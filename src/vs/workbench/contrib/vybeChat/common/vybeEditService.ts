/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Edit Service
 * Main service interface for managing AI edit transactions, diffs, and checkpoints.
 */

import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Diff, DiffArea, Checkpoint, EditTransactionState, VybeEditedFileSummary } from './vybeEditTypes.js';

export const IVybeEditService = createDecorator<IVybeEditService>('vybeEditService');

/**
 * Main service for AI edit operations.
 * Handles accept/reject flows, transaction lifecycle, and checkpoint management.
 */
export interface IVybeEditService {
	readonly _serviceBrand: undefined;

	// Events
	/**
	 * Emitted when a new edit transaction is created.
	 */
	readonly onDidCreateTransaction: Event<{ transactionId: string; uri: URI; diffAreaId: string }>;

	/**
	 * Emitted when a transaction completes (accepted or rejected).
	 */
	readonly onDidCompleteTransaction: Event<{ transactionId: string; uri: URI; state: EditTransactionState }>;

	/**
	 * Emitted when a single diff is accepted.
	 */
	readonly onDidAcceptDiff: Event<{ diffId: string; uri: URI; diffAreaId: string }>;

	/**
	 * Emitted when a single diff is rejected.
	 */
	readonly onDidRejectDiff: Event<{ diffId: string; uri: URI; diffAreaId: string }>;

	/**
	 * Emitted when all diffs in a file are accepted.
	 */
	readonly onDidAcceptFile: Event<{ uri: URI; diffAreaId: string }>;

	/**
	 * Emitted when all diffs in a file are rejected.
	 */
	readonly onDidRejectFile: Event<{ uri: URI; diffAreaId: string }>;

	/**
	 * Emitted when all diffs across all files are accepted.
	 */
	readonly onDidAcceptAll: Event<void>;

	/**
	 * Emitted when all diffs across all files are rejected.
	 */
	readonly onDidRejectAll: Event<void>;

	/**
	 * Emitted when edited file summaries change.
	 * Fires after diffs are created, updated, accepted, or rejected.
	 */
	readonly onDidChangeEditedFiles: Event<void>;

	// Single diff operations
	/**
	 * Accept a single diff, applying the change to the file.
	 * @param diffId Unique identifier of the diff to accept
	 * @returns Promise resolving to true if accepted, false otherwise
	 */
	acceptDiff(diffId: string): Promise<boolean>;

	/**
	 * Reject a single diff, reverting the change.
	 * @param diffId Unique identifier of the diff to reject
	 * @returns Promise resolving to true if rejected, false otherwise
	 */
	rejectDiff(diffId: string): Promise<boolean>;

	// File-level operations
	/**
	 * Accept all diffs in a file.
	 * Creates a checkpoint before accepting.
	 * @param uri File URI to accept all diffs for
	 */
	acceptFile(uri: URI): Promise<void>;

	/**
	 * Reject all diffs in a file, reverting all changes.
	 * @param uri File URI to reject all diffs for
	 */
	rejectFile(uri: URI): Promise<void>;

	// Global operations
	/**
	 * Accept all diffs across all files.
	 * Creates a checkpoint before accepting.
	 */
	acceptAll(): Promise<void>;

	/**
	 * Reject all diffs across all files.
	 */
	rejectAll(): Promise<void>;

	// Transaction management
	/**
	 * Creates a new edit transaction for a file.
	 *
	 * CRITICAL: This method MUST NOT compute diffs.
	 * Diff computation belongs exclusively to IVybeDiffService.
	 * modifiedContent is NOT required at creation time.
	 * This enables streaming workflows where final content is unknown.
	 *
	 * @param uri File URI for the transaction
	 * @param originalContent Original file content (baseline snapshot)
	 * @param options Optional transaction options
	 * @returns Promise resolving to transaction ID
	 */
	createEditTransaction(
		uri: URI,
		originalContent: string,
		options?: {
			streaming?: boolean;
			source?: 'agent' | 'user' | 'tool';
		}
	): Promise<string>;

	/**
	 * Gets an edit transaction by ID.
	 * @param transactionId Transaction identifier
	 * @returns EditTransaction if found, undefined otherwise
	 */
	getEditTransaction(transactionId: string): EditTransaction | undefined;

	// Query operations
	/**
	 * Gets all diffs for a file.
	 * @param uri File URI
	 * @returns Array of diffs for the file
	 */
	getDiffsForFile(uri: URI): readonly Diff[];

	/**
	 * Gets all diff areas for a file.
	 * @param uri File URI
	 * @returns Array of diff areas for the file
	 */
	getDiffAreasForFile(uri: URI): readonly DiffArea[];

	/**
	 * Gets all diffs across all files.
	 * @returns Array of all diffs
	 */
	getAllDiffs(): readonly Diff[];

	/**
	 * Gets all diff areas across all files.
	 * @returns Array of all diff areas
	 */
	getAllDiffAreas(): readonly DiffArea[];

	// Checkpoint operations
	/**
	 * Creates a checkpoint for undo/redo across files.
	 * @param label Human-readable label for the checkpoint
	 * @param description Optional description
	 * @returns Promise resolving to checkpoint ID
	 */
	createCheckpoint(label: string, description?: string): Promise<string>;

	/**
	 * Gets a checkpoint by ID.
	 * @param checkpointId Checkpoint identifier
	 * @returns Checkpoint if found, undefined otherwise
	 */
	getCheckpoint(checkpointId: string): Checkpoint | undefined;

	/**
	 * Gets all checkpoints.
	 * @returns Array of all checkpoints
	 */
	getAllCheckpoints(): readonly Checkpoint[];

	// File edit summaries
	/**
	 * Gets summaries for all files with edits.
	 * @returns Array of file edit summaries, sorted by lastModified (most recent first)
	 */
	getEditedFiles(): readonly VybeEditedFileSummary[];

	/**
	 * Gets the edit summary for a specific file.
	 * @param uri File URI
	 * @returns File edit summary if the file has edits, undefined otherwise
	 */
	getEditedFile(uri: URI): VybeEditedFileSummary | undefined;

	/**
	 * PHASE D1: Checks if a system write is currently in progress.
	 * System writes (accept/reject) should not trigger recomputation.
	 *
	 * @returns true if a system write is in progress, false otherwise
	 */
	isSystemWrite(): boolean;
}

/**
 * Represents an edit transaction lifecycle.
 * Tracks the state of AI-generated edits for a file.
 */
export interface EditTransaction {
	/** Unique identifier for this transaction */
	readonly transactionId: string;
	/** File URI this transaction applies to */
	readonly uri: URI;
	/** Current state of the transaction */
	readonly state: EditTransactionState;
	/** Associated DiffArea identifier */
	readonly diffAreaId: string;
	/** Timestamp when transaction was created */
	readonly createdAt: number;
	/** Timestamp when transaction was completed (if completed) */
	readonly completedAt?: number;
	/** Source of the edit (agent, user, or tool) */
	readonly source?: 'agent' | 'user' | 'tool';
}

