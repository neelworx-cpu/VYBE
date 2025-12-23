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

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ICodeEditor, getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../editor/common/model.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IVybeEditService } from '../common/vybeEditService.js';
import { IVybeDiffService } from '../common/vybeDiffService.js';
import { DiffZone, DiffArea, Diff, DiffState } from '../common/vybeEditTypes.js';
import {
	vybeDiffLineAddedDecoration,
	vybeDiffLineEditedDecoration,
	vybeDiffLineDeletedDecoration,
} from './vybeDiffDecorationTypes.js';
import { STORAGE_KEY_ENABLE_DIFF_DECORATIONS } from './contribution/vybeDiffDecorations.contribution.js';

/**
 * Manages DiffZones - the binding between DiffAreas and editor instances.
 * Tracks which editors have which diff areas and manages their lifecycle.
 */
export class VybeDiffZoneManager extends Disposable {
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

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IVybeEditService private readonly _editService: IVybeEditService,
		@IVybeDiffService private readonly _diffService: IVybeDiffService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

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
		this._register(this._editService.onDidAcceptDiff(({ uri }) => {
			this.refreshDecorationsForUri(uri);
		}));

		this._register(this._editService.onDidRejectDiff(({ uri }) => {
			this.refreshDecorationsForUri(uri);
		}));

		// Listen to diff service events for streaming updates
		this._register(this._diffService.onDidUpdateDiffArea(({ uri, reason }) => {
			try {
				// For streaming updates, refresh decorations to show updated ranges
				if (reason === 'streaming') {
					this.refreshDecorationsForUri(uri);
				} else if (reason === 'recompute') {
					// For recompute (new diff creation), refresh decorations if editor is already open
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
		const model = editor.getModel();
		if (model) {
			const editorId = this._getEditorId(editor);
			let scheduler = this._refreshSchedulers.get(editorId);
			if (!scheduler) {
				scheduler = new RunOnceScheduler(() => {
					this.refreshDecorationsForEditor(editor, diffArea.uri);
				}, 300); // 300ms debounce
				this._refreshSchedulers.set(editorId, scheduler);
				disposables.add(scheduler);
			}

			disposables.add(model.onDidChangeContent(() => {
				scheduler!.schedule();
			}));
		}

		// Initial decoration refresh
		this.refreshDecorationsForEditor(editor, diffArea.uri);

		// Store disposables (we'll need to track these for cleanup)
		// For now, we'll rely on editor disposal to clean up
		// In a full implementation, we'd store these in a WeakMap

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
	 */
	refreshDecorationsForUri(uri: URI): void {
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

			// Get all diff areas for this URI
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			const allDecorations: IModelDeltaDecoration[] = [];

			// Get actual diff states from edit service (for accurate state tracking)
			// The edit service tracks state separately due to readonly DiffArea constraint
			const diffsForFile = this._editService.getDiffsForFile(uri);

			for (const diffArea of diffAreas) {
				const decorations = this.computeDecorationsFromDiffArea(diffArea, model, diffsForFile);
				allDecorations.push(...decorations);
			}

			// Apply decorations to all zones for this editor/URI
			const zones = this._getZonesForUri(uri);
			for (const zone of zones) {
				if (zone.editor === editor) {
					zone.decorations.set(allDecorations);
				}
			}
		} catch (error) {
			this._logService.error('[VybeDiffZoneManager] Error refreshing decorations', error);
		}
	}

	/**
	 * Computes decorations from a DiffArea.
	 * Only includes decorations for diffs with state=Pending or Streaming.
	 *
	 * @param diffArea The diff area to compute decorations for
	 * @param model The text model to compute ranges against
	 * @param diffsForFile Optional array of diffs from edit service (for accurate state tracking)
	 */
	computeDecorationsFromDiffArea(diffArea: DiffArea, model: ITextModel, diffsForFile?: readonly Diff[]): IModelDeltaDecoration[] {
		const decorations: IModelDeltaDecoration[] = [];

		// Create a map of diffId -> actual state from edit service (if provided)
		const stateMap = new Map<string, DiffState>();
		if (diffsForFile) {
			for (const diff of diffsForFile) {
				if (diff.diffAreaId === diffArea.diffAreaId) {
					stateMap.set(diff.diffId, diff.state);
				}
			}
		}

		for (const diff of diffArea.diffs.values()) {
			// Get actual state from edit service if available, otherwise use diff.state
			const actualState = stateMap.get(diff.diffId) ?? diff.state;

			// Only show decorations for pending or streaming diffs
			// Accepted/Rejected diffs should not show decorations
			if (actualState !== DiffState.Pending && actualState !== DiffState.Streaming) {
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

			// Convert LineRange to Range for decoration
			let range: Range | null = null;

			if (isDeletion) {
				// For deletions, represent at the nearest valid line in modified model
				// Use originalRange.startLine, clamped to model line count
				const lineNumber = Math.min(diff.originalRange.startLineNumber, model.getLineCount());
				if (lineNumber > 0) {
					range = new Range(lineNumber, 1, lineNumber, model.getLineLength(lineNumber) + 1);
				}
			} else {
				// For insertions/edits, use modifiedRange
				range = diff.modifiedRange.toInclusiveRange();
			}

			if (range) {
				// Clamp range to model bounds
				const maxLine = model.getLineCount();
				if (range.startLineNumber > maxLine) {
					// Range is beyond model, skip
					continue;
				}

				// Ensure range is within model bounds
				range = new Range(
					range.startLineNumber,
					range.startColumn,
					Math.min(range.endLineNumber, maxLine),
					range.endLineNumber > maxLine ? model.getLineLength(maxLine) + 1 : range.endColumn
				);

				decorations.push({
					range,
					options: decorationType,
				});
			}
		}

		return decorations;
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

