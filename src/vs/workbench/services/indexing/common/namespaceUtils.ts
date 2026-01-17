/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * # Namespace Derivation for Pinecone Vector Store
 *
 * ## Overview
 * Pinecone namespaces are used to isolate vectors per user+workspace combination.
 * The namespace format is: `{userId}::{workspaceHash}`
 *
 * ## Current Implementation
 * - `userId`: Hash of the user's HOME directory (machine-local identifier)
 * - `workspaceHash`: FNV-1a hash of the workspace path (first 16 hex chars)
 *
 * ## Future Multi-Tenancy
 * When VYBE account identity is implemented, `getUserId()` should:
 * 1. Check if user is signed in to VYBE account
 * 2. If signed in, use `vybeAccountId` as the user identifier
 * 3. Otherwise, fall back to machine-local identifier
 *
 * This ensures:
 * - Same user on same machine → same namespace (consistency)
 * - Different users on same machine → different namespaces (isolation)
 * - Same user on different machines → same namespace when signed in (portability)
 *
 * ## Stability Guarantees
 * - Namespace remains stable as long as user identity and workspace path don't change
 * - Deleting index clears vectors but namespace can be reused
 * - Workspace path changes (e.g., rename folder) will create a new namespace
 */

import { URI } from '../../../../base/common/uri.js';

/**
 * Hash function for generating workspace IDs (FNV-1a)
 */
function fnv1a(content: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		hash ^= content.charCodeAt(i);
		hash = (hash * 0x01000193) >>> 0;
	}
	return hash.toString(16);
}

/**
 * Global override for user identity - set by VYBE account service when user signs in.
 * When set, this takes precedence over machine-local identifier.
 * This is the forward-compatible hook for future multi-tenancy.
 */
let vybeAccountUserId: string | undefined;

/**
 * Set the VYBE account user ID for multi-tenancy support.
 * Call this when user signs in to VYBE account.
 * @param accountId The VYBE account ID, or undefined to clear
 */
export function setVybeAccountUserId(accountId: string | undefined): void {
	vybeAccountUserId = accountId;
}

/**
 * Get the current VYBE account user ID, if set.
 */
export function getVybeAccountUserId(): string | undefined {
	return vybeAccountUserId;
}

/**
 * Generate a unique user ID.
 *
 * Priority:
 * 1. VYBE account ID (if user is signed in) - future multi-tenancy
 * 2. Machine-local identifier (hash of HOME directory)
 *
 * This ensures namespace stability per user+workspace while supporting
 * future migration to VYBE account-based identity.
 */
export function getUserId(): string {
	// Priority 1: Use VYBE account ID if signed in
	if (vybeAccountUserId) {
		return vybeAccountUserId;
	}

	// Priority 2: Use machine-local identifier
	// Hash of user home directory ensures same user on same machine gets same ID
	const machineId = typeof process !== 'undefined' && process.env.HOME
		? process.env.HOME
		: 'default-user';
	return fnv1a(machineId).substring(0, 16);
}

/**
 * Generate a workspace hash from workspace path.
 */
export function getWorkspaceHash(workspacePath: string): string {
	return fnv1a(workspacePath).substring(0, 16);
}

/**
 * Generate a Pinecone namespace for a workspace.
 * Format: {userId}::{workspaceHash}
 */
export function getNamespace(userId: string, workspacePath: string): string {
	const workspaceHash = getWorkspaceHash(workspacePath);
	return `${userId}::${workspaceHash}`;
}

/**
 * Generate a vector ID for a code chunk.
 * Format: {workspaceHash}::{filePath}::{chunkIndex}
 */
export function getVectorId(workspacePath: string, filePath: string, chunkIndex: number): string {
	const workspaceHash = getWorkspaceHash(workspacePath);
	// Normalize file path: remove leading slashes, replace slashes with colons
	const normalizedPath = filePath.replace(/^\/+/, '').replace(/\//g, '::');
	return `${workspaceHash}::${normalizedPath}::chunk-${chunkIndex}`;
}

/**
 * Get workspace path from workspace identifier.
 */
export function getWorkspacePath(workspace: { folders: Array<{ uri: URI }> } | { uri: URI }): string {
	if ('folders' in workspace && workspace.folders.length > 0) {
		return workspace.folders[0].uri.fsPath;
	}
	if ('uri' in workspace) {
		return workspace.uri.fsPath;
	}
	return '';
}
