/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextBundle, ContextQuery, IContextBundlerService } from '../common/contextBundlerService.js';
import { ISemanticSearchService } from '../common/semanticSearchService.js';
import { IGraphService } from '../common/graphService.js';
import { CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH, CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_EMBEDDING_MODEL } from '../common/indexingConfiguration.js';

/**
 * Phase 1 stub: returns an empty bundle with uninitialized freshness metadata.
 */
export class ContextBundlerService extends Disposable implements IContextBundlerService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISemanticSearchService private readonly semanticSearchService: ISemanticSearchService,
		@IGraphService private readonly graphService: IGraphService,
	) {
		super();
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING)
			&& !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH);
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

		const symbols = [];
		for (const s of semantic) {
			const neighbors = await this.graphService.getNeighbors(s.uri.toString(), query.workspace as unknown as any);
			for (const edge of neighbors) {
				symbols.push({
					id: edge.to,
					name: edge.to,
					uri: s.uri,
					languageId: s.languageId
				});
			}
		}

		return {
			snippets,
			symbols,
			dependencies: [],
			recencyInfo: { state: 'ready' },
			engineMetadata: {
				selectionStrategy: 'hybrid',
				indexFreshness: 'fresh',
				embeddingModel: this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed'
			}
		};
	}
}

