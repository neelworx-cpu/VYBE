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
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IndexStatus, IIndexService, IndexDiagnostics, IndexState } from '../common/indexService.js';
import { CloudIndexService } from './cloudIndexService.js';
import { CONFIG_CLOUD_INDEXING_ENABLED } from '../common/indexingConfiguration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Composite index service that always uses CloudIndexService.
 * Local indexing has been removed - cloud indexing is now the only method.
 */
export class CompositeIndexService extends Disposable implements IIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IndexStatus>());
	readonly onDidChangeStatus: Event<IndexStatus> = this._onDidChangeStatus.event;

	private cloudService: CloudIndexService | undefined;
	private cloudServicePromise: Promise<CloudIndexService> | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// Note: We no longer destroy the cloud service on config changes.
		// CloudIndexService already checks isEnabled() internally for each operation,
		// so destroying it would lose the statusMap and cause "0 files indexed" resets.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_CLOUD_INDEXING_ENABLED)) {
				this.logService.info('[CompositeIndexService] Cloud indexing config changed');
				// Service is kept alive - it will check isEnabled() on next operation
			}
		}));
	}

	private async getCloudService(): Promise<CloudIndexService> {
		if (this.cloudService) {
			return this.cloudService;
		}

		if (this.cloudServicePromise) {
			return this.cloudServicePromise;
		}

		this.cloudServicePromise = (async () => {
			try {
				const service = this.instantiationService.createInstance(CloudIndexService);
				this.cloudService = service;

				// Forward events from cloud service
				this._register(service.onDidChangeStatus(e => {
					this._onDidChangeStatus.fire(e);
				}));

				return service;
			} catch (error) {
				this.logService.error('[CompositeIndexService] Failed to create CloudIndexService:', error);
				throw error;
			}
		})();

		return this.cloudServicePromise;
	}

	private async getActiveService(): Promise<IIndexService> {
		return this.getCloudService();
	}

	async buildFullIndex(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus> {
		const service = await this.getActiveService();
		return service.buildFullIndex(workspace, token);
	}

	async refreshPaths(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus> {
		const service = await this.getActiveService();
		return service.refreshPaths(workspace, uris, token);
	}

	async getStatus(workspace: IAnyWorkspaceIdentifier): Promise<IndexStatus> {
		try {
			// Add timeout to prevent hanging if service creation is slow
			const servicePromise = this.getActiveService();
			const timeoutPromise = new Promise<IIndexService>((_, reject) => {
				setTimeout(() => reject(new Error('Service initialization timeout')), 5000);
			});

			const service = await Promise.race([servicePromise, timeoutPromise]);
			return service.getStatus(workspace);
		} catch (error) {
			// If service creation fails or times out, return a default status
			// This prevents the UI from getting stuck on "Loading..."
			this.logService.warn('[CompositeIndexService] getStatus failed, returning default status:', error);
			return {
				workspace,
				state: IndexState.Idle,
				totalFiles: 0,
				indexedFiles: 0,
				totalChunks: 0,
				embeddedChunks: 0,
				paused: false,
				modelDownloadState: 'ready',
			};
		}
	}

	async indexSavedFiles?(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus> {
		const service = await this.getActiveService();
		if (service.indexSavedFiles) {
			return service.indexSavedFiles(workspace, uris, token);
		}
		return this.refreshPaths(workspace, uris, token);
	}

	async repairModel?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus> {
		const service = await this.getActiveService();
		if (service.repairModel) {
			return service.repairModel(workspace, token);
		}
		// Cloud service doesn't need model repair
		const status = await this.getStatus(workspace);
		return status;
	}

	async deleteIndex?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<void> {
		const service = await this.getActiveService();
		if (service.deleteIndex) {
			return service.deleteIndex(workspace, token);
		}
	}

	async getDiagnostics?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexDiagnostics> {
		const service = await this.getActiveService();
		if (service.getDiagnostics) {
			return service.getDiagnostics(workspace, token);
		}
		// Fallback diagnostics
		const status = await this.getStatus(workspace);
		return {
			workspace,
			state: status.state,
			totalFiles: status.totalFiles ?? 0,
			indexedFiles: status.indexedFiles ?? 0,
			totalChunks: status.totalChunks ?? 0,
			embeddedChunks: status.embeddedChunks ?? 0,
			embeddingModel: status.embeddingModel,
			lastIndexedTime: status.lastIndexedTime,
			lastError: status.errorMessage,
		};
	}

	async pause(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		const service = await this.getActiveService();
		return service.pause(workspace, reason);
	}

	async resume(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		const service = await this.getActiveService();
		return service.resume(workspace);
	}

	async rebuildWorkspaceIndex(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		const service = await this.getActiveService();
		return service.rebuildWorkspaceIndex(workspace, reason);
	}
}
