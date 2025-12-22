/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

/**
 * Canonical shared model types for the local indexing + embeddings stack.
 *
 * These types are intentionally storage-agnostic (no SQLite details) and are
 * used as the common “shape language” between the indexer, search services,
 * diagnostics, and any IPC surfaces.
 */

export interface WorkspaceIdentity {
	readonly id: string;
	readonly workspace: IWorkspaceIdentifier;
}

export const enum FileIndexState {
	Unindexed = 'unindexed',
	Indexing = 'indexing',
	Indexed = 'indexed',
	Deleted = 'deleted',
	Error = 'error'
}

export const enum EmbeddingState {
	None = 'none',
	Pending = 'pending',
	Embedded = 'embedded',
	Error = 'error'
}

export interface FileRow {
	readonly workspaceId: string;
	readonly filePath: string;
	readonly mtime: number;
	readonly size?: number;
	readonly hash: string;
	readonly languageId?: string;
	readonly state: FileIndexState;
	readonly lastIndexedTime?: number;
	readonly chunkCount?: number;
	readonly embeddingState?: EmbeddingState;
	readonly lastError?: string;
}

export interface ChunkRow {
	readonly id: string;
	readonly workspaceId: string;
	readonly filePath: string;
	readonly uri: URI;
	readonly content: string;
	readonly languageId?: string;
	readonly startLine: number;
	readonly startChar: number;
	readonly endLine: number;
	readonly endChar: number;
	readonly hash: string;
	readonly createdAt?: number;
	readonly updatedAt?: number;
}

export interface EmbeddingRow {
	readonly workspaceId: string;
	readonly chunkId: string;
	readonly uri: URI;
	readonly languageId?: string;
	readonly modelId: string;
	readonly modelVersion?: string;
	readonly dim: number;
	readonly norm: number;
	readonly vector: Float32Array;
}

export interface IndexVersionInfo {
	readonly schemaVersion: number;
	readonly lastMigrationTime?: number;
}

export interface ModelVersionInfo {
	readonly modelId: string;
	readonly modelVersion: string;
}



