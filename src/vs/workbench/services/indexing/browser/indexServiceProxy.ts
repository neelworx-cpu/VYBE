/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IAnyWorkspaceIdentifier, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IndexState, IndexStatus, IIndexService } from '../common/indexService.js';
import { getExtHostIndexingProxy } from '../../../api/browser/mainThreadIndexing.js';

/**
 * Renderer-side proxy implementation of {@link IIndexService} that forwards
 * calls to the extension host. This class must not construct or access any
 * Node-only indexing or SQLite logic.
 */
export class IndexServiceProxy extends Disposable implements IIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IndexStatus>());
	readonly onDidChangeStatus: Event<IndexStatus> = this._onDidChangeStatus.event;

	private readonly extHostIndexing = getExtHostIndexingProxy();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();

		// Auto-index on workspace folder changes
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(async (e) => {
			if (e.added.length > 0) {
				const workspace = this.workspaceContextService.getWorkspace();
				if (workspace.folders.length > 0) {
					// Delay slightly to ensure workspace is fully initialized
					setTimeout(async () => {
						await this.autoIndexIfNeeded(workspace);
					}, 1000);
				}
			}
		}));

		// Auto-index if workspace is already open when service initializes
		// Use a small delay to ensure service is fully initialized, but make it immediate
		// so the UI doesn't show stale data
		setTimeout(async () => {
			const workspace = this.workspaceContextService.getWorkspace();
			if (workspace.folders.length > 0) {
				await this.autoIndexIfNeeded(workspace);
			}
		}, 100);
	}

	private async autoIndexIfNeeded(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		try {
			const workspaceId = this.workspaceIdFromIdentifier(workspace);
			const status = await this.getStatus(workspace);

			// Check if we should auto-index:
			// 1. State is idle/uninitialized (no index yet)
			// 2. No full scan has been completed yet (lastFullScanTime is missing/null)
			// This is the correct way to check if a workspace needs an initial full scan
			const shouldAutoIndex =
				status.state === IndexState.Idle ||
				status.state === IndexState.Uninitialized ||
				!status.lastFullScanTime; // No full scan completed yet

			if (shouldAutoIndex) {
				// Wait for ext host to be ready (retry up to 5 times with 200ms delay)
				let retries = 0;
				while (!this.extHostIndexing && retries < 5) {
					await new Promise(resolve => setTimeout(resolve, 200));
					retries++;
				}

				if (!this.extHostIndexing) {
					this.logService.error('[IndexServiceProxy] auto-index failed - extHostIndexing proxy not available after retries', { workspaceId, retries });
					return;
				}

				await this.buildFullIndex(workspace, CancellationToken.None);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			this.logService.error('[IndexServiceProxy] auto-index failed', { message, stack });
		}
	}

	private workspaceIdFromIdentifier(workspace: IAnyWorkspaceIdentifier): string {
		if (isWorkspaceIdentifier(workspace)) {
			return workspace.id ?? workspace.configPath.fsPath;
		} else if (isSingleFolderWorkspaceIdentifier(workspace)) {
			return workspace.id ?? workspace.uri.fsPath;
		}
		// Fallback for empty workspace
		return workspace.id ?? 'default';
	}

	private getWorkspaceRoots(): URI[] {
		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.folders.length) {
			return workspace.folders.map(f => f.uri);
		}
		// No folder roots means there is nothing to index.
		return [];
	}

	async buildFullIndex(workspace: IAnyWorkspaceIdentifier, _token?: CancellationToken): Promise<IndexStatus> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);
		const roots = this.getWorkspaceRoots();

		if (!roots.length) {
			const message = 'No workspace folder roots to index';
			this.logService.warn('[IndexServiceProxy] buildFullIndex aborted - no roots', { workspaceId });
			const status: IndexStatus = {
				workspace,
				state: IndexState.Error,
				errorMessage: message
			};
			this._onDidChangeStatus.fire(status);
			return status;
		}

		if (!this.extHostIndexing) {
			const status: IndexStatus = {
				workspace,
				state: IndexState.Uninitialized,
			};
			this._onDidChangeStatus.fire(status);
			return status;
		}

		try {
			const dto = await this.extHostIndexing.$buildFullIndex(workspaceId, roots.map(r => r.toJSON()), _token ?? CancellationToken.None);
			// Full index completed (detailed counts in status)
			const state = (dto.state ?? IndexState.Uninitialized) as IndexState;
			const status: IndexStatus = {
				workspace,
				state,
				lastIndexedTime: dto.lastIndexedTime,
				totalFiles: dto.totalFiles,
				indexedFiles: dto.indexedFiles,
				totalChunks: dto.totalChunks,
				embeddedChunks: dto.embeddedChunks,
				embeddingModel: dto.embeddingModel ?? this.configurationService.getValue<string>('vybe.localIndexing.embeddingModel'),
				errorMessage: dto.errorMessage,
				lastFullScanTime: dto.lastFullScanTime,
				lastEmbeddingRunTime: dto.lastEmbeddingRunTime,
				failedEmbeddingCount: dto.failedEmbeddingCount,
				pendingEmbeddingCount: dto.pendingEmbeddingCount,
				retrievalMode: dto.retrievalMode,
				vectorIndexReady: dto.vectorIndexReady,
				lastErrorCode: dto.lastErrorCode,
				lastErrorMessage: dto.lastErrorMessage,
				paused: dto.paused,
				pausedReason: dto.pausedReason,
				degradedReason: dto.degradedReason,
				rebuilding: dto.rebuilding,
				backfillingVectorIndex: dto.backfillingVectorIndex,
				modelDownloadState: dto.modelDownloadState,
				modelDownloadProgress: dto.modelDownloadProgress,
				modelDownloadMessage: dto.modelDownloadMessage,
			};
			// Status event fired (detailed counts logged above)
			this._onDidChangeStatus.fire(status);
			return status;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			this.logService.error('[IndexServiceProxy] buildFullIndex failed', { workspaceId, message, stack });
			const fallback: IndexStatus = {
				workspace,
				state: IndexState.Error,
				errorMessage: message
			};
			this._onDidChangeStatus.fire(fallback);
			return fallback;
		}
	}

	async refreshPaths(workspace: IAnyWorkspaceIdentifier, _uris: URI[], _token?: CancellationToken): Promise<IndexStatus> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		if (!this.extHostIndexing) {
			const status: IndexStatus = {
				workspace,
				state: IndexState.Uninitialized,
			};
			this._onDidChangeStatus.fire(status);
			return status;
		}

		try {
			const dto = await this.extHostIndexing.$refreshPaths(workspaceId, _uris.map(u => u.toJSON()), _token ?? CancellationToken.None);
			const state = (dto.state ?? IndexState.Uninitialized) as IndexState;
			const status: IndexStatus = {
				workspace,
				state,
				lastIndexedTime: dto.lastIndexedTime,
				totalFiles: dto.totalFiles,
				indexedFiles: dto.indexedFiles,
				totalChunks: dto.totalChunks,
				embeddedChunks: dto.embeddedChunks,
				embeddingModel: dto.embeddingModel ?? this.configurationService.getValue<string>('vybe.localIndexing.embeddingModel'),
				errorMessage: dto.errorMessage,
				lastFullScanTime: dto.lastFullScanTime,
				lastEmbeddingRunTime: dto.lastEmbeddingRunTime,
				failedEmbeddingCount: dto.failedEmbeddingCount,
				pendingEmbeddingCount: dto.pendingEmbeddingCount,
				retrievalMode: dto.retrievalMode,
				vectorIndexReady: dto.vectorIndexReady,
				lastErrorCode: dto.lastErrorCode,
				lastErrorMessage: dto.lastErrorMessage,
				paused: dto.paused,
				pausedReason: dto.pausedReason,
				degradedReason: dto.degradedReason,
				rebuilding: dto.rebuilding,
				backfillingVectorIndex: dto.backfillingVectorIndex,
				modelDownloadState: dto.modelDownloadState,
				modelDownloadProgress: dto.modelDownloadProgress,
				modelDownloadMessage: dto.modelDownloadMessage,
			};
			this._onDidChangeStatus.fire(status);
			return status;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.warn('[IndexServiceProxy] refreshPaths failed', message);
			const fallback: IndexStatus = {
				workspace,
				state: IndexState.Error,
				errorMessage: message
			};
			this._onDidChangeStatus.fire(fallback);
			return fallback;
		}
	}

	async indexSavedFiles(workspace: IAnyWorkspaceIdentifier, uris: URI[], _token?: CancellationToken): Promise<IndexStatus> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		if (!this.extHostIndexing) {
			const status: IndexStatus = {
				workspace,
				state: IndexState.Uninitialized,
			};
			this._onDidChangeStatus.fire(status);
			return status;
		}

		if (!uris.length) {
			return this.getStatus(workspace);
		}

		try {
			const dto = await this.extHostIndexing.$indexSavedFiles(
				workspaceId,
				uris.map(u => u.toJSON()),
				_token ?? CancellationToken.None
			);
			const state = (dto.state ?? IndexState.Uninitialized) as IndexState;
			const status: IndexStatus = {
				workspace,
				state,
				lastIndexedTime: dto.lastIndexedTime,
				totalFiles: dto.totalFiles,
				indexedFiles: dto.indexedFiles,
				totalChunks: dto.totalChunks,
				embeddedChunks: dto.embeddedChunks,
				embeddingModel: dto.embeddingModel ?? this.configurationService.getValue<string>('vybe.localIndexing.embeddingModel'),
				errorMessage: dto.errorMessage,
				lastFullScanTime: dto.lastFullScanTime,
				lastEmbeddingRunTime: dto.lastEmbeddingRunTime,
				failedEmbeddingCount: dto.failedEmbeddingCount,
				pendingEmbeddingCount: dto.pendingEmbeddingCount,
				retrievalMode: dto.retrievalMode,
				vectorIndexReady: dto.vectorIndexReady,
				lastErrorCode: dto.lastErrorCode,
				lastErrorMessage: dto.lastErrorMessage,
				paused: dto.paused,
				pausedReason: dto.pausedReason,
				degradedReason: dto.degradedReason,
				rebuilding: dto.rebuilding,
				backfillingVectorIndex: dto.backfillingVectorIndex,
				modelDownloadState: dto.modelDownloadState,
				modelDownloadProgress: dto.modelDownloadProgress,
				modelDownloadMessage: dto.modelDownloadMessage,
			};
			this._onDidChangeStatus.fire(status);
			return status;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.warn('[IndexServiceProxy] indexSavedFiles failed', message);
			const fallback: IndexStatus = {
				workspace,
				state: IndexState.Error,
				errorMessage: message
			};
			this._onDidChangeStatus.fire(fallback);
			return fallback;
		}
	}

	async getStatus(workspace: IAnyWorkspaceIdentifier): Promise<IndexStatus> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		// Until the extension host customer has been constructed we may not
		// have an indexing proxy available. In that case, surface a clear
		// "uninitialized" status instead of pretending the index is empty.
		if (!this.extHostIndexing) {
			const status: IndexStatus = {
				workspace,
				state: IndexState.Uninitialized,
			};
			this._onDidChangeStatus.fire(status);
			return status;
		}
		try {
			const dto = await this.extHostIndexing.$getStatus(workspaceId);
			// Status retrieved (detailed counts logged in ext host)
			const state = (dto.state ?? IndexState.Uninitialized) as IndexState;
			const status: IndexStatus = {
				workspace,
				state,
				lastIndexedTime: dto.lastIndexedTime,
				totalFiles: dto.totalFiles,
				indexedFiles: dto.indexedFiles,
				totalChunks: dto.totalChunks,
				embeddedChunks: dto.embeddedChunks,
				embeddingModel: dto.embeddingModel ?? this.configurationService.getValue<string>('vybe.localIndexing.embeddingModel'),
				errorMessage: dto.errorMessage,
				lastFullScanTime: dto.lastFullScanTime,
				lastEmbeddingRunTime: dto.lastEmbeddingRunTime,
				failedEmbeddingCount: dto.failedEmbeddingCount,
				pendingEmbeddingCount: dto.pendingEmbeddingCount,
				retrievalMode: dto.retrievalMode,
				vectorIndexReady: dto.vectorIndexReady,
				lastErrorCode: dto.lastErrorCode,
				lastErrorMessage: dto.lastErrorMessage,
				paused: dto.paused,
				pausedReason: dto.pausedReason,
				degradedReason: dto.degradedReason,
				rebuilding: dto.rebuilding,
				backfillingVectorIndex: dto.backfillingVectorIndex,
				modelDownloadState: dto.modelDownloadState,
				modelDownloadProgress: dto.modelDownloadProgress,
				modelDownloadMessage: dto.modelDownloadMessage,
			};
			// Status event fired (detailed counts logged in ext host)
			this._onDidChangeStatus.fire(status);
			return status;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.warn('[IndexServiceProxy] getStatus failed', message);
			const fallback: IndexStatus = {
				workspace,
				state: IndexState.Error,
				errorMessage: message
			};
			this._onDidChangeStatus.fire(fallback);
			return fallback;
		}
	}

	// Phase 12: Control plane methods
	async pause(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		if (!this.extHostIndexing) {
			this.logService.warn('[IndexServiceProxy] pause failed - ext host not available', { workspaceId });
			return;
		}

		try {
			await this.extHostIndexing.$pauseIndexing(workspaceId, reason);
			// Refresh status after pause
			await this.getStatus(workspace);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.error('[IndexServiceProxy] pause failed', { workspaceId, message });
			throw err;
		}
	}

	async resume(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		if (!this.extHostIndexing) {
			this.logService.warn('[IndexServiceProxy] resume failed - ext host not available', { workspaceId });
			return;
		}

		try {
			await this.extHostIndexing.$resumeIndexing(workspaceId);
			// Refresh status after resume
			await this.getStatus(workspace);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.error('[IndexServiceProxy] resume failed', { workspaceId, message });
			throw err;
		}
	}

	async deleteIndex(workspace: IAnyWorkspaceIdentifier, _token?: CancellationToken): Promise<void> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		if (!this.extHostIndexing) {
			this.logService.warn('[IndexServiceProxy] deleteIndex failed - ext host not available', { workspaceId });
			return;
		}

		try {
			await this.extHostIndexing.$deleteIndex(workspaceId);
			// Refresh status after delete (should show empty/uninitialized state)
			await this.getStatus(workspace);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.error('[IndexServiceProxy] deleteIndex failed', { workspaceId, message });
			throw err;
		}
	}

	async rebuildWorkspaceIndex(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		const workspaceId = this.workspaceIdFromIdentifier(workspace);

		if (!this.extHostIndexing) {
			this.logService.warn('[IndexServiceProxy] rebuildWorkspaceIndex failed - ext host not available', { workspaceId });
			return;
		}

		try {
			await this.extHostIndexing.$rebuildWorkspaceIndex(workspaceId, reason);
			// Refresh status after rebuild
			await this.getStatus(workspace);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.error('[IndexServiceProxy] rebuildWorkspaceIndex failed', { workspaceId, message });
			throw err;
		}
	}
}


