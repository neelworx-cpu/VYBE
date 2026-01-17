/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ISemanticSearchService, SemanticSearchOptions, SemanticSearchResult } from '../common/semanticSearchService.js';
import { CloudSemanticSearchService } from './cloudSemanticSearchService.js';
import { CONFIG_CLOUD_INDEXING_ENABLED } from '../common/indexingConfiguration.js';

/**
 * Composite semantic search service that always uses CloudSemanticSearchService.
 * Local indexing has been removed - cloud indexing is now the only method.
 */
export class CompositeSemanticSearchService extends Disposable implements ISemanticSearchService {
	declare readonly _serviceBrand: undefined;

	private cloudService: CloudSemanticSearchService | undefined;
	private cloudServicePromise: Promise<CloudSemanticSearchService> | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// Listen for config changes to reload service
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_CLOUD_INDEXING_ENABLED)) {
				this.logService.info('[CompositeSemanticSearchService] Cloud indexing config changed, reloading service');
				// Reset cloud service to reload it
				this.cloudService = undefined;
				this.cloudServicePromise = undefined;
			}
		}));
	}

	private async getCloudService(): Promise<CloudSemanticSearchService> {
		if (this.cloudService) {
			return this.cloudService;
		}

		if (this.cloudServicePromise) {
			return this.cloudServicePromise;
		}

		this.cloudServicePromise = (async () => {
			try {
				const service = this.instantiationService.createInstance(CloudSemanticSearchService);
				this.cloudService = service;
				return service;
			} catch (error) {
				this.logService.error('[CompositeSemanticSearchService] Failed to create CloudSemanticSearchService:', error);
				throw error;
			}
		})();

		return this.cloudServicePromise;
	}

	private async getActiveService(): Promise<ISemanticSearchService> {
		return this.getCloudService();
	}

	async search(query: string, options?: SemanticSearchOptions, token?: CancellationToken): Promise<SemanticSearchResult[]> {
		const service = await this.getActiveService();
		return service.search(query, options, token);
	}
}
