/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE DiffZone Manager
 * Manages the binding between DiffAreas and editor instances.
 * Handles visual decorations for AI-generated diffs.
 */

import './media/vybeDiffDecorations.css';
import './media/vybeDiffHunkWidget.css';
import './media/vybeFileCommandBar.css';

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ICodeEditor, getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IVybeEditService } from '../common/vybeEditService.js';
import { IVybeDiffService } from '../common/vybeDiffService.js';
import { IVybeDiffZoneManager } from '../common/vybeDiffZoneManager.js';
import { DiffZone, DiffArea, Diff, DiffState } from '../common/vybeEditTypes.js';
import {
	vybeDiffLineAddedDecoration,
	vybeDiffLineEditedDecoration,
	vybeDiffLineDeletedDecoration,
} from './vybeDiffDecorationTypes.js';
import { STORAGE_KEY_ENABLE_DIFF_DECORATIONS } from './contribution/vybeDiffDecorations.contribution.js';
import { VybeDiffHunkWidget } from './widgets/vybeDiffHunkWidget.js';
import { VybeFileCommandBar } from './widgets/vybeFileCommandBar.js';

/**
 * Manages DiffZones - the binding between DiffAreas and editor instances.
 * Tracks which editors have which diff areas and manages their lifecycle.
 */
export class VybeDiffZoneManager extends Disposable implements IVybeDiffZoneManager {
	readonly _serviceBrand: undefined;
	/**
	 * Zones keyed by editor ID, then by diff area ID.
	 * Map<editorId, Map<diffAreaId, DiffZone>>
	 */
	private readonly _zonesByEditor = new Map<string, Map<string, DiffZone>>();

	/**
	 * Zones keyed by URI string for quick lookup.
	 * Map<uriString, Set<DiffZone>>
	 */
	private readonly _zonesByUri = new Map<string, Set<DiffZone>>();

	/**
	 * Editor ID counter for generating unique IDs.
	 */
	private _editorIdCounter = 0;

	/**
	 * Map of editor instances to their IDs.
	 * Using WeakMap for automatic cleanup when editors are disposed.
	 */
	private readonly _editorToId = new WeakMap<ICodeEditor, string>();

	/**
	 * Debounce schedulers for model content changes, keyed by editor ID.
	 * Prevents excessive decoration refreshes during rapid edits.
	 */
	private readonly _refreshSchedulers = new Map<string, RunOnceScheduler>();

	/**
	 * Diff hunk widgets keyed by zone, then by diff ID.
	 * Map<DiffZone, Map<diffId, VybeDiffHunkWidget>>
	 */
	private readonly _hunkWidgetsByZone = new WeakMap<DiffZone, Map<string, VybeDiffHunkWidget>>();

	/**
	 * File command bars keyed by zone.
	 * Map<DiffZone, VybeFileCommandBar>
	 */
	private readonly _fileCommandBarsByZone = new WeakMap<DiffZone, VybeFileCommandBar>();

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IVybeEditService private readonly _editService: IVybeEditService,
		@IVybeDiffService private readonly _diffService: IVybeDiffService,
		@IModelService private readonly _modelService: IModelService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// BLOCKER 2: Listen to model mount events
		// When a model is added (editor opens), refresh decorations if diff areas exist
		// DO NOT recompute on mount - recomputation happens during computeDiffs
		// This prevents removing diffs when model is loaded from disk
		this._register(this._modelService.onModelAdded(async (model) => {
			try {
				const diffAreas = this._diffService.getDiffAreasForUri(model.uri);
				if (diffAreas.length > 0) {
					this._logService.trace(`[VybeDiffZoneManager] Model mounted with ${diffAreas.length} diff areas, refreshing decorations only (no recomputation)`);
					// Only refresh decorations - do NOT recompute
					// computeDiffs already wrote modified content to the model
					// If model has original content, it means diffs were created before editor opened
					// In that case, we'll wait for computeDiffs to write modified content
					this.refreshDecorationsForUri(model.uri);
				}
			} catch (error) {
				this._logService.error('[VybeDiffZoneManager] Error handling model mount', error);
			}
		}));

		// Listen to editor lifecycle events
		// Use onDidVisibleEditorsChange to detect when editors become visible
		this._register(this._editorService.onDidVisibleEditorsChange(() => {
			this._handleVisibleEditorsChange();
		}));

		this._register(this._editorService.onDidCloseEditor((event) => {
			this._handleEditorClose(event);
		}));

		// Listen to edit service events
		this._register(this._editService.onDidAcceptFile(({ uri }) => {
			this.handleFileAcceptedOrRejected(uri);
		}));

		this._register(this._editService.onDidRejectFile(({ uri }) => {
			this.handleFileAcceptedOrRejected(uri);
		}));

		this._register(this._editService.onDidAcceptAll(() => {
			this._handleAcceptAll();
		}));

