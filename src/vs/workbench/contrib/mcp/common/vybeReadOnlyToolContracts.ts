/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Read-Only MCP Tool Contracts
 *
 * Defines TypeScript interfaces and Zod schemas for read-only MCP tools.
 * These tools are READ-ONLY and workspace-scoped.
 *
 * Tools:
 * - vybe.read_file: Read file content
 * - vybe.list_files: List directory contents
 * - vybe.get_file_info: Get file metadata
 * - vybe.compute_diff: Compute diff between two content strings
 * - vybe.get_diff_areas: Get existing diff areas for a file
 */

// Note: Zod schemas removed - validation happens at runtime via TypeScript types

// ============================================================================
// SHARED ERROR CONTRACT
// ============================================================================

/**
 * Error codes for Phase 2 tools
 */
export enum VybeToolErrorCode {
	/** Resource is outside workspace */
	RESOURCE_OUTSIDE_WORKSPACE = 'RESOURCE_OUTSIDE_WORKSPACE',
	/** Resource does not exist */
	RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
	/** Resource is not a file (e.g., trying to read a directory) */
	RESOURCE_NOT_FILE = 'RESOURCE_NOT_FILE',
	/** Resource is not a directory (e.g., trying to list files of a file) */
	RESOURCE_NOT_DIRECTORY = 'RESOURCE_NOT_DIRECTORY',
	/** Invalid URI format */
	INVALID_URI = 'INVALID_URI',
	/** File is too large to read */
	FILE_TOO_LARGE = 'FILE_TOO_LARGE',
	/** Diff computation failed */
	DIFF_COMPUTATION_FAILED = 'DIFF_COMPUTATION_FAILED',
	/** Internal error */
	INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Structured error response for all Phase 2 tools
 */
export interface VybeToolError {
	code: VybeToolErrorCode;
	message: string;
	details?: {
		resource?: string;
		reason?: string;
		[key: string]: unknown;
	};
}


// ============================================================================
// TOOL 1: vybe.read_file
// ============================================================================

/**
 * Input for vybe.read_file
 */
export interface VybeReadFileInput {
	uri: string;
}

/**
 * Output for vybe.read_file
 */
export interface VybeReadFileOutput {
	content: string;
}


// ============================================================================
// TOOL 2: vybe.list_files
// ============================================================================

/**
 * File type in list_files output
 */
export type FileListItemType = 'file' | 'directory';

/**
 * Single file/directory item in list_files output
 */
export interface FileListItem {
	uri: string;
	type: FileListItemType;
}

/**
 * Input for vybe.list_files
 */
export interface VybeListFilesInput {
	uri: string;
	/**
	 * Whether to recurse into subdirectories
	 * @default false
	 */
	recursive?: boolean;
}

/**
 * Output for vybe.list_files
 */
export interface VybeListFilesOutput {
	files: FileListItem[];
}


// ============================================================================
// TOOL 3: vybe.get_file_info
// ============================================================================

/**
 * File type in get_file_info output
 */
export type FileInfoType = 'file' | 'directory' | 'unknown';

/**
 * Input for vybe.get_file_info
 */
export interface VybeGetFileInfoInput {
	uri: string;
}

/**
 * Output for vybe.get_file_info
 */
export interface VybeGetFileInfoOutput {
	exists: boolean;
	size?: number;
	mtime?: number;
	type?: FileInfoType;
}


// ============================================================================
// TOOL 4: vybe.compute_diff
// ============================================================================

/**
 * MCP-friendly diff hunk representation
 * Does NOT expose VS Code internal types (LineRange, etc.)
 */
export interface DiffHunk {
	/**
	 * Original line range (1-based, inclusive)
	 */
	originalRange: {
		startLineNumber: number;
		endLineNumber: number;
	};
	/**
	 * Modified line range (1-based, inclusive)
	 */
	modifiedRange: {
		startLineNumber: number;
		endLineNumber: number;
	};
	/**
	 * Original code content
	 */
	originalCode: string;
	/**
	 * Modified code content
	 */
	modifiedCode: string;
}

/**
 * Input for vybe.compute_diff
 * Pure content-based computation (no URI required)
 */
export interface VybeComputeDiffInput {
	original: string;
	modified: string;
	/**
	 * Optional language ID for syntax-aware diff computation
	 * If not provided, defaults to 'plaintext'
	 */
	languageId?: string;
	/**
	 * Whether to ignore whitespace changes
	 * @default false
	 */
	ignoreTrimWhitespace?: boolean;
	/**
	 * Maximum computation time in milliseconds
	 * @default 3000
	 */
	maxComputationTimeMs?: number;
}

/**
 * Output for vybe.compute_diff
 */
export interface VybeComputeDiffOutput {
	hunks: DiffHunk[];
}


// ============================================================================
// TOOL 5: vybe.get_diff_areas
// ============================================================================

/**
 * Diff area status derived from Diff[] states
 */
export type DiffAreaStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Line range for diff area (1-based, inclusive)
 */
export interface DiffAreaRange {
	startLineNumber: number;
	endLineNumber: number;
}

/**
 * Single diff area in get_diff_areas output
 */
export interface DiffAreaInfo {
	id: string;
	uri: string;
	status: DiffAreaStatus;
	ranges: DiffAreaRange[];
}

/**
 * Input for vybe.get_diff_areas
 */
export interface VybeGetDiffAreasInput {
	uri: string;
}

/**
 * Output for vybe.get_diff_areas
 */
export interface VybeGetDiffAreasOutput {
	diffAreas: DiffAreaInfo[];
}


// ============================================================================
// TRANSFORMATION NOTES FOR STEP 3 IMPLEMENTATION
// ============================================================================

/**
 * TRANSFORMATION NOTES:
 *
 * 1. URI Conversion:
 *    - Input: string → URI.parse(input.uri)
 *    - Output: URI.toString() → string
 *    - Validate: IWorkspaceContextService.isInsideWorkspace(uri) before any operation
 *
 * 2. vybe.read_file:
 *    - IFileService.readFile(uri) → IFileContent
 *    - Convert: IFileContent.value (VSBuffer) → string via value.toString()
 *    - Error if resource outside workspace or not found
 *
 * 3. vybe.list_files:
 *    - IFileService.resolve(uri) → IFileStat
 *    - Extract: IFileStat.children → FileListItem[]
 *    - Convert: IFileStat.isFile → 'file', isDirectory → 'directory'
 *    - Limit depth: If recursive=false, only return direct children
 *    - Filter: Only include files and directories (exclude symbolic links if needed)
 *
 * 4. vybe.get_file_info:
 *    - IFileService.stat(uri) → IFileStatWithPartialMetadata
 *    - Extract: size, mtime, type
 *    - Convert: FileType enum → FileInfoType string
 *    - Handle: exists=false if stat throws FileNotFoundError
 *
 * 5. vybe.compute_diff:
 *    - IVybeDiffService.computeDiffs(uri, original, modified, options) → {diffs, diffAreas}
 *    - Transform Diff[] → DiffHunk[]:
 *      - Diff.originalRange (LineRange) → {startLineNumber, endLineNumber}
 *        - LineRange.endLineNumberExclusive → endLineNumber (inclusive): endLineNumberExclusive - 1
 *      - Diff.modifiedRange (LineRange) → {startLineNumber, endLineNumber}
 *        - Same conversion as above
 *      - Diff.originalCode → originalCode (string, already available)
 *      - Diff.modifiedCode → modifiedCode (string, already available)
 *    - Note: uri parameter can be a temporary URI for context (language detection)
 *    - Pure computation: No side effects, no file writes
 *
 * 6. vybe.get_diff_areas:
 *    - IVybeEditService.getDiffAreasForFile(uri) → DiffArea[]
 *    - IVybeEditService.getDiffsForFile(uri) → Diff[]
 *    - Derive status:
 *      - For each DiffArea, check all Diff[] in that area
 *      - If all diffs have state === DiffState.Accepted → status = 'accepted'
 *      - If all diffs have state === DiffState.Rejected → status = 'rejected'
 *      - Otherwise → status = 'pending'
 *    - Extract ranges:
 *      - For each Diff in DiffArea, convert Diff.originalRange and Diff.modifiedRange
 *      - Collect all unique ranges (may need to merge overlapping ranges)
 *    - Transform: DiffArea → DiffAreaInfo
 *      - diffAreaId → id
 *      - uri → uri (convert to string)
 *      - derived status → status
 *      - collected ranges → ranges
 *
 * 7. Workspace Validation:
 *    - All tools must call: IWorkspaceContextService.isInsideWorkspace(uri)
 *    - If false, return: { code: 'RESOURCE_OUTSIDE_WORKSPACE', message: '...', details: { resource: uri.toString() } }
 *    - Do NOT throw errors; return structured error objects
 *
 * 8. Error Handling:
 *    - Catch all exceptions and convert to VybeToolError
 *    - Map VS Code errors to error codes:
 *      - FileNotFoundError → RESOURCE_NOT_FOUND
 *      - FileOperationError → INTERNAL_ERROR
 *      - etc.
 */

