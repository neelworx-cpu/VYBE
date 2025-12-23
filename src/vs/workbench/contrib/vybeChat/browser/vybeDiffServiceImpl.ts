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
	 * Emitter for diff area update events.
	 */
	private readonly _onDidUpdateDiffArea = this._register(new Emitter<{ uri: URI; diffAreaId: string; reason: 'streaming' | 'recompute' }>());
	readonly onDidUpdateDiffArea: Event<{ uri: URI; diffAreaId: string; reason: 'streaming' | 'recompute' }> = this._onDidUpdateDiffArea.event;

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

				// Emit event for each diff area created
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
		newModifiedContent: string
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

			// Update the diff area with final diffs (preserve diffAreaId)
			const updatedDiffArea: DiffArea = {
				...diffArea,
				diffs: finalDiffs,
			};
			this._diffAreas.set(diffAreaId, updatedDiffArea);

			// Emit event after diff area is updated
			this._onDidUpdateDiffArea.fire({ uri: diffArea.uri, diffAreaId, reason: 'streaming' });

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

		// Convert each DetailedLineRangeMapping to a Diff
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

		// Create exactly ONE DiffArea per file
		const diffArea: DiffArea = {
			diffAreaId,
			uri,
			diffs: new Map(diffs.map(d => [d.diffId, d])),
			originalSnapshot: originalContent,
			createdAt: now,
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

	override dispose(): void {
		// Clear in-memory storage
		this._diffAreas.clear();
		this._uriToDiffAreaIds.clear();
		super.dispose();
	}
}

