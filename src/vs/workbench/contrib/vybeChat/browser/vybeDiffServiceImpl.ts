/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Diff Service Implementation
 * Concrete implementation of the diff computation engine.
 * Logic only - no UI, decorations, commands, or checkpoints.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IVybeDiffService, DiffComputationOptions } from '../common/vybeDiffService.js';
import { Diff, DiffArea, DiffState } from '../common/vybeEditTypes.js';

/**
 * Implementation of IVybeDiffService.
 * Computes diffs between original and modified content using VS Code's diff engine.
 */
export class VybeDiffServiceImpl extends Disposable implements IVybeDiffService {
	declare readonly _serviceBrand: undefined;

	/**
	 * In-memory storage for DiffAreas, keyed by diffAreaId.
	 * Reset on reload - no persistence.
	 */
	private readonly _diffAreas = new Map<string, DiffArea>();

	/**
	 * Map of URI to diff area IDs for quick lookup.
	 */
	private readonly _uriToDiffAreaIds = new Map<string, Set<string>>();

	/**
	 * PHASE D1: Write guard flag to prevent recursive recomputation during system writes.
	 */
	private _isSystemWrite: boolean = false;

	/**
	 * Emitter for diff area update events.
	 */
	private readonly _onDidUpdateDiffArea = this._register(new Emitter<{ uri: URI; diffAreaId: string; reason: 'streaming' | 'recompute' | 'deleted' }>());
	readonly onDidUpdateDiffArea: Event<{ uri: URI; diffAreaId: string; reason: 'streaming' | 'recompute' | 'deleted' }> = this._onDidUpdateDiffArea.event;

	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async computeDiffs(
		uri: URI,
		originalContent: string,
		modifiedContent: string,
		options?: DiffComputationOptions
	): Promise<{
		diffs: Diff[];
		diffAreas: DiffArea[];
	}> {
		try {
			// Create in-memory text models for diff computation
			const originalUri = this._createTempUri(uri, 'original');
			const modifiedUri = this._createTempUri(uri, 'modified');

			// Detect language from URI or use plain text
			const languageId = this._detectLanguageId(uri);

			// Create models
			const originalModel = this._modelService.createModel(
				originalContent,
				this._languageService.createById(languageId),
				originalUri
			);
			const modifiedModel = this._modelService.createModel(
				modifiedContent,
				this._languageService.createById(languageId),
				modifiedUri
			);

			try {
				// Compute diff using VS Code's diff engine
				const documentDiff = await this._editorWorkerService.computeDiff(
					originalUri,
					modifiedUri,
					{
						ignoreTrimWhitespace: options?.ignoreTrimWhitespace ?? false,
						maxComputationTimeMs: options?.maxComputationTimeMs ?? 3000,
						computeMoves: options?.computeMoves ?? false,
					},
					'advanced'
				);

				if (!documentDiff) {
					this._logService.warn('[VybeDiffService] Diff computation returned null');
					return { diffs: [], diffAreas: [] };
				}

				if (documentDiff.identical) {
					// No changes - return empty results
					return { diffs: [], diffAreas: [] };
				}

				// Convert IDocumentDiff to VYBE Diff/DiffArea types
				const result = this._convertDocumentDiffToDiffs(
					uri,
					originalContent,
					originalModel,
					modifiedModel,
					documentDiff.changes,
					true // store in memory
				);

				// PHASE A: Write modified content to file model AFTER diffs are computed
				// This ensures file model contains modified content (not original)
				// Must happen BEFORE emitting events so decorations use correct content
				if (result.diffs.length > 0) {
					await this._writeModifiedContentToFile(uri, modifiedContent);
					this._logService.trace(`[VybeDiffService] Wrote modified content to model, ${result.diffs.length} diffs created`);
				}

				// Emit event for each diff area created AFTER writing modified content
				// This ensures decorations are created with correct model content
				for (const diffArea of result.diffAreas) {
					this._onDidUpdateDiffArea.fire({ uri, diffAreaId: diffArea.diffAreaId, reason: 'recompute' });
				}

				return result;
			} finally {
				// Clean up temporary models
				originalModel.dispose();
				modifiedModel.dispose();
			}
		} catch (error) {
			// Never throw on diff failure - log and return empty results
			this._logService.error('[VybeDiffService] Error computing diffs', error);
			return { diffs: [], diffAreas: [] };
		}
	}

