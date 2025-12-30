/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Patch Utilities for Phase 3B (Node.js Only)
 *
 * Provides unified diff parsing, validation, and in-memory application.
 * This file MUST be in node/ directory because it uses the 'diff' package
 * which is Node.js-only and cannot run in browser/renderer context.
 */

import { applyPatch, parsePatch } from 'diff';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a parsed patch hunk
 */
export interface PatchHunk {
	/** Starting line number in original file (1-indexed) */
	oldStart: number;
	/** Number of lines in original file */
	oldLines: number;
	/** Starting line number in modified file (1-indexed) */
	newStart: number;
	/** Number of lines in modified file */
	newLines: number;
	/** Lines to remove (from original) */
	removedLines: string[];
	/** Lines to add (to modified) */
	addedLines: string[];
}

/**
 * Result of patch validation
 */
export interface PatchValidationResult {
	/** Whether patch is valid */
	valid: boolean;
	/** Error message if invalid */
	error?: string;
	/** Number of hunks in patch */
	hunkCount: number;
}

// ============================================================================
// PATCH PARSING
// ============================================================================

/**
 * Parse a unified diff patch string into structured hunks
 * @param patch Unified diff format patch string
 * @returns Array of parsed patch hunks
 * @throws Error if patch cannot be parsed
 */
export function parseUnifiedDiff(patch: string): PatchHunk[] {
	try {
		const parsed = parsePatch(patch);
		if (parsed.length === 0) {
			throw new Error('Patch contains no diffs');
		}

		// For now, we only support single-file patches
		if (parsed.length > 1) {
			throw new Error('Multi-file patches are not supported');
		}

		const diff = parsed[0];
		const hunks: PatchHunk[] = [];

		for (const hunk of diff.hunks || []) {
			hunks.push({
				oldStart: hunk.oldStart,
				oldLines: hunk.oldLines,
				newStart: hunk.newStart,
				newLines: hunk.newLines,
				removedLines: hunk.lines.filter((line: string) => line.startsWith('-')).map((line: string) => line.substring(1)),
				addedLines: hunk.lines.filter((line: string) => line.startsWith('+')).map((line: string) => line.substring(1))
			});
		}

		return hunks;
	} catch (error) {
		throw new Error(`Failed to parse patch: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// ============================================================================
// PATCH VALIDATION
// ============================================================================

/**
 * Validate that a patch can be applied to the given original content
 * @param originalContent Original file content
 * @param patch Unified diff format patch string
 * @returns Validation result with validity status and error message if invalid
 */
export function validatePatch(originalContent: string, patch: string): PatchValidationResult {
	try {
		// First, try to parse the patch
		const hunks = parseUnifiedDiff(patch);
		const hunkCount = hunks.length;

		// Try to apply the patch in memory to validate it
		const result = applyPatch(originalContent, patch);
		if (result === false) {
			return {
				valid: false,
				error: 'Patch cannot be applied to current file content (context mismatch or invalid line numbers)',
				hunkCount
			};
		}

		return {
			valid: true,
			hunkCount
		};
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : String(error),
			hunkCount: 0
		};
	}
}

// ============================================================================
// PATCH APPLICATION
// ============================================================================

/**
 * Apply a unified diff patch to content in memory
 * @param originalContent Original file content
 * @param patch Unified diff format patch string
 * @returns New content with patch applied, or null if application failed
 */
export function applyPatchInMemory(originalContent: string, patch: string): string | null {
	try {
		const result = applyPatch(originalContent, patch);
		if (result === false) {
			return null;
		}
		return result;
	} catch (error) {
		// Log error but return null to indicate failure
		console.error('[vybePatchUtils] Failed to apply patch:', error);
		return null;
	}
}


