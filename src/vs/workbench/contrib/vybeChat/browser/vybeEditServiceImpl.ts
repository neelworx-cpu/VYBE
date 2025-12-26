/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Edit Service Implementation
 * Manages edit transaction lifecycles and provides accept/reject operations for diffs.
 * Logic only - no UI, decorations, commands, or checkpoints timeline.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IUndoRedoService, UndoRedoElementType, UndoRedoGroup, IResourceUndoRedoElement, IWorkspaceUndoRedoElement } from '../../../../platform/undoRedo/common/undoRedo.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IVybeEditService, EditTransaction } from '../common/vybeEditService.js';
import { IVybeDiffService } from '../common/vybeDiffService.js';
import { IVybeCheckpointService } from '../common/vybeCheckpointService.js';
import { Diff, DiffArea, Checkpoint, DiffAreaSnapshot, DiffState, EditTransactionState, VybeEditedFileSummary } from '../common/vybeEditTypes.js';

/**
 * Implementation of IVybeEditService.
 * Manages edit transactions and provides accept/reject operations.
 */
export class VybeEditServiceImpl extends Disposable implements IVybeEditService {
	declare readonly _serviceBrand: undefined;

	/**
	 * In-memory storage for transactions, keyed by transactionId.
	 * Reset on reload - no persistence.
	 */
	private readonly _transactions = new Map<string, EditTransaction>();

	/**
	 * In-memory storage for checkpoints, keyed by checkpointId.
	 * Reset on reload - no persistence.
	 */
	private readonly _checkpoints = new Map<string, Checkpoint>();

	/**
	 * Epoch counter for checkpoints (increments for each checkpoint).
	 */
	private _nextEpoch = 1;

	/**
	 * Track diff state updates separately since DiffArea is readonly and managed by diff service.
	 * Maps diffId -> current state.
	 * Note: This is a workaround for Phase 1C. Full implementation would extend IVybeDiffService.
	 */
	private readonly _diffStates = new Map<string, DiffState>();

	/**
	 * PHASE D1: Write guard flag to prevent recursive recomputation during system writes.
	 */
	private _isSystemWrite: boolean = false;


	// Events
	private readonly _onDidCreateTransaction = this._register(new Emitter<{ transactionId: string; uri: URI; diffAreaId: string }>());
	readonly onDidCreateTransaction: Event<{ transactionId: string; uri: URI; diffAreaId: string }> = this._onDidCreateTransaction.event;

	private readonly _onDidCompleteTransaction = this._register(new Emitter<{ transactionId: string; uri: URI; state: EditTransactionState }>());
	readonly onDidCompleteTransaction: Event<{ transactionId: string; uri: URI; state: EditTransactionState }> = this._onDidCompleteTransaction.event;

	private readonly _onDidAcceptDiff = this._register(new Emitter<{ diffId: string; uri: URI; diffAreaId: string }>());
	readonly onDidAcceptDiff: Event<{ diffId: string; uri: URI; diffAreaId: string }> = this._onDidAcceptDiff.event;

	private readonly _onDidRejectDiff = this._register(new Emitter<{ diffId: string; uri: URI; diffAreaId: string }>());
	readonly onDidRejectDiff: Event<{ diffId: string; uri: URI; diffAreaId: string }> = this._onDidRejectDiff.event;

	private readonly _onDidAcceptFile = this._register(new Emitter<{ uri: URI; diffAreaId: string }>());
	readonly onDidAcceptFile: Event<{ uri: URI; diffAreaId: string }> = this._onDidAcceptFile.event;

	private readonly _onDidRejectFile = this._register(new Emitter<{ uri: URI; diffAreaId: string }>());
	readonly onDidRejectFile: Event<{ uri: URI; diffAreaId: string }> = this._onDidRejectFile.event;

	private readonly _onDidAcceptAll = this._register(new Emitter<void>());
	readonly onDidAcceptAll: Event<void> = this._onDidAcceptAll.event;

	private readonly _onDidRejectAll = this._register(new Emitter<void>());
	readonly onDidRejectAll: Event<void> = this._onDidRejectAll.event;

	private readonly _onDidChangeEditedFiles = this._register(new Emitter<void>());
	readonly onDidChangeEditedFiles: Event<void> = this._onDidChangeEditedFiles.event;

	constructor(
		@IVybeDiffService private readonly _diffService: IVybeDiffService,
		@IModelService private readonly _modelService: IModelService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IVybeCheckpointService private readonly _checkpointService: IVybeCheckpointService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// CRITICAL: Listen to diff service recompute events to clean up stale diff states
		// When diffs are deleted and recreated with new IDs, we must clear old state entries
		this._register(this._diffService.onDidUpdateDiffArea(({ uri, diffAreaId, reason }) => {
			if (reason === 'recompute') {
				// When recompute happens, old diffs were deleted and new ones created with fresh IDs
				// We need to clean up stale state entries for the old diff IDs
				// Get the current diff area to see what diff IDs exist now
				const diffArea = this._diffService.getDiffArea(uri, diffAreaId);
				if (diffArea) {
					const currentDiffIds = new Set(diffArea.diffs.keys());
					// Remove state entries for any diff IDs that no longer exist in this diff area
					// (they were deleted during recompute and replaced with new IDs)
					for (const [diffId] of this._diffStates.entries()) {
						// Check if this diff ID belongs to this diff area and no longer exists
						const diff = this._findDiff(diffId);
						if (diff && diff.diffAreaId === diffAreaId && !currentDiffIds.has(diffId)) {
							// This diff ID was deleted during recompute, remove its state
							this._diffStates.delete(diffId);
							this._logService.trace(`[VybeEditService] Cleaned up stale diff state for deleted diff ${diffId.substring(0, 8)}`);
						}
					}
				}
			}
		}));
	}

	/**
	 * PHASE D1: Helper to execute a function with system write flag set.
	 * Prevents recursive recomputation during system writes.
	 */
	private async _withSystemWrite<T>(fn: () => Promise<T>): Promise<T> {
		this._isSystemWrite = true;
		try {
			return await fn();
		} finally {
			this._isSystemWrite = false;
		}
	}

	/**
	 * PHASE D1: Checks if a system write is currently in progress.
	 */
	isSystemWrite(): boolean {
		return this._isSystemWrite;
	}

	/**
	 * PHASE D5: Captures diff state snapshot for a URI.
	 * BLOCKER 3: Extended to capture full diff state including originalCode and full diffs map.
	 */
	private _captureDiffStateSnapshot(uri: URI): DiffAreaSnapshot[] {
		const diffAreas = this._diffService.getDiffAreasForUri(uri);
		const snapshots: DiffAreaSnapshot[] = [];

		for (const diffArea of diffAreas) {
			// BLOCKER 3: Capture full diffs map (preserves diff IDs and state)
			const diffsMap = new Map(diffArea.diffs);
			snapshots.push({
				diffAreaId: diffArea.diffAreaId,
				uri: diffArea.uri,
				originalSnapshot: diffArea.originalSnapshot,
				originalCode: diffArea.originalCode,
				startLine: diffArea.startLine,
				endLine: diffArea.endLine,
				diffs: diffsMap,
			});
		}

		return snapshots;
	}

