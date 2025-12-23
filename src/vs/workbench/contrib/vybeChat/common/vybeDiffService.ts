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
	 * @param reason Reason for the update: 'streaming' for streaming updates, 'recompute' for initial diff creation
	 */
	readonly onDidUpdateDiffArea: Event<{ uri: URI; diffAreaId: string; reason: 'streaming' | 'recompute' }>;

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
	 * @returns Promise resolving to new, updated, and removed diffs
	 */
	updateDiffsForStreaming(
		diffAreaId: string,
		newModifiedContent: string
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
}

