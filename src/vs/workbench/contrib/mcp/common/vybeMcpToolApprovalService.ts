/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE MCP Tool Approval Service
 * Service for requesting user approval before executing mutating MCP tools.
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IVybeMcpToolApprovalService = createDecorator<IVybeMcpToolApprovalService>('vybeMcpToolApprovalService');

/**
 * Request for tool approval
 */
export interface ApprovalRequest {
	/** Name of the tool requesting approval */
	toolName: string;
	/** Single file URI affected (if applicable) */
	fileUri?: string;
	/** Multiple file URIs affected (if applicable) */
	fileUris?: string[];
	/** Number of diffs that will be affected */
	diffCount?: number;
	/** Human-readable description of what will happen */
	description: string;
}

/**
 * Result of approval request
 */
export interface ApprovalResult {
	/** Whether the user approved the operation */
	approved: boolean;
	/** Optional reason for denial (if not approved) */
	reason?: string;
}

/**
 * Service for managing MCP tool approvals.
 * Enforces user confirmation before mutating operations.
 */
export interface IVybeMcpToolApprovalService {
	readonly _serviceBrand: undefined;

	/**
	 * Request approval for a mutating tool operation.
	 * Shows a dialog to the user and waits for their response.
	 *
	 * @param request Approval request details
	 * @returns Promise resolving to approval result
	 */
	requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;
}


