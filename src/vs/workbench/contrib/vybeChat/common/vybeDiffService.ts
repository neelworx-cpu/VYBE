/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Diff Service
 * Service for computing and managing diffs between original and modified content.
 */

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Diff, DiffArea } from './vybeEditTypes.js';

export const IVybeDiffService = createDecorator<IVybeDiffService>('vybeDiffService');

/**
 * Options for diff computation.
 */
export interface DiffComputationOptions {
	/**
	 * When true, ignore whitespace changes in diff computation.
	 * @default false
	 */
	ignoreTrimWhitespace?: boolean;

	/**
	 * Maximum time in milliseconds to spend computing the diff.
	 * @default 3000
	 */
	maxComputationTimeMs?: number;

	/**
	 * When true, compute moved text blocks in addition to insertions and deletions.
	 * @default false
	 */
	computeMoves?: boolean;
}

/**
 * Service for computing and managing diffs.
 * Handles conversion from IDocumentDiff to VYBE Diff/DiffArea types.
 */
export interface IVybeDiffService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when a diff area is updated.
	 * @param uri File URI
	 * @param diffAreaId DiffArea identifier
	 * @param reason Reason for the update: 'streaming' for streaming updates, 'recompute' for initial diff creation, 'deleted' for diff deletion
	 */
	readonly onDidUpdateDiffArea: Event<{ uri: URI; diffAreaId: string; reason: 'streaming' | 'recompute' | 'deleted' }>;

	/**
	 * Computes diffs between original and modified content.
	 * Returns array of Diff objects grouped by DiffArea.
	 *
	 * @param uri File URI for context
	 * @param originalContent Original file content (baseline)
	 * @param modifiedContent Modified file content (current state)
	 * @param options Optional diff computation options
	 * @returns Promise resolving to computed diffs and diff areas
	 */
	computeDiffs(
		uri: URI,
		originalContent: string,
		modifiedContent: string,
		options?: DiffComputationOptions
	): Promise<{
		diffs: Diff[];
		diffAreas: DiffArea[];
	}>;

	/**
	 * Updates existing diffs when content changes incrementally.
	 * Used for streaming scenarios where content grows over time.
	 *
	 * @param diffAreaId DiffArea identifier to update
	 * @param newModifiedContent New modified content (incremental update)
	 * @param streamRequestId Optional stream request ID for abort
	 * @returns Promise resolving to new, updated, and removed diffs
	 */
	updateDiffsForStreaming(
		diffAreaId: string,
		newModifiedContent: string,
		streamRequestId?: string
	): Promise<{
		newDiffs: Diff[];
		updatedDiffs: Diff[];
		removedDiffs: Diff[];
	}>;

	/**
	 * Gets a diff area for a given URI and diff area ID.
	 * @param uri File URI
	 * @param diffAreaId DiffArea identifier
	 * @returns DiffArea if found, undefined otherwise
	 */
	getDiffArea(uri: URI, diffAreaId: string): DiffArea | undefined;

	/**
	 * Gets all diff areas for a URI.
	 * @param uri File URI
	 * @returns Array of diff areas for the URI
	 */
	getDiffAreasForUri(uri: URI): readonly DiffArea[];

	/**
	 * PHASE D4: Recomputes diffs for a file when its content changes.
	 * Extracts region [startLine:endLine] from current file and compares against baseline.
	 * This keeps diff ranges accurate after user edits.
	 *
	 * @param uri File URI
	 * @returns Promise resolving when recomputation is complete
	 */
	recomputeDiffsForFile(uri: URI): Promise<void>;

	/**
	 * PHASE B: Updates the baseline snapshot for a diff area.
	 * Used when accepting diffs - the current file content becomes the new baseline.
	 *
	 * @param diffAreaId DiffArea identifier
	 * @param newSnapshot New baseline snapshot (full file content)
	 */
	updateDiffAreaSnapshot(diffAreaId: string, newSnapshot: string): void;

	/**
	 * VOID-STYLE: Merges an accepted diff into the baseline (originalCode).
	 * This preserves remaining diffs by only updating the baseline for the accepted diff region.
	 * Used when accepting a single diff to avoid invalidating remaining diffs.
	 *
	 * @param diffAreaId DiffArea identifier
	 * @param diff The diff being accepted
	 */
	mergeAcceptedDiffIntoBaseline(diffAreaId: string, diff: Diff): void;

	/**
	 * PHASE B: Deletes a diff from a diff area.
	 * Used when accepting or rejecting a diff.
	 *
	 * @param diffAreaId DiffArea identifier
	 * @param diffId Diff identifier to delete
	 */
	deleteDiff(diffAreaId: string, diffId: string): void;

	/**
	 * PHASE D1: Checks if a system write is currently in progress.
	 * System writes (accept/reject/streaming) should not trigger recomputation.
	 *
	 * @returns true if a system write is in progress, false otherwise
	 */
	isSystemWrite(): boolean;

	/**
	 * PHASE D3: Realigns diff area ranges when user edits occur.
	 * Adjusts startLine/endLine of all diff areas for a URI based on the edit.
	 * Must be called BEFORE recomputation to ensure correct region extraction.
	 *
	 * @param uri File URI
	 * @param changeText Text that was inserted/replaced
	 * @param changeRange Range of the change in the file model
	 */
	realignDiffAreaRanges(uri: URI, changeText: string, changeRange: { startLineNumber: number; endLineNumber: number }): void;

	/**
	 * BLOCKER 4: Aborts streaming for a diff area.
	 * Sets isStreaming to false and clears streamRequestId.
	 *
	 * @param diffAreaId DiffArea identifier
	 */
	abortStreaming(diffAreaId: string): void;

	/**
	 * BLOCKER 3: Restores a diff area directly from snapshot.
	 * Preserves diff IDs and structure without recomputation.
	 *
	 * @param diffAreaId DiffArea identifier
	 * @param diffArea Complete diff area to restore
	 */
	restoreDiffArea(diffAreaId: string, diffArea: DiffArea): void;

	/**
	 * Writes modified content to the file model with system write guard.
	 * Used when model mounts with original content to restore modified content.
	 *
	 * @param uri File URI
	 * @param modifiedContent Modified content to write
	 */
	writeModifiedContentToFile(uri: URI, modifiedContent: string): Promise<void>;
}

