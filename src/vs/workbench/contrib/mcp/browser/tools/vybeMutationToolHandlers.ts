/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mutation MCP Tool Handlers
 *
 * Implements handlers for mutating MCP tools that modify editor state.
 * All mutating operations require user approval before execution.
 */

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService, FileOperationError, FileOperationResult } from '../../../../../platform/files/common/files.js';
import { ITextFileService, TextFileResolveReason } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IVybeEditService } from '../../../../contrib/vybeChat/common/vybeEditService.js';
import { IVybeDiffService } from '../../../../contrib/vybeChat/common/vybeDiffService.js';
import { DiffState } from '../../../../contrib/vybeChat/common/vybeEditTypes.js';
import { IVybeMcpToolApprovalService } from '../../common/vybeMcpToolApprovalService.js';
import { isNative } from '../../../../../base/common/platform.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import {
	VybeMutationToolError,
	VybeMutationToolErrorCode,
	VybeCreateEditTransactionInput,
	VybeCreateEditTransactionOutput,
	VybeAcceptDiffInput,
	VybeAcceptDiffOutput,
	VybeRejectDiffInput,
	VybeRejectDiffOutput,
	VybeAcceptFileInput,
	VybeAcceptFileOutput,
	VybeRejectFileInput,
	VybeRejectFileOutput,
	VybeWriteFileInput,
	VybeWriteFileOutput,
	VybeApplyPatchInput,
	VybeApplyPatchOutput
} from '../../common/vybeMutationToolContracts.js';
// Patch utilities are in node/ directory (Node.js-only due to 'diff' package)
// Call them via IPC from main process

/**
 * Validate patch via IPC (main process has access to 'diff' package)
 */
async function validatePatchViaIPC(originalContent: string, patch: string): Promise<{ valid: boolean; error?: string; hunkCount: number }> {
	if (!isNative || !ipcRenderer) {
		// Fallback for non-native environments (should not happen in production)
		return { valid: false, error: 'Patch validation not available in this environment', hunkCount: 0 };
	}
	return await ipcRenderer.invoke('vscode:vybeValidatePatch', originalContent, patch) as { valid: boolean; error?: string; hunkCount: number };
}

/**
 * Apply patch via IPC (main process has access to 'diff' package)
 */
async function applyPatchInMemoryViaIPC(originalContent: string, patch: string): Promise<string | null> {
	if (!isNative || !ipcRenderer) {
		// Fallback for non-native environments (should not happen in production)
		return null;
	}
	return await ipcRenderer.invoke('vscode:vybeApplyPatch', originalContent, patch) as string | null;
}

/**
 * Validates that a URI is inside the workspace
 * Reuses validation from read-only handlers
 */