		this._register(this._editService.onDidRejectAll(() => {
			this._handleRejectAll();
		}));

		this._register(this._editService.onDidCreateTransaction(({ uri, diffAreaId }) => {
			this._handleTransactionCreated(uri, diffAreaId);
		}));

		// Listen to accept/reject diff events to refresh decorations
		// PHASE D4: After accept/reject completes, recompute diffs (system write flag is cleared)
		// FIX 3: Recompute diffs after accept (like Void's _refreshStylesAndDiffsInURI)
		// VOID-STYLE: Recomputation now happens synchronously in acceptDiff/rejectDiff
		// We only need to refresh decorations here (recompute already done)
		this._register(this._editService.onDidAcceptDiff(({ uri }) => {
			this._logService.trace(`[VybeDiffZoneManager] Diff accepted, refreshing decorations (recompute already done)`);
			this.refreshDecorationsForUri(uri);
		}));

		this._register(this._editService.onDidRejectDiff(({ uri }) => {
			this._logService.trace(`[VybeDiffZoneManager] Diff rejected, refreshing decorations (recompute already done)`);
			this.refreshDecorationsForUri(uri);
		}));

		// Listen to diff service events for streaming updates
		this._register(this._diffService.onDidUpdateDiffArea(({ uri, diffAreaId, reason }) => {
			try {
				// For recompute (new diff creation), create zones if editor is open
				if (reason === 'recompute') {
					// Check if editor is already open for this URI
					const codeEditor = this._getCodeEditorForUri(uri);
					if (codeEditor) {
						// Get the diff area
						const diffArea = this._diffService.getDiffArea(uri, diffAreaId);
						if (diffArea) {
							// Create zone if it doesn't exist
							const existingZones = this._getZonesForUri(uri);
							const zoneExists = Array.from(existingZones).some(zone => zone.diffAreaId === diffAreaId);
							if (!zoneExists) {
								this._logService.trace(`[VybeDiffZoneManager] Creating zone for diffArea ${diffAreaId} on recompute`);
								this._createZone(codeEditor, diffArea);
							} else {
								this._logService.trace(`[VybeDiffZoneManager] Zone already exists for diffArea ${diffAreaId}`);
							}
						} else {
							this._logService.warn(`[VybeDiffZoneManager] Diff area ${diffAreaId} not found for URI ${uri.toString()}`);
						}
					} else {
						this._logService.trace(`[VybeDiffZoneManager] No editor open for URI ${uri.toString()}, zone will be created when editor opens`);
					}
					// Refresh decorations
					this.refreshDecorationsForUri(uri);
				} else if (reason === 'streaming') {
					// For streaming updates, refresh decorations to show updated ranges
					this.refreshDecorationsForUri(uri);
				} else if (reason === 'deleted') {
					// CRITICAL: When a diff is deleted, immediately refresh decorations
					// This ensures decorations are removed immediately (like Void's _clearAllEffects)
					this._logService.trace(`[VybeDiffZoneManager] Diff deleted, immediately refreshing decorations`);
					this.refreshDecorationsForUri(uri);
				}
			} catch (error) {
				// Best-effort, never throw
				this._logService.error('[VybeDiffZoneManager] Error handling diff area update', error);
			}
		}));

