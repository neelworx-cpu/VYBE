/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { IIndexService } from '../../../services/indexing/common/indexService.js';
import { ISemanticSearchService } from '../../../services/indexing/common/semanticSearchService.js';
import { IContextBundlerService } from '../../../services/indexing/common/contextBundlerService.js';
import { CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH } from '../../../services/indexing/common/indexingConfiguration.js';
import {
	disabledContextResponse,
	disabledRefreshResponse,
	disabledSearchResponse,
	disabledStatusResponse,
	GetContextForMcpRequest,
	GetContextForMcpResponse,
	ListIndexStatusRequest,
	ListIndexStatusResponse,
	RefreshIndexRequest,
	RefreshIndexResponse,
	SearchHybridRequest,
	SearchHybridResponse,
	parseWorkspaceId,
	IDEContextSnippet,
	IDEContextSymbol
} from './vybeMcpTools.js';

export class VybeMcpRouter {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IIndexService private readonly indexService: IIndexService,
		@ISemanticSearchService private readonly semanticSearchService: ISemanticSearchService,
		@IContextBundlerService private readonly contextBundlerService: IContextBundlerService,
		@ILogService private readonly logService: ILogService,
	) { }

	private indexingEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING);
	}

	private semanticEnabled(): boolean {
		return this.indexingEnabled() && !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH);
	}

	private normalizeLanguageId(uri: URI, languageId?: string): string {
		if (languageId) {
			return languageId;
		}
		const path = uri.path.toLowerCase();
		if (path.endsWith('.ts') || path.endsWith('.tsx')) { return 'typescript'; }
		if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.mjs') || path.endsWith('.cjs')) { return 'javascript'; }
		return 'plaintext';
	}

	private toRange(range?: { startLineNumber?: number; endLineNumber?: number }): { startLine: number; endLine: number; startChar: number; endChar: number } {
		const startLine = range?.startLineNumber ?? 0;
		const endLine = range?.endLineNumber ?? startLine;
		return { startLine, endLine, startChar: 0, endChar: 0 };
	}

	private normalizeSnippet(s: { uri: URI; snippet: string; score?: number; range?: { startLineNumber?: number; endLineNumber?: number }; provenance?: string[]; languageId?: string }): IDEContextSnippet {
		return {
			uri: s.uri.toString(),
			snippet: s.snippet,
			score: s.score ?? 0,
			range: this.toRange(s.range),
			provenance: s.provenance ?? [],
			languageId: this.normalizeLanguageId(s.uri, s.languageId)
		};
	}

	private normalizeSymbol(sym: { id: string; name: string; kind?: string; uri: URI; range?: { startLineNumber?: number; endLineNumber?: number }; languageId?: string }): IDEContextSymbol {
		return {
			id: sym.id,
			name: sym.name,
			kind: sym.kind ?? 'unknown',
			uri: sym.uri.toString(),
			range: sym.range ? { startLine: sym.range.startLineNumber ?? 0, endLine: sym.range.endLineNumber ?? sym.range.startLineNumber ?? 0 } : undefined,
			languageId: this.normalizeLanguageId(sym.uri, sym.languageId)
		};
	}

	private formatDependency(dep: unknown): string {
		if (dep && typeof dep === 'object') {
			const candidate = dep as { from?: string; to?: string; kind?: string };
			if (candidate.from && candidate.to) {
				return `${candidate.from} -> ${candidate.to}${candidate.kind ? ` (${candidate.kind})` : ''}`;
			}
		}
		return String(dep ?? '');
	}

	private extractEmbeddingModel(meta: unknown): string | undefined {
		if (meta && typeof meta === 'object' && Object.prototype.hasOwnProperty.call(meta, 'embeddingModel')) {
			const val = (meta as { embeddingModel?: unknown }).embeddingModel;
			return typeof val === 'string' ? val : undefined;
		}
		return undefined;
	}

	private extractRange(obj: unknown): { startLineNumber?: number; endLineNumber?: number } | undefined {
		if (!obj || typeof obj !== 'object') {
			return undefined;
		}
		const maybe = obj as { startLineNumber?: number; endLineNumber?: number; startLine?: number; endLine?: number };
		if (maybe.startLineNumber !== undefined || maybe.endLineNumber !== undefined) {
			return { startLineNumber: maybe.startLineNumber, endLineNumber: maybe.endLineNumber };
		}
		if (maybe.startLine !== undefined || maybe.endLine !== undefined) {
			return { startLineNumber: maybe.startLine, endLineNumber: maybe.endLine };
		}
		return undefined;
	}

	private extractLanguageId(obj: unknown): string | undefined {
		if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, 'languageId')) {
			const val = (obj as { languageId?: unknown }).languageId;
			return typeof val === 'string' ? val : undefined;
		}
		return undefined;
	}

	private normalizeSnippetUnknown(snippet: unknown): IDEContextSnippet | undefined {
		if (!snippet || typeof snippet !== 'object') {
			return undefined;
		}
		const s = snippet as { uri?: URI; snippet?: string; score?: number; range?: unknown; provenance?: string[]; languageId?: string };
		if (!s.uri || !s.snippet) {
			return undefined;
		}
		return this.normalizeSnippet({
			uri: s.uri,
			snippet: s.snippet,
			score: s.score,
			range: this.extractRange(s.range),
			provenance: s.provenance,
			languageId: this.extractLanguageId(s)
		});
	}

	private normalizeSymbolUnknown(sym: unknown): IDEContextSymbol | undefined {
		if (!sym || typeof sym !== 'object') {
			return undefined;
		}
		const s = sym as { id?: string; name?: string; kind?: string; uri?: URI; range?: unknown; languageId?: string };
		if (!s.id || !s.name || !s.uri) {
			return undefined;
		}
		return this.normalizeSymbol({
			id: s.id,
			name: s.name,
			kind: s.kind,
			uri: s.uri,
			range: this.extractRange(s.range),
			languageId: this.extractLanguageId(s)
		});
	}

	async handleGetContext(request: GetContextForMcpRequest, token?: CancellationToken): Promise<GetContextForMcpResponse> {
		if (!this.semanticEnabled()) {
			return disabledContextResponse();
		}
		const ws = parseWorkspaceId(request.workspaceId);
		if (!ws?.id) {
			return disabledContextResponse();
		}
		const bundle = await this.contextBundlerService.getContextForMcp({
			workspace: ws,
			queryText: request.queryText,
			focusUri: request.focusUri ? URI.parse(request.focusUri) : undefined,
			maxSnippets: request.maxSnippets,
			maxTokens: request.maxTokens,
		}, token ?? CancellationToken.None);
		const normalizedSnippets = bundle.snippets.map(s => this.normalizeSnippetUnknown(s)).filter(Boolean) as IDEContextSnippet[];
		const normalizedSymbols = bundle.symbols.map(sym => this.normalizeSymbolUnknown(sym)).filter(Boolean) as IDEContextSymbol[];

		return {
			state: (bundle.recencyInfo?.state as GetContextForMcpResponse['state']) ?? 'uninitialized',
			snippets: normalizedSnippets,
			symbols: normalizedSymbols,
			dependencies: (bundle.dependencies ?? []).map(dep => this.formatDependency(dep)),
			recencyInfo: {
				lastIndexedTime: bundle.recencyInfo?.lastIndexedTime,
				state: bundle.recencyInfo?.state ?? 'uninitialized'
			},
			engineMetadata: {
				selectionStrategy: bundle.engineMetadata?.selectionStrategy,
				indexFreshness: bundle.engineMetadata?.indexFreshness ?? bundle.recencyInfo?.state,
				embeddingModel: this.extractEmbeddingModel(bundle.engineMetadata)
			}
		};
	}

	async handleSearchHybrid(request: SearchHybridRequest, token?: CancellationToken): Promise<SearchHybridResponse> {
		if (!this.semanticEnabled()) {
			return disabledSearchResponse();
		}
		const ws = parseWorkspaceId(request.workspaceId);
		if (!ws?.id) {
			return disabledSearchResponse();
		}
		const results = await this.semanticSearchService.search(request.query, { workspace: ws.configPath, maxResults: request.maxResults }, token ?? CancellationToken.None);
		return {
			results: results.map((r): SearchHybridResponse['results'][number] => ({
				uri: r.uri.toString(),
				score: r.score,
				snippet: r.snippet,
				range: this.toRange(r.range ? { startLineNumber: r.range.startLineNumber, endLineNumber: r.range.endLineNumber } : undefined),
				provenance: r.provenance,
				languageId: this.normalizeLanguageId(r.uri, r.languageId)
			}))
		};
	}

	async handleListIndexStatus(request: ListIndexStatusRequest): Promise<ListIndexStatusResponse> {
		if (!this.indexingEnabled()) {
			return disabledStatusResponse(request.workspaceId);
		}
		const ws = parseWorkspaceId(request.workspaceId);
		const status = await this.indexService.getStatus(ws);
		const state = status.state as ListIndexStatusResponse['state'];

		// Prefer richer diagnostics when available so tools can inspect the
		// underlying store without reading the database directly.
		const diagnostics = typeof this.indexService.getDiagnostics === 'function'
			? await this.indexService.getDiagnostics(ws, undefined)
			: undefined;

		return {
			workspaceId: request.workspaceId,
			state,
			indexedFiles: diagnostics?.indexedFiles ?? status.indexedFiles ?? status.indexedFileCount,
			totalFiles: diagnostics?.totalFiles ?? status.totalFiles ?? status.indexedFileCount,
			totalChunks: diagnostics?.totalChunks,
			embeddedChunks: diagnostics?.embeddedChunks,
			lastIndexedTime: diagnostics?.lastIndexedTime ?? status.lastIndexedTime ?? status.lastUpdated,
			embeddingModel: diagnostics?.embeddingModel ?? status.embeddingModel,
			dbPath: diagnostics?.dbPath,
			errorMessage: status.errorMessage
		};
	}

	async handleRefreshIndex(request: RefreshIndexRequest, token?: CancellationToken): Promise<RefreshIndexResponse> {
		if (!this.indexingEnabled()) {
			return disabledRefreshResponse();
		}
		const ws = parseWorkspaceId(request.workspaceId);
		try {
			if (request.mode === 'full' || !request.uris) {
				await this.indexService.buildFullIndex(ws, token);
			} else {
				await this.indexService.refreshPaths(ws, request.uris.map(u => URI.parse(u)), token);
			}
			return { accepted: true, state: 'indexing' };
		} catch (err) {
			this.logService.error('vybe.refresh_index error', err);
			return { accepted: false, state: 'error', message: (err as Error).message };
		}
	}
}