function validateWorkspaceForMutation(
	uri: URI,
	workspaceService: IWorkspaceContextService
): VybeMutationToolError | null {
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
			code: VybeMutationToolErrorCode.RESOURCE_OUTSIDE_WORKSPACE,
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
 * Finds a diff by ID across all diff areas
 */
function findDiffById(editService: IVybeEditService, diffId: string): { diff: any; uri: URI } | null {
	// Get all diffs from edit service
	const allDiffs = editService.getAllDiffs();

	for (const diff of allDiffs) {
		if (diff.diffId === diffId) {
			return { diff, uri: diff.uri };
		}
	}

	return null;
}

/**
 * Handler for vybe.create_edit_transaction
 * No approval required (read-only operation)
 */
export async function handleVybeCreateEditTransaction(
	editService: IVybeEditService,
	workspaceService: IWorkspaceContextService,
	input: VybeCreateEditTransactionInput,
	token: CancellationToken
): Promise<VybeCreateEditTransactionOutput | VybeMutationToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Create edit transaction
		const transactionId = await editService.createEditTransaction(
			uri,
			input.originalContent,
			{
				streaming: input.streaming,
				source: 'tool'
			}
		);

		// Get the transaction to extract diffAreaId
		const transaction = editService.getEditTransaction(transactionId);
		if (!transaction) {
			return {
				code: VybeMutationToolErrorCode.TRANSACTION_CREATION_FAILED,
				message: 'Transaction was created but could not be retrieved',
				details: { transactionId }
			};
		}

		// TEST-ONLY: Seed diffs if modifiedContent is provided
		// This allows headless testing of accept/reject operations without UI widgets
		// Note: In production, this should be guarded by VYBE_DEV_TESTS=1, but for Phase 3A
		// we enable it unconditionally since it's only called from test code
		if (input.modifiedContent) {
			const editServiceImpl = editService as any; // Access internal method
			if (typeof editServiceImpl._seedDiffsForTransaction === 'function') {
				await editServiceImpl._seedDiffsForTransaction(transactionId, input.originalContent, input.modifiedContent);
			}
		}

		return {
			transactionId,
			diffAreaId: transaction.diffAreaId
		};
	} catch (error) {
		return {
			code: VybeMutationToolErrorCode.TRANSACTION_CREATION_FAILED,
			message: `Failed to create edit transaction: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

/**
 * Handler for vybe.accept_diff
 * Requires approval before mutation
 */
export async function handleVybeAcceptDiff(
	editService: IVybeEditService,
	approvalService: IVybeMcpToolApprovalService,
	workspaceService: IWorkspaceContextService,
	input: VybeAcceptDiffInput,
	token: CancellationToken
): Promise<VybeAcceptDiffOutput | VybeMutationToolError> {
	try {
		// Find the diff
		const diffInfo = findDiffById(editService, input.diffId);
		if (!diffInfo) {
			return {
				code: VybeMutationToolErrorCode.DIFF_NOT_FOUND,
				message: `Diff not found: ${input.diffId}`,
				details: { diffId: input.diffId }
			};
		}

		// Check if already accepted
		if (diffInfo.diff.state === DiffState.Accepted) {
			return {
				code: VybeMutationToolErrorCode.DIFF_ALREADY_ACCEPTED,
				message: `Diff is already accepted: ${input.diffId}`,
				details: { diffId: input.diffId }
			};
		}

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(diffInfo.uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Request approval
		const approvalResult = await approvalService.requestApproval({
			toolName: 'vybe.accept_diff',
			fileUri: diffInfo.uri.toString(),
			diffCount: 1,
			description: 'Accept a single diff change'
		});

		if (!approvalResult.approved) {
			return {
				code: VybeMutationToolErrorCode.APPROVAL_DENIED,
				message: `Approval denied: ${approvalResult.reason || 'User denied approval'}`,
				details: { diffId: input.diffId }
			};
		}

		// Execute mutation
		const success = await editService.acceptDiff(input.diffId);
		if (!success) {
			return {
				code: VybeMutationToolErrorCode.INTERNAL_ERROR,
				message: 'Failed to accept diff',
				details: { diffId: input.diffId }
			};
		}

		return {
			success: true,
			diffId: input.diffId
		};
	} catch (error) {
		return {
			code: VybeMutationToolErrorCode.INTERNAL_ERROR,
			message: `Failed to accept diff: ${error instanceof Error ? error.message : String(error)}`,
			details: { diffId: input.diffId }
		};
	}
}

/**
 * Handler for vybe.reject_diff
 * Requires approval before mutation
 */
export async function handleVybeRejectDiff(
	editService: IVybeEditService,
	approvalService: IVybeMcpToolApprovalService,
	workspaceService: IWorkspaceContextService,
	input: VybeRejectDiffInput,
	token: CancellationToken
): Promise<VybeRejectDiffOutput | VybeMutationToolError> {
	try {
		// Find the diff
		const diffInfo = findDiffById(editService, input.diffId);
		if (!diffInfo) {
			return {
				code: VybeMutationToolErrorCode.DIFF_NOT_FOUND,
				message: `Diff not found: ${input.diffId}`,
				details: { diffId: input.diffId }
			};
		}

		// Check if already rejected
		if (diffInfo.diff.state === DiffState.Rejected) {
			return {
				code: VybeMutationToolErrorCode.DIFF_ALREADY_REJECTED,
				message: `Diff is already rejected: ${input.diffId}`,
				details: { diffId: input.diffId }
			};
		}

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(diffInfo.uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Request approval
		const approvalResult = await approvalService.requestApproval({
			toolName: 'vybe.reject_diff',
			fileUri: diffInfo.uri.toString(),
			diffCount: 1,
			description: 'Reject a single diff change'
		});

		if (!approvalResult.approved) {
			return {
				code: VybeMutationToolErrorCode.APPROVAL_DENIED,
				message: `Approval denied: ${approvalResult.reason || 'User denied approval'}`,
				details: { diffId: input.diffId }
			};
		}

		// Execute mutation
		const success = await editService.rejectDiff(input.diffId);
		if (!success) {
			return {
				code: VybeMutationToolErrorCode.INTERNAL_ERROR,
				message: 'Failed to reject diff',
				details: { diffId: input.diffId }
			};
		}

		return {
			success: true,
			diffId: input.diffId
		};
	} catch (error) {
		return {
			code: VybeMutationToolErrorCode.INTERNAL_ERROR,
			message: `Failed to reject diff: ${error instanceof Error ? error.message : String(error)}`,
			details: { diffId: input.diffId }
		};
	}
}

/**
 * Handler for vybe.accept_file
 * Requires approval before mutation
 */
export async function handleVybeAcceptFile(
	editService: IVybeEditService,
	approvalService: IVybeMcpToolApprovalService,
	workspaceService: IWorkspaceContextService,
	input: VybeAcceptFileInput,
	token: CancellationToken
): Promise<VybeAcceptFileOutput | VybeMutationToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Get diff areas to count diffs
		const diffAreas = editService.getDiffAreasForFile(uri);
		if (diffAreas.length === 0) {
			return {
				code: VybeMutationToolErrorCode.NO_DIFFS_FOUND,
				message: `No diffs found for file: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Count total diffs
		let diffCount = 0;
		for (const diffArea of diffAreas) {
			diffCount += diffArea.diffs.size;
		}

		if (diffCount === 0) {
			return {
				code: VybeMutationToolErrorCode.NO_DIFFS_FOUND,
				message: `No diffs found for file: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Request approval
		const approvalResult = await approvalService.requestApproval({
			toolName: 'vybe.accept_file',
			fileUri: uri.toString(),
			diffCount,
			description: 'Accept all diffs in file'
		});

		if (!approvalResult.approved) {
			return {
				code: VybeMutationToolErrorCode.APPROVAL_DENIED,
				message: `Approval denied: ${approvalResult.reason || 'User denied approval'}`,
				details: { resource: input.uri }
			};
		}

		// Execute mutation
		await editService.acceptFile(uri);

		return {
			success: true,
			uri: input.uri,
			diffCount
		};
	} catch (error) {
		return {
			code: VybeMutationToolErrorCode.INTERNAL_ERROR,
			message: `Failed to accept file: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

/**
 * Handler for vybe.reject_file
 * Requires approval before mutation
 */
export async function handleVybeRejectFile(
	editService: IVybeEditService,
	approvalService: IVybeMcpToolApprovalService,
	workspaceService: IWorkspaceContextService,
	input: VybeRejectFileInput,
	token: CancellationToken
): Promise<VybeRejectFileOutput | VybeMutationToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Get diff areas to count diffs
		const diffAreas = editService.getDiffAreasForFile(uri);
		if (diffAreas.length === 0) {
			return {
				code: VybeMutationToolErrorCode.NO_DIFFS_FOUND,
				message: `No diffs found for file: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Count total diffs
		let diffCount = 0;
		for (const diffArea of diffAreas) {
			diffCount += diffArea.diffs.size;
		}

		if (diffCount === 0) {
			return {
				code: VybeMutationToolErrorCode.NO_DIFFS_FOUND,
				message: `No diffs found for file: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Request approval
		const approvalResult = await approvalService.requestApproval({
			toolName: 'vybe.reject_file',
			fileUri: uri.toString(),
			diffCount,
			description: 'Reject all diffs in file'
		});

		if (!approvalResult.approved) {
			return {
				code: VybeMutationToolErrorCode.APPROVAL_DENIED,
				message: `Approval denied: ${approvalResult.reason || 'User denied approval'}`,
				details: { resource: input.uri }
			};
		}

		// Execute mutation
		await editService.rejectFile(uri);

		return {
			success: true,
			uri: input.uri,
			diffCount
		};
	} catch (error) {
		return {
			code: VybeMutationToolErrorCode.INTERNAL_ERROR,
			message: `Failed to reject file: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

/**
 * Handler for vybe.write_file
 * Creates a transaction, seeds diffs, requires approval, and saves to disk
 */
export async function handleVybeWriteFile(
	fileService: IFileService,
	textFileService: ITextFileService,
	editService: IVybeEditService,
	diffService: IVybeDiffService,
	approvalService: IVybeMcpToolApprovalService,
	workspaceService: IWorkspaceContextService,
	modelService: IModelService,
	languageService: ILanguageService,
	input: VybeWriteFileInput,
	token: CancellationToken
): Promise<VybeWriteFileOutput | VybeMutationToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Check if file exists
		const fileExists = await fileService.exists(uri);
		if (fileExists && input.overwrite === false) {
			return {
				code: VybeMutationToolErrorCode.FILE_EXISTS,
				message: `File already exists and overwrite is disabled: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Read original content if file exists, otherwise use empty string
		let originalContent = '';
		if (fileExists) {
			try {
				const fileContent = await fileService.readFile(uri, undefined, token);
				originalContent = fileContent.value.toString();
			} catch (error) {
				if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					// File was deleted between exists() and readFile(), treat as new file
					originalContent = '';
				} else {
					return {
						code: VybeMutationToolErrorCode.INTERNAL_ERROR,
						message: `Failed to read original file: ${error instanceof Error ? error.message : String(error)}`,
						details: { resource: input.uri }
					};
				}
			}
		}

		// Create edit transaction
		const transactionId = await editService.createEditTransaction(uri, originalContent, { source: 'tool' });
		const transaction = editService.getEditTransaction(transactionId);
		if (!transaction) {
			return {
				code: VybeMutationToolErrorCode.TRANSACTION_CREATION_FAILED,
				message: `Failed to create edit transaction for: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Seed diffs (original vs new content)
		// Access internal method for diff seeding (test-only, but needed for Phase 3B)
		const editServiceImpl = editService as any;
		if (editServiceImpl._seedDiffsForTransaction) {
			await editServiceImpl._seedDiffsForTransaction(transactionId, originalContent, input.content);
		}

		// Get diff count for approval
		const diffAreas = diffService.getDiffAreasForUri(uri);
		let diffCount = 0;
		for (const diffArea of diffAreas) {
			diffCount += diffArea.diffs.size;
		}

		// Request approval
		const approvalResult = await approvalService.requestApproval({
			toolName: 'vybe.write_file',
			fileUri: uri.toString(),
			diffCount,
			description: fileExists
				? `The agent wants to overwrite file ${uri.fsPath} with new content.`
				: `The agent wants to create a new file ${uri.fsPath}.`
		});

		if (!approvalResult.approved) {
			return {
				code: VybeMutationToolErrorCode.APPROVAL_DENIED,
				message: approvalResult.reason || 'User denied approval for writing file.',
				details: { resource: input.uri }
			};
		}

		// Ensure text model exists before acceptFile (for files not open in editor)
		// For new files, create the file on disk first, then resolve the model
		// For existing files, resolve the model reference
		let modelExists = modelService.getModel(uri) !== null;
		if (!modelExists) {
			if (!fileExists) {
				// New file: create file on disk first (empty), then resolve model
				// This ensures the file exists and is registered with ITextFileService
				await textFileService.create([{ resource: uri, value: '' }]);
				// Now resolve the model so it's properly registered
				await textFileService.files.resolve(uri, { reason: TextFileResolveReason.REFERENCE });
			} else {
				// Existing file: try to resolve model reference
				try {
					await textFileService.files.resolve(uri, { reason: TextFileResolveReason.REFERENCE });
				} catch (error) {
					// If resolve fails, this is unexpected for existing files
					// Log error but continue - acceptFile will handle missing model
				}
			}
		}

		// Accept file (this mutates editor state)
		await editService.acceptFile(uri, true); // autoSave = true

		// Check if file was actually saved (non-fatal if save failed - model state preserved)
		const saved = !textFileService.isDirty(uri);

		// Return success with diff count and save status
		return {
			success: true,
			uri: input.uri,
			diffCount,
			saved
		};
	} catch (error) {
		return {
			code: VybeMutationToolErrorCode.INTERNAL_ERROR,
			message: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

/**
 * Handler for vybe.apply_patch
 * Validates patch, applies in memory, creates transaction, seeds diffs, requires approval, and saves to disk
 */
export async function handleVybeApplyPatch(
	fileService: IFileService,
	textFileService: ITextFileService,
	editService: IVybeEditService,
	diffService: IVybeDiffService,
	approvalService: IVybeMcpToolApprovalService,
	workspaceService: IWorkspaceContextService,
	modelService: IModelService,
	languageService: ILanguageService,
	input: VybeApplyPatchInput,
	token: CancellationToken
): Promise<VybeApplyPatchOutput | VybeMutationToolError> {
	try {
		const uri = URI.parse(input.uri);

		// Validate workspace
		const workspaceError = validateWorkspaceForMutation(uri, workspaceService);
		if (workspaceError) {
			return workspaceError;
		}

		// Read current file content
		let originalContent: string;
		try {
			const fileContent = await fileService.readFile(uri, undefined, token);
			originalContent = fileContent.value.toString();
		} catch (error) {
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return {
					code: VybeMutationToolErrorCode.RESOURCE_NOT_FOUND,
					message: `File not found: ${input.uri}`,
					details: { resource: input.uri }
				};
			}
			return {
				code: VybeMutationToolErrorCode.INTERNAL_ERROR,
				message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
				details: { resource: input.uri }
			};
		}

		// Validate patch can be applied (via IPC to main process)
		const validationResult = await validatePatchViaIPC(originalContent, input.patch);
		if (!validationResult.valid) {
			return {
				code: VybeMutationToolErrorCode.PATCH_VALIDATION_FAILED,
				message: `Patch validation failed: ${validationResult.error || 'Unknown error'}`,
				details: { resource: input.uri, reason: validationResult.error }
			};
		}

		// Apply patch in memory (via IPC to main process)
		const patchedContent = await applyPatchInMemoryViaIPC(originalContent, input.patch);
		if (patchedContent === null) {
			return {
				code: VybeMutationToolErrorCode.PATCH_APPLY_FAILED,
				message: 'Failed to apply patch to file content',
				details: { resource: input.uri }
			};
		}

		// Create edit transaction
		const transactionId = await editService.createEditTransaction(uri, originalContent, { source: 'tool' });
		const transaction = editService.getEditTransaction(transactionId);
		if (!transaction) {
			return {
				code: VybeMutationToolErrorCode.TRANSACTION_CREATION_FAILED,
				message: `Failed to create edit transaction for: ${input.uri}`,
				details: { resource: input.uri }
			};
		}

		// Seed diffs (original vs patched content)
		const editServiceImpl = editService as any;
		if (editServiceImpl._seedDiffsForTransaction) {
			await editServiceImpl._seedDiffsForTransaction(transactionId, originalContent, patchedContent);
		}

		// Get diff count for approval
		const diffAreas = diffService.getDiffAreasForUri(uri);
		let diffCount = 0;
		for (const diffArea of diffAreas) {
			diffCount += diffArea.diffs.size;
		}

		// Request approval
		const approvalResult = await approvalService.requestApproval({
			toolName: 'vybe.apply_patch',
			fileUri: uri.toString(),
			diffCount,
			description: `The agent wants to apply a patch to file ${uri.fsPath} (${validationResult.hunkCount} hunk(s)).`
		});

		if (!approvalResult.approved) {
			return {
				code: VybeMutationToolErrorCode.APPROVAL_DENIED,
				message: approvalResult.reason || 'User denied approval for applying patch.',
				details: { resource: input.uri }
			};
		}

		// Ensure text model exists before acceptFile (for files not open in editor)
		// Resolve model reference, or create model with patched content if needed
		let modelExists = modelService.getModel(uri) !== null;
		if (!modelExists) {
			try {
				await textFileService.files.resolve(uri, { reason: TextFileResolveReason.REFERENCE });
			} catch (error) {
				// If resolve fails, create model with patched content as fallback
				const languageSelection = languageService.createByFilepathOrFirstLine(uri, patchedContent.split('\n')[0]);
				modelService.createModel(patchedContent, languageSelection, uri);
			}
		}

		// Accept file (this mutates editor state and saves)
		await editService.acceptFile(uri, true); // autoSave = true

		// Check if file was actually saved (non-fatal if save failed - model state preserved)
		const saved = !textFileService.isDirty(uri);

		// Return success with diff count, applied hunks, and save status
		return {
			success: true,
			uri: input.uri,
			diffCount,
			appliedHunks: validationResult.hunkCount,
			saved
		};
	} catch (error) {
		// Check if it's a patch parse error
		if (error instanceof Error && error.message.includes('Failed to parse patch')) {
			return {
				code: VybeMutationToolErrorCode.PATCH_PARSE_FAILED,
				message: `Failed to parse patch: ${error.message}`,
				details: { resource: input.uri }
			};
		}

		return {
			code: VybeMutationToolErrorCode.INTERNAL_ERROR,
			message: `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`,
			details: { resource: input.uri }
		};
	}
}