	async updateDiffsForStreaming(
		diffAreaId: string,
		newModifiedContent: string,
		streamRequestId?: string
	): Promise<{
		newDiffs: Diff[];
		updatedDiffs: Diff[];
		removedDiffs: Diff[];
	}> {
		try {
			const diffArea = this._diffAreas.get(diffAreaId);
			if (!diffArea) {
				this._logService.warn(`[VybeDiffService] DiffArea not found: ${diffAreaId}`);
				return { newDiffs: [], updatedDiffs: [], removedDiffs: [] };
			}

			// BLOCKER 4: Set streaming state
			diffArea.isStreaming = true;
			if (streamRequestId !== undefined) {
				diffArea.streamRequestId = streamRequestId;
			}

			// Recompute diff between originalSnapshot and newModifiedContent
			// Use internal method to avoid storing a new DiffArea
			const recomputeResult = await this._computeDiffsInternal(
				diffArea.uri,
				diffArea.originalSnapshot,
				newModifiedContent
			);

			// Compare against existing diffs by matching ranges/content (not IDs, since recompute generates new IDs)
			// Create a key function to match diffs by their ranges
			const getDiffKey = (diff: Diff): string => {
				return `${diff.originalRange.startLineNumber}-${diff.originalRange.endLineNumberExclusive}-${diff.modifiedRange.startLineNumber}-${diff.modifiedRange.endLineNumberExclusive}`;
			};

			// Build maps for comparison
			const existingDiffsByKey = new Map<string, Diff>();
			for (const existingDiff of diffArea.diffs.values()) {
				existingDiffsByKey.set(getDiffKey(existingDiff), existingDiff);
			}

			const newDiffsByKey = new Map<string, Diff>();
			for (const newDiff of recomputeResult.diffs) {
				newDiffsByKey.set(getDiffKey(newDiff), newDiff);
			}

			// Find new, updated, and removed diffs
			const newDiffs: Diff[] = [];
			const updatedDiffs: Diff[] = [];
			const removedDiffs: Diff[] = [];

			// Check for new and updated diffs
			for (const newDiff of recomputeResult.diffs) {
				const key = getDiffKey(newDiff);
				const existingDiff = existingDiffsByKey.get(key);

				if (!existingDiff) {
					// New diff (no matching range)
					newDiffs.push(newDiff);
				} else {
					// Same range - check if content changed
					if (
						newDiff.originalCode !== existingDiff.originalCode ||
						newDiff.modifiedCode !== existingDiff.modifiedCode
					) {
						// Preserve existing diffId for updated diffs
						const updatedDiff: Diff = {
							...newDiff,
							diffId: existingDiff.diffId, // Preserve ID
						};
						updatedDiffs.push(updatedDiff);
					}
					// If content is the same, no update needed
				}
			}

			// Find removed diffs (exist in old but not in new)
			for (const existingDiff of diffArea.diffs.values()) {
				const key = getDiffKey(existingDiff);
				if (!newDiffsByKey.has(key)) {
					removedDiffs.push(existingDiff);
				}
			}

			// Build final diff map, preserving IDs for existing diffs
			const finalDiffs = new Map<string, Diff>();

			// Process all recomputed diffs
			for (const newDiff of recomputeResult.diffs) {
				const key = getDiffKey(newDiff);
				const existingDiff = existingDiffsByKey.get(key);

				if (existingDiff) {
					// Match found - preserve existing ID and diffAreaId
					if (
						newDiff.originalCode !== existingDiff.originalCode ||
						newDiff.modifiedCode !== existingDiff.modifiedCode
					) {
						// Content changed - use updated diff with preserved IDs
						finalDiffs.set(existingDiff.diffId, {
							...newDiff,
							diffId: existingDiff.diffId,
							diffAreaId: diffAreaId, // Preserve original diffAreaId
						});
					} else {
						// Content unchanged - keep existing diff as-is
						finalDiffs.set(existingDiff.diffId, existingDiff);
					}
				} else {
					// New diff - use new ID but preserve diffAreaId
					finalDiffs.set(newDiff.diffId, {
						...newDiff,
						diffAreaId: diffAreaId, // Use existing diffAreaId
					});
				}
			}

			// PHASE D2: Recompute startLine/endLine after streaming updates
			let startLine = Number.MAX_SAFE_INTEGER;
			let endLine = 0;
			for (const diff of finalDiffs.values()) {
				if (!diff.modifiedRange.isEmpty) {
					const inclusiveRange = diff.modifiedRange.toInclusiveRange();
					if (inclusiveRange) {
						startLine = Math.min(startLine, inclusiveRange.startLineNumber);
						endLine = Math.max(endLine, inclusiveRange.endLineNumber);
					}
				}
			}
			// If no valid ranges found, keep existing range
			if (startLine === Number.MAX_SAFE_INTEGER || endLine === 0) {
				startLine = diffArea.startLine;
				endLine = diffArea.endLine;
			}

			// BLOCKER 1: Recompute region baseline if range changed
			// Extract region from originalSnapshot using new range
			const originalLines = diffArea.originalSnapshot.split('\n');
			const newRegionBaseline = originalLines.slice(startLine - 1, endLine).join('\n');

			// Update the diff area with final diffs (preserve diffAreaId)
			const updatedDiffArea: DiffArea = {
				...diffArea,
				diffs: finalDiffs,
				startLine,
				endLine,
				originalCode: newRegionBaseline,
				isStreaming: true, // Still streaming
				streamRequestId: diffArea.streamRequestId,
			};
			this._diffAreas.set(diffAreaId, updatedDiffArea);

			// Emit event after diff area is updated
			this._onDidUpdateDiffArea.fire({ uri: diffArea.uri, diffAreaId, reason: 'streaming' });

			// PHASE A: Write modified content to file model after streaming update
			await this._writeModifiedContentToFile(diffArea.uri, newModifiedContent);

			// BLOCKER 4: Note: isStreaming remains true - caller must set to false when streaming completes
			// This allows multiple streaming updates while keeping state

			return { newDiffs, updatedDiffs, removedDiffs };
		} catch (error) {
			this._logService.error('[VybeDiffService] Error updating diffs for streaming', error);
			return { newDiffs: [], updatedDiffs: [], removedDiffs: [] };
		}
	}

