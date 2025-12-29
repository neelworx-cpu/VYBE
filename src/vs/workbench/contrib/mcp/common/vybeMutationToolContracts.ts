/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mutation MCP Tool Contracts
 *
 * Defines TypeScript interfaces for mutating MCP tools.
 * These tools modify editor state and require approval.
 *
 * Tools:
 * - vybe.create_edit_transaction: Create a new edit transaction (no approval)
 * - vybe.accept_diff: Accept a single diff (requires approval)
 * - vybe.reject_diff: Reject a single diff (requires approval)
 * - vybe.accept_file: Accept all diffs in a file (requires approval)
 * - vybe.reject_file: Reject all diffs in a file (requires approval)
 */

import { VybeToolError, VybeToolErrorCode } from './vybeReadOnlyToolContracts.js';

// ============================================================================
// EXTENDED ERROR CODES
// ============================================================================

/**
 * Extended error codes for Phase 3A mutation tools
 * Extends VybeToolErrorCode with mutation-specific codes
 */
export enum VybeMutationToolErrorCode {
	// Re-export Phase 2 error codes (as string literals to match base enum)
	RESOURCE_OUTSIDE_WORKSPACE = 'RESOURCE_OUTSIDE_WORKSPACE',
	RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
	INVALID_URI = 'INVALID_URI',
	INTERNAL_ERROR = 'INTERNAL_ERROR',
	// Phase 3A specific error codes
	APPROVAL_DENIED = 'APPROVAL_DENIED',
	TRANSACTION_CREATION_FAILED = 'TRANSACTION_CREATION_FAILED',
	TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
	DIFF_NOT_FOUND = 'DIFF_NOT_FOUND',
	DIFF_ALREADY_ACCEPTED = 'DIFF_ALREADY_ACCEPTED',
	DIFF_ALREADY_REJECTED = 'DIFF_ALREADY_REJECTED',
	NO_DIFFS_FOUND = 'NO_DIFFS_FOUND',
	// Phase 3B specific error codes
	PATCH_PARSE_FAILED = 'PATCH_PARSE_FAILED',
	PATCH_APPLY_FAILED = 'PATCH_APPLY_FAILED',
	PATCH_VALIDATION_FAILED = 'PATCH_VALIDATION_FAILED',
	SAVE_FAILED = 'SAVE_FAILED',
	FILE_EXISTS = 'FILE_EXISTS'
}

// Re-export VybeToolError for convenience
export type { VybeToolError };

/**
 * Extended error interface that accepts both base and mutation error codes
 * Uses a union type for the code field to support both error code enums
 */
export interface VybeMutationToolError {
	code: VybeToolErrorCode | VybeMutationToolErrorCode;
	message: string;
	details?: {
		resource?: string;
		reason?: string;
		[key: string]: unknown;
	};
}

// ============================================================================
// TOOL 1: vybe.create_edit_transaction
// ============================================================================

/**
 * Input for vybe.create_edit_transaction
 */
export interface VybeCreateEditTransactionInput {
	/** File URI for the transaction */
	uri: string;
	/** Original file content (baseline snapshot) */
	originalContent: string;
	/** Whether this transaction is for streaming content */
	streaming?: boolean;
	/**
	 * @internal TEST-ONLY: Modified content to seed diffs immediately.
	 * Only works when VYBE_DEV_TESTS=1 is set.
	 * This allows headless testing of accept/reject operations without UI widgets.
	 */
	modifiedContent?: string;
}

/**
 * Output for vybe.create_edit_transaction
 */
export interface VybeCreateEditTransactionOutput {
	/** Unique transaction identifier */
	transactionId: string;
	/** Associated diff area identifier */
	diffAreaId: string;
}

// ============================================================================
// TOOL 2: vybe.accept_diff
// ============================================================================

/**
 * Input for vybe.accept_diff
 */
export interface VybeAcceptDiffInput {
	/** Unique identifier of the diff to accept */
	diffId: string;
}

/**
 * Output for vybe.accept_diff
 */
export interface VybeAcceptDiffOutput {
	/** Whether the operation succeeded */
	success: boolean;
	/** The diff ID that was accepted */
	diffId: string;
}

// ============================================================================
// TOOL 3: vybe.reject_diff
// ============================================================================

/**
 * Input for vybe.reject_diff
 */
export interface VybeRejectDiffInput {
	/** Unique identifier of the diff to reject */
	diffId: string;
}

/**
 * Output for vybe.reject_diff
 */
export interface VybeRejectDiffOutput {
	/** Whether the operation succeeded */
	success: boolean;
	/** The diff ID that was rejected */
	diffId: string;
}

// ============================================================================
// TOOL 4: vybe.accept_file
// ============================================================================

/**
 * Input for vybe.accept_file
 */
export interface VybeAcceptFileInput {
	/** File URI to accept all diffs for */
	uri: string;
}

/**
 * Output for vybe.accept_file
 */
export interface VybeAcceptFileOutput {
	/** Whether the operation succeeded */
	success: boolean;
	/** The file URI that was accepted */
	uri: string;
	/** Number of diffs that were accepted */
	diffCount: number;
}

// ============================================================================
// TOOL 5: vybe.reject_file
// ============================================================================

/**
 * Input for vybe.reject_file
 */
export interface VybeRejectFileInput {
	/** File URI to reject all diffs for */
	uri: string;
}

/**
 * Output for vybe.reject_file
 */
export interface VybeRejectFileOutput {
	/** Whether the operation succeeded */
	success: boolean;
	/** The file URI that was rejected */
	uri: string;
	/** Number of diffs that were rejected */
	diffCount: number;
}

// ============================================================================
// TOOL 6: vybe.write_file
// ============================================================================

/**
 * Input for vybe.write_file
 */
export interface VybeWriteFileInput {
	/** File URI to write to */
	uri: string;
	/** New file content */
	content: string;
	/** Whether to overwrite if file exists (default: true) */
	overwrite?: boolean;
}

/**
 * Output for vybe.write_file
 */
export interface VybeWriteFileOutput {
	/** Whether the operation succeeded */
	success: boolean;
	/** The file URI that was written */
	uri: string;
	/** Number of diffs that were created */
	diffCount: number;
	/** Whether the file was successfully saved to disk (false if save failed but editor state was mutated) */
	saved: boolean;
}

// ============================================================================
// TOOL 7: vybe.apply_patch
// ============================================================================

/**
 * Input for vybe.apply_patch
 */
export interface VybeApplyPatchInput {
	/** File URI to apply patch to */
	uri: string;
	/** Unified diff format patch string */
	patch: string;
}

/**
 * Output for vybe.apply_patch
 */
export interface VybeApplyPatchOutput {
	/** Whether the operation succeeded */
	success: boolean;
	/** The file URI that was patched */
	uri: string;
	/** Number of diffs that were created */
	diffCount: number;
	/** Number of patch hunks that were applied */
	appliedHunks: number;
	/** Whether the file was successfully saved to disk (false if save failed but editor state was mutated) */
	saved: boolean;
}