	/**
	 * PHASE D5: Restores diff state snapshot for a URI.
	 * BLOCKER 3: Restores DiffArea objects directly from snapshot, preserving diff IDs.
	 * Also restores diff states in _diffStates map.
	 */
	private async _restoreDiffStateSnapshot(uri: URI, snapshots: DiffAreaSnapshot[]): Promise<void> {
		// VOID-STYLE: Delete ALL diff areas first (like Void's _deleteAllDiffAreas)
		// This ensures a clean slate before restoration, preventing stale state from breaking subsequent operations
		const existingDiffAreas = this._diffService.getDiffAreasForUri(uri);
		for (const diffArea of existingDiffAreas) {
			// Delete all diffs in this area
			const diffIds = Array.from(diffArea.diffs.keys());
			for (const diffId of diffIds) {
				this._diffService.deleteDiff(diffArea.diffAreaId, diffId);
				this._diffStates.delete(diffId); // Also remove from state map
			}
		}

		// Now restore diff areas from snapshot (clean slate)
		for (const snapshot of snapshots) {
			// Create DiffArea from snapshot, preserving all state
			const restoredDiffArea: DiffArea = {
				diffAreaId: snapshot.diffAreaId,
				uri: snapshot.uri,
				diffs: new Map(snapshot.diffs), // BLOCKER 3: Preserve diff IDs
				originalSnapshot: snapshot.originalSnapshot,
				originalCode: snapshot.originalCode,
				createdAt: Date.now(), // Use current time (or could preserve from snapshot if needed)
				startLine: snapshot.startLine,
				endLine: snapshot.endLine,
				isStreaming: false, // Never restore streaming state
			};

			// Restore diff area directly
			this._diffService.restoreDiffArea(snapshot.diffAreaId, restoredDiffArea);

			// CRITICAL: Restore diff states from snapshot
			// Each diff in the snapshot has its state preserved
			for (const [diffId, diff] of snapshot.diffs.entries()) {
				this._diffStates.set(diffId, diff.state);
			}
		}

		// Note: File content restoration is handled by checkpoint service
		// We only restore diff state here
	}

	// ============================================================================
	// Transaction Management
	// ============================================================================

	async createEditTransaction(
		uri: URI,
		originalContent: string,
		options?: {
			streaming?: boolean;
			source?: 'agent' | 'user' | 'tool';
		}
	): Promise<string> {
		try {
			const transactionId = generateUuid();
			const diffAreaId = generateUuid(); // Will be associated when diffs are computed
			const now = Date.now();

			const state = options?.streaming
				? EditTransactionState.Streaming
				: EditTransactionState.Pending;

			const transaction: EditTransaction = {
				transactionId,
				uri,
				state,
				diffAreaId, // Note: This will be updated when diffs are computed via IVybeDiffService
				createdAt: now,
				source: options?.source,
			};

			this._transactions.set(transactionId, transaction);

			// Emit event
			this._onDidCreateTransaction.fire({ transactionId, uri, diffAreaId });

			// Notify that edited files summaries may have changed
			// Note: This is optimistic - diffs may not be computed yet, but summaries will
			// be empty until diffs are created via IVybeDiffService.computeDiffs().
			// The event will fire again when diffs are actually accepted/rejected.
			this._notifyEditedFilesChanged();

			return transactionId;
		} catch (error) {
			this._logService.error('[VybeEditService] Error creating edit transaction', error);
			throw error; // This is a creation method, so we can throw
		}
	}

	getEditTransaction(transactionId: string): EditTransaction | undefined {
		return this._transactions.get(transactionId);
	}

	// ============================================================================
	// Single Diff Operations
	// ============================================================================

