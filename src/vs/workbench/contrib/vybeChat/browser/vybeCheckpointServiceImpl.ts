/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Checkpoint Service Implementation
 * Manages checkpoints for multi-file undo/redo operations.
 * Infrastructure only - no UI.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IUndoRedoService, UndoRedoElementType, UndoRedoGroup, IWorkspaceUndoRedoElement } from '../../../../platform/undoRedo/common/undoRedo.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IVybeCheckpointService } from '../common/vybeCheckpointService.js';
import { VybeCheckpoint } from '../common/vybeCheckpointTypes.js';

/**
 * Implementation of IVybeCheckpointService.
 * Captures and restores file snapshots for multi-file undo/redo.
 */
export class VybeCheckpointServiceImpl extends Disposable implements IVybeCheckpointService {
	declare readonly _serviceBrand: undefined;

	/**
	 * In-memory storage for checkpoints, keyed by checkpointId.
	 * Reset on reload - no persistence.
	 */
	private readonly _checkpoints = new Map<string, VybeCheckpoint>();

	/**
	 * Ordered list of checkpoints (sorted by epoch, oldest first).
	 * Maintained for efficient getCheckpoints() and getLatestCheckpoint().
	 */
	private readonly _checkpointsByEpoch: VybeCheckpoint[] = [];

	/**
	 * Epoch counter for ordering checkpoints (increments for each checkpoint).
	 * Starts at 1 (0 reserved for initial state if needed).
	 */
	private _epochCounter = 1;

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	createCheckpoint(
		label: string,
		uris: readonly URI[],
		reason?: 'acceptFile' | 'acceptAll'
	): string {
		try {
			const checkpointId = generateUuid();
			const epoch = this._epochCounter++;
			const timestamp = Date.now();

			// Capture file snapshots
			const fileSnapshots = new Map<URI, string>();
			const affectedUris: URI[] = [];

			for (const uri of uris) {
				const model = this._modelService.getModel(uri);
				if (!model) {
					// Model not found - skip this URI (best-effort)
					this._logService.warn(`[VybeCheckpointService] Model not found for URI: ${uri.toString()}`);
					continue;
				}

				// Capture current content
				const snapshot = model.getValue();
				fileSnapshots.set(uri, snapshot);
				affectedUris.push(uri);
			}

			if (affectedUris.length === 0) {
				this._logService.warn(`[VybeCheckpointService] No valid models found for checkpoint creation`);
				// Still create checkpoint with empty snapshots (for consistency)
			}

			// Create checkpoint
			const checkpoint: VybeCheckpoint = {
				checkpointId,
				epoch,
				label,
				timestamp,
				affectedUris,
				fileSnapshots,
				description: reason ? `Checkpoint created for ${reason}` : undefined,
			};

			// Store checkpoint
			this._checkpoints.set(checkpointId, checkpoint);
			this._checkpointsByEpoch.push(checkpoint);
			// Keep sorted by epoch (should already be sorted, but ensure it)
			this._checkpointsByEpoch.sort((a, b) => a.epoch - b.epoch);

			this._logService.trace(
				`[VybeCheckpointService] Created checkpoint ${checkpointId} (epoch ${epoch}) for ${affectedUris.length} files${reason ? ` (reason: ${reason})` : ''}`
			);

			return checkpointId;
		} catch (error) {
			this._logService.error('[VybeCheckpointService] Error creating checkpoint', error);
			// Return empty string on error (caller should handle)
			return '';
		}
	}

	async restoreCheckpoint(checkpointId: string): Promise<void> {
		try {
			const checkpoint = this._checkpoints.get(checkpointId);
			if (!checkpoint) {
				this._logService.warn(`[VybeCheckpointService] Checkpoint not found: ${checkpointId}`);
				return;
			}

			this._logService.trace(`[VybeCheckpointService] Restoring checkpoint ${checkpointId} (epoch ${checkpoint.epoch})`);

			// Create undo group for workspace-level undo
			const undoGroup = new UndoRedoGroup();

			// Restore each file snapshot
			for (const [uri, snapshot] of checkpoint.fileSnapshots) {
				try {
					const model = this._modelService.getModel(uri);
					if (!model) {
						this._logService.warn(`[VybeCheckpointService] Model not found for URI during restore: ${uri.toString()}`);
						continue;
					}

					// Apply full-range replace to restore snapshot
					const fullRange = model.getFullModelRange();
					const edit: ISingleEditOperation = EditOperation.replace(fullRange, snapshot);

					// Use pushEditOperations to integrate with undo/redo
					model.pushEditOperations(null, [edit], () => null, undoGroup);
				} catch (error) {
					// Best-effort: log error but continue with other files
					this._logService.error(`[VybeCheckpointService] Error restoring file ${uri.toString()}`, error);
				}
			}

			// Push workspace undo element for multi-file undo
			if (checkpoint.affectedUris.length > 0) {
				const workspaceElement: IWorkspaceUndoRedoElement = {
					type: UndoRedoElementType.Workspace,
					label: `Restore checkpoint: ${checkpoint.label}`,
					code: 'vybe.checkpoint.restore',
					undo: async () => {
						// Undo is handled by individual file undo stacks
						// This element is mainly for grouping
					},
					redo: async () => {
						// Redo is handled by individual file undo stacks
						// This element is mainly for grouping
					},
				};

				this._undoRedoService.pushElement(workspaceElement, undoGroup);
			}

			this._logService.trace(
				`[VybeCheckpointService] Restored checkpoint ${checkpointId} for ${checkpoint.affectedUris.length} files`
			);
		} catch (error) {
			// Never throw - best-effort restore
			this._logService.error(`[VybeCheckpointService] Error restoring checkpoint ${checkpointId}`, error);
		}
	}

	getCheckpoints(): readonly VybeCheckpoint[] {
		// Return ordered list (already sorted by epoch)
		return this._checkpointsByEpoch;
	}

	getLatestCheckpoint(): VybeCheckpoint | undefined {
		// Return checkpoint with highest epoch (last in sorted array)
		return this._checkpointsByEpoch.length > 0
			? this._checkpointsByEpoch[this._checkpointsByEpoch.length - 1]
			: undefined;
	}

	getCheckpoint(checkpointId: string): VybeCheckpoint | undefined {
		return this._checkpoints.get(checkpointId);
	}

	override dispose(): void {
		// Clear in-memory storage
		this._checkpoints.clear();
		this._checkpointsByEpoch.length = 0;
		this._epochCounter = 1;
		super.dispose();
	}
}