		// Listen to storage changes for diff decorations setting
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY_ENABLE_DIFF_DECORATIONS, this._store)(() => {
			// Refresh all decorations when setting toggles
			this._refreshAllDecorations();
		}));

		// Initialize zones for already-open editors
		this._initializeZonesForOpenEditors();
	}

	/**
	 * Handles when visible editors change.
	 * Creates zones for any diff areas associated with newly visible files.
	 */
	private _handleVisibleEditorsChange(): void {
		try {
			const visiblePanes = this._editorService.visibleEditorPanes;

			for (const pane of visiblePanes) {
				const resource = pane.input?.resource;
				if (!resource) {
					continue;
				}

				// Check if zones already exist for this URI
				const existingZones = this._getZonesForUri(resource);
				if (existingZones.size > 0) {
					// Zones already exist, skip
					continue;
				}

				const diffAreas = this._diffService.getDiffAreasForUri(resource);
				if (diffAreas.length === 0) {
					// No diffs for this file, nothing to do
					continue;
				}

				// Get the code editor instance
				const codeEditor = this._getCodeEditorForUri(resource);
				if (!codeEditor) {
					// Not a text editor or editor not available yet
					continue;
				}

				// Create zones for each diff area
				for (const diffArea of diffAreas) {
					this._createZone(codeEditor, diffArea);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error handling visible editors change', error);
		}
	}

	/**
	 * Handles when an editor closes.
	 * Disposes all zones for that editor.
	 */
	private _handleEditorClose(event: { editor: { resource: URI | undefined } }): void {
		try {
			if (!event.editor.resource) {
				return;
			}

			const uri = event.editor.resource;
			const zones = this._getZonesForUri(uri);

			// Dispose all zones for this URI
			for (const zone of zones) {
				this._disposeZone(zone);
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error handling editor close', error);
		}
	}

	/**
	 * Gets the code editor instance for a URI.
	 * Returns undefined if not a text editor or editor not available.
	 */
	private _getCodeEditorForUri(uri: URI): ICodeEditor | undefined {
		try {
			// Get all visible editor panes
			const visiblePanes = this._editorService.visibleEditorPanes;

			for (const pane of visiblePanes) {
				// Check if this pane has the URI we're looking for
				if (pane.input?.resource?.toString() === uri.toString()) {
					// Get the control and check if it's a code editor
					const control = pane.getControl();
					const codeEditor = getCodeEditor(control);
					if (codeEditor) {
						return codeEditor;
					}
				}
			}

			return undefined;
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error getting code editor for URI', error);
			return undefined;
		}
	}

	/**
	 * Gets a unique ID for an editor instance.
	 */
	private _getEditorId(editor: ICodeEditor): string {
		let id = this._editorToId.get(editor);
		if (!id) {
			id = `editor-${this._editorIdCounter++}`;
			this._editorToId.set(editor, id);
		}
		return id;
	}

	/**
	 * Creates a DiffZone for an editor and diff area.
	 */
	private _createZone(editor: ICodeEditor, diffArea: DiffArea): DiffZone {
		const editorId = this._getEditorId(editor);

		// Check if zone already exists
		const zonesForEditor = this._zonesByEditor.get(editorId);
		if (zonesForEditor?.has(diffArea.diffAreaId)) {
			// Zone already exists, return it
			return zonesForEditor.get(diffArea.diffAreaId)!;
		}

		// Create decoration collection (empty for Phase 1D)
		const decorations = editor.createDecorationsCollection();

		// Create zone
		const zone: DiffZone = {
			diffAreaId: diffArea.diffAreaId,
			editor,
			decorations,
			isStreaming: false,
		};

		// Register listeners
		const disposables = new DisposableStore();

		// Dispose zone when editor is disposed
		disposables.add(editor.onDidDispose(() => {
			this._disposeZone(zone);
		}));

		// Handle model changes
		disposables.add(editor.onDidChangeModel(() => {
			const model = editor.getModel();
			if (!model || model.uri.toString() !== diffArea.uri.toString()) {
				// Model changed to different URI, dispose zone
				this._disposeZone(zone);
			} else {
				// Model changed but same URI, refresh decorations
				this.refreshDecorationsForEditor(editor, diffArea.uri);
			}
		}));

		// Listen to model content changes with debouncing
		// Only refresh decorations, don't recompute diffs (recompute breaks diff matching)
		const model = editor.getModel();
		if (model) {
			const editorId = this._getEditorId(editor);
			let scheduler = this._refreshSchedulers.get(editorId);
			if (!scheduler) {
				scheduler = new RunOnceScheduler(async () => {
					// PHASE D4: Recompute diffs after realignment
					// This ensures diffs are always fresh and match current file state
					await this._diffService.recomputeDiffsForFile(diffArea.uri);
					// Then refresh decorations/widgets
					this.refreshDecorationsForEditor(editor, diffArea.uri);
				}, 300); // 300ms debounce
				this._refreshSchedulers.set(editorId, scheduler);
				disposables.add(scheduler);
			}

			disposables.add(model.onDidChangeContent((e) => {
				// PHASE D1: Only refresh if NOT a system write
				// System writes (accept/reject/streaming) should not trigger recomputation
				if (!this._diffService.isSystemWrite() && !this._editService.isSystemWrite()) {
					// PHASE D3: Realign ranges FIRST before refresh/recomputation
					for (const change of e.changes) {
						this._diffService.realignDiffAreaRanges(
							diffArea.uri,
							change.text,
							{ startLineNumber: change.range.startLineNumber, endLineNumber: change.range.endLineNumber }
						);
					}
					scheduler!.schedule();
				}
			}));
		}

		// Initial decoration refresh
		this.refreshDecorationsForEditor(editor, diffArea.uri);

		// Create file command bar for this zone
		const fileCommandBar = this._instantiationService.createInstance<typeof VybeFileCommandBar, VybeFileCommandBar>(VybeFileCommandBar, editor, diffArea.uri);
		this._fileCommandBarsByZone.set(zone, fileCommandBar);
		disposables.add(fileCommandBar);

		// Store disposables in the zone for proper cleanup
		// Register the disposables store so it gets cleaned up when zone is disposed
		this._register(disposables);

		// Store zone in maps
		if (!this._zonesByEditor.has(editorId)) {
			this._zonesByEditor.set(editorId, new Map());
		}
		this._zonesByEditor.get(editorId)!.set(diffArea.diffAreaId, zone);

		const uriKey = diffArea.uri.toString();
		if (!this._zonesByUri.has(uriKey)) {
			this._zonesByUri.set(uriKey, new Set());
		}
		this._zonesByUri.get(uriKey)!.add(zone);

		this._logService.trace(`[VybeDiffZoneManager] Created zone for editor ${editorId}, diffArea ${diffArea.diffAreaId}`);

		return zone;
	}

	/**
	 * Disposes a DiffZone and cleans up all resources.
	 */
	private _disposeZone(zone: DiffZone): void {
		try {
			// Dispose hunk widgets for this zone
			const hunkWidgets = this._hunkWidgetsByZone.get(zone);
			if (hunkWidgets) {
				for (const widget of hunkWidgets.values()) {
					widget.dispose();
				}
				hunkWidgets.clear();
			}

			// Dispose file command bar for this zone
			const fileCommandBar = this._fileCommandBarsByZone.get(zone);
			if (fileCommandBar) {
				fileCommandBar.dispose();
			}

			// Clear decorations
			zone.decorations.clear();

			// Find and remove from maps
			const editorId = this._getEditorId(zone.editor);
			const zonesForEditor = this._zonesByEditor.get(editorId);

			// Clean up refresh scheduler if no zones remain for this editor
			if (zonesForEditor && zonesForEditor.size === 1) {
				// This is the last zone for this editor, clean up scheduler
				const scheduler = this._refreshSchedulers.get(editorId);
				if (scheduler) {
					scheduler.dispose();
					this._refreshSchedulers.delete(editorId);
				}
			}

			if (zonesForEditor) {
				zonesForEditor.delete(zone.diffAreaId);
				if (zonesForEditor.size === 0) {
					this._zonesByEditor.delete(editorId);
				}
			}

			const uriKey = zone.editor.getModel()?.uri.toString();
			if (uriKey) {
				const zonesForUri = this._zonesByUri.get(uriKey);
				if (zonesForUri) {
					zonesForUri.delete(zone);
					if (zonesForUri.size === 0) {
						this._zonesByUri.delete(uriKey);
					}
				}
			}

			this._logService.trace(`[VybeDiffZoneManager] Disposed zone for diffArea ${zone.diffAreaId}`);
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error disposing zone', error);
		}
	}

	/**
	 * Gets all zones for an editor.
	 */
	getZonesForEditor(editor: ICodeEditor): readonly DiffZone[] {
		const editorId = this._getEditorId(editor);
		const zonesForEditor = this._zonesByEditor.get(editorId);
		if (!zonesForEditor) {
			return [];
		}
		return Array.from(zonesForEditor.values());
	}

	/**
	 * Gets all zones for a URI.
	 */
	private _getZonesForUri(uri: URI): Set<DiffZone> {
		const uriKey = uri.toString();
		const zones = this._zonesByUri.get(uriKey);
		return zones ?? new Set();
	}

	/**
	 * Gets all zones for a URI (public API).
	 */
	getZonesForUri(uri: URI): readonly DiffZone[] {
		return Array.from(this._getZonesForUri(uri));
	}

	/**
	 * Handles when a file is accepted or rejected.
	 * Disposes all zones for that URI.
	 */
	handleFileAcceptedOrRejected(uri: URI): void {
		try {
			const zones = this._getZonesForUri(uri);
			for (const zone of zones) {
				this._disposeZone(zone);
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error handling file accept/reject', error);
		}
	}

	/**
	 * Handles when all diffs are accepted.
	 * Disposes all zones.
	 */
	private _handleAcceptAll(): void {
		try {
			// Dispose all zones
			for (const zonesForEditor of this._zonesByEditor.values()) {
				for (const zone of zonesForEditor.values()) {
					this._disposeZone(zone);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error handling accept all', error);
		}
	}

	/**
	 * Handles when all diffs are rejected.
	 * Disposes all zones.
	 */
	private _handleRejectAll(): void {
		try {
			// Dispose all zones
			for (const zonesForEditor of this._zonesByEditor.values()) {
				for (const zone of zonesForEditor.values()) {
					this._disposeZone(zone);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error handling reject all', error);
		}
	}

	/**
	 * Handles when a transaction is created.
	 * If an editor is already open for that URI, create zones.
	 */
	private _handleTransactionCreated(uri: URI, diffAreaId: string): void {
		try {
			// Check if editor is already open for this URI
			const codeEditor = this._getCodeEditorForUri(uri);
			if (!codeEditor) {
				// Editor not open yet, zones will be created when editor opens
				return;
			}

			// Get diff area
			const diffArea = this._diffService.getDiffArea(uri, diffAreaId);
			if (!diffArea) {
				// Diff area not found yet (might be created later)
				return;
			}

			// Create zone if it doesn't exist
			this._createZone(codeEditor, diffArea);
			// Refresh decorations after zone creation
			this.refreshDecorationsForEditor(codeEditor, uri);
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error handling transaction created', error);
		}
	}

	/**
	 * Initializes zones for editors that are already open when the manager starts.
	 * This ensures zones are created for files with diffs that were opened before the manager initialized.
	 */
	private _initializeZonesForOpenEditors(): void {
		try {
			const visiblePanes = this._editorService.visibleEditorPanes;

			for (const pane of visiblePanes) {
				const resource = pane.input?.resource;
				if (!resource) {
					continue;
				}

				// Check if zones already exist for this URI
				const existingZones = this._getZonesForUri(resource);
				if (existingZones.size > 0) {
					// Zones already exist, skip
					continue;
				}

				const diffAreas = this._diffService.getDiffAreasForUri(resource);
				if (diffAreas.length === 0) {
					// No diffs for this file, nothing to do
					continue;
				}

				// Get the code editor instance
				const codeEditor = this._getCodeEditorForUri(resource);
				if (!codeEditor) {
					// Not a text editor or editor not available yet
					continue;
				}

				// Create zones for each diff area
				for (const diffArea of diffAreas) {
					this._createZone(codeEditor, diffArea);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error initializing zones for open editors', error);
		}
	}

	/**
	 * Refreshes decorations for all zones associated with a URI.
	 * Creates zones if they don't exist yet (e.g., if zone manager wasn't initialized when diffs were created).
	 */
	refreshDecorationsForUri(uri: URI): void {
		// CRITICAL: Ensure zones exist before refreshing
		// If zones don't exist (e.g., zone manager wasn't initialized when diffs were created),
		// create them now
		const codeEditor = this._getCodeEditorForUri(uri);
		if (codeEditor) {
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			const existingZones = this._getZonesForUri(uri);

			// Create zones for any diff areas that don't have zones yet
			for (const diffArea of diffAreas) {
				const zoneExists = Array.from(existingZones).some(zone => zone.diffAreaId === diffArea.diffAreaId);
				if (!zoneExists) {
					this._logService.trace(`[VybeDiffZoneManager] Creating zone for diffArea ${diffArea.diffAreaId} during refresh`);
					this._createZone(codeEditor, diffArea);
				}
			}
		}

		// Now refresh decorations for all zones
		const zones = this._getZonesForUri(uri);
		for (const zone of zones) {
			this.refreshDecorationsForEditor(zone.editor, uri);
		}
	}

	/**
	 * Refreshes decorations for all zones in an editor for a given URI.
	 */
	refreshDecorationsForEditor(editor: ICodeEditor, uri: URI): void {
		try {
			// Check if decorations are enabled (from VYBE settings storage)
			const enabled = this._storageService.getBoolean(STORAGE_KEY_ENABLE_DIFF_DECORATIONS, StorageScope.APPLICATION, false);

			if (!enabled) {
				this._logService.trace(`[VybeDiffZoneManager] Decorations disabled for ${uri.toString()}`);
				// Clear all decorations for this editor/URI
				const zones = this._getZonesForUri(uri);
				for (const zone of zones) {
					if (zone.editor === editor) {
						zone.decorations.clear();
					}
				}
				return;
			}

			const model = editor.getModel();
			if (!model || model.uri.toString() !== uri.toString()) {
				return;
			}

			// FIX 2: Always clear decorations first (like Void's _clearAllEffects)
			// This ensures stale decorations don't persist
			const zones = this._getZonesForUri(uri);
			for (const zone of zones) {
				if (zone.editor === editor) {
					zone.decorations.clear();
					this._logService.trace(`[VybeDiffZoneManager] Cleared decorations for zone ${zone.diffAreaId}`);
				}
			}

			// Get all diff areas for this URI
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			const allDecorations: IModelDeltaDecoration[] = [];
			const decorationsByDiffId = new Map<string, IModelDeltaDecoration>();

			// Get actual diff states from edit service (for accurate state tracking)
			// The edit service tracks state separately due to readonly DiffArea constraint
			const diffsForFile = this._editService.getDiffsForFile(uri);

			this._logService.trace(`[VybeDiffZoneManager] Refreshing decorations for ${uri.toString()}: ${diffAreas.length} diff areas, ${diffsForFile.length} diffs`);

			for (const diffArea of diffAreas) {
				const { decorations, diffIdToDecoration } = this.computeDecorationsFromDiffArea(diffArea, model, diffsForFile);
				allDecorations.push(...decorations);
				// Merge decorations map
				for (const [diffId, decoration] of diffIdToDecoration.entries()) {
					decorationsByDiffId.set(diffId, decoration);
				}
				this._logService.trace(`[VybeDiffZoneManager] DiffArea ${diffArea.diffAreaId}: ${decorations.length} decorations, ${diffArea.diffs.size} diffs`);
			}

			// Apply decorations to all zones for this editor/URI
			this._logService.trace(`[VybeDiffZoneManager] Found ${zones.size} zones for ${uri.toString()}`);
			for (const zone of zones) {
				if (zone.editor === editor) {
					zone.decorations.set(allDecorations);
					this._logService.info(`[VybeDiffZoneManager] ✅ Applied ${allDecorations.length} decorations to zone ${zone.diffAreaId}`);
					// Update widgets for this zone - only create widgets for diffs that have decorations
					this._updateWidgetsForZone(zone, diffAreas, diffsForFile, decorationsByDiffId);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error refreshing decorations', error);
		}
	}

	/**
	 * Updates hunk widgets for a zone based on current diffs.
	 * Only creates widgets for diffs that have decorations (ensures alignment).
	 */
	private _updateWidgetsForZone(zone: DiffZone, diffAreas: readonly DiffArea[], diffsForFile?: readonly Diff[], decorationsByDiffId?: Map<string, IModelDeltaDecoration>): void {
		try {
			// Get or create hunk widgets map for this zone
			let hunkWidgets = this._hunkWidgetsByZone.get(zone);
			if (!hunkWidgets) {
				hunkWidgets = new Map();
				this._hunkWidgetsByZone.set(zone, hunkWidgets);
			}

			// CRITICAL: First, remove ALL existing widgets to start fresh
			// This prevents orphaned widgets from previous runs
			this._logService.info(`[VybeDiffZoneManager] Clearing ${hunkWidgets.size} existing widgets for zone ${zone.diffAreaId}`);
			for (const [, widget] of hunkWidgets.entries()) {
				widget.remove();
				widget.dispose();
			}
			hunkWidgets.clear();

			// Validate decorations map
			if (!decorationsByDiffId || decorationsByDiffId.size === 0) {
				this._logService.warn(`[VybeDiffZoneManager] ⚠️ No decorations map provided for zone ${zone.diffAreaId} - no widgets will be created`);
				return;
			}

			this._logService.info(`[VybeDiffZoneManager] Decorations map has ${decorationsByDiffId.size} entries: ${Array.from(decorationsByDiffId.keys()).map(id => id.substring(0, 8)).join(', ')}`);

			// Collect all pending/streaming diffs for this zone
			const activeDiffs = new Set<string>();
			this._logService.info(`[VybeDiffZoneManager] Updating widgets for zone ${zone.diffAreaId}, checking ${diffAreas.length} diff areas`);
			for (const diffArea of diffAreas) {
				if (diffArea.diffAreaId !== zone.diffAreaId) {
					this._logService.trace(`[VybeDiffZoneManager] Skipping diffArea ${diffArea.diffAreaId} (zone is ${zone.diffAreaId})`);
					continue;
				}

				this._logService.info(`[VybeDiffZoneManager] Processing diffArea ${diffArea.diffAreaId} with ${diffArea.diffs.size} total diffs`);

				for (const diff of diffArea.diffs.values()) {
					// Get actual state from edit service if available
					const actualState = diffsForFile?.find(d => d.diffId === diff.diffId)?.state ?? diff.state;

					const isInsertion = diff.originalRange.isEmpty;
					const isDeletion = diff.modifiedRange.isEmpty;
					const diffType = isInsertion ? 'INSERT' : isDeletion ? 'DELETE' : 'EDIT';
					this._logService.info(`[VybeDiffZoneManager] Diff ${diff.diffId.substring(0, 8)}: type=${diffType}, state=${actualState}, originalRange=${diff.originalRange.startLineNumber}-${diff.originalRange.endLineNumberExclusive}, modifiedRange=${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`);

					// Only create widgets for pending or streaming diffs
					if (actualState === DiffState.Pending || actualState === DiffState.Streaming) {
						// CRITICAL: Only create widget if a decoration exists for this diff
						// This ensures widgets and decorations are always aligned
						const decoration = decorationsByDiffId.get(diff.diffId);
						if (!decoration) {
							this._logService.info(`[VybeDiffZoneManager] ❌ Skipping widget for diff ${diff.diffId.substring(0, 8)} (no decoration found in map - decoration was likely skipped due to invalid range)`);
							continue;
						}

						activeDiffs.add(diff.diffId);

						// Create widget for this diff (we cleared all widgets above, so this is always new)
						this._logService.info(`[VybeDiffZoneManager] Creating widget for diff ${diff.diffId.substring(0, 8)}`);
						const widget = this._instantiationService.createInstance(VybeDiffHunkWidget, zone.editor, diff);
						hunkWidgets.set(diff.diffId, widget);

						// POSITION BELOW DIFF: Pass decoration start line, widget will position at end line + 1 line height
						// This ensures buttons appear below the diff background consistently
						const decorationStartLine = decoration.range.startLineNumber;
						const decorationEndLine = decoration.range.endLineNumber;

						widget.layout(decorationStartLine);

						// Show widget (can be toggled based on cursor position later)
						widget.toggle(true);
						const isInsertion = diff.originalRange.isEmpty;
						const isDeletion = diff.modifiedRange.isEmpty;
						const diffType = isInsertion ? 'INSERT' : isDeletion ? 'DELETE' : 'EDIT';

						// Determine end line for logging (matching widget's logic)
						const endLine = isDeletion
							? diff.modifiedRange.startLineNumber
							: (isInsertion
								? diff.modifiedRange.endLineNumberExclusive - 1
								: diff.modifiedRange.endLineNumberExclusive - 1);

						this._logService.info(`[VybeDiffZoneManager] ✅ Widget created for diff ${diff.diffId.substring(0, 8)} below line ${endLine} (type=${diffType}, decoration range: ${decorationStartLine}-${decorationEndLine})`);
					} else {
						this._logService.info(`[VybeDiffZoneManager] ❌ Skipping widget for diff ${diff.diffId.substring(0, 8)} (state=${actualState}, not pending/streaming)`);
					}
				}
			}

			// Log final state
			this._logService.info(`[VybeDiffZoneManager] ✅ Zone ${zone.diffAreaId} widget update complete: ${activeDiffs.size} active widgets, ${hunkWidgets.size} total widgets`);

			// Remove widgets for diffs that are no longer active (shouldn't happen since we cleared above, but safety check)
			for (const [diffId, widget] of hunkWidgets.entries()) {
				if (!activeDiffs.has(diffId)) {
					this._logService.warn(`[VybeDiffZoneManager] Removing orphaned widget for diff ${diffId.substring(0, 8)}`);
					widget.remove();
					widget.dispose();
					hunkWidgets.delete(diffId);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error updating widgets for zone', error);
		}
	}

	/**
	 * Computes decorations from a DiffArea.
	 * Only includes decorations for diffs with state=Pending or Streaming.
	 *
	 * @param diffArea The diff area to compute decorations for
	 * @param model The text model to compute ranges against
	 * @param diffsForFile Optional array of diffs from edit service (for accurate state tracking)
	 * @returns Object with decorations array and a map of diffId -> decoration for widget alignment
	 */
	computeDecorationsFromDiffArea(diffArea: DiffArea, model: ITextModel, diffsForFile?: readonly Diff[]): { decorations: IModelDeltaDecoration[]; diffIdToDecoration: Map<string, IModelDeltaDecoration> } {
		const decorations: IModelDeltaDecoration[] = [];
		const diffIdToDecoration = new Map<string, IModelDeltaDecoration>();

		// Create a map of diffId -> actual state from edit service (if provided)
		const stateMap = new Map<string, DiffState>();
		if (diffsForFile) {
			for (const diff of diffsForFile) {
				if (diff.diffAreaId === diffArea.diffAreaId) {
					stateMap.set(diff.diffId, diff.state);
				}
			}
		}

		this._logService.trace(`[VybeDiffZoneManager] Computing decorations for diffArea ${diffArea.diffAreaId}: ${diffArea.diffs.size} diffs, model has ${model.getLineCount()} lines`);

		for (const diff of diffArea.diffs.values()) {
			// Get actual state from edit service if available, otherwise use diff.state
			const actualState = stateMap.get(diff.diffId) ?? diff.state;

			this._logService.trace(`[VybeDiffZoneManager] Processing diff ${diff.diffId.substring(0, 8)}: state=${actualState}, originalRange=${diff.originalRange.startLineNumber}-${diff.originalRange.endLineNumberExclusive}, modifiedRange=${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`);

			// Only show decorations for pending or streaming diffs
			// Accepted/Rejected diffs should not show decorations
			if (actualState !== DiffState.Pending && actualState !== DiffState.Streaming) {
				this._logService.trace(`[VybeDiffZoneManager] Skipping decoration for diff ${diff.diffId.substring(0, 8)} (state=${actualState}, not pending/streaming)`);
				continue;
			}

			// Determine decoration type based on diff type
			let decorationType;
			const isInsertion = diff.originalRange.isEmpty;
			const isDeletion = diff.modifiedRange.isEmpty;

			if (isInsertion) {
				decorationType = vybeDiffLineAddedDecoration;
			} else if (isDeletion) {
				decorationType = vybeDiffLineDeletedDecoration;
			} else {
				decorationType = vybeDiffLineEditedDecoration;
			}

			// PHASE C: Convert LineRange to Range for decoration
			// IMPORTANT: The file model now contains MODIFIED content (from Phase A)
			// Decorations must use modifiedRange (where new content is in the file)
			let range: Range | null = null;

			if (isDeletion) {
				// For deletions, use modifiedRange.startLineNumber (where deletion marker should be)
				// Clamp to model bounds
				const lineNumber = Math.min(diff.modifiedRange.startLineNumber, model.getLineCount());
				if (lineNumber > 0) {
					range = new Range(lineNumber, 1, lineNumber, model.getLineLength(lineNumber) + 1);
				} else {
					this._logService.warn(`[VybeDiffZoneManager] Deletion diff ${diff.diffId} has invalid line number: ${diff.modifiedRange.startLineNumber}`);
					continue;
				}
			} else if (isInsertion) {
				// For insertions, use modifiedRange (where the new content is in the file)
				// The file model has the modified content, so we can use modifiedRange directly
				const startLine = diff.modifiedRange.startLineNumber;
				const endLine = diff.modifiedRange.endLineNumberExclusive - 1; // Convert to inclusive

				// Clamp to model bounds
				const maxLine = model.getLineCount();
				const clampedStartLine = Math.max(1, Math.min(startLine, maxLine));
				const clampedEndLine = Math.max(clampedStartLine, Math.min(endLine, maxLine));

				if (clampedStartLine > maxLine) {
					this._logService.warn(`[VybeDiffZoneManager] Insertion diff ${diff.diffId} start line (${clampedStartLine}) is beyond model (${maxLine}), skipping`);
					continue;
				}

				const endLineLength = model.getLineLength(clampedEndLine);
				range = new Range(clampedStartLine, 1, clampedEndLine, endLineLength + 1);
				this._logService.trace(`[VybeDiffZoneManager] Insertion diff ${diff.diffId}: modifiedRange=${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}, decorationRange=${clampedStartLine}-${clampedEndLine}`);
			} else {
				// For edits, use modifiedRange (where the new content is in the file)
				// The file model has the modified content, so we can use modifiedRange directly
				range = diff.modifiedRange.toInclusiveRange();
				if (!range) {
					this._logService.warn(`[VybeDiffZoneManager] Edit diff ${diff.diffId} modifiedRange.toInclusiveRange() returned null. modifiedRange: ${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`);
					continue;
				}
			}

			if (!range) {
				this._logService.warn(`[VybeDiffZoneManager] No range computed for diff ${diff.diffId}, skipping decoration`);
				continue;
			}

			// Clamp range to model bounds
			const maxLine = model.getLineCount();
			if (range.startLineNumber > maxLine) {
				// Range is beyond model, skip
				this._logService.warn(`[VybeDiffZoneManager] Diff ${diff.diffId} range start (${range.startLineNumber}) is beyond model (${maxLine}), skipping decoration`);
				continue;
			}

			// Ensure range is within model bounds, but preserve multi-line ranges
			const clampedStartLine = Math.max(1, Math.min(range.startLineNumber, maxLine));
			const clampedEndLine = Math.max(clampedStartLine, Math.min(range.endLineNumber, maxLine));

			// Get proper column values for clamped lines
			const startColumn = clampedStartLine === range.startLineNumber ? range.startColumn : 1;
			const endColumn = clampedEndLine === range.endLineNumber
				? range.endColumn
				: model.getLineLength(clampedEndLine) + 1;

			range = new Range(clampedStartLine, startColumn, clampedEndLine, endColumn);

			this._logService.info(`[VybeDiffZoneManager] ✅ Adding decoration for diff ${diff.diffId.substring(0, 8)}: type=${isInsertion ? 'INSERT' : isDeletion ? 'DELETE' : 'EDIT'}, range=${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}, originalRange=${diff.originalRange.startLineNumber}-${diff.originalRange.endLineNumberExclusive}, modifiedRange=${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`);

			const decoration: IModelDeltaDecoration = {
				range,
				options: decorationType,
			};
			decorations.push(decoration);
			diffIdToDecoration.set(diff.diffId, decoration);
		}

		this._logService.info(`[VybeDiffZoneManager] ✅ Computed ${decorations.length} decorations from ${diffArea.diffs.size} diffs for diffArea ${diffArea.diffAreaId}`);
		if (decorations.length !== diffArea.diffs.size) {
			const skipped = diffArea.diffs.size - decorations.length;
			this._logService.warn(`[VybeDiffZoneManager] ⚠️ Skipped ${skipped} decoration(s) due to invalid ranges or non-pending state`);
		}
		this._logService.info(`[VybeDiffZoneManager] Decoration map keys: ${Array.from(diffIdToDecoration.keys()).map(id => id.substring(0, 8)).join(', ')}`);

		return { decorations, diffIdToDecoration };
	}

	/**
	 * Refreshes all decorations across all editors.
	 */
	private _refreshAllDecorations(): void {
		for (const [uriKey, zones] of this._zonesByUri.entries()) {
			const uri = URI.parse(uriKey);
			for (const zone of zones) {
				this.refreshDecorationsForEditor(zone.editor, uri);
			}
		}
	}

	override dispose(): void {
		// Dispose all refresh schedulers
		for (const scheduler of this._refreshSchedulers.values()) {
			scheduler.dispose();
		}
		this._refreshSchedulers.clear();

		// Dispose all zones
		for (const zonesForEditor of this._zonesByEditor.values()) {
			for (const zone of zonesForEditor.values()) {
				this._disposeZone(zone);
			}
		}

		// Clear maps
		this._zonesByEditor.clear();
		this._zonesByUri.clear();
		// WeakMap will be automatically cleared when editors are garbage collected

		super.dispose();
	}
}