	async acceptDiff(diffId: string): Promise<boolean> {
		try {
			const diff = this._findDiff(diffId);
			if (!diff) {
				this._logService.warn(`[VybeEditService] Diff not found: ${diffId}`);
				return false;
			}

			const currentState = this._getDiffState(diff);
			if (currentState === DiffState.Accepted) {
				// Already accepted, no-op
				return true;
			}

			const model = this._getTextModel(diff.uri);
			if (!model) {
				this._logService.warn(`[VybeEditService] Model not found for URI: ${diff.uri.toString()}`);
				return false;
			}

			// FIX 1: Capture snapshot BEFORE any changes (like Void's _addToHistory)
			// This ensures the snapshot includes the diff that will be deleted
			const beforeSnapshot = this._captureDiffStateSnapshot(diff.uri);
			const beforeFileContent = model.getValue();
			// CRITICAL: Capture diff info for undo/redo callbacks (before deletion)
			const diffIdForUndo = diffId;
			const diffAreaIdForUndo = diff.diffAreaId;
			const uriForUndo = diff.uri;

			// PHASE B: ACCEPT LOGIC (VOID-STYLE)
			// File already has modified content (from Phase A)
			// Accept updates baseline by merging the accepted diff into originalCode
			// This preserves remaining diffs - they're still valid against the updated baseline
			// File model does NOT change - this ensures widgets remain stable

			// VOID-STYLE: Merge accepted diff into baseline (not full file replacement)
			// This ensures remaining diffs remain valid after accept
			this._diffService.mergeAcceptedDiffIntoBaseline(diff.diffAreaId, diff);

			// Update diff state BEFORE deleting (so snapshot captures correct state)
			this._updateDiffState(diff.diffAreaId, diffId, DiffState.Accepted);

			// Delete diff from DiffArea (no longer needed, change is "accepted" into baseline)
			// CRITICAL: Delete AFTER updating state so decorations refresh correctly
			this._diffService.deleteDiff(diff.diffAreaId, diffId);

			// CRITICAL: Also remove from _diffStates map to ensure getDiffsForFile doesn't return it
			this._diffStates.delete(diffId);

			// VOID-STYLE: Synchronously recompute and refresh (like Void's _refreshStylesAndDiffsInURI)
			// This ensures widgets are recreated with new IDs immediately, before any user interaction
			// CRITICAL: Do this BEFORE emitting events to prevent race conditions
			// CRITICAL: Delete the diff FIRST so widgets can't use it during recomputation
			// The recomputation will create new diffs with fresh IDs
			await this._diffService.recomputeDiffsForFile(diff.uri);

			// CRITICAL: Wait for the event to be processed and widgets to be recreated
			// The onDidUpdateDiffArea event listener will automatically call refreshDecorationsForUri
			// which disposes old widgets and creates new ones with fresh diff IDs
			await new Promise(resolve => setTimeout(resolve, 50));

			// Push undo element (for undo/redo support)
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				diff.uri,
				'Accept Diff',
				'vybe.edit.accept',
				async () => {
					// CRITICAL: Re-find diff after restore (it was deleted, now restored)
					const restoredDiff = this._findDiff(diffIdForUndo);
					if (!restoredDiff) {
						this._logService.warn(`[VybeEditService] Cannot undo: diff ${diffIdForUndo} not found after restore`);
						return;
					}
					const restoredModel = this._getTextModel(uriForUndo);
					if (!restoredModel) {
						this._logService.warn(`[VybeEditService] Cannot undo: model not found for ${uriForUndo.toString()}`);
						return;
					}
					// BLOCKER 4: Abort streaming if active before undo
					const restoredDiffArea = this._diffService.getDiffArea(uriForUndo, diffAreaIdForUndo);
					if (restoredDiffArea?.isStreaming) {
						this._diffService.abortStreaming(diffAreaIdForUndo);
					}
					// FIX 4: Full restoration on undo (like Void's _restoreVoidFileSnapshot)
					// 1. Restore file content
					const fullRange = restoredModel.getFullModelRange();
					await this._withSystemWrite(async () => {
						restoredModel.pushEditOperations(null, [EditOperation.replace(fullRange, beforeFileContent)], () => null);
					});
					// 2. Restore diff state (this restores the diff back to DiffArea and restores states)
					await this._restoreDiffStateSnapshot(uriForUndo, beforeSnapshot);
					// 3. CRITICAL: Do NOT recompute after restore - the restored diffs are already correct
					// Recomputation would compare restored file vs restored baseline and might remove diffs
					// Just refresh decorations to show the restored diffs
					// 4. Emit event to trigger decoration refresh (no recomputation needed)
					this._onDidAcceptDiff.fire({ diffId: diffIdForUndo, uri: uriForUndo, diffAreaId: diffAreaIdForUndo });
				},
				async () => {
					// CRITICAL: Re-find diff for redo (it might have been restored by undo)
					const redoDiff = this._findDiff(diffIdForUndo);
					if (!redoDiff) {
						this._logService.warn(`[VybeEditService] Cannot redo: diff ${diffIdForUndo} not found`);
						return;
					}
					// PHASE D5: Redo accept - re-apply baseline merge (VOID-STYLE)
					// Merge accepted diff into baseline
					this._diffService.mergeAcceptedDiffIntoBaseline(diffAreaIdForUndo, redoDiff);
					this._updateDiffState(diffAreaIdForUndo, diffIdForUndo, DiffState.Accepted);
					this._diffService.deleteDiff(diffAreaIdForUndo, diffIdForUndo);
					// CRITICAL: Also remove from _diffStates map
					this._diffStates.delete(diffIdForUndo);
					// VOID-STYLE: Synchronously recompute and refresh
					await this._diffService.recomputeDiffsForFile(uriForUndo);
					// Emit event to trigger decoration refresh
					this._onDidAcceptDiff.fire({ diffId: diffIdForUndo, uri: uriForUndo, diffAreaId: diffAreaIdForUndo });
				}
			));

			// Emit event (after synchronous recompute, so widgets are already recreated)
			this._onDidAcceptDiff.fire({ diffId, uri: diff.uri, diffAreaId: diff.diffAreaId });

			// Notify that edited files summaries changed
			this._notifyEditedFilesChanged();

