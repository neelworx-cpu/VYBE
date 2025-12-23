/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Checkpoint Types
 * Data structures for checkpoint timeline system.
 */

import { URI } from '../../../../base/common/uri.js';

/**
 * Unique identifier for a checkpoint.
 */
export type CheckpointId = string;

/**
 * A checkpoint represents a snapshot of file states at a specific point in time.
 * Used for multi-file undo/redo operations.
 */
export interface VybeCheckpoint {
	/** Unique identifier for this checkpoint */
	readonly checkpointId: CheckpointId;
	/** Epoch number for ordering checkpoints (incremental) */
	readonly epoch: number;
	/** Human-readable label for this checkpoint */
	readonly label: string;
	/** Creation timestamp (milliseconds since epoch) */
	readonly timestamp: number;
	/** URIs of files included in this checkpoint */
	readonly affectedUris: readonly URI[];
	/** File content snapshots at checkpoint time, keyed by URI */
	readonly fileSnapshots: ReadonlyMap<URI, string>;
	/** Optional description of the checkpoint */
	readonly description?: string;
}

