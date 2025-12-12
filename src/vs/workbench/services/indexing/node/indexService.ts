/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAiEmbeddingVectorService } from '../../aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IndexRequest, IndexState, IndexStatus, IIndexService } from '../common/indexService.js';
import { ILanguageAdapterService } from '../common/languageAdapter.js';
import { ITextShardStore } from '../common/textShardStore.js';
import { IGraphService } from '../common/graphService.js';
import { ISemanticSearchService } from '../common/semanticSearchService.js';
import { IEmbeddingStore } from '../common/embeddingStore.js';
import { registerDefaultLanguageAdapters } from './languageAdapters.js';
import { IndexWatcher } from './indexWatcher.js';
import { CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_ENABLE_LOCAL_INDEX_WATCHER, CONFIG_ENABLE_LOCAL_EMBEDDINGS, CONFIG_MAX_CONCURRENT_JOBS, CONFIG_INDEX_BATCH_SIZE, CONFIG_INDEX_DEBOUNCE_MS, CONFIG_EMBEDDING_MODEL } from '../common/indexingConfiguration.js';
import { ChunkingService } from './chunkingService.js';
import { EmbeddingService } from './embeddingService.js';
import { SqliteStore } from './sqliteStore.js';

const LOCAL_INDEXING_ENABLED = 'vybe.localIndexing.enabled';

