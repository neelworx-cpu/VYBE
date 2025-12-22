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
import { IEnvironmentService, INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAiEmbeddingVectorService } from '../../aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IndexDiagnostics, IndexRequest, IndexState, IndexStatus, IIndexService } from '../common/indexService.js';
import { ModelInstallState } from '../common/embeddingRuntime.js';
import { ModelManager } from './modelManager.js';
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
	private currentWorkspace: IAnyWorkspaceIdentifier | undefined;
	private lastFullIndexTime = 0;
	private readonly chunkingService = new ChunkingService();
	private readonly sqliteStore: SqliteStore;
	private readonly embeddingService: EmbeddingService;
	private readonly modelManager: ModelManager;

	private getWorkspaceRoots(workspace: IAnyWorkspaceIdentifier): URI[] {
		const roots: URI[] = [];
		const anyWorkspace = workspace as unknown as { uri?: URI; configPath?: URI; id?: string };

		// Single-folder workspace: use folder URI directly.
		if (anyWorkspace.uri) {
			roots.push(anyWorkspace.uri);
		}

		// Multi-root workspace: use the workspace file's parent folder or the
		// folder path directly when configPath is itself a folder URI.
		if (!roots.length && anyWorkspace.configPath) {
			const configPath = anyWorkspace.configPath;
			if (!configPath.path.toLowerCase().endsWith('.code-workspace')) {
				roots.push(configPath);
			} else if (configPath.fsPath) {
				roots.push(dirname(configPath));
			}
		}

		// Fallback: if no roots yet and workspace.id looks like an absolute
		// path, treat it as a folder root. This covers some older callers
		// that pass filesystem paths as the workspace identifier.
		if (!roots.length && anyWorkspace.id && anyWorkspace.id.startsWith('/')) {
			roots.push(URI.file(anyWorkspace.id));
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
		this.embeddingService = new EmbeddingService(this.configurationService, this.embeddingVectorService, this.sqliteStore, this.logService);

		let modelId = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed';
		// Backwards-compat: treat the original HuggingFace-style identifier as an alias
		// for the on-disk model folder `coderank-embed`.
		if (modelId === 'nomic-ai/CodeRankEmbed') {
			modelId = 'coderank-embed';
		}
		const nativeEnv = this.environmentService as INativeEnvironmentService;
		const userDataPath = nativeEnv.userDataPath;
		this.modelManager = new ModelManager(modelId, '1.0.0', userDataPath, this.logService);
	}

	private ensureStoreAvailable(workspace: IAnyWorkspaceIdentifier): boolean {
		const store: any = this.sqliteStore as any;
		const available = typeof store.isAvailable === 'function' ? store.isAvailable() : true;
		if (available) {
			return true;
		}

		const reason: string | undefined = typeof store.getUnavailableReason === 'function'
			? store.getUnavailableReason()
			: 'Local index store is unavailable';

		const current = this.getOrCreateStatus(workspace);
		const updated: IndexStatus = {
			...current,
			state: IndexState.Error,
			errorMessage: reason,
			lastUpdated: Date.now(),
			...this.getModelStatusFields()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), updated);
		this.logService.warn('[indexService] marking workspace index as error due to unavailable SQLite store', { reason });
		this._onDidChangeStatus.fire(updated);
		return false;
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(LOCAL_INDEXING_ENABLED);
	}

	private isWatcherEnabled(): boolean {
		return this.isEnabled() && !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEX_WATCHER);
	}

	private getOrCreateStatus(workspace: IAnyWorkspaceIdentifier): IndexStatus {
		const key = this.workspaceKey(workspace);
		const existing = this.statusByWorkspace.get(key);
		if (existing) {
			return existing;
		}
		const status: IndexStatus = {
			workspace,
			state: IndexState.Uninitialized,
			...this.getModelStatusFields()
		};
		this.statusByWorkspace.set(key, status);
		return status;
	}

	private getModelStatusFields(): Pick<IndexStatus, 'modelDownloadState' | 'modelDownloadProgress' | 'modelDownloadMessage'> {
		const embeddingsEnabled = !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS);
		if (!embeddingsEnabled) {
			return {
				modelDownloadState: 'idle',
				modelDownloadProgress: 0,
				modelDownloadMessage: undefined
			};
		}

		const status = this.modelManager.getStatus();
		switch (status.state) {
			case  ModelInstallState.NotInstalled:
			case  ModelInstallState.Checking:
				return {
					modelDownloadState: 'checking',
					modelDownloadProgress: status.progress,
					modelDownloadMessage: status.message
				};
			case ModelInstallState.Downloading:
				return {
					modelDownloadState: 'downloading',
					modelDownloadProgress: status.progress,
					modelDownloadMessage: status.message
				};
			case ModelInstallState.Extracting:
				return {
					modelDownloadState: 'extracting',
					modelDownloadProgress: status.progress,
					modelDownloadMessage: status.message
				};
			case ModelInstallState.Error:
				return {
					modelDownloadState: 'error',
					modelDownloadProgress: status.progress,
					modelDownloadMessage: status.message
				};
			case ModelInstallState.Ready:
			default:
				return {
					modelDownloadState: 'ready',
					modelDownloadProgress: status.progress ?? 100,
					modelDownloadMessage: status.message
				};
		}
	}

	async buildFullIndex(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus> {
		this.currentWorkspace = workspace;
		const status = this.getOrCreateStatus(workspace);
		if (!this.isEnabled()) {
			return status;
		}
		if (!this.ensureStoreAvailable(workspace)) {
			return this.getOrCreateStatus(workspace);
		}
		const now = Date.now();
		if (now - this.lastFullIndexTime < 60000) {
			return status;
		}
		this.lastFullIndexTime = now;
		const updated: IndexStatus = {
			...status,
			...this.getModelStatusFields(),
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
		const workspaceLabel = (workspace as any).configPath?.toString() ?? (workspace as any).uri?.toString() ?? workspace.id ?? 'unknown';
		this.logService.info('[indexService] enumerate files', { workspace: workspaceLabel, roots: roots.map(r => r.toString()), count: allUris.length });
		if (!allUris.length) {
			this.logService.info('[indexService] no files enumerated', { workspace: workspaceLabel, roots: roots.map(r => r.toString()) });
		}

		await this.indexUris(workspace, allUris, token);

		if (!this.ensureStoreAvailable(workspace)) {
			return this.getOrCreateStatus(workspace);
		}

		const totalFiles = await this.sqliteStore.fileCount(workspace as any);
		const indexedFiles = totalFiles; // minimal pipeline: counted as indexed
		const embeddingMetrics = await this.computeEmbeddingMetrics(workspace);
		this.logService.info('[indexService] post-index counts', {
			workspace: workspaceLabel,
			totalFiles,
			totalChunks: embeddingMetrics.totalChunks
		});
		const embeddingModel = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed';
		const ready: IndexStatus = {
			workspace,
			state: IndexState.Ready,
			lastUpdated: Date.now(),
			totalFiles,
			indexedFiles,
			embeddingModel,
			...embeddingMetrics,
			...this.getModelStatusFields()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), ready);
		this._onDidChangeStatus.fire(ready);
		return ready;
	}

	async refreshPaths(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus> {
		this.currentWorkspace = workspace;
		const status = this.getOrCreateStatus(workspace);
		if (!this.isEnabled()) {
			return status;
		}
		if (!this.ensureStoreAvailable(workspace)) {
			return this.getOrCreateStatus(workspace);
		}
		const updated: IndexStatus = {
			...status,
			...this.getModelStatusFields(),
			state: IndexState.Indexing,
			lastUpdated: Date.now()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), updated);
		this._onDidChangeStatus.fire(updated);

		await this.indexUris(workspace, uris, token);
		if (!this.ensureStoreAvailable(workspace)) {
			return this.getOrCreateStatus(workspace);
		}

		const totalFiles = await this.sqliteStore.fileCount(workspace as any);
		const indexedFiles = totalFiles;
		const embeddingMetrics = await this.computeEmbeddingMetrics(workspace);
		const embeddingModel = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed';
		const ready: IndexStatus = {
			workspace,
			state: IndexState.Ready,
			lastUpdated: Date.now(),
			totalFiles,
			indexedFiles,
			embeddingModel,
			...embeddingMetrics,
			...this.getModelStatusFields()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), ready);
		this._onDidChangeStatus.fire(ready);
		return ready;
	}

	async getStatus(workspace: IAnyWorkspaceIdentifier): Promise<IndexStatus> {
		return this.getOrCreateStatus(workspace);
	}

	async deleteIndex(workspace: IAnyWorkspaceIdentifier, _token?: CancellationToken): Promise<void> {
		// Best-effort: attempt to close the database, delete the on-disk file,
		// and reset the in-memory status for this workspace.
		const key = this.workspaceKey(workspace);

		try {
			await this.sqliteStore.close(workspace as any);
		} catch (err) {
			this.logService.trace('[indexService] error while closing SQLite store during deleteIndex', err instanceof Error ? err.message : String(err));
		}

		const store: any = this.sqliteStore as any;
		let dbPath: string | undefined;
		if (typeof store.getDbPath === 'function') {
			try {
				dbPath = store.getDbPath(workspace);
			} catch {
				// ignore
			}
		}

		if (dbPath) {
			try {
				await this.fileService.del(URI.file(dbPath));
			} catch (err) {
				this.logService.trace('[indexService] failed to delete index database file', {
					dbPath,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}

		const resetStatus: IndexStatus = {
			workspace,
			state: IndexState.Uninitialized,
			lastUpdated: Date.now(),
			totalFiles: 0,
			indexedFiles: 0,
			totalChunks: 0,
			embeddedChunks: 0,
			embeddingPending: 0,
			embeddingInProgress: 0,
			embeddingActiveBatches: 0,
			embeddingModel: this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed',
			...this.getModelStatusFields()
		};

		this.statusByWorkspace.set(key, resetStatus);
		this._onDidChangeStatus.fire(resetStatus);
	}

	async repairModel(workspace: IAnyWorkspaceIdentifier, _token?: CancellationToken): Promise<IndexStatus> {
		const current = this.getOrCreateStatus(workspace);
		if (!this.isEnabled()) {
			return current;
		}

		const updated: IndexStatus = {
			...current,
			...this.getModelStatusFields(),
			lastUpdated: Date.now()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), updated);
		this._onDidChangeStatus.fire(updated);
		return updated;
	}

	async getDiagnostics(workspace: IAnyWorkspaceIdentifier, _token?: CancellationToken): Promise<IndexDiagnostics> {
		const status = this.getOrCreateStatus(workspace);
		const store: any = this.sqliteStore as any;
		const storeAvailable = typeof store.isAvailable === 'function' ? store.isAvailable() : true;

		let totalFiles = 0;
		let totalChunks = 0;
		let embeddedChunks = 0;
		let dbPath: string | undefined;

		if (storeAvailable) {
			totalFiles = await this.sqliteStore.fileCount(workspace as any);
			totalChunks = await this.sqliteStore.chunkCount(workspace as any);
			if (typeof store.embeddingCount === 'function') {
				embeddedChunks = await store.embeddingCount(workspace as any);
			}
			if (typeof store.getDbPath === 'function') {
				dbPath = store.getDbPath(workspace);
			}
		}

		const lastError = status.errorMessage ?? (typeof store.getUnavailableReason === 'function' ? store.getUnavailableReason() : undefined);

		return {
			workspace,
			state: status.state,
			totalFiles,
			indexedFiles: status.indexedFiles ?? status.indexedFileCount ?? totalFiles,
			totalChunks,
			embeddedChunks,
			embeddingModel: status.embeddingModel,
			modelDownloadState: status.modelDownloadState,
			lastIndexedTime: status.lastIndexedTime,
			lastError,
			dbPath
		};
	}

	private async computeEmbeddingMetrics(workspace: IAnyWorkspaceIdentifier): Promise<Pick<IndexStatus, 'totalChunks' | 'embeddedChunks' | 'embeddingPending' | 'embeddingInProgress' | 'embeddingActiveBatches'>> {
		const [totalChunks, embeddedChunks] = await Promise.all([
			this.sqliteStore.chunkCount(workspace as any),
			this.sqliteStore.embeddingCount(workspace as any)
		]);
		const totalEmbeddingChunks = totalChunks || embeddedChunks;
		const pending = totalEmbeddingChunks > embeddedChunks ? (totalEmbeddingChunks - embeddedChunks) : 0;
		return {
			totalChunks,
			embeddedChunks,
			embeddingPending: pending,
			embeddingInProgress: 0,
			embeddingActiveBatches: 0
		};
	}

	private async updateEmbeddingMetrics(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		const status = this.getOrCreateStatus(workspace);
		const metrics = await this.computeEmbeddingMetrics(workspace);
		const updated: IndexStatus = {
			...status,
			...metrics,
			lastUpdated: Date.now()
		};
		this.statusByWorkspace.set(this.workspaceKey(workspace), updated);
		this._onDidChangeStatus.fire(updated);
	}

	private workspaceKey(workspace: IAnyWorkspaceIdentifier): string {
		if (workspace.id) {
			return workspace.id;
		}
		const anyWorkspace = workspace as unknown as { configPath?: URI; uri?: URI };
		if (anyWorkspace.configPath?.fsPath) {
			return anyWorkspace.configPath.fsPath;
		}
		if (anyWorkspace.uri?.fsPath) {
			return anyWorkspace.uri.fsPath;
		}
		return 'default';
	}

	startWatcher(workspaceRoots: URI[], workspace?: IAnyWorkspaceIdentifier): void {
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
		if (!this.ensureStoreAvailable(workspace)) {
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
			await this.embeddingService.embedChunks(workspace as any, chunks, token);
			await this.updateEmbeddingMetrics(workspace);
		}
	}

	private async indexUris(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		if (!this.ensureStoreAvailable(workspace)) {
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
				const existingHash = await this.sqliteStore.getFileHash(workspace as any, uri.fsPath);
				const contents = (await this.fileService.readFile(uri)).value.toString();
				const hash = this.hashContent(contents, uri);
				fileHashes.set(uri.fsPath, hash);
				if (existingHash && existingHash === hash) {
					continue;
				}
				const chunks = this.chunkingService.chunkDocument(uri, undefined, contents);
				await this.sqliteStore.writeChunks(workspace as any, chunks.map(c => ({
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
				await this.sqliteStore.writeFile(workspace as any, {
					filePath: uri.fsPath,
					workspace: wsKey,
					lastModified: stat.mtime ?? Date.now(),
					hash,
					size: stat.size
				});
				if (this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS)) {
					await this.embeddingService.embedChunks(workspace as any, chunks, token);
					await this.updateEmbeddingMetrics(workspace);
				}
				written++;
			} catch (err) {
				errored++;
				this.logService.trace('[indexService] skipping uri due to error', { uri: uri.toString(), err: err instanceof Error ? err.message : String(err) });
			}
		}
		const workspaceLabel2 = (workspace as any).configPath?.toString() ?? (workspace as any).uri?.toString() ?? workspace.id ?? 'unknown';
		this.logService.info('[indexService] indexUris completed', { workspace: workspaceLabel2, processed, written, errored });

		// remove stale files
		const known = await this.sqliteStore.listFiles(workspace as any);
		for (const file of known) {
			if (!fileHashes.has(file.filePath)) {
				try {
					const exists = await this.fileService.stat(URI.file(file.filePath));
					if (!exists) {
						await this.sqliteStore.deleteFile(workspace as any, file.filePath);
					}
				} catch {
					await this.sqliteStore.deleteFile(workspace as any, file.filePath);
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

	private enqueueDelete(uri: URI, workspace?: IAnyWorkspaceIdentifier) {
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

	// Phase 12: Control plane methods
	async pause(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		// Node-side IndexService doesn't implement pause - it's handled by ExtHostIndexing
		// This is a stub to satisfy the interface
		this.logService.warn('[IndexService] pause called on node service - should use proxy');
	}

	async resume(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		// Node-side IndexService doesn't implement resume - it's handled by ExtHostIndexing
		// This is a stub to satisfy the interface
		this.logService.warn('[IndexService] resume called on node service - should use proxy');
	}

	async rebuildWorkspaceIndex(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		// Node-side IndexService doesn't implement rebuild - it's handled by ExtHostIndexing
		// This is a stub to satisfy the interface
		this.logService.warn('[IndexService] rebuildWorkspaceIndex called on node service - should use proxy');
	}
}

