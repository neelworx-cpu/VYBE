/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ISemanticSearchService, SemanticSearchOptions, SemanticSearchResult } from '../common/semanticSearchService.js';
import { ITextShardStore } from '../common/textShardStore.js';
import { CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH, CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_ENABLE_LOCAL_EMBEDDINGS, CONFIG_SEARCH_TOP_K, CONFIG_LEXICAL_ROW_LIMIT } from '../common/indexingConfiguration.js';
import { IAiEmbeddingVectorService } from '../../aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { SqliteStore } from './sqliteStore.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Phase 1 stub: returns no results and does not affect existing search behavior.
 */
export class SemanticSearchService extends Disposable implements ISemanticSearchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextShardStore private readonly textShardStore: ITextShardStore,
		@IAiEmbeddingVectorService private readonly embeddingVectorService: IAiEmbeddingVectorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super();
		this.sqliteStore = new SqliteStore(environmentService, fileService, logService);
	}

	private readonly sqliteStore: SqliteStore;

	private isIndexingEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING);
	}

	async search(query: string, options?: SemanticSearchOptions, _token?: CancellationToken): Promise<SemanticSearchResult[]> {
		const workspaceUri = options?.workspace;
		if (!this.isIndexingEnabled() || !workspaceUri) {
			return [];
		}
		const workspace = { id: workspaceUri.toString(), configPath: workspaceUri } as any;

		const maxResults = options?.maxResults ?? 20;
		const lexicalLimit = this.configurationService.getValue<number>(CONFIG_LEXICAL_ROW_LIMIT) ?? maxResults;
		const topK = this.configurationService.getValue<number>(CONFIG_SEARCH_TOP_K) ?? maxResults;

		// Lexical
		const lexicalHits = await this.textShardStore.searchLexical(query, Math.min(maxResults, lexicalLimit), workspace);
		const maxLexScore = lexicalHits.reduce((m, h) => Math.max(m, h.score ?? 0), 0) || 1;

		const semanticAllowed = this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH)
			&& this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS);

		let semanticResults: { chunkId: string; score: number }[] = [];
		let queryVec: Float32Array | undefined;

		if (semanticAllowed) {
			try {
				const vectors = await this.embeddingVectorService.getEmbeddingVector([query], _token ?? CancellationToken.None) as number[][];
				queryVec = Float32Array.from(vectors[0] ?? []);
			} catch {
				queryVec = undefined;
			}
			if (queryVec && queryVec.length) {
				semanticResults = await this.sqliteStore.nearestVectors(workspace, queryVec, topK);
			}
		}

		const chunkIds = Array.from(new Set([...semanticResults.map(r => r.chunkId), ...lexicalHits.map(h => h.chunkId ?? '')].filter(Boolean)));
		const chunkMeta = chunkIds.length ? await this.sqliteStore.getChunksByIds(workspace, chunkIds) : [];
		const chunkMap = new Map<string, typeof chunkMeta[number]>();
		for (const c of chunkMeta) {
			chunkMap.set(c.id, c);
		}

		const recencyBase = await this.sqliteStore.readMetadata(workspace, 'lastIndexedTime');
		const recencyTime = recencyBase ? Number(recencyBase) : undefined;

		const results: SemanticSearchResult[] = [];
		const seen = new Set<string>();

		const computeRecency = (uri: URI) => {
			let recencyScore = 0;
			if (recencyTime) {
				const ageMs = Date.now() - recencyTime;
				const ageDays = ageMs / (1000 * 60 * 60 * 24);
				recencyScore = 1 / (1 + ageDays);
			}
			try {
				const mtime = undefined; // avoid FS per result for now
				if (mtime) {
					const ageMs = Date.now() - mtime;
					const ageDays = ageMs / (1000 * 60 * 60 * 24);
					recencyScore = Math.max(recencyScore, 1 / (1 + ageDays));
				}
			} catch {
				// ignore
			}
			return recencyScore;
		};

		const semanticMax = semanticResults.reduce((m, r) => Math.max(m, r.score), 0) || 1;

		const addResult = (chunkId: string, lexicalScoreRaw: number, semanticScoreRaw: number) => {
			if (seen.has(chunkId)) {
				return;
			}
			const meta = chunkMap.get(chunkId);
			if (!meta) {
				return;
			}
			const lexicalScore = lexicalScoreRaw > 0 ? Math.min(1, lexicalScoreRaw / maxLexScore) : 0;
			const semanticScore = semanticScoreRaw > 0 ? Math.min(1, (semanticScoreRaw + 1) / 2 / (semanticMax ? Math.max(semanticMax, 1) : 1)) : 0;
			const recencyScore = computeRecency(meta.uri);

			let finalScore: number;
			if (semanticAllowed && semanticScoreRaw > 0) {
				// Weighted sum: 0.65 semantic, 0.25 lexical, 0.10 recency
				finalScore = 0.65 * semanticScore + 0.25 * lexicalScore + 0.10 * recencyScore;
			} else {
				// Semantic disabled: fallback weighting
				finalScore = 0.75 * lexicalScore + 0.25 * recencyScore;
			}

			const provenance: Array<'lexical' | 'vector' | 'graph'> = [];
			if (lexicalScore > 0) {
				provenance.push('lexical');
			}
			if (semanticScore > 0) {
				provenance.push('vector');
			}

			results.push({
				uri: meta.uri,
				score: finalScore,
				snippet: meta.content.slice(0, 500),
				range: { startLineNumber: meta.startLine, endLineNumber: meta.endLine },
				provenance,
				languageId: meta.languageId ?? 'plaintext'
			});
			seen.add(chunkId);
		};

		for (const sem of semanticResults) {
			addResult(sem.chunkId, 0, sem.score);
		}
		for (const lex of lexicalHits) {
			const cid = lex.chunkId ?? '';
			if (!cid) {
				continue;
			}
			addResult(cid, lex.score ?? 0, semanticResults.find(s => s.chunkId === cid)?.score ?? 0);
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, maxResults);
	}
}

