/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Read-Only MCP Tool Handlers
 *
 * Implements handlers for read-only MCP tools that expose IDE capabilities
 * without allowing mutations.
 */

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileOperationError, FileOperationResult } from '../../../../../platform/files/common/files.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IVybeDiffService } from '../../../../contrib/vybeChat/common/vybeDiffService.js';
import { IVybeEditService } from '../../../../contrib/vybeChat/common/vybeEditService.js';
import { DiffState, Diff, DiffArea } from '../../../../contrib/vybeChat/common/vybeEditTypes.js';
import {
	VybeToolError,
	VybeToolErrorCode,
	VybeReadFileInput,
	VybeReadFileOutput,
	VybeListFilesInput,
	VybeListFilesOutput,
	FileListItem,
	VybeGetFileInfoInput,
	VybeGetFileInfoOutput,
	VybeComputeDiffInput,
	VybeComputeDiffOutput,
	DiffHunk,
	VybeGetDiffAreasInput,
	VybeGetDiffAreasOutput,
	DiffAreaInfo,
	DiffAreaStatus,
	DiffAreaRange
} from '../../common/vybeReadOnlyToolContracts.js';

/**
 * Validates that a URI is inside the workspace
 */
function validateWorkspace(
	uri: URI,
	workspaceService: IWorkspaceContextService
): VybeToolError | null {
	if (!workspaceService.isInsideWorkspace(uri)) {
		const workspace = workspaceService.getWorkspace();
		const workspaceFolders = workspace.folders || [];
		const workspaceFolderUris = workspaceFolders.map(f => f.uri.toString());

		let message = `Resource is outside workspace: ${uri.toString()}`;
		if (workspaceFolders.length === 0) {
			message += ' (No workspace folder is set)';
		} else {
			message += ` (Workspace folders: ${workspaceFolderUris.join(', ')})`;
		}

		return {
			code: VybeToolErrorCode.RESOURCE_OUTSIDE_WORKSPACE,
			message,
			details: {
				resource: uri.toString(),
				workspaceFolders: workspaceFolderUris
			}
		};
	}
	return null;
}


/**
 * Converts LineRange to inclusive end line number
 */
function lineRangeToInclusive(range: { startLineNumber: number; endLineNumberExclusive: number }): { startLineNumber: number; endLineNumber: number } {
	return {
		startLineNumber: range.startLineNumber,
		endLineNumber: range.endLineNumberExclusive - 1
	};
}

/**
 * Derives diff area status from diff states
 */
function deriveDiffAreaStatus(diffs: readonly Diff[]): DiffAreaStatus {
	if (diffs.length === 0) {
		return 'pending';
	}

	const states = new Set(diffs.map(d => d.state));

	// If all diffs are accepted
	if (states.size === 1 && states.has(DiffState.Accepted)) {
		return 'accepted';
	}

	// If all diffs are rejected
	if (states.size === 1 && states.has(DiffState.Rejected)) {
		return 'rejected';
	}

	// Otherwise, pending (includes streaming, mixed states, etc.)
	return 'pending';
}

/**
 * Collects ranges from diffs in a diff area
 */
function collectDiffAreaRanges(diffs: readonly Diff[]): DiffAreaRange[] {
	const ranges: DiffAreaRange[] = [];

	for (const diff of diffs) {
		// Add original range
		const originalRange = lineRangeToInclusive(diff.originalRange);
		ranges.push({
			startLineNumber: originalRange.startLineNumber,
			endLineNumber: originalRange.endLineNumber
		});

		// Add modified range
		const modifiedRange = lineRangeToInclusive(diff.modifiedRange);
		ranges.push({
			startLineNumber: modifiedRange.startLineNumber,
			endLineNumber: modifiedRange.endLineNumber
		});
	}

	// Remove duplicates and sort (simple deduplication)
	const uniqueRanges = new Map<string, DiffAreaRange>();
	for (const range of ranges) {
		const key = `${range.startLineNumber}-${range.endLineNumber}`;
		if (!uniqueRanges.has(key)) {
			uniqueRanges.set(key, range);
		}
	}

	return Array.from(uniqueRanges.values()).sort((a, b) => {
		if (a.startLineNumber !== b.startLineNumber) {
			return a.startLineNumber - b.startLineNumber;
		}
		return a.endLineNumber - b.endLineNumber;
	});
}

/**
 * Handler for vybe.read_file
 */