	getDiffArea(uri: URI, diffAreaId: string): DiffArea | undefined {
		return this._diffAreas.get(diffAreaId);
	}

	getDiffAreasForUri(uri: URI): readonly DiffArea[] {
		const uriKey = uri.toString();
		const diffAreaIds = this._uriToDiffAreaIds.get(uriKey);
		if (!diffAreaIds) {
			return [];
		}

		const result: DiffArea[] = [];
		for (const diffAreaId of diffAreaIds) {
			const diffArea = this._diffAreas.get(diffAreaId);
			if (diffArea) {
				result.push(diffArea);
			}
		}
		return result;
	}

	/**
	 * Internal method to compute diffs without storing DiffArea.
	 * Used by updateDiffsForStreaming to avoid creating duplicate DiffAreas.
	 */
	private async _computeDiffsInternal(
		uri: URI,
		originalContent: string,
		modifiedContent: string,
		options?: DiffComputationOptions
	): Promise<{
		diffs: Diff[];
	}> {
		try {
			// Create in-memory text models for diff computation
			const originalUri = this._createTempUri(uri, 'original');
			const modifiedUri = this._createTempUri(uri, 'modified');

			// Detect language from URI or use plain text
			const languageId = this._detectLanguageId(uri);

			// Create models
			const originalModel = this._modelService.createModel(
				originalContent,
				this._languageService.createById(languageId),
				originalUri
			);
			const modifiedModel = this._modelService.createModel(
				modifiedContent,
				this._languageService.createById(languageId),
				modifiedUri
			);

			try {
				// Compute diff using VS Code's diff engine
				const documentDiff = await this._editorWorkerService.computeDiff(
					originalUri,
					modifiedUri,
					{
						ignoreTrimWhitespace: options?.ignoreTrimWhitespace ?? false,
						maxComputationTimeMs: options?.maxComputationTimeMs ?? 3000,
						computeMoves: options?.computeMoves ?? false,
					},
					'advanced'
				);

				if (!documentDiff || documentDiff.identical) {
					return { diffs: [] };
				}

				// Convert to diffs without storing DiffArea
				const diffs = this._convertChangesToDiffs(
					uri,
					originalModel,
					modifiedModel,
					documentDiff.changes
				);

				return { diffs };
			} finally {
				// Clean up temporary models
				originalModel.dispose();
				modifiedModel.dispose();
			}
		} catch (error) {
			this._logService.error('[VybeDiffService] Error computing diffs internally', error);
			return { diffs: [] };
		}
	}

