/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE MCP Tool Approval Service Implementation
 * Manages user approval for mutating MCP tool operations.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IVybeMcpToolApprovalService, ApprovalRequest, ApprovalResult } from '../common/vybeMcpToolApprovalService.js';

/**
 * Implementation of IVybeMcpToolApprovalService.
 * Uses IDialogService to show approval dialogs to users.
 */
export class VybeMcpToolApprovalServiceImpl extends Disposable implements IVybeMcpToolApprovalService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly _dialogService: IDialogService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
		try {
			// Build dialog message
			const message = this._buildMessage(request);
			const detail = await this._buildDetail(request);

			// Show confirmation dialog
			const result = await this._dialogService.confirm({
				type: Severity.Warning,
				message,
				detail,
				primaryButton: localize('approve', 'Approve'),
				cancelButton: localize('deny', 'Deny')
			});

			if (result.confirmed) {
				this._logService.trace(`[VybeMcpToolApprovalService] User approved: ${request.toolName}`);
				return { approved: true };
			} else {
				this._logService.trace(`[VybeMcpToolApprovalService] User denied: ${request.toolName}`);
				return { approved: false, reason: 'User denied approval' };
			}
		} catch (error) {
			// On any error (timeout, dialog failure, etc.), deny by default
			this._logService.error(`[VybeMcpToolApprovalService] Error requesting approval: ${error instanceof Error ? error.message : String(error)}`);
			return { approved: false, reason: error instanceof Error ? error.message : 'Approval request failed' };
		}
	}

	/**
	 * Builds the main message for the approval dialog
	 */
	private _buildMessage(request: ApprovalRequest): string {
		const toolDisplayName = this._getToolDisplayName(request.toolName);

		if (request.fileUri) {
			const fileName = this._extractFileName(request.fileUri);
			return localize('approvalMessageSingleFile', '{0} in file "{1}"?', toolDisplayName, fileName);
		} else if (request.fileUris && request.fileUris.length > 0) {
			if (request.fileUris.length === 1) {
				const fileName = this._extractFileName(request.fileUris[0]);
				return localize('approvalMessageSingleFile', '{0} in file "{1}"?', toolDisplayName, fileName);
			} else {
				return localize('approvalMessageMultipleFiles', '{0} in {1} files?', toolDisplayName, request.fileUris.length);
			}
		} else {
			return localize('approvalMessageGeneric', '{0}?', toolDisplayName);
		}
	}

	/**
	 * Builds the detail text for the approval dialog
	 */
	private async _buildDetail(request: ApprovalRequest): Promise<string> {
		const parts: string[] = [];

		// Tool name
		parts.push(localize('approvalDetailTool', 'Tool: {0}', request.toolName));

		// File(s) with existence check
		if (request.fileUri) {
			parts.push(localize('approvalDetailFile', 'File: {0}', request.fileUri));
			// Check if file exists for overwrite warning
			try {
				const uri = URI.parse(request.fileUri);
				const exists = await this._fileService.exists(uri);
				if (exists) {
					parts.push(localize('approvalDetailOverwrite', '⚠️ This will overwrite existing file'));
				}
			} catch (error) {
				// Ignore errors checking file existence
				this._logService.trace(`[VybeMcpToolApprovalService] Could not check file existence: ${error}`);
			}
		} else if (request.fileUris && request.fileUris.length > 0) {
			if (request.fileUris.length === 1) {
				parts.push(localize('approvalDetailFile', 'File: {0}', request.fileUris[0]));
				// Check if file exists
				try {
					const uri = URI.parse(request.fileUris[0]);
					const exists = await this._fileService.exists(uri);
					if (exists) {
						parts.push(localize('approvalDetailOverwrite', '⚠️ This will overwrite existing file'));
					}
				} catch (error) {
					// Ignore errors
				}
			} else {
				parts.push(localize('approvalDetailFiles', 'Files: {0}', request.fileUris.length));
				request.fileUris.forEach((uri, index) => {
					if (index < 3) { // Show first 3 files
						parts.push(`  - ${uri}`);
					}
				});
				if (request.fileUris.length > 3) {
					parts.push(localize('approvalDetailMoreFiles', '  ... and {0} more', request.fileUris.length - 3));
				}
			}
		}

		// Diff count
		if (request.diffCount !== undefined && request.diffCount > 0) {
			parts.push(localize('approvalDetailDiffs', 'Diffs: {0} diff(s) will be affected', request.diffCount));
		}

		// Description
		if (request.description) {
			parts.push(localize('approvalDetailDescription', 'Description: {0}', request.description));
		}

		// Warning
		parts.push(localize('approvalDetailWarning', 'Warning: This will modify editor state. Changes can be undone.'));

		return parts.join('\n');
	}

	/**
	 * Gets a human-readable display name for a tool
	 */
	private _getToolDisplayName(toolName: string): string {
		const displayNames: Record<string, string> = {
			'vybe.accept_diff': localize('toolAcceptDiff', 'Accept diff'),
			'vybe.reject_diff': localize('toolRejectDiff', 'Reject diff'),
			'vybe.accept_file': localize('toolAcceptFile', 'Accept all diffs in file'),
			'vybe.reject_file': localize('toolRejectFile', 'Reject all diffs in file'),
			'vybe.accept_all': localize('toolAcceptAll', 'Accept all diffs'),
			'vybe.reject_all': localize('toolRejectAll', 'Reject all diffs'),
			'vybe.write_file': localize('toolWriteFile', 'Write file'),
			'vybe.apply_patch': localize('toolApplyPatch', 'Apply patch')
		};

		return displayNames[toolName] || toolName;
	}

	/**
	 * Extracts a file name from a URI string
	 */
	private _extractFileName(uri: string): string {
		try {
			const lastSlash = uri.lastIndexOf('/');
			if (lastSlash >= 0 && lastSlash < uri.length - 1) {
				return uri.substring(lastSlash + 1);
			}
			return uri;
		} catch {
			return uri;
		}
	}
}

