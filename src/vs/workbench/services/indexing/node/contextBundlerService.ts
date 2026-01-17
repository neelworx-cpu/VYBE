/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextBundle, ContextQuery, IContextBundlerService } from '../common/contextBundlerService.js';
import { ISemanticSearchService } from '../common/semanticSearchService.js';
import { CONFIG_CLOUD_INDEXING_ENABLED } from '../common/indexingConfiguration.js';

/**
 * Phase 1 stub: returns an empty bundle with uninitialized freshness metadata.
 */
export class ContextBundlerService extends Disposable implements IContextBundlerService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISemanticSearchService private readonly semanticSearchService: ISemanticSearchService,
	) {
		super();
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED);
	}

	async getContextForMcp(query: ContextQuery, _token?: CancellationToken): Promise<ContextBundle> {
		if (!this.isEnabled()) {
			return {
				snippets: [],
				symbols: [],
				dependencies: [],
				recencyInfo: { state: 'uninitialized' },
				engineMetadata: { selectionStrategy: 'hybrid', indexFreshness: 'uninitialized', embeddingModel: undefined }
			};
		}

		const semantic = await this.semanticSearchService.search(query.queryText ?? '', { workspace: query.workspace as unknown as any, maxResults: query.maxSnippets ?? 10 });
		const snippets = semantic.map(s => ({
			uri: s.uri,
			snippet: s.snippet ?? '',
			score: s.score,
			range: s.range,
			provenance: s.provenance
		}));

		// Graph service removed - local indexing dependency
		const symbols: any[] = [];

		return {
			snippets,
			symbols,
			dependencies: [],
			recencyInfo: { state: 'ready' },
			engineMetadata: {
				selectionStrategy: 'hybrid',
				indexFreshness: 'fresh',
				embeddingModel: 'voyage-code-3' // Cloud indexing uses Voyage AI
			}
		};
	}
}