	/**
	 * Converts VS Code's IDocumentDiff.changes to VYBE Diff[] and DiffArea[].
	 * Creates exactly ONE DiffArea per file.
	 */
	private _convertDocumentDiffToDiffs(
		uri: URI,
		originalContent: string,
		originalModel: ITextModel,
		modifiedModel: ITextModel,
		changes: readonly DetailedLineRangeMapping[],
		storeInMemory: boolean = true
	): {
		diffs: Diff[];
		diffAreas: DiffArea[];
	} {
		if (changes.length === 0) {
			return { diffs: [], diffAreas: [] };
		}

		// Generate stable IDs
		const diffAreaId = generateUuid();
		const diffs: Diff[] = [];
		const now = Date.now();

		// Convert each change to a Diff (no merging - each change is its own diff)
		// This gives users granular control to accept/reject individual changes
		for (const change of changes) {
			const diffId = generateUuid();

			// Extract code content from models
			const originalCode = this._extractCodeFromRange(originalModel, change.original);
			const modifiedCode = this._extractCodeFromRange(modifiedModel, change.modified);

			const diff: Diff = {
				diffId,
				diffAreaId,
				uri,
				originalRange: change.original,
				modifiedRange: change.modified,
				originalCode,
				modifiedCode,
				state: DiffState.Pending,
			};

			diffs.push(diff);
		}

		// PHASE D2: Compute startLine and endLine from modifiedRange of all diffs
		// These represent the region in the current file model (not baseline)
		let startLine = Number.MAX_SAFE_INTEGER;
		let endLine = 0;
		for (const diff of diffs) {
			if (!diff.modifiedRange.isEmpty) {
				const inclusiveRange = diff.modifiedRange.toInclusiveRange();
				if (inclusiveRange) {
					startLine = Math.min(startLine, inclusiveRange.startLineNumber);
					endLine = Math.max(endLine, inclusiveRange.endLineNumber);
				}
			}
		}
		// If no valid ranges found, use full file range
		if (startLine === Number.MAX_SAFE_INTEGER || endLine === 0) {
			// Try to get line count from modified model
			const lineCount = modifiedModel.getLineCount();
			startLine = 1;
			endLine = lineCount > 0 ? lineCount : 1;
		}

		// BLOCKER 1: Extract region baseline from originalContent
		// This represents the baseline for the region [startLine:endLine]
		const originalLines = originalContent.split('\n');
		const regionBaseline = originalLines.slice(startLine - 1, endLine).join('\n');

		// Create exactly ONE DiffArea per file
		const diffArea: DiffArea = {
			diffAreaId,
			uri,
			diffs: new Map(diffs.map(d => [d.diffId, d])),
			originalSnapshot: originalContent,
			originalCode: regionBaseline,
			createdAt: now,
			startLine,
			endLine,
			isStreaming: false,
		};

		// Store in memory if requested
		if (storeInMemory) {
			this._diffAreas.set(diffAreaId, diffArea);

			// Update URI mapping
			const uriKey = uri.toString();
			if (!this._uriToDiffAreaIds.has(uriKey)) {
				this._uriToDiffAreaIds.set(uriKey, new Set());
			}
			this._uriToDiffAreaIds.get(uriKey)!.add(diffAreaId);
		}

		return {
			diffs,
			diffAreas: [diffArea],
		};
	}

	/**
	 * Converts DetailedLineRangeMapping[] to Diff[] without creating a DiffArea.
	 * Used internally for streaming updates.
	 */
	private _convertChangesToDiffs(
		uri: URI,
		originalModel: ITextModel,
		modifiedModel: ITextModel,
		changes: readonly DetailedLineRangeMapping[]
	): Diff[] {
		if (changes.length === 0) {
			return [];
		}

		// Generate a temporary diffAreaId for grouping (not stored)
		const tempDiffAreaId = generateUuid();
		const diffs: Diff[] = [];

		// Convert each DetailedLineRangeMapping to a Diff
		for (const change of changes) {
			const diffId = generateUuid();

			// Extract code content from models
			const originalCode = this._extractCodeFromRange(originalModel, change.original);
			const modifiedCode = this._extractCodeFromRange(modifiedModel, change.modified);

			const diff: Diff = {
				diffId,
				diffAreaId: tempDiffAreaId, // Temporary ID, will be replaced when merging
				uri,
				originalRange: change.original,
				modifiedRange: change.modified,
				originalCode,
				modifiedCode,
				state: DiffState.Pending,
			};

			diffs.push(diff);
		}

		return diffs;
	}