export async function handleVybeReadFile(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService,
	input: VybeReadFileInput,
	token: CancellationToken
): Promise<VybeReadFileOutput | VybeToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspace(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Read file
		const fileContent = await fileService.readFile(uri, undefined, token);

		// Convert VSBuffer to string
		const content = fileContent.value.toString();

		return { content };
	} catch (error) {
		if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
			return {
				code: VybeToolErrorCode.RESOURCE_NOT_FOUND,
				message: `File not found: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		if (error instanceof FileOperationError) {
			return {
				code: VybeToolErrorCode.INTERNAL_ERROR,
				message: `File operation failed: ${error.message}`,
				details: { resource: input.uri, reason: error.message }
			};
		}

		return {
			code: VybeToolErrorCode.INTERNAL_ERROR,
			message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

/**
 * Handler for vybe.list_files
 */
export async function handleVybeListFiles(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService,
	input: VybeListFilesInput,
	token: CancellationToken
): Promise<VybeListFilesOutput | VybeToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspace(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Resolve directory
		const stat = await fileService.resolve(uri, { resolveTo: [] });

		// Check if it's a directory
		if (!stat.isDirectory) {
			return {
				code: VybeToolErrorCode.RESOURCE_NOT_DIRECTORY,
				message: `Resource is not a directory: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Collect files
		const files: FileListItem[] = [];

		if (stat.children) {
			for (const child of stat.children) {
				// Only include files and directories (exclude symbolic links for now)
				if (child.isFile || child.isDirectory) {
					files.push({
						uri: child.resource.toString(),
						type: child.isFile ? 'file' : 'directory'
					});
				}

				// If recursive, we'd need to recurse here, but for Phase 2 we keep it simple
				// and only return direct children
			}
		}

		return { files };
		} catch (error) {
		if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
			return {
				code: VybeToolErrorCode.RESOURCE_NOT_FOUND,
				message: `Directory not found: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		return {
			code: VybeToolErrorCode.INTERNAL_ERROR,
			message: `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

/**
 * Handler for vybe.get_file_info
 */
export async function handleVybeGetFileInfo(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService,
	input: VybeGetFileInfoInput,
	token: CancellationToken
): Promise<VybeGetFileInfoOutput | VybeToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspace(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Get file stat
		const stat = await fileService.stat(uri);

		// Determine type from isFile/isDirectory flags
		let type: 'file' | 'directory' | 'unknown' = 'unknown';
		if (stat.isFile) {
			type = 'file';
		} else if (stat.isDirectory) {
			type = 'directory';
		}

		return {
			exists: true,
			size: stat.size,
			mtime: stat.mtime,
			type
		};
	} catch (error) {
		if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
			return {
				exists: false
			};
		}

		// For other errors, return exists: false
		return {
			exists: false
		};
	}
}

/**
 * Handler for vybe.compute_diff
 */
export async function handleVybeComputeDiff(
	diffService: IVybeDiffService,
	input: VybeComputeDiffInput,
	token: CancellationToken
): Promise<VybeComputeDiffOutput | VybeToolError> {
	try {
		// Create a temporary URI for context (language detection)
		// Use a file:// URI with the languageId as the extension if provided
		const tempUri = input.languageId
			? URI.from({ scheme: 'file', path: `/temp.${input.languageId}` })
			: URI.from({ scheme: 'file', path: '/temp.txt' });

		// Compute diffs
		const result = await diffService.computeDiffs(
			tempUri,
			input.original,
			input.modified,
			{
				ignoreTrimWhitespace: input.ignoreTrimWhitespace ?? false,
				maxComputationTimeMs: input.maxComputationTimeMs ?? 3000
			}
		);

		// Transform Diff[] to DiffHunk[]
		const hunks: DiffHunk[] = result.diffs.map(diff => ({
			originalRange: lineRangeToInclusive(diff.originalRange),
			modifiedRange: lineRangeToInclusive(diff.modifiedRange),
			originalCode: diff.originalCode,
			modifiedCode: diff.modifiedCode
		}));

		return { hunks };
	} catch (error) {
		return {
			code: VybeToolErrorCode.DIFF_COMPUTATION_FAILED,
			message: `Failed to compute diff: ${error instanceof Error ? error.message : String(error)}`,
			details: { reason: error instanceof Error ? error.message : String(error) }
		};
	}
}

/**
 * Handler for vybe.get_diff_areas
 */
export async function handleVybeGetDiffAreas(
	editService: IVybeEditService,
	workspaceService: IWorkspaceContextService,
	input: VybeGetDiffAreasInput,
	token: CancellationToken
): Promise<VybeGetDiffAreasOutput | VybeToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspace(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Get diff areas for the file
		const diffAreas = editService.getDiffAreasForFile(uri);

		// Transform to MCP-friendly format
		const diffAreaInfos: DiffAreaInfo[] = diffAreas.map((diffArea: DiffArea) => {
			// Get all diffs in this area
			const areaDiffs = Array.from(diffArea.diffs.values());

			// Derive status from diff states
			const status = deriveDiffAreaStatus(areaDiffs);

			// Collect ranges
			const ranges = collectDiffAreaRanges(areaDiffs);

			return {
				id: diffArea.diffAreaId,
				uri: diffArea.uri.toString(),
				status,
				ranges
			};
		});

		return { diffAreas: diffAreaInfos };
	} catch (error) {
		return {
			code: VybeToolErrorCode.INTERNAL_ERROR,
			message: `Failed to get diff areas: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

