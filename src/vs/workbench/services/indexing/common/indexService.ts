/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IIndexService = createDecorator<IIndexService>('indexService');

export const enum IndexState {
	Uninitialized = 'uninitialized',
	Indexing = 'indexing',
	Ready = 'ready',
	Stale = 'stale',
	Error = 'error',
	/**
	 * No index data exists yet for the workspace. This is conceptually the
	 * same as {@link IndexState.Uninitialized} but is exposed as a more
	 * descriptive lifecycle state.
	 */
	Idle = 'idle',
	/**
	 * A full index build is currently running. This is conceptually the same
	 * as {@link IndexState.Indexing} but is exposed as a more descriptive
	 * lifecycle state.
	 */
	Building = 'building',
	/**
	 * The index is usable but not fully healthy. For example, embeddings or
	 * vector acceleration may have partially failed, or the on-disk schema is
	 * from a newer version so writes are disabled.
	 */
	Degraded = 'degraded'
}

export interface IndexStatus {
	readonly workspace: IAnyWorkspaceIdentifier;
	readonly state: IndexState;
	readonly indexedFileCount?: number;
	readonly lastUpdated?: number;
	readonly lastIndexedTime?: number;
	readonly totalFiles?: number;
	readonly indexedFiles?: number;
	readonly totalChunks?: number;
	readonly embeddedChunks?: number;
	readonly embeddingPending?: number;
	readonly embeddingInProgress?: number;
	readonly embeddingActiveBatches?: number;
	readonly embeddingModel?: string;
	readonly errorMessage?: string;
	readonly modelDownloadState?: 'idle' | 'checking' | 'downloading' | 'extracting' | 'ready' | 'error' | 'hash';
	readonly modelDownloadProgress?: number;
	readonly modelDownloadMessage?: string;
	readonly lastFullScanTime?: number;
	readonly lastEmbeddingRunTime?: number;
	readonly failedEmbeddingCount?: number;
	readonly pendingEmbeddingCount?: number;
	readonly retrievalMode?: 'ts' | 'sqlite-vector';
	readonly vectorIndexReady?: boolean;
	readonly lastErrorCode?: string;
	readonly lastErrorMessage?: string;
	// Phase 10: Control plane fields
	readonly paused?: boolean;
	readonly pausedReason?: string;
	readonly degradedReason?: string;
	readonly rebuilding?: boolean;
	readonly backfillingVectorIndex?: boolean;
}

/**
 * Minimal, JSON-serializable DTO for flowing index status across the
 * extension host RPC boundary. This intentionally omits complex types
 * like URIs and focuses on aggregate counts and high-level state.
 */
export interface IndexStatusDto {
	readonly workspaceId: string;
	readonly state: IndexState;
	readonly totalFiles?: number;
	readonly indexedFiles?: number;
	readonly totalChunks?: number;
	readonly lastIndexedTime?: number;
	readonly schemaVersion?: number;
	readonly embeddedChunks?: number;
	readonly embeddingModel?: string;
	readonly errorMessage?: string;
}

export interface IndexDiagnostics {
	readonly workspace: IAnyWorkspaceIdentifier;
	readonly state: IndexState;
	readonly totalFiles: number;
	readonly indexedFiles: number;
	readonly totalChunks: number;
	readonly embeddedChunks: number;
	readonly embeddingModel?: string;
	readonly modelDownloadState?: IndexStatus['modelDownloadState'];
	readonly lastIndexedTime?: number;
	readonly lastError?: string;
	/**
	 * Optional on-disk path to the underlying index database for this
	 * workspace. Exposed for diagnostics and never used for direct access
	 * by tools.
	 */
	readonly dbPath?: string;
}

export interface IndexRequest {
	readonly uri: URI;
	readonly languageId?: string;
	readonly content?: string;
	readonly workspace?: IAnyWorkspaceIdentifier;
}

export interface IIndexService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeStatus: Event<IndexStatus>;

	buildFullIndex(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus>;
	refreshPaths(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus>;
	getStatus(workspace: IAnyWorkspaceIdentifier): Promise<IndexStatus>;
	/**
	 * Optional incremental indexing entry point for a set of saved files.
	 * Implementations should only touch the specified URIs and must not
	 * rebuild the full tree unless explicitly requested via buildFullIndex.
	 */
	indexSavedFiles?(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus>;
	/**
	 * Optional hook to repair or reinitialize the local embedding model
	 * installation for a given workspace. Implementations may be a no-op.
	 */
	repairModel?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus>;

	/**
	 * Deletes all index data for the given workspace. Implementations should
	 * treat this as a best-effort operation and leave the workspace in an
	 * {@link IndexState.Uninitialized} state on success.
	 */
	deleteIndex?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<void>;

	/**
	 * Returns a metadata-only snapshot of the current index state for
	 * diagnostics and support. Implementations must not include file
	 * contents or embeddings.
	 */
	getDiagnostics?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexDiagnostics>;

	/**
	 * Phase 12: Pause indexing operations for a workspace.
	 * Current work will complete, but no new work will start.
	 */
	pause(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void>;

	/**
	 * Phase 12: Resume indexing operations for a workspace.
	 */
	resume(workspace: IAnyWorkspaceIdentifier): Promise<void>;

	/**
	 * Phase 12: Rebuild workspace index. This will delete all index data
	 * and rebuild from scratch.
	 */
	rebuildWorkspaceIndex(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void>;
}