	/**
	 * Extracts code content from a model for a given LineRange.
	 */
	private _extractCodeFromRange(model: ITextModel, lineRange: LineRange): string {
		if (lineRange.isEmpty) {
			return '';
		}

		// Convert LineRange to Range for getValueInRange
		const inclusiveRange = lineRange.toInclusiveRange();
		if (!inclusiveRange) {
			// Empty range
			return '';
		}

		// Extract content using Range (includes full lines)
		return model.getValueInRange(inclusiveRange);
	}

	/**
	 * Creates a temporary URI for in-memory model creation.
	 */
	private _createTempUri(baseUri: URI, suffix: string): URI {
		return baseUri.with({
			scheme: 'vybe-diff-temp',
			path: `${baseUri.path}-${suffix}-${generateUuid()}`,
		});
	}

	/**
	 * Detects language ID from URI or defaults to plain text.
	 */
	private _detectLanguageId(uri: URI): string {
		const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(uri, '');
		return languageId || 'plaintext';
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
	 * PHASE A: Writes modified content to the file model.
	 * This ensures the file model contains modified content (not original) after diffs are computed.
	 * Must be called AFTER computeDiffs completes.
	 * PHASE D1: Wrapped with system write guard to prevent recursive recomputation.
	 */
	private async _writeModifiedContentToFile(uri: URI, modifiedContent: string): Promise<void> {
		return this._withSystemWrite(async () => {
			try {
				// Get or create model for URI
				let model = this._modelService.getModel(uri);
				if (!model) {
					// Model doesn't exist, create it
					const languageId = this._detectLanguageId(uri);
					model = this._modelService.createModel(
						modifiedContent,
						this._languageService.createById(languageId),
						uri
					);
				} else {
					// Model exists, update its content
					model.setValue(modifiedContent);
				}
				this._logService.trace(`[VybeDiffService] Wrote modified content to file model: ${uri.toString()}`);
			} catch (error) {
				this._logService.error(`[VybeDiffService] Error writing modified content to file: ${uri.toString()}`, error);
			}
		});
	}

	/**
	 * Public method to write modified content to file model with system write guard.
	 * Used when model mounts with original content to restore modified content.
	 */
	async writeModifiedContentToFile(uri: URI, modifiedContent: string): Promise<void> {
		await this._writeModifiedContentToFile(uri, modifiedContent);
	}

	/**
	 * PHASE B: Updates the baseline snapshot for a diff area.
	 * BLOCKER 1: Also updates region baseline (originalCode) when accepting.
	 */
	updateDiffAreaSnapshot(diffAreaId: string, newSnapshot: string): void {
		const diffArea = this._diffAreas.get(diffAreaId);
		if (!diffArea) {
			this._logService.warn(`[VybeDiffService] DiffArea not found for snapshot update: ${diffAreaId}`);
			return;
		}

		// BLOCKER 1: Extract region baseline from new snapshot
		const newSnapshotLines = newSnapshot.split('\n');
		const startLine = Math.max(1, diffArea.startLine);
		const endLine = Math.min(newSnapshotLines.length, diffArea.endLine);
		const newRegionBaseline = newSnapshotLines.slice(startLine - 1, endLine).join('\n');

		// Update both full-file snapshot and region baseline
		const updatedDiffArea: DiffArea = {
			...diffArea,
			originalSnapshot: newSnapshot,
			originalCode: newRegionBaseline,
		};
		this._diffAreas.set(diffAreaId, updatedDiffArea);

		// Emit update event
		this._onDidUpdateDiffArea.fire({ uri: diffArea.uri, diffAreaId, reason: 'recompute' });
		this._logService.trace(`[VybeDiffService] Updated baseline snapshot for diffArea ${diffAreaId}`);
	}

	/**
	 * VOID-STYLE: Merges an accepted diff into the baseline (originalCode).
	 * This preserves remaining diffs by only updating the baseline for the accepted diff region.
	 * Matches Void's logic: merge diff.code into originalCode using string manipulation.
	 */
	mergeAcceptedDiffIntoBaseline(diffAreaId: string, diff: Diff): void {
		const diffArea = this._diffAreas.get(diffAreaId);
		if (!diffArea) {
			this._logService.warn(`[VybeDiffService] DiffArea not found for baseline merge: ${diffAreaId}`);
			return;
		}

		// VOID-STYLE: Merge accepted diff into originalCode (region baseline)
		// This preserves remaining diffs by only updating the specific region
		const originalLines = diffArea.originalCode.split('\n');
		let newOriginalCode: string;

		const isInsertion = diff.originalRange.isEmpty;
		const isDeletion = diff.modifiedRange.isEmpty;

		if (isDeletion) {
			// Deletion: remove the deleted lines from originalCode
			// Void: [...originalLines.slice(0, originalStartLine - 1), ...originalLines.slice(originalEndLine - 1 + 1)]
			const originalStartLine = diff.originalRange.startLineNumber;
			const originalEndLine = diff.originalRange.endLineNumberExclusive;
			newOriginalCode = [
				...originalLines.slice(0, originalStartLine - 1), // everything before startLine
				// <-- deletion has nothing here
				...originalLines.slice(originalEndLine - 1) // everything after endLine (inclusive, so +1 from exclusive)
			].join('\n');
		} else if (isInsertion) {
			// Insertion: insert diff.modifiedCode into originalCode
			// Void: [...originalLines.slice(0, originalStartLine - 1), diff.code, ...originalLines.slice(originalStartLine - 1)]
			const originalStartLine = diff.originalRange.startLineNumber;
			newOriginalCode = [
				...originalLines.slice(0, originalStartLine - 1), // everything before startLine
				diff.modifiedCode, // inserted code
				...originalLines.slice(originalStartLine - 1) // startLine (inclusive) and on
			].join('\n');
		} else {
			// Edit: replace the edited lines in originalCode
			// Void: [...originalLines.slice(0, originalStartLine - 1), diff.code, ...originalLines.slice(originalEndLine - 1 + 1)]
			const originalStartLine = diff.originalRange.startLineNumber;
			const originalEndLine = diff.originalRange.endLineNumberExclusive;
			newOriginalCode = [
				...originalLines.slice(0, originalStartLine - 1), // everything before startLine
				diff.modifiedCode, // edited code
				...originalLines.slice(originalEndLine - 1) // everything after endLine (inclusive, so +1 from exclusive)
			].join('\n');
		}

		// Update region baseline (originalCode) with merged content
		// Note: We don't update originalSnapshot here - that's only updated on acceptFile/acceptAll
		const updatedDiffArea: DiffArea = {
			...diffArea,
			originalCode: newOriginalCode,
		};
		this._diffAreas.set(diffAreaId, updatedDiffArea);

		this._logService.trace(`[VybeDiffService] Merged accepted diff into baseline for diffArea ${diffAreaId}: originalCode length ${diffArea.originalCode.length} -> ${newOriginalCode.length}`);
	}

	/**
	 * PHASE D3: Realigns diff area ranges when user edits occur.
	 * Handles 6 cases matching Void's logic:
	 * 1. Change fully below diff area → no change
	 * 2. Change fully above diff area → shift down by delta
	 * 3. Change fully within diff area → expand diff area by delta
	 * 4. Change fully contains diff area → replace diff area range
	 * 5. Change overlaps top → adjust start, expand end
	 * 6. Change overlaps bottom → expand end
	 */
	realignDiffAreaRanges(uri: URI, changeText: string, changeRange: { startLineNumber: number; endLineNumber: number }): void {
		const uriKey = uri.toString();
		const diffAreaIds = this._uriToDiffAreaIds.get(uriKey);
		if (!diffAreaIds || diffAreaIds.size === 0) {
			return;
		}

		const startLine = changeRange.startLineNumber;
		const endLine = changeRange.endLineNumber;

		// Compute net number of newlines that were added/removed
		const newTextHeight = (changeText.match(/\n/g) || []).length + 1; // number of newlines is number of \n's + 1
		const changedRangeHeight = endLine - startLine + 1;
		const deltaNewlines = newTextHeight - changedRangeHeight;

		// Realign each diff area
		for (const diffAreaId of diffAreaIds) {
			const diffArea = this._diffAreas.get(diffAreaId);
			if (!diffArea) {
				continue;
			}

			// Case 1: Change fully below diff area → no change
			if (diffArea.endLine < startLine) {
				continue;
			}
			// Case 2: Change fully above diff area → shift down by delta
			else if (endLine < diffArea.startLine) {
				diffArea.startLine += deltaNewlines;
				diffArea.endLine += deltaNewlines;
			}
			// Case 3: Change fully within diff area → expand diff area by delta
			else if (startLine >= diffArea.startLine && endLine <= diffArea.endLine) {
				diffArea.endLine += deltaNewlines;
			}
			// Case 4: Change fully contains diff area → replace diff area range
			else if (diffArea.startLine > startLine && diffArea.endLine < endLine) {
				diffArea.startLine = startLine;
				diffArea.endLine = startLine + newTextHeight;
			}
			// Case 5: Change overlaps top of diff area → adjust start, expand end
			else if (startLine < diffArea.startLine && diffArea.startLine <= endLine) {
				const numOverlappingLines = endLine - diffArea.startLine + 1;
				const numRemainingLinesInDA = diffArea.endLine - diffArea.startLine + 1 - numOverlappingLines;
				const newHeight = (numRemainingLinesInDA - 1) + (newTextHeight - 1) + 1;
				diffArea.startLine = startLine;
				diffArea.endLine = startLine + newHeight;
			}
			// Case 6: Change overlaps bottom of diff area → expand end
			else if (startLine <= diffArea.endLine && diffArea.endLine < endLine) {
				const numOverlappingLines = diffArea.endLine - startLine + 1;
				diffArea.endLine += newTextHeight - numOverlappingLines;
			}

			// Update the diff area in the map (mutation is allowed since it's not readonly)
			this._diffAreas.set(diffAreaId, diffArea);
		}
	}

	/**
	 * BLOCKER 4: Aborts streaming for a diff area.
	 */
	abortStreaming(diffAreaId: string): void {
		const diffArea = this._diffAreas.get(diffAreaId);
		if (!diffArea) {
			this._logService.warn(`[VybeDiffService] DiffArea not found for abort: ${diffAreaId}`);
			return;
		}

		diffArea.isStreaming = false;
		diffArea.streamRequestId = undefined;
		this._logService.trace(`[VybeDiffService] Aborted streaming for diffArea ${diffAreaId}`);
	}

	/**
	 * BLOCKER 3: Restores a diff area directly from snapshot.
	 * Preserves diff IDs and structure without recomputation.
	 */
	restoreDiffArea(diffAreaId: string, diffArea: DiffArea): void {
		// Restore diff area in map
		this._diffAreas.set(diffAreaId, diffArea);

		// Ensure URI mapping exists
		const uriKey = diffArea.uri.toString();
		if (!this._uriToDiffAreaIds.has(uriKey)) {
			this._uriToDiffAreaIds.set(uriKey, new Set());
		}
		this._uriToDiffAreaIds.get(uriKey)!.add(diffAreaId);

		// Emit update event
		this._onDidUpdateDiffArea.fire({ uri: diffArea.uri, diffAreaId, reason: 'recompute' });
		this._logService.trace(`[VybeDiffService] Restored diffArea ${diffAreaId} from snapshot`);
	}

	/**
	 * PHASE B: Deletes a diff from a diff area.
	 */
	deleteDiff(diffAreaId: string, diffId: string): void {
		const diffArea = this._diffAreas.get(diffAreaId);
		if (!diffArea) {
			this._logService.warn(`[VybeDiffService] DiffArea not found for diff deletion: ${diffAreaId}`);
			return;
		}

		// Remove diff from map
		const updatedDiffs = new Map(diffArea.diffs);
		updatedDiffs.delete(diffId);

		// If diff area becomes empty, delete it
		if (updatedDiffs.size === 0) {
			this._diffAreas.delete(diffAreaId);
			const uriKey = diffArea.uri.toString();
			const diffAreaIds = this._uriToDiffAreaIds.get(uriKey);
			if (diffAreaIds) {
				diffAreaIds.delete(diffAreaId);
				if (diffAreaIds.size === 0) {
					this._uriToDiffAreaIds.delete(uriKey);
				}
			}
			this._logService.trace(`[VybeDiffService] Deleted empty diffArea ${diffAreaId}`);
		} else {
			// Update diff area with remaining diffs
			const updatedDiffArea: DiffArea = {
				...diffArea,
				diffs: updatedDiffs,
			};
			this._diffAreas.set(diffAreaId, updatedDiffArea);
		}

		// Emit update event with 'deleted' reason to trigger immediate refresh
		this._onDidUpdateDiffArea.fire({ uri: diffArea.uri, diffAreaId, reason: 'deleted' });
		this._logService.trace(`[VybeDiffService] Deleted diff ${diffId} from diffArea ${diffAreaId}, remaining diffs: ${updatedDiffs.size}`);
	}

	/**
	 * PHASE D4: Recomputes diffs for a file when its content changes.
	 * Extracts region [startLine:endLine] from current file model and compares against baseline.
	 */
	async recomputeDiffsForFile(uri: URI): Promise<void> {
		// PHASE D1: Don't recompute during system writes
		if (this._isSystemWrite) {
			return;
		}

		try {
			const uriKey = uri.toString();
			const diffAreaIds = this._uriToDiffAreaIds.get(uriKey);
			if (!diffAreaIds || diffAreaIds.size === 0) {
				// No diff areas for this file
				return;
			}

			// Get the file model to extract current content
			const model = this._modelService.getModel(uri);
			if (!model) {
				this._logService.warn(`[VybeDiffService] Model not found for recomputation: ${uri.toString()}`);
				return;
			}

			// Recompute diffs for each diff area
			for (const diffAreaId of diffAreaIds) {
				const diffArea = this._diffAreas.get(diffAreaId);
				if (!diffArea || diffArea.uri.toString() !== uri.toString()) {
					continue;
				}

				// BLOCKER 5: Skip recomputation if diff area is streaming
				// This prevents conflicts between streaming updates and user-edit recomputation
				if (diffArea.isStreaming) {
					this._logService.trace(`[VybeDiffService] Skipping recomputation for streaming diffArea ${diffAreaId}`);
					continue;
				}

				// VOID-STYLE: Delete all existing diffs first (like Void's _clearAllEffects)
				// This ensures a clean slate and prevents stale state from preserved IDs
				const existingDiffIds = Array.from(diffArea.diffs.keys());
				this._logService.trace(`[VybeDiffService] Deleting ${existingDiffIds.length} existing diffs before recompute for diffArea ${diffAreaId}`);
				for (const diffId of existingDiffIds) {
					// Delete from diffArea but don't emit events (we'll emit after recompute)
					diffArea.diffs.delete(diffId);
				}

				// PHASE D4: Extract current file content [startLine:endLine] from model
				const startLine = Math.max(1, diffArea.startLine);
				const endLine = Math.min(model.getLineCount(), diffArea.endLine);
				const currentRegionContent = model.getValueInRange(
					new Range(startLine, 1, endLine, Number.MAX_SAFE_INTEGER)
				);

				// BLOCKER 1: Use region-specific baseline (originalCode) instead of full-file baseline
				// Compare region-to-region, not region-to-full-file
				const baselineContent = diffArea.originalCode;

				this._logService.trace(`[VybeDiffService] Recomputing diffs for diffArea ${diffAreaId}: baseline=${baselineContent.length} chars, current=${currentRegionContent.length} chars`);

				// Recompute diff between baseline and current region
				const recomputeResult = await this._computeDiffsInternal(
					uri,
					baselineContent,
					currentRegionContent
				);

				this._logService.trace(`[VybeDiffService] Recomputation found ${recomputeResult.diffs.length} new diffs for diffArea ${diffAreaId}`);

				// VOID-STYLE: Use all recomputed diffs with fresh IDs (no matching/preservation)
				// This matches Void's behavior: delete all, recompute all, create fresh IDs
				const newDiffs = new Map<string, Diff>();
				for (const newDiff of recomputeResult.diffs) {
					// All diffs get fresh IDs from _computeDiffsInternal
					newDiffs.set(newDiff.diffId, newDiff);
				}

				// Update the DiffArea with fresh diffs
				const updatedDiffArea: DiffArea = {
					...diffArea,
					diffs: newDiffs,
				};

				this._diffAreas.set(diffAreaId, updatedDiffArea);

				this._logService.trace(`[VybeDiffService] Updated diffArea ${diffAreaId}: ${newDiffs.size} fresh diffs (was ${existingDiffIds.length})`);

				// Emit update event
				this._onDidUpdateDiffArea.fire({ uri, diffAreaId, reason: 'recompute' });
			}
		} catch (error) {
			this._logService.error('[VybeDiffService] Error recomputing diffs for file', error);
		}
	}

	override dispose(): void {
		// Clear in-memory storage
		this._diffAreas.clear();
		this._uriToDiffAreaIds.clear();
		super.dispose();
	}
}

