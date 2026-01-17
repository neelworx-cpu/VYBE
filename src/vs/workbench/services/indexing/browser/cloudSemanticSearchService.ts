/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISemanticSearchService, SemanticSearchOptions, SemanticSearchResult } from '../common/semanticSearchService.js';
import { IVoyageEmbeddingService } from '../common/voyageEmbeddingService.js';
import { IPineconeVectorStore } from '../common/pineconeVectorStore.js';
import { getNamespace, getUserId } from '../common/namespaceUtils.js';

/**
 * Cloud-based semantic search service using Voyage AI and Pinecone.
 */
export class CloudSemanticSearchService extends Disposable implements ISemanticSearchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IVoyageEmbeddingService private readonly voyageService: IVoyageEmbeddingService,
		@IPineconeVectorStore private readonly pineconeStore: IPineconeVectorStore,
	) {
		super();
	}

	async search(query: string, options?: SemanticSearchOptions, token?: CancellationToken): Promise<SemanticSearchResult[]> {
		const workspaceUri = options?.workspace;
		if (!workspaceUri) {
			this.logService.warn('[CloudSemanticSearchService] No workspace URI provided');
			return [];
		}

		const workspacePath = workspaceUri.fsPath;
		const userId = getUserId();
		const namespace = getNamespace(userId, workspacePath);
		const topK = options?.maxResults ?? 20;

		try {
			// Get embedding for the query
			this.logService.trace('[CloudSemanticSearchService] Generating query embedding', { query: query.substring(0, 100) });
			const queryEmbeddings = await this.voyageService.embed([query], 'query');
			if (!queryEmbeddings || queryEmbeddings.length === 0) {
				this.logService.warn('[CloudSemanticSearchService] Failed to generate query embedding');
				return [];
			}

			const queryVector = queryEmbeddings[0];

			// Query Pinecone
			this.logService.trace('[CloudSemanticSearchService] Querying Pinecone', { namespace, topK });
			const results = await this.pineconeStore.query(namespace, queryVector, topK);

			// Convert to SemanticSearchResult[]
			const searchResults: SemanticSearchResult[] = results.map(result => {
				const uri = URI.file(result.metadata.filePath);
				return {
					uri,
					score: result.score,
					snippet: result.metadata.content,
					range: {
						startLineNumber: result.metadata.startLine + 1,
						endLineNumber: result.metadata.endLine + 1,
					},
					provenance: ['vector'] as Array<'lexical' | 'vector' | 'graph'>,
					languageId: result.metadata.languageId,
				};
			});

			this.logService.info('[CloudSemanticSearchService] Search completed', {
				workspacePath,
				namespace,
				query: query.substring(0, 100),
				resultCount: searchResults.length
			});

			return searchResults;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[CloudSemanticSearchService] Search failed', {
				query: query.substring(0, 100),
				workspacePath,
				namespace,
				message
			});
			return [];
		}
	}
}