export class IndexService extends Disposable implements IIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IndexStatus>());
	readonly onDidChangeStatus: Event<IndexStatus> = this._onDidChangeStatus.event;

	private readonly statusByWorkspace = new Map<string, IndexStatus>();
	private watcher: IndexWatcher | undefined;
	private readonly pendingRequests: IndexRequest[] = [];
	private processing = false;
	private currentWorkspace: IWorkspaceIdentifier | undefined;
	private lastFullIndexTime = 0;
	private readonly chunkingService = new ChunkingService();
	private readonly sqliteStore: SqliteStore;
	private readonly embeddingService: EmbeddingService;

	private getWorkspaceRoots(workspace: IWorkspaceIdentifier): URI[] {
		const roots: URI[] = [];
		if (workspace.configPath) {
			// If configPath is a folder (not a .code-workspace), use it.
			if (!workspace.configPath.path.toLowerCase().endsWith('.code-workspace')) {
				roots.push(workspace.configPath);
			} else if (workspace.configPath.fsPath) {
				// If configPath is a .code-workspace file, use its parent folder as root.
				roots.push(dirname(workspace.configPath));
			}
		}
		// If no roots yet and workspace.id looks like a path, use it.
		if (!roots.length && workspace.id && workspace.id.startsWith('/')) {
			roots.push(URI.file(workspace.id));
		}
		return roots;
	}

	private async enumerateFiles(root: URI, limit = 20000, token?: CancellationToken): Promise<URI[]> {
		const results: URI[] = [];
		const queue: URI[] = [root];
		while (queue.length && results.length < limit) {
			if (token?.isCancellationRequested) {
				break;
			}
			const current = queue.pop()!;
			try {
				const stat = await this.fileService.resolve(current);
				if (!stat.children) {
					if (!stat.isDirectory) {
						results.push(current);
					}
					continue;
				}
				for (const child of stat.children) {
					if (token?.isCancellationRequested) {
						break;
					}
					if (child.isDirectory) {
						queue.push(child.resource);
					} else if (child.resource) {
						results.push(child.resource);
						if (results.length >= limit) {
							break;
						}
					}
				}
			} catch (err) {
				this.logService.trace('[indexService] enumerateFiles skipped path', current.toString(), err);
			}
		}
		return results;
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@ILanguageAdapterService private readonly languageAdapterService: ILanguageAdapterService,
		@ITextShardStore private readonly textShardStore: ITextShardStore,
		@IGraphService private readonly graphService: IGraphService,
		@ISemanticSearchService _semanticSearchService: ISemanticSearchService,
		@IEmbeddingStore _embeddingStore: IEmbeddingStore,
		@IAiEmbeddingVectorService private readonly embeddingVectorService: IAiEmbeddingVectorService,
	) {
		super();
		this._register(registerDefaultLanguageAdapters(this.languageAdapterService));
		this.sqliteStore = new SqliteStore(this.environmentService, this.fileService, this.logService);
		this.embeddingService = new EmbeddingService(this.configurationService, this.embeddingVectorService, this.sqliteStore);
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(LOCAL_INDEXING_ENABLED);
	}

	private isWatcherEnabled(): boolean {
		return this.isEnabled() && !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEX_WATCHER);
	}

	private getOrCreateStatus(workspace: IWorkspaceIdentifier): IndexStatus {
		const key = this.workspaceKey(workspace);
		const existing = this.statusByWorkspace.get(key);
		if (existing) {
			return existing;
		}
		const status: IndexStatus = { workspace, state: IndexState.Uninitialized };
		this.statusByWorkspace.set(key, status);
		return status;
	}

	async buildFullIndex(workspace: IWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus> {
		this.currentWorkspace = workspace;
		const status = this.getOrCreateStatus(workspace);
		if (!this.isEnabled()) {
			return status;
		}
		const now = Date.now();
		if (now - this.lastFullIndexTime < 60000) {
			return status;
		}
		this.lastFullIndexTime = now;
		const updated: IndexStatus = {
			...status,
			state: IndexState.Indexing,
			lastUpdated: Date.now()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), updated);
		this._onDidChangeStatus.fire(updated);

		// Enumerate workspace files
		const roots = this.getWorkspaceRoots(workspace);
		const allUris: URI[] = [];
		for (const root of roots) {
			if (allUris.length >= 20000) {
				break;
			}
			const remaining = 20000 - allUris.length;
			const uris = await this.enumerateFiles(root, remaining, token);
			allUris.push(...uris);
		}
		this.logService.info('[indexService] enumerate files', { workspace: workspace.configPath?.toString(), roots: roots.map(r => r.toString()), count: allUris.length });
		if (!allUris.length) {
			this.logService.info('[indexService] no files enumerated', { workspace: workspace.configPath?.toString(), roots: roots.map(r => r.toString()) });
		}

		await this.indexUris(workspace, allUris, token);

		const totalFiles = await this.sqliteStore.fileCount(workspace);
		const indexedFiles = totalFiles; // minimal pipeline: counted as indexed
		const chunkTotal = await this.sqliteStore.chunkCount(workspace);
		this.logService.info('[indexService] post-index counts', { workspace: workspace.configPath?.toString(), totalFiles, chunkTotal });
		const embeddingModel = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'nomic-ai/CodeRankEmbed';
		const ready: IndexStatus = {
			workspace,
			state: IndexState.Ready,
			lastUpdated: Date.now(),
			totalFiles,
			indexedFiles,
			embeddingModel
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), ready);
		this._onDidChangeStatus.fire(ready);
		return ready;
	}

	async refreshPaths(workspace: IWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus> {
		this.currentWorkspace = workspace;
		const status = this.getOrCreateStatus(workspace);
		if (!this.isEnabled()) {
			return status;
		}
		const updated: IndexStatus = {
			...status,
			state: IndexState.Indexing,
			lastUpdated: Date.now()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), updated);
		this._onDidChangeStatus.fire(updated);

		await this.indexUris(workspace, uris, token);

		const totalFiles = await this.sqliteStore.fileCount(workspace);
		const indexedFiles = totalFiles;
		const embeddingModel = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'nomic-ai/CodeRankEmbed';
		const ready: IndexStatus = {
			workspace,
			state: IndexState.Ready,
			lastUpdated: Date.now(),
			totalFiles,
			indexedFiles,
			embeddingModel
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), ready);
		this._onDidChangeStatus.fire(ready);
		return ready;
	}

	async getStatus(workspace: IWorkspaceIdentifier): Promise<IndexStatus> {
		return this.getOrCreateStatus(workspace);
	}

	private workspaceKey(workspace: IWorkspaceIdentifier): string {
		if (workspace.id) {
			return workspace.id;
		}
		if (workspace.configPath?.fsPath) {
			return workspace.configPath.fsPath;
		}
		return URI.revive(workspace.configPath).toString();
	}

	startWatcher(workspaceRoots: URI[], workspace?: IWorkspaceIdentifier): void {
		if (!this.isWatcherEnabled() || this.watcher) {
			return;
		}
		if (workspace) {
			this.currentWorkspace = workspace;
		}
		this.watcher = this._register(new IndexWatcher(this.fileService, workspaceRoots));
		this.watcher.start();
		this._register(this.watcher.onDidBatch(evt => {
			for (const uri of [...evt.added, ...evt.changed]) {
				this.enqueue({ uri, workspace: this.currentWorkspace });
			}
			for (const uri of evt.deleted) {
				this.enqueueDelete(uri, this.currentWorkspace);
			}
			this.scheduleProcess();
		}));
	}

	/**
	 * Index a set of files. This is intentionally not invoked automatically; it is called by higher layers when enabled.
	 */
	async indexFiles(requests: IndexRequest[], token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}

		for (const request of requests) {
			if (token?.isCancellationRequested) {
				return;
			}
			await this.indexSingle(request, token);
		}
	}

	private async indexSingle(request: IndexRequest, token?: CancellationToken): Promise<void> {
		const adapter = this.languageAdapterService.getAdapter(request.uri, request.languageId);
		if (!adapter) {
			return;
		}

		let text = request.content;
		if (text === undefined) {
			const buffer = await this.fileService.readFile(request.uri, undefined, token);
			text = buffer.value.toString();
		}

		const workspace = request.workspace ?? this.currentWorkspace;
		if (!workspace) {
			return;
		}
		const roots = this.getWorkspaceRoots(workspace);
		if (roots.length && !roots.some(r => request.uri.fsPath.startsWith(r.fsPath))) {
			return;
		}

		const chunks = this.chunkingService.chunkDocument(request.uri, request.languageId, text);
		await this.textShardStore.indexDocument(request.uri, request.languageId, chunks, workspace, token);

		const symbols = await adapter.extractSymbols(text, request.uri, request.languageId);
		const defs = await adapter.extractDefinitions(text, request.uri, request.languageId);
		const refs = await adapter.extractReferences(text, request.uri, request.languageId);
		const edges = await adapter.extractGraphEdges(text, request.uri, request.languageId);
		await this.graphService.updateFromFile(request.uri, symbols, defs, refs, edges, request.workspace ?? this.currentWorkspace, token);

		if (this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS) && this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING)) {
			await this.embeddingService.embedChunks(workspace, chunks, token);
		}
	}

	private async indexUris(workspace: IWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		const wsKey = this.workspaceKey(workspace);
		const roots = this.getWorkspaceRoots(workspace);
		const fileHashes = new Map<string, string>();
		let processed = 0;
		let written = 0;
		let errored = 0;
		for (const uri of uris) {
			if (token?.isCancellationRequested) {
				return;
			}
			// workspace boundary
			if (roots.length && !roots.some(r => uri.fsPath.startsWith(r.fsPath))) {
				continue;
			}
			try {
				const stat = await this.fileService.stat(uri);
				if (stat.isDirectory) {
					continue;
				}
				processed++;
				const existingHash = await this.sqliteStore.getFileHash(workspace, uri.fsPath);
				const contents = (await this.fileService.readFile(uri)).value.toString();
				const hash = this.hashContent(contents, uri);
				fileHashes.set(uri.fsPath, hash);
				if (existingHash && existingHash === hash) {
					continue;
				}
				const chunks = this.chunkingService.chunkDocument(uri, undefined, contents);
				await this.sqliteStore.writeChunks(workspace, chunks.map(c => ({
					id: c.id,
					workspace: wsKey,
					uri: c.uri,
					content: c.content,
					startLine: c.range?.start.lineNumber ?? 1,
					endLine: c.range?.end.lineNumber ?? (c.range?.start.lineNumber ?? 1),
					startChar: c.range?.start.column ?? 1,
					endChar: c.range?.end.column ?? 1,
					languageId: c.languageId ?? 'plaintext',
					score: 0,
					hash: this.hashContent(c.content, c.uri)
				})));
				await this.sqliteStore.writeFile(workspace, {
					filePath: uri.fsPath,
					workspace: wsKey,
					lastModified: stat.mtime ?? Date.now(),
					hash,
					size: stat.size
				});
				if (this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS)) {
					await this.embeddingService.embedChunks(workspace, chunks, token);
				}
				written++;
			} catch (err) {
				errored++;
				this.logService.trace('[indexService] skipping uri due to error', { uri: uri.toString(), err: err instanceof Error ? err.message : String(err) });
			}
		}
		this.logService.info('[indexService] indexUris completed', { workspace: workspace.configPath?.toString(), processed, written, errored });

		// remove stale files
		const known = await this.sqliteStore.listFiles(workspace);
		for (const file of known) {
			if (!fileHashes.has(file.filePath)) {
				try {
					const exists = await this.fileService.stat(URI.file(file.filePath));
					if (!exists) {
						await this.sqliteStore.deleteFile(workspace, file.filePath);
					}
				} catch {
					await this.sqliteStore.deleteFile(workspace, file.filePath);
				}
			}
		}
	}

	private hashContent(content: string, uri: URI): string {
		let hash = 0x811c9dc5;
		const str = uri.toString() + '::' + content;
		for (let i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash = (hash * 0x01000193) >>> 0;
		}
		return hash.toString(16);
	}

	private enqueue(request: IndexRequest) {
		this.pendingRequests.push(request);
	}

	private enqueueDelete(uri: URI, workspace?: IWorkspaceIdentifier) {
		this.pendingRequests.push({ uri, content: '', workspace });
	}

	private scheduleProcess() {
		if (this.processing) {
			return;
		}
		const debounceMs = this.configurationService.getValue<number>(CONFIG_INDEX_DEBOUNCE_MS) ?? 500;
		setTimeout(() => this.processQueue(), debounceMs);
	}

	private async processQueue() {
		if (!this.isEnabled()) {
			this.pendingRequests.length = 0;
			return;
		}
		if (this.processing) {
			return;
		}
		this.processing = true;
		try {
			const batchSize = this.configurationService.getValue<number>(CONFIG_INDEX_BATCH_SIZE) ?? 20;
			const maxConcurrent = this.configurationService.getValue<number>(CONFIG_MAX_CONCURRENT_JOBS) ?? 2;
			while (this.pendingRequests.length) {
				const batch = this.pendingRequests.splice(0, batchSize);
				const work = batch.map(req => this.indexSingle(req));
				for (let i = 0; i < work.length; i += maxConcurrent) {
					const slice = work.slice(i, i + maxConcurrent);
					await Promise.all(slice);
				}
			}
		} finally {
			this.processing = false;
		}
	}
}

