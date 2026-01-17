/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVoyageEmbeddingService } from '../common/voyageEmbeddingService.js';
import { VoyageEmbeddingServiceImpl } from '../electron-browser/voyageEmbeddingServiceImpl.js';
import { IPineconeVectorStore } from '../common/pineconeVectorStore.js';
import { IIndexService } from '../common/indexService.js';
import { CompositeIndexService } from './compositeIndexService.js';
// Use proxy in browser - actual SDK implementation is in node/ and accessed via RPC
import { PineconeVectorStoreProxy } from './pineconeVectorStoreProxy.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CONFIG_CLOUD_INDEXING_ENABLED } from '../common/indexingConfiguration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

// Register cloud indexing services
registerSingleton(IVoyageEmbeddingService, VoyageEmbeddingServiceImpl, InstantiationType.Delayed);
// Register Pinecone proxy in browser (actual SDK implementation is in node/ accessed via RPC)
registerSingleton(IPineconeVectorStore, PineconeVectorStoreProxy, InstantiationType.Delayed);
// Register CompositeIndexService as the IIndexService implementation
registerSingleton(IIndexService, CompositeIndexService, InstantiationType.Delayed);

/**
 * Workbench contribution that ensures cloud indexing starts automatically when enabled.
 * This decouples the indexing lifecycle from the Settings UI - indexing starts at workbench
 * startup rather than when the user opens Settings.
 */
class CloudIndexingWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.cloudIndexing';

	constructor(
		@IIndexService private readonly indexService: IIndexService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// If cloud indexing is enabled, trigger service initialization
		// The service will auto-index if needed based on its internal logic
		if (this.configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED)) {
			this.logService.info('[CloudIndexingContribution] Cloud indexing enabled, initializing service');
			// Trigger service initialization by calling a lightweight method
			// This ensures the CloudIndexService constructor runs and auto-index kicks in
			this.initializeService();
		}

		// Listen for config changes to trigger service when enabled
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_CLOUD_INDEXING_ENABLED)) {
				const enabled = this.configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED);
				if (enabled) {
					this.logService.info('[CloudIndexingContribution] Cloud indexing was enabled, initializing service');
					this.initializeService();
				}
			}
		}));
	}

	private async initializeService(): Promise<void> {
		// The indexService is lazy - calling any method on it triggers instantiation
		// We don't need the result; just accessing the service is enough to start auto-indexing
		try {
			// Small delay to let the workbench finish initializing
			await new Promise(resolve => setTimeout(resolve, 500));
			// Access the service - this triggers CloudIndexService construction and auto-index
			await (this.indexService as any).getStatus?.({
				id: 'trigger-init',
				uri: undefined,
				configPath: undefined
			}).catch(() => { /* ignore errors during init trigger */ });
		} catch {
			// Ignore - the service will handle its own initialization
		}
	}
}

// Register the contribution to run at workbench startup (after restore phase)
registerWorkbenchContribution2(
	CloudIndexingWorkbenchContribution.ID,
	CloudIndexingWorkbenchContribution,
	WorkbenchPhase.AfterRestored
);