			return true;
		} catch (error) {
			this._logService.error('[VybeEditService] Error accepting diff', error);
			return false;
		}
	}

	async rejectDiff(diffId: string): Promise<boolean> {
		try {
			const diff = this._findDiff(diffId);
			if (!diff) {
				this._logService.warn(`[VybeEditService] Diff not found: ${diffId}`);
				return false;
			}

			const currentState = this._getDiffState(diff);
			if (currentState === DiffState.Rejected) {
				// Already rejected, no-op
				return true;
			}

			const model = this._getTextModel(diff.uri);
			if (!model) {
				this._logService.warn(`[VybeEditService] Model not found for URI: ${diff.uri.toString()}`);
				return false;
			}

			// Get diff area to access originalSnapshot
			const diffArea = this._diffService.getDiffArea(diff.uri, diff.diffAreaId);
			if (!diffArea) {
				this._logService.warn(`[VybeEditService] DiffArea not found for reject: ${diff.diffAreaId}`);
				return false;
			}

			// BLOCKER 4: Abort streaming if active
			if (diffArea.isStreaming) {
				this._diffService.abortStreaming(diff.diffAreaId);
			}

			// BLOCKER 6: REJECT LOGIC - Region-scoped
			// File has modified content (from Phase A)
			// Reject writes only the diff region back, preserving user edits outside diff area

			// Determine diff type
			const isInsertion = diff.originalRange.isEmpty;
			const isDeletion = diff.modifiedRange.isEmpty;

			// BLOCKER 6: Write only the diff region, not full file
			await this._withSystemWrite(async () => {
				let writeText: string;
				let toRange: Range;

				if (isDeletion) {
					// Deletion: Insert originalCode back at the position
					const insertLine = diff.modifiedRange.startLineNumber;
					// Handle edge case: deletion at end of diff area
					if (insertLine - 1 === diffArea.endLine) {
						writeText = '\n' + diff.originalCode;
						toRange = new Range(insertLine - 1, Number.MAX_SAFE_INTEGER, insertLine - 1, Number.MAX_SAFE_INTEGER);
					} else {
						writeText = diff.originalCode + '\n';
						toRange = new Range(insertLine, 1, insertLine, 1);
					}
				} else if (isInsertion) {
					// Insertion: Delete the inserted lines
					const modifiedInclusive = diff.modifiedRange.toInclusiveRange();
					if (!modifiedInclusive) {
						this._logService.warn(`[VybeEditService] Cannot reject insertion: modifiedRange is invalid`);
						return;
					}
					const startLine = modifiedInclusive.startLineNumber;
					const endLine = modifiedInclusive.endLineNumber;
					// Handle edge case: insertion at end of diff area
					if (endLine === diffArea.endLine) {
						writeText = '';
						toRange = new Range(startLine - 1, Number.MAX_SAFE_INTEGER, endLine, 1);
					} else {
						writeText = '';
						toRange = new Range(startLine, 1, endLine + 1, 1);
					}
				} else {
					// Edit: Replace modified range with originalCode
					const modifiedInclusive = diff.modifiedRange.toInclusiveRange();
					if (!modifiedInclusive) {
						this._logService.warn(`[VybeEditService] Cannot reject edit: modifiedRange is invalid`);
						return;
					}
					const startLine = modifiedInclusive.startLineNumber;
					const endLine = modifiedInclusive.endLineNumber;
					writeText = diff.originalCode;
					toRange = new Range(startLine, 1, endLine, Number.MAX_SAFE_INTEGER);
				}

				const edit: ISingleEditOperation = EditOperation.replace(toRange, writeText);
				model.pushEditOperations(null, [edit], () => null);
			});

			// CRITICAL: Realign diff area ranges BEFORE deleting the diff
			// Reject removes/adds lines, so all subsequent diff ranges need to be adjusted
			// We need to compute the change range for realignment
			let changeRange: { startLineNumber: number; endLineNumber: number };
			let changeText: string;

			if (isInsertion) {
				// Insertion rejection: we're deleting lines
				const modifiedInclusive = diff.modifiedRange.toInclusiveRange();
				if (modifiedInclusive) {
					changeRange = {
						startLineNumber: modifiedInclusive.startLineNumber,
						endLineNumber: modifiedInclusive.endLineNumber
					};
					changeText = ''; // Deleting, so empty text
				} else {
					changeRange = { startLineNumber: diff.modifiedRange.startLineNumber, endLineNumber: diff.modifiedRange.startLineNumber };
					changeText = '';
				}
			} else if (isDeletion) {
				// Deletion rejection: we're inserting lines back
				const insertLine = diff.modifiedRange.startLineNumber;
				changeRange = { startLineNumber: insertLine, endLineNumber: insertLine };
				changeText = diff.originalCode + '\n';
			} else {
				// Edit rejection: replacing content
				const modifiedInclusive = diff.modifiedRange.toInclusiveRange();
				if (modifiedInclusive) {
					changeRange = {
						startLineNumber: modifiedInclusive.startLineNumber,
						endLineNumber: modifiedInclusive.endLineNumber
					};
					changeText = diff.originalCode;
				} else {
					changeRange = { startLineNumber: diff.modifiedRange.startLineNumber, endLineNumber: diff.modifiedRange.startLineNumber };
					changeText = diff.originalCode;
				}
			}

			// Realign ranges for all diff areas (this updates DiffArea.startLine/endLine)
			this._diffService.realignDiffAreaRanges(diff.uri, changeText, changeRange);

			// FIX 1: Capture snapshot BEFORE deleting (like Void's _addToHistory)
			// This ensures the snapshot includes the diff that will be deleted
			const beforeSnapshot = this._captureDiffStateSnapshot(diff.uri);
			// CRITICAL: Capture diff info for undo/redo callbacks (before deletion)
			const diffIdForUndo = diffId;
			const diffAreaIdForUndo = diff.diffAreaId;
			const uriForUndo = diff.uri;

			// Update diff state BEFORE deleting (so snapshot captures correct state)
			this._updateDiffState(diff.diffAreaId, diffId, DiffState.Rejected);

			// Delete diff from DiffArea
			// CRITICAL: Delete AFTER updating state so decorations refresh correctly
			this._diffService.deleteDiff(diff.diffAreaId, diffId);

			// CRITICAL: Also remove from _diffStates map to ensure getDiffsForFile doesn't return it
			this._diffStates.delete(diffId);

			// VOID-STYLE: Synchronously recompute and refresh (like Void's _refreshStylesAndDiffsInURI)
			// This ensures widgets are recreated with new IDs immediately, before any user interaction
			// CRITICAL: Do this BEFORE emitting events to prevent race conditions
			// CRITICAL: Delete the diff FIRST so widgets can't use it during recomputation
			// The recomputation will create new diffs with fresh IDs
			await this._diffService.recomputeDiffsForFile(diff.uri);

			// CRITICAL: Wait for the event to be processed and widgets to be recreated
			// The onDidUpdateDiffArea event listener will automatically call refreshDecorationsForUri
			// which disposes old widgets and creates new ones with fresh diff IDs
			await new Promise(resolve => setTimeout(resolve, 50));

			// Note: beforeRegionContent is not needed for undo since we restore full snapshot

			// Push undo element (for undo/redo support)
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				diff.uri,
				'Reject Diff',
				'vybe.edit.reject',
				async () => {
					// CRITICAL: Re-find diff after restore (it was deleted, now restored)
					const restoredDiff = this._findDiff(diffIdForUndo);
					if (!restoredDiff) {
						this._logService.warn(`[VybeEditService] Cannot undo reject: diff ${diffIdForUndo} not found after restore`);
						return;
					}
					const restoredModel = this._getTextModel(uriForUndo);
					if (!restoredModel) {
						this._logService.warn(`[VybeEditService] Cannot undo reject: model not found for ${uriForUndo.toString()}`);
						return;
					}
					// BLOCKER 4: Abort streaming if active before undo
					const restoredDiffArea = this._diffService.getDiffArea(uriForUndo, diffAreaIdForUndo);
					if (restoredDiffArea?.isStreaming) {
						this._diffService.abortStreaming(diffAreaIdForUndo);
					}
					// FIX 4: Full restoration on undo (like Void's _restoreVoidFileSnapshot)
					// 1. Restore diff state (this restores the diff back to DiffArea and restores states)
					await this._restoreDiffStateSnapshot(uriForUndo, beforeSnapshot);
					// 2. CRITICAL: Do NOT recompute after restore - the restored diffs are already correct
					// Recomputation would compare restored file vs restored baseline and might remove diffs
					// Just refresh decorations to show the restored diffs
					// 3. Emit event to trigger decoration refresh (no recomputation needed)
					this._onDidRejectDiff.fire({ diffId: diffIdForUndo, uri: uriForUndo, diffAreaId: diffAreaIdForUndo });
				},
				async () => {
					// CRITICAL: Re-find diff for redo (it might have been restored by undo)
					const redoDiff = this._findDiff(diffIdForUndo);
					if (!redoDiff) {
						this._logService.warn(`[VybeEditService] Cannot redo reject: diff ${diffIdForUndo} not found`);
						return;
					}
					const redoModel = this._getTextModel(uriForUndo);
					if (!redoModel) {
						this._logService.warn(`[VybeEditService] Cannot redo reject: model not found for ${uriForUndo.toString()}`);
						return;
					}
					const redoDiffArea = this._diffService.getDiffArea(uriForUndo, diffAreaIdForUndo);
					if (!redoDiffArea) {
						this._logService.warn(`[VybeEditService] Cannot redo reject: diffArea ${diffAreaIdForUndo} not found`);
						return;
					}
					// BLOCKER 6: Redo reject - re-apply region reject
					const redoIsDeletion = redoDiff.originalRange.isEmpty;
					const redoIsInsertion = redoDiff.modifiedRange.isEmpty;
					await this._withSystemWrite(async () => {
						let writeText: string;
						let toRange: Range;

						if (redoIsDeletion) {
							const insertLine = redoDiff.modifiedRange.startLineNumber;
							if (insertLine - 1 === redoDiffArea.endLine) {
								writeText = '\n' + redoDiff.originalCode;
								toRange = new Range(insertLine - 1, Number.MAX_SAFE_INTEGER, insertLine - 1, Number.MAX_SAFE_INTEGER);
							} else {
								writeText = redoDiff.originalCode + '\n';
								toRange = new Range(insertLine, 1, insertLine, 1);
							}
						} else if (redoIsInsertion) {
							const modifiedInclusive = redoDiff.modifiedRange.toInclusiveRange();
							if (!modifiedInclusive) {
								return; // Cannot redo
							}
							const startLine = modifiedInclusive.startLineNumber;
							const endLine = modifiedInclusive.endLineNumber;
							if (endLine === redoDiffArea.endLine) {
								writeText = '';
								toRange = new Range(startLine - 1, Number.MAX_SAFE_INTEGER, endLine, 1);
							} else {
								writeText = '';
								toRange = new Range(startLine, 1, endLine + 1, 1);
							}
						} else {
							const modifiedInclusive = redoDiff.modifiedRange.toInclusiveRange();
							if (!modifiedInclusive) {
								return; // Cannot redo
							}
							writeText = redoDiff.originalCode;
							toRange = new Range(modifiedInclusive.startLineNumber, 1, modifiedInclusive.endLineNumber, Number.MAX_SAFE_INTEGER);
						}

						redoModel.pushEditOperations(null, [EditOperation.replace(toRange, writeText)], () => null);
					});
					// Realign ranges after reject
					const redoModifiedInclusive = redoDiff.modifiedRange.toInclusiveRange();
					if (redoModifiedInclusive) {
						this._diffService.realignDiffAreaRanges(uriForUndo, redoDiff.originalCode, { startLineNumber: redoModifiedInclusive.startLineNumber, endLineNumber: redoModifiedInclusive.endLineNumber });
					}
					this._updateDiffState(diffAreaIdForUndo, diffIdForUndo, DiffState.Rejected);
					this._diffService.deleteDiff(diffAreaIdForUndo, diffIdForUndo);
					this._diffStates.delete(diffIdForUndo);
					// VOID-STYLE: Synchronously recompute and refresh
					await this._diffService.recomputeDiffsForFile(uriForUndo);
					this._onDidRejectDiff.fire({ diffId: diffIdForUndo, uri: uriForUndo, diffAreaId: diffAreaIdForUndo });
				}
			));

			// Emit event (after synchronous recompute, so widgets are already recreated)
			this._onDidRejectDiff.fire({ diffId, uri: diff.uri, diffAreaId: diff.diffAreaId });

			// Notify that edited files summaries changed
			this._notifyEditedFilesChanged();

			return true;
		} catch (error) {
			this._logService.error('[VybeEditService] Error rejecting diff', error);
			return false;
		}
	}

	// ============================================================================
	// File-Level Operations
	// ============================================================================

	async acceptFile(uri: URI): Promise<void> {
		try {
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			if (diffAreas.length === 0) {
				return;
			}

			// Collect all pending diffs
			const pendingDiffs: Diff[] = [];
			for (const diffArea of diffAreas) {
				for (const diff of diffArea.diffs.values()) {
					const currentState = this._getDiffState(diff);
					if (currentState === DiffState.Pending || currentState === DiffState.Streaming) {
						pendingDiffs.push(diff);
					}
				}
			}

			if (pendingDiffs.length === 0) {
				return;
			}

			const model = this._getTextModel(uri);
			if (!model) {
				this._logService.warn(`[VybeEditService] Model not found for URI: ${uri.toString()}`);
				return;
			}

			// Create checkpoint BEFORE accepting
			const checkpointId = this._checkpointService.createCheckpoint(
				`Accept File: ${uri.toString()}`,
				[uri],
				'acceptFile'
			);
			if (checkpointId) {
				this._logService.trace(`[VybeEditService] Created checkpoint ${checkpointId} before acceptFile`);
			}

			// PHASE B: ACCEPT FILE LOGIC
			// File already has modified content (from Phase A)
			// Accept updates baselines only - file model does NOT change

			// Get current file content - this becomes the new baseline for all diff areas
			const currentFileContent = model.getValue();

			// Update baselines for all diff areas and delete all diffs
			for (const diffArea of diffAreas) {
				// Update baseline
				this._diffService.updateDiffAreaSnapshot(diffArea.diffAreaId, currentFileContent);

				// Delete all pending diffs from this area
				for (const diff of pendingDiffs) {
					if (diff.diffAreaId === diffArea.diffAreaId) {
						this._diffService.deleteDiff(diffArea.diffAreaId, diff.diffId);
						this._updateDiffState(diff.diffAreaId, diff.diffId, DiffState.Accepted);
					}
				}
			}

			// Push undo element (simplified - full undo/redo would require storing previous baselines)
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				uri,
				'Accept All Diffs',
				'vybe.edit.acceptFile',
				async () => {
					// Undo: restore previous baselines and re-add diffs
					// This is complex - for now, we'll mark as not implemented
					this._logService.warn('[VybeEditService] Undo acceptFile not fully implemented yet');
				},
				async () => {
					// Redo: re-apply baseline updates
					// This is complex - for now, we'll mark as not implemented
					this._logService.warn('[VybeEditService] Redo acceptFile not fully implemented yet');
				}
			));

			// Update transaction states
			this._updateTransactionStatesForUri(uri, EditTransactionState.Accepted);

			// Emit events for each diff area
			for (const diffArea of diffAreas) {
				this._onDidAcceptFile.fire({ uri, diffAreaId: diffArea.diffAreaId });
			}
		} catch (error) {
			this._logService.error('[VybeEditService] Error accepting file', error);
		}
	}

	async rejectFile(uri: URI): Promise<void> {
		try {
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			if (diffAreas.length === 0) {
				return;
			}

			const model = this._getTextModel(uri);
			if (!model) {
				this._logService.warn(`[VybeEditService] Model not found for URI: ${uri.toString()}`);
				return;
			}

			// PHASE B: REJECT FILE LOGIC
			// File has modified content (from Phase A)
			// Reject writes originalSnapshot back to file (reverts to baseline)

			// Get original snapshot from first diff area (they should all have the same snapshot)
			const originalSnapshot = diffAreas[0].originalSnapshot;

			// Write originalSnapshot back to file (full file revert)
			// PHASE D1: Wrapped with system write guard
			await this._withSystemWrite(async () => {
				const fullRange = model.getFullModelRange();
				const edit: ISingleEditOperation = EditOperation.replace(fullRange, originalSnapshot);
				model.pushEditOperations(null, [edit], () => null);
			});

			// Delete all diffs and update states to Rejected
			for (const diffArea of diffAreas) {
				// Delete all diffs from this area
				const diffIds = Array.from(diffArea.diffs.keys());
				for (const diffId of diffIds) {
					this._diffService.deleteDiff(diffArea.diffAreaId, diffId);
					this._updateDiffState(diffArea.diffAreaId, diffId, DiffState.Rejected);
				}
			}

			// Push undo element
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				uri,
				'Reject All Diffs',
				'vybe.edit.rejectFile',
				async () => {
					// Undo: restore current content (before rejection)
					// PHASE D1: Wrapped with system write guard
					if (model && !model.isDisposed()) {
						await this._withSystemWrite(async () => {
							const currentContent = model.getValue();
							const undoFullRange = model.getFullModelRange();
							model.pushEditOperations(null, [EditOperation.replace(undoFullRange, currentContent)], () => null);
						});
						// Restore diff states (would need to track previous states, simplified here)
					}
				},
				async () => {
					// Redo: re-apply original snapshot
					// PHASE D1: Wrapped with system write guard
					if (model && !model.isDisposed()) {
						await this._withSystemWrite(async () => {
							const redoFullRange = model.getFullModelRange();
							model.pushEditOperations(null, [EditOperation.replace(redoFullRange, originalSnapshot)], () => null);
						});
						for (const diffArea of diffAreas) {
							for (const diff of diffArea.diffs.values()) {
								this._updateDiffState(diffArea.diffAreaId, diff.diffId, DiffState.Rejected);
							}
						}
					}
				}
			));

			// Update transaction states
			this._updateTransactionStatesForUri(uri, EditTransactionState.Rejected);

			// Emit events for each diff area
			for (const diffArea of diffAreas) {
				this._onDidRejectFile.fire({ uri, diffAreaId: diffArea.diffAreaId });
			}

			// Notify that edited files summaries changed
			this._notifyEditedFilesChanged();
		} catch (error) {
			this._logService.error('[VybeEditService] Error rejecting file', error);
		}
	}

	// ============================================================================
	// Global Operations
	// ============================================================================

	async acceptAll(): Promise<void> {
		try {
			// Get all diff areas
			const allDiffAreas = this._getAllDiffAreas();
			if (allDiffAreas.length === 0) {
				return;
			}

			// Group by URI
			const diffsByUri = new Map<URI, Diff[]>();
			for (const diffArea of allDiffAreas) {
				for (const diff of diffArea.diffs.values()) {
					const currentState = this._getDiffState(diff);
					if (currentState === DiffState.Pending || currentState === DiffState.Streaming) {
						if (!diffsByUri.has(diff.uri)) {
							diffsByUri.set(diff.uri, []);
						}
						diffsByUri.get(diff.uri)!.push(diff);
					}
				}
			}

			if (diffsByUri.size === 0) {
				return;
			}

			// Create checkpoint BEFORE accepting
			const affectedUris = Array.from(diffsByUri.keys());
			const checkpointId = this._checkpointService.createCheckpoint(
				'Accept All Diffs',
				affectedUris,
				'acceptAll'
			);
			if (checkpointId) {
				this._logService.trace(`[VybeEditService] Created checkpoint ${checkpointId} before acceptAll for ${affectedUris.length} files`);
			}

			// PHASE B: ACCEPT ALL LOGIC
			// Files already have modified content (from Phase A)
			// Accept updates baselines only - file models do NOT change

			// Group diffs by diff area
			const diffAreasByUri = new Map<URI, DiffArea[]>();
			for (const diffArea of allDiffAreas) {
				if (!diffAreasByUri.has(diffArea.uri)) {
					diffAreasByUri.set(diffArea.uri, []);
				}
				diffAreasByUri.get(diffArea.uri)!.push(diffArea);
			}

			// Update baselines for all files and delete all diffs
			for (const [uri, diffAreas] of diffAreasByUri) {
				const model = this._getTextModel(uri);
				if (!model) {
					continue;
				}

				// Get current file content - this becomes the new baseline
				const currentFileContent = model.getValue();

				// Update baselines for all diff areas in this file
				for (const diffArea of diffAreas) {
					this._diffService.updateDiffAreaSnapshot(diffArea.diffAreaId, currentFileContent);

					// Delete all pending diffs from this area
					for (const diff of diffsByUri.get(uri) || []) {
						if (diff.diffAreaId === diffArea.diffAreaId) {
							this._diffService.deleteDiff(diffArea.diffAreaId, diff.diffId);
							this._updateDiffState(diff.diffAreaId, diff.diffId, DiffState.Accepted);
						}
					}
				}
			}

			// Push workspace undo element (simplified - full undo/redo would require storing previous baselines)
			const workspaceElement: IWorkspaceUndoRedoElement = {
				type: UndoRedoElementType.Workspace,
				resources: Array.from(diffsByUri.keys()),
				label: 'Accept All Diffs',
				code: 'vybe.edit.acceptAll',
				undo: async () => {
					// Undo: restore previous baselines and re-add diffs
					// This is complex - for now, we'll mark as not implemented
					this._logService.warn('[VybeEditService] Undo acceptAll not fully implemented yet');
				},
				redo: async () => {
					// Redo: re-apply baseline updates
					// This is complex - for now, we'll mark as not implemented
					this._logService.warn('[VybeEditService] Redo acceptAll not fully implemented yet');
				},
			};
			this._undoRedoService.pushElement(workspaceElement);

			// Update all transaction states
			this._updateAllTransactionStates(EditTransactionState.Accepted);

			// Emit event
			this._onDidAcceptAll.fire();

			// Notify that edited files summaries changed
			this._notifyEditedFilesChanged();
		} catch (error) {
			this._logService.error('[VybeEditService] Error accepting all', error);
		}
	}

	async rejectAll(): Promise<void> {
		try {
			// Get all diff areas
			const allDiffAreas = this._getAllDiffAreas();
			if (allDiffAreas.length === 0) {
				return;
			}

			// Group by URI
			const diffAreasByUri = new Map<URI, DiffArea[]>();
			for (const diffArea of allDiffAreas) {
				if (!diffAreasByUri.has(diffArea.uri)) {
					diffAreasByUri.set(diffArea.uri, []);
				}
				diffAreasByUri.get(diffArea.uri)!.push(diffArea);
			}

			if (diffAreasByUri.size === 0) {
				return;
			}

			// PHASE B: REJECT ALL LOGIC
			// Files have modified content (from Phase A)
			// Reject writes originalSnapshots back to files (reverts to baselines)

			// Create undo group for all files
			const undoGroup = new UndoRedoGroup();

			// Restore original snapshots for each URI
			const resourceElements: IResourceUndoRedoElement[] = [];

			for (const [uri, diffAreas] of diffAreasByUri) {
				const model = this._getTextModel(uri);
				if (!model) {
					continue;
				}

				// Get original snapshot (from first diff area)
				// PHASE D1: Wrapped with system write guard
				await this._withSystemWrite(async () => {
					const originalSnapshot = diffAreas[0].originalSnapshot;
					const fullRange = model.getFullModelRange();
					const edit: ISingleEditOperation = EditOperation.replace(fullRange, originalSnapshot);
					model.pushEditOperations(null, [edit], () => null, undoGroup);
				});

				// Delete all diffs and update states to Rejected
				for (const diffArea of diffAreas) {
					// Delete all diffs from this area
					const diffIds = Array.from(diffArea.diffs.keys());
					for (const diffId of diffIds) {
						this._diffService.deleteDiff(diffArea.diffAreaId, diffId);
						this._updateDiffState(diffArea.diffAreaId, diffId, DiffState.Rejected);
					}
				}

				// Create resource undo element
				resourceElements.push(this._createResourceUndoElement(
					uri,
					'Reject All Diffs',
					'vybe.edit.rejectAll',
					async () => {
						// Undo: restore current content
						// This is complex - for now, we'll mark as not implemented
						this._logService.warn('[VybeEditService] Undo rejectAll not fully implemented yet');
					},
					async () => {
						// Redo: re-apply original snapshot
						// This is complex - for now, we'll mark as not implemented
						this._logService.warn('[VybeEditService] Redo rejectAll not fully implemented yet');
					}
				));
			}

			// Push workspace undo element
			if (resourceElements.length > 0) {
				const workspaceElement: IWorkspaceUndoRedoElement = {
					type: UndoRedoElementType.Workspace,
					resources: Array.from(diffAreasByUri.keys()),
					label: 'Reject All Diffs',
					code: 'vybe.edit.rejectAll',
					undo: async () => {
						for (const element of resourceElements) {
							await element.undo();
						}
					},
					redo: async () => {
						for (const element of resourceElements) {
							await element.redo();
						}
					},
				};
				this._undoRedoService.pushElement(workspaceElement);
			}

			// Update all transaction states
			this._updateAllTransactionStates(EditTransactionState.Rejected);

			// Emit event
			this._onDidRejectAll.fire();

			// Notify that edited files summaries changed
			this._notifyEditedFilesChanged();
		} catch (error) {
			this._logService.error('[VybeEditService] Error rejecting all', error);
		}
	}

	// ============================================================================
	// Query Operations
	// ============================================================================

	getDiffsForFile(uri: URI): readonly Diff[] {
		try {
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			const diffs: Diff[] = [];
			for (const diffArea of diffAreas) {
				for (const diff of diffArea.diffs.values()) {
					// Apply state updates from _diffStates map
					const updatedState = this._getDiffState(diff);
					const updatedDiff: Diff = {
						...diff,
						state: updatedState
					};
					diffs.push(updatedDiff);
				}
			}
			return diffs;
		} catch (error) {
			this._logService.error('[VybeEditService] Error getting diffs for file', error);
			return [];
		}
	}

	getDiffAreasForFile(uri: URI): readonly DiffArea[] {
		try {
			return this._diffService.getDiffAreasForUri(uri);
		} catch (error) {
			this._logService.error('[VybeEditService] Error getting diff areas for file', error);
			return [];
		}
	}

	getAllDiffs(): readonly Diff[] {
		try {
			const allDiffAreas = this._getAllDiffAreas();
			const diffs: Diff[] = [];
			for (const diffArea of allDiffAreas) {
				for (const diff of diffArea.diffs.values()) {
					// Apply state updates from _diffStates map
					const updatedState = this._getDiffState(diff);
					const updatedDiff: Diff = {
						...diff,
						state: updatedState
					};
					diffs.push(updatedDiff);
				}
			}
			return diffs;
		} catch (error) {
			this._logService.error('[VybeEditService] Error getting all diffs', error);
			return [];
		}
	}

	getAllDiffAreas(): readonly DiffArea[] {
		try {
			return this._getAllDiffAreas();
		} catch (error) {
			this._logService.error('[VybeEditService] Error getting all diff areas', error);
			return [];
		}
	}

	// ============================================================================
	// Checkpoint Operations (Stub for Phase 1C)
	// ============================================================================

	async createCheckpoint(label: string, description?: string): Promise<string> {
		try {
			const checkpointId = generateUuid();
			const epoch = this._nextEpoch++;
			const now = Date.now();

			// Get all file snapshots
			const fileSnapshots = new Map<URI, string>();
			// PHASE D5: Capture diff area snapshots
			const diffAreaSnapshots = new Map<string, DiffAreaSnapshot>();
			const allDiffAreas = this._getAllDiffAreas();
			for (const diffArea of allDiffAreas) {
				if (!fileSnapshots.has(diffArea.uri)) {
					const model = this._getTextModel(diffArea.uri);
					if (model) {
						fileSnapshots.set(diffArea.uri, model.getValue());
					}
				}
				// BLOCKER 3: Capture full diffs map (not just IDs)
				const diffsMap = new Map(diffArea.diffs);
				diffAreaSnapshots.set(diffArea.diffAreaId, {
					diffAreaId: diffArea.diffAreaId,
					uri: diffArea.uri,
					originalSnapshot: diffArea.originalSnapshot,
					originalCode: diffArea.originalCode,
					startLine: diffArea.startLine,
					endLine: diffArea.endLine,
					diffs: diffsMap,
				});
			}

			const checkpoint: Checkpoint = {
				checkpointId,
				epoch,
				label,
				fileSnapshots,
				diffAreaSnapshots, // PHASE D5: Include diff state
				timestamp: now,
				description,
			};

			this._checkpoints.set(checkpointId, checkpoint);
			return checkpointId;
		} catch (error) {
			this._logService.error('[VybeEditService] Error creating checkpoint', error);
			throw error;
		}
	}

	getCheckpoint(checkpointId: string): Checkpoint | undefined {
		return this._checkpoints.get(checkpointId);
	}

	getAllCheckpoints(): readonly Checkpoint[] {
		return Array.from(this._checkpoints.values());
	}

	// ============================================================================
	// File Edit Summaries
	// ============================================================================

	getEditedFiles(): readonly VybeEditedFileSummary[] {
		return this._computeAllSummaries();
	}

	getEditedFile(uri: URI): VybeEditedFileSummary | undefined {
		return this._computeFileSummary(uri);
	}

	/**
	 * Computes a file edit summary for a specific URI.
	 * Aggregates stats from all DiffAreas and Diffs for that file.
	 */
	private _computeFileSummary(uri: URI): VybeEditedFileSummary | undefined {
		try {
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			if (diffAreas.length === 0) {
				return undefined;
			}

			let addedLines = 0;
			let removedLines = 0;
			let diffCount = 0;
			let pendingDiffCount = 0;
			let streamingDiffCount = 0;
			let acceptedDiffCount = 0;
			let rejectedDiffCount = 0;
			let lastModified = 0;

			// Aggregate across all diff areas for this URI
			for (const diffArea of diffAreas) {
				for (const diff of diffArea.diffs.values()) {
					diffCount++;

					// Get actual state (from edit service tracking)
					const actualState = this._getDiffState(diff);

					// Count by state
					switch (actualState) {
						case DiffState.Pending:
							pendingDiffCount++;
							break;
						case DiffState.Streaming:
							streamingDiffCount++;
							break;
						case DiffState.Accepted:
							acceptedDiffCount++;
							break;
						case DiffState.Rejected:
							rejectedDiffCount++;
							break;
					}

					// Calculate line counts
					// For simplicity: use LineRange.length directly
					addedLines += diff.modifiedRange.length;
					removedLines += diff.originalRange.length;

					// Track most recent modification time
					// Use diffArea.createdAt as proxy (could be enhanced with per-diff timestamps)
					lastModified = Math.max(lastModified, diffArea.createdAt);
				}
			}

			if (diffCount === 0) {
				return undefined;
			}

			return {
				uri,
				addedLines,
				removedLines,
				diffCount,
				pendingDiffCount,
				streamingDiffCount,
				acceptedDiffCount,
				rejectedDiffCount,
				hasPendingDiffs: pendingDiffCount > 0,
				hasStreamingDiffs: streamingDiffCount > 0,
				lastModified,
			};
		} catch (error) {
			this._logService.error('[VybeEditService] Error computing file summary', error);
			return undefined;
		}
	}

	/**
	 * Computes summaries for all files with edits.
	 * Returns summaries sorted by lastModified (most recent first).
	 */
	private _computeAllSummaries(): VybeEditedFileSummary[] {
		try {
			// Get all unique URIs from transactions
			const uris = new Set<URI>();
			for (const transaction of this._transactions.values()) {
				uris.add(transaction.uri);
			}

			// Also get URIs from diff areas (in case there are diffs without transactions)
			const allDiffAreas = this._getAllDiffAreas();
			for (const diffArea of allDiffAreas) {
				uris.add(diffArea.uri);
			}

			// Compute summaries for each URI
			const summaries: VybeEditedFileSummary[] = [];
			for (const uri of uris) {
				const summary = this._computeFileSummary(uri);
				if (summary) {
					summaries.push(summary);
				}
			}

			// Sort by lastModified (most recent first)
			summaries.sort((a, b) => b.lastModified - a.lastModified);

			return summaries;
		} catch (error) {
			this._logService.error('[VybeEditService] Error computing all summaries', error);
			return [];
		}
	}

	/**
	 * Notifies listeners that edited file summaries have changed.
	 */
	private _notifyEditedFilesChanged(): void {
		this._onDidChangeEditedFiles.fire();
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Gets a text model for a URI.
	 */
	private _getTextModel(uri: URI): ITextModel | null {
		const model = this._modelService.getModel(uri);
		if (!model) {
			this._logService.warn(`[VybeEditService] Model not found for URI: ${uri.toString()}`);
			return null;
		}
		return model;
	}


	/**
	 * Finds a diff by diffId across all diff areas.
	 */
	private _findDiff(diffId: string): Diff | undefined {
		const allDiffAreas = this._getAllDiffAreas();
		for (const diffArea of allDiffAreas) {
			const diff = diffArea.diffs.get(diffId);
			if (diff) {
				return diff;
			}
		}
		return undefined;
	}

	/**
	 * Updates the state of a diff.
	 *
	 * Note: Since DiffArea is readonly and managed by IVybeDiffService, we track state
	 * separately in _diffStates. This is a workaround for Phase 1C. A proper solution would
	 * extend IVybeDiffService with an updateDiffState method that updates the DiffArea internally.
	 */
	private _updateDiffState(diffAreaId: string, diffId: string, newState: DiffState): void {
		this._diffStates.set(diffId, newState);
		this._logService.trace(`[VybeEditService] Diff state updated: ${diffId} -> ${newState}`);
	}

	/**
	 * Gets the current state of a diff, checking our tracked state first,
	 * then falling back to the diff's original state.
	 */
	private _getDiffState(diff: Diff): DiffState {
		return this._diffStates.get(diff.diffId) ?? diff.state;
	}

	/**
	 * Updates transaction states for a URI.
	 */
	private _updateTransactionStatesForUri(uri: URI, newState: EditTransactionState): void {
		for (const transaction of this._transactions.values()) {
			if (transaction.uri.toString() === uri.toString()) {
				const updatedTransaction: EditTransaction = {
					...transaction,
					state: newState,
					completedAt: newState === EditTransactionState.Accepted || newState === EditTransactionState.Rejected
						? Date.now()
						: transaction.completedAt,
				};
				this._transactions.set(transaction.transactionId, updatedTransaction);

				// Emit completion event if transaction is completed
				if (newState === EditTransactionState.Accepted || newState === EditTransactionState.Rejected) {
					this._onDidCompleteTransaction.fire({
						transactionId: transaction.transactionId,
						uri: transaction.uri,
						state: newState,
					});
				}
			}
		}
	}

	/**
	 * Updates all transaction states.
	 */
	private _updateAllTransactionStates(newState: EditTransactionState): void {
		for (const transaction of this._transactions.values()) {
			const updatedTransaction: EditTransaction = {
				...transaction,
				state: newState,
				completedAt: newState === EditTransactionState.Accepted || newState === EditTransactionState.Rejected
					? Date.now()
					: transaction.completedAt,
			};
			this._transactions.set(transaction.transactionId, updatedTransaction);

			// Emit completion event if transaction is completed
			if (newState === EditTransactionState.Accepted || newState === EditTransactionState.Rejected) {
				this._onDidCompleteTransaction.fire({
					transactionId: transaction.transactionId,
					uri: transaction.uri,
					state: newState,
				});
			}
		}
	}

	/**
	 * Gets all diff areas by querying the diff service for all URIs.
	 * This is a helper that collects all diff areas.
	 */
	private _getAllDiffAreas(): DiffArea[] {
		// Get all unique URIs from transactions
		const uris = new Set<URI>();
		for (const transaction of this._transactions.values()) {
			uris.add(transaction.uri);
		}

		const allDiffAreas: DiffArea[] = [];
		for (const uri of uris) {
			const diffAreas = this._diffService.getDiffAreasForUri(uri);
			allDiffAreas.push(...diffAreas);
		}

		// Also check all diff areas directly from diff service
		// This ensures we get all diff areas even if not associated with a transaction
		// Note: This is a simplified approach. A full implementation would track all URIs with diffs.
		return allDiffAreas;
	}

	/**
	 * Creates a resource undo element.
	 */
	private _createResourceUndoElement(
		resource: URI,
		label: string,
		code: string,
		undo: () => Promise<void> | void,
		redo: () => Promise<void> | void
	): IResourceUndoRedoElement {
		return {
			type: UndoRedoElementType.Resource,
			resource,
			label,
			code,
			undo,
			redo,
		};
	}

	override dispose(): void {
		// Clear in-memory storage
		this._transactions.clear();
		this._checkpoints.clear();
		this._diffStates.clear();
		this._nextEpoch = 1;
		super.dispose();
	}
}

