/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Checkpoint Service
 * Service for creating and restoring checkpoints for multi-file undo/redo.
 */

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { VybeCheckpoint } from './vybeCheckpointTypes.js';

export const IVybeCheckpointService = createDecorator<IVybeCheckpointService>('vybeCheckpointService');

/**
 * Service for managing checkpoints in the AI edit timeline.
 * Enables multi-file undo/redo operations.
 */
export interface IVybeCheckpointService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a checkpoint for the specified files.
	 * Captures current file content snapshots.
	 *
	 * @param label Human-readable label for the checkpoint
	 * @param uris Files to include in checkpoint
	 * @param reason Reason for checkpoint creation (for logging)
	 * @returns Checkpoint ID
	 */
	createCheckpoint(
		label: string,
		uris: readonly URI[],
		reason?: 'acceptFile' | 'acceptAll'
	): string;

	/**
	 * Restores a checkpoint by applying stored file snapshots.
	 * This will restore all files in the checkpoint to their snapshot state.
	 *
	 * @param checkpointId Checkpoint to restore
	 * @returns Promise that resolves when restoration is complete
	 */
	restoreCheckpoint(checkpointId: string): Promise<void>;

	/**
	 * Gets all checkpoints in epoch order (oldest first).
	 * @returns Array of checkpoints sorted by epoch
	 */
	getCheckpoints(): readonly VybeCheckpoint[];

	/**
	 * Gets the latest checkpoint (highest epoch).
	 * @returns Latest checkpoint, or undefined if no checkpoints exist
	 */
	getLatestCheckpoint(): VybeCheckpoint | undefined;

	/**
	 * Gets a checkpoint by ID.
	 * @param checkpointId Checkpoint identifier
	 * @returns Checkpoint if found, undefined otherwise
	 */
	getCheckpoint(checkpointId: string): VybeCheckpoint | undefined;
}

