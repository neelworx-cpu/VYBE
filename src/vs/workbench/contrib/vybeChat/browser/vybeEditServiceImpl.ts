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
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { IUndoRedoService, UndoRedoElementType, UndoRedoGroup, IResourceUndoRedoElement, IWorkspaceUndoRedoElement } from '../../../../platform/undoRedo/common/undoRedo.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IVybeEditService, EditTransaction } from '../common/vybeEditService.js';
import { IVybeDiffService } from '../common/vybeDiffService.js';
import { IVybeCheckpointService } from '../common/vybeCheckpointService.js';
import { ITextFileService } from '../../../../workbench/services/textfile/common/textfiles.js';
import { SaveReason } from '../../../../workbench/common/editor.js';
import { Diff, DiffArea, Checkpoint, DiffState, EditTransactionState, VybeEditedFileSummary } from '../common/vybeEditTypes.js';

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
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
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

	/**
	 * INTERNAL/TEST-ONLY: Seeds diffs into an existing transaction.
	 * This method computes diffs using the transaction's diffAreaId and stores them
	 * in the diff service, making them available for accept/reject operations.
	 *
	 * This is a headless mechanism for testing Phase 3A without requiring UI widgets.
	 *
	 * @param transactionId Transaction identifier
	 * @param originalContent Original content (baseline) - must match what was passed to createEditTransaction
	 * @param modifiedContent Modified content to diff against original
	 * @returns Promise resolving to true if diffs were created, false otherwise
	 */
	async _seedDiffsForTransaction(transactionId: string, originalContent: string, modifiedContent: string): Promise<boolean> {
		try {
			const transaction = this._transactions.get(transactionId);
			if (!transaction) {
				this._logService.warn(`[VybeEditService] Transaction not found: ${transactionId}`);
				return false;
			}

			// Compute diffs using the transaction's diffAreaId
			const result = await this._diffService.computeDiffs(
				transaction.uri,
				originalContent,
				modifiedContent,
				{ diffAreaId: transaction.diffAreaId }
			);

			if (result.diffs.length === 0) {
				this._logService.trace(`[VybeEditService] No diffs computed for transaction: ${transactionId}`);
				return false;
			}

			this._logService.trace(`[VybeEditService] Seeded ${result.diffs.length} diffs for transaction: ${transactionId}`);
			return true;
		} catch (error) {
			this._logService.error('[VybeEditService] Error seeding diffs for transaction', error);
			return false;
		}
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

			// Convert LineRange to Range
			const range = this._convertLineRangeToRange(diff.modifiedRange);
			if (!range) {
				this._logService.warn(`[VybeEditService] Invalid range for diff: ${diffId}`);
				return false;
			}

			// Apply the edit
			const edit: ISingleEditOperation = EditOperation.replace(range, diff.modifiedCode);
			const undoEdits: ISingleEditOperation[] = [];

			model.pushEditOperations(null, [edit], (undoEditOps) => {
				undoEdits.push(...undoEditOps);
				return null;
			});

			// Update diff state
			this._updateDiffState(diff.diffAreaId, diffId, DiffState.Accepted);

			// Push undo element
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				diff.uri,
				'Accept Diff',
				'vybe.edit.accept',
				async () => {
					// Undo: restore original code
					const originalRange = this._convertLineRangeToRange(diff.originalRange);
					if (originalRange && model && !model.isDisposed()) {
						model.pushEditOperations(null, [EditOperation.replace(originalRange, diff.originalCode)], () => null);
						// Restore previous state (remove from tracked states to revert to original)
						this._diffStates.delete(diffId);
					}
				},
				async () => {
					// Redo: re-apply modified code
					if (range && model && !model.isDisposed()) {
						model.pushEditOperations(null, [EditOperation.replace(range, diff.modifiedCode)], () => null);
						this._updateDiffState(diff.diffAreaId, diffId, DiffState.Accepted);
					}
				}
			));

			// Emit event
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

			// Convert LineRange to Range
			const range = this._convertLineRangeToRange(diff.modifiedRange);
			if (!range) {
				this._logService.warn(`[VybeEditService] Invalid range for diff: ${diffId}`);
				return false;
			}

			// Restore original code
			const edit: ISingleEditOperation = EditOperation.replace(range, diff.originalCode);
			const undoEdits: ISingleEditOperation[] = [];

			model.pushEditOperations(null, [edit], (undoEditOps) => {
				undoEdits.push(...undoEditOps);
				return null;
			});

			// Update diff state
			this._updateDiffState(diff.diffAreaId, diffId, DiffState.Rejected);

			// Push undo element
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				diff.uri,
				'Reject Diff',
				'vybe.edit.reject',
				async () => {
					// Undo: restore modified code
					if (range && model && !model.isDisposed()) {
						model.pushEditOperations(null, [EditOperation.replace(range, diff.modifiedCode)], () => null);
						// Restore previous state (remove from tracked states to revert to original)
						this._diffStates.delete(diffId);
					}
				},
				async () => {
					// Redo: re-apply original code
					if (range && model && !model.isDisposed()) {
						model.pushEditOperations(null, [EditOperation.replace(range, diff.originalCode)], () => null);
						this._updateDiffState(diff.diffAreaId, diffId, DiffState.Rejected);
					}
				}
			));

			// Emit event
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

	async acceptFile(uri: URI, autoSave: boolean = false): Promise<void> {
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

			// Create checkpoint BEFORE applying edits
			const checkpointId = this._checkpointService.createCheckpoint(
				`Accept File: ${uri.toString()}`,
				[uri],
				'acceptFile'
			);
			if (checkpointId) {
				this._logService.trace(`[VybeEditService] Created checkpoint ${checkpointId} before acceptFile`);
			}

			// Create undo group for all edits
			const undoGroup = new UndoRedoGroup();

			// Apply all edits in a single undo group
			const edits: ISingleEditOperation[] = [];
			for (const diff of pendingDiffs) {
				const range = this._convertLineRangeToRange(diff.modifiedRange);
				if (range) {
					edits.push(EditOperation.replace(range, diff.modifiedCode));
				}
			}

			if (edits.length > 0) {
				model.pushEditOperations(null, edits, () => null, undoGroup);

				// Update all diff states
				for (const diff of pendingDiffs) {
					this._updateDiffState(diff.diffAreaId, diff.diffId, DiffState.Accepted);
				}

				// Push undo element for entire file
				this._undoRedoService.pushElement(this._createResourceUndoElement(
					uri,
					'Accept All Diffs',
					'vybe.edit.acceptFile',
					async () => {
						// Undo: restore original code for all diffs
						if (model && !model.isDisposed()) {
							const undoEdits: ISingleEditOperation[] = [];
							for (const diff of pendingDiffs) {
								const range = this._convertLineRangeToRange(diff.originalRange);
								if (range) {
									undoEdits.push(EditOperation.replace(range, diff.originalCode));
								}
							}
							if (undoEdits.length > 0) {
								model.pushEditOperations(null, undoEdits, () => null, undoGroup);
								for (const diff of pendingDiffs) {
									// Restore previous state (remove from tracked states)
									this._diffStates.delete(diff.diffId);
								}
							}
						}
					},
					async () => {
						// Redo: re-apply modified code for all diffs
						if (model && !model.isDisposed()) {
							if (edits.length > 0) {
								model.pushEditOperations(null, edits, () => null, undoGroup);
								for (const diff of pendingDiffs) {
									this._updateDiffState(diff.diffAreaId, diff.diffId, DiffState.Accepted);
								}
							}
						}
					}
				));
			}

			// Update transaction states
			this._updateTransactionStatesForUri(uri, EditTransactionState.Accepted);

			// Emit events for each diff area
			for (const diffArea of diffAreas) {
				this._onDidAcceptFile.fire({ uri, diffAreaId: diffArea.diffAreaId });
			}

			// Auto-save if requested (Phase 3B)
			if (autoSave) {
				try {
					// Check if model is dirty before saving
					if (this._textFileService.isDirty(uri)) {
						await this._textFileService.save(uri, { reason: SaveReason.EXPLICIT });
						this._logService.trace(`[VybeEditService] Auto-saved file after acceptFile: ${uri.toString()}`);
					}
				} catch (saveError) {
					// Log save failure but don't throw - model state is preserved
					this._logService.warn(`[VybeEditService] Failed to auto-save file after acceptFile: ${uri.toString()}`, saveError);
				}
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

			// Get original snapshot from first diff area (they should all have the same snapshot)
			const originalSnapshot = diffAreas[0].originalSnapshot;

			// Replace entire file content
			const fullRange = model.getFullModelRange();
			const edit: ISingleEditOperation = EditOperation.replace(fullRange, originalSnapshot);

			model.pushEditOperations(null, [edit], () => null);

			// Update all diff states to Rejected
			for (const diffArea of diffAreas) {
				for (const diff of diffArea.diffs.values()) {
					this._updateDiffState(diffArea.diffAreaId, diff.diffId, DiffState.Rejected);
				}
			}

			// Push undo element
			this._undoRedoService.pushElement(this._createResourceUndoElement(
				uri,
				'Reject All Diffs',
				'vybe.edit.rejectFile',
				async () => {
					// Undo: restore current content (before rejection)
					if (model && !model.isDisposed()) {
						const currentContent = model.getValue();
						model.pushEditOperations(null, [EditOperation.replace(fullRange, currentContent)], () => null);
						// Restore diff states (would need to track previous states, simplified here)
					}
				},
				async () => {
					// Redo: re-apply original snapshot
					if (model && !model.isDisposed()) {
						model.pushEditOperations(null, [EditOperation.replace(fullRange, originalSnapshot)], () => null);
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

			// Create checkpoint BEFORE applying edits
			const affectedUris = Array.from(diffsByUri.keys());
			const checkpointId = this._checkpointService.createCheckpoint(
				'Accept All Diffs',
				affectedUris,
				'acceptAll'
			);
			if (checkpointId) {
				this._logService.trace(`[VybeEditService] Created checkpoint ${checkpointId} before acceptAll for ${affectedUris.length} files`);
			}

			// Create undo group for all files
			const undoGroup = new UndoRedoGroup();

			// Apply edits for each URI
			const resourceElements: IResourceUndoRedoElement[] = [];

			for (const [uri, diffs] of diffsByUri) {
				const model = this._getTextModel(uri);
				if (!model) {
					continue;
				}

				const edits: ISingleEditOperation[] = [];
				for (const diff of diffs) {
					const range = this._convertLineRangeToRange(diff.modifiedRange);
					if (range) {
						edits.push(EditOperation.replace(range, diff.modifiedCode));
					}
				}

				if (edits.length > 0) {
					model.pushEditOperations(null, edits, () => null, undoGroup);

					// Update diff states
					for (const diff of diffs) {
						this._updateDiffState(diff.diffAreaId, diff.diffId, DiffState.Accepted);
					}

					// Create resource undo element
					resourceElements.push(this._createResourceUndoElement(
						uri,
						'Accept All Diffs',
						'vybe.edit.acceptAll',
						async () => {
							// Undo: restore original code
							if (model && !model.isDisposed()) {
								const undoEdits: ISingleEditOperation[] = [];
								for (const diff of diffs) {
									const range = this._convertLineRangeToRange(diff.originalRange);
									if (range) {
										undoEdits.push(EditOperation.replace(range, diff.originalCode));
									}
								}
								if (undoEdits.length > 0) {
									model.pushEditOperations(null, undoEdits, () => null, undoGroup);
									for (const diff of diffs) {
										// Restore previous state (remove from tracked states)
										this._diffStates.delete(diff.diffId);
									}
								}
							}
						},
						async () => {
							// Redo: re-apply modified code
							if (model && !model.isDisposed()) {
								if (edits.length > 0) {
									model.pushEditOperations(null, edits, () => null, undoGroup);
									for (const diff of diffs) {
										this._updateDiffState(diff.diffAreaId, diff.diffId, DiffState.Accepted);
									}
								}
							}
						}
					));
				}
			}

			// Push workspace undo element
			if (resourceElements.length > 0) {
				const workspaceElement: IWorkspaceUndoRedoElement = {
					type: UndoRedoElementType.Workspace,
					resources: Array.from(diffsByUri.keys()),
					label: 'Accept All Diffs',
					code: 'vybe.edit.acceptAll',
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
				const originalSnapshot = diffAreas[0].originalSnapshot;
				const fullRange = model.getFullModelRange();
				const edit: ISingleEditOperation = EditOperation.replace(fullRange, originalSnapshot);

				model.pushEditOperations(null, [edit], () => null, undoGroup);

				// Update all diff states to Rejected
				for (const diffArea of diffAreas) {
					for (const diff of diffArea.diffs.values()) {
						this._updateDiffState(diffArea.diffAreaId, diff.diffId, DiffState.Rejected);
					}
				}

				// Create resource undo element
				resourceElements.push(this._createResourceUndoElement(
					uri,
					'Reject All Diffs',
					'vybe.edit.rejectAll',
					async () => {
						// Undo: restore current content
						if (model && !model.isDisposed()) {
							const currentContent = model.getValue();
							model.pushEditOperations(null, [EditOperation.replace(fullRange, currentContent)], () => null, undoGroup);
						}
					},
					async () => {
						// Redo: re-apply original snapshot
						if (model && !model.isDisposed()) {
							model.pushEditOperations(null, [EditOperation.replace(fullRange, originalSnapshot)], () => null, undoGroup);
							for (const diffArea of diffAreas) {
								for (const diff of diffArea.diffs.values()) {
									this._updateDiffState(diffArea.diffAreaId, diff.diffId, DiffState.Rejected);
								}
							}
						}
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
					diffs.push(diff);
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
					diffs.push(diff);
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

			// Get all file snapshots (stub - full implementation in Phase 3)
			const fileSnapshots = new Map<URI, string>();
			const allDiffAreas = this._getAllDiffAreas();
			for (const diffArea of allDiffAreas) {
				if (!fileSnapshots.has(diffArea.uri)) {
					const model = this._getTextModel(diffArea.uri);
					if (model) {
						fileSnapshots.set(diffArea.uri, model.getValue());
					}
				}
			}

			const checkpoint: Checkpoint = {
				checkpointId,
				epoch,
				label,
				fileSnapshots,
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
	 * Converts a LineRange to a Range for edit operations.
	 */
	private _convertLineRangeToRange(lineRange: LineRange): Range | null {
		return lineRange.toInclusiveRange();
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

