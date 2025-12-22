/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostIndexingShape, IndexStatusDto, FileSystemEvents, DevSimilarChunkHitDto, IndexStateDto, ContextItemDto, RepoOverviewDto } from './extHost.protocol.js';
import { ExtHostContext } from './extHostContext.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { ExtHostFileSystemEventService } from './extHostFileSystemEventService.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
// eslint-disable-next-line local/code-import-patterns
import { createHash } from 'crypto';
// eslint-disable-next-line local/code-import-patterns
import { createRequire } from 'module';

type SqliteRow = Record<string, unknown>;
type SqliteParams = unknown[];

type SqliteModule = {
	Database: new (...args: unknown[]) => {
		run(sql: string, params: SqliteParams, cb: (err: Error | null) => void): void;
		get(sql: string, params: SqliteParams, cb: (err: Error | null, row: SqliteRow | undefined) => void): void;
		exec(sql: string, cb: (err: Error | null) => void): void;
		all(sql: string, params: SqliteParams, cb: (err: Error | null, rows: SqliteRow[]) => void): void;
		close(cb: (err: Error | null) => void): void;
		loadExtension?(path: string, cb?: (err: Error | null) => void): void;
	};
};

type SqliteDatabase = InstanceType<SqliteModule['Database']>;

const CURRENT_SCHEMA_VERSION = 7;

const nodeRequire = createRequire(import.meta.url);

// Phase 8: hard safety limits to prevent runaway work. These are intentionally
// conservative and can be tuned, but must always fail gracefully without
// crashing the extension host.
const MAX_FILES_PER_FULL_SCAN = 200_000;
const MAX_CHUNKS_PER_INDEX_SAVED_FILES = 50_000;
const MAX_EMBEDDINGS_PER_QUEUE_RUN = 50_000;
const MAX_EMBEDDING_QUEUE_MS = 30_000;
const MAX_EMBEDDINGS_PER_QUERY = 100_000;
const MAX_TOP_K = 50;

// Phase 9: Expected embedding dimension. If runtime produces different dimensions,
// vectors will be skipped with a warning. Set to undefined to allow variable dimensions.
// Most embedding models have fixed dimensions (e.g., 384, 768, 1536).
// Note: Currently unused - dimension validation happens at runtime if needed.
// const EXPECTED_EMBEDDING_DIMENSION: number | undefined = undefined;

// Phase 9: Backfill configuration
const VECTOR_BACKFILL_BATCH_SIZE = 1000;
const VECTOR_BACKFILL_TIME_BUDGET_MS = 30000; // 30 seconds max per backfill run

// Phase 10: Resource budgets and concurrency limits
const MAX_CONCURRENT_FULL_SCANS = 1;
const FULL_SCAN_TIME_BUDGET_MS = 300_000; // 5 minutes max per full scan
const RETRIEVAL_QUERY_TIME_BUDGET_MS = 10_000; // 10 seconds max per retrieval query

// Phase 7: ranking weights for dev-only retrieval scoring.
const W_COSINE = 1.0;
const W_RECENCY = 0.2;
const W_SAME_FILE = 0.1;
const W_LENGTH = 0.05;
const W_DEPTH = 0.02;

const GOLDEN_QUERIES: readonly string[] = [
	'navigation header',
	'vybe settings',
	'chat history'
];

interface ILocalEmbeddingRuntime {
	readonly modelId: string;
	readonly version: string;
	embed(texts: string[], token: CancellationToken): Promise<number[][]>;
}

class HashEmbeddingRuntime implements ILocalEmbeddingRuntime {
	readonly modelId = 'hash-embedding';
	readonly version = '1';

	async embed(texts: string[], _token: CancellationToken): Promise<number[][]> {
		// Deterministic, low-cost embedding based on sha256. This is a stub
		// runtime that never calls the network and is safe to run locally.
		return texts.map(text => {
			const h = createHash('sha256');
			h.update(Buffer.from(text, 'utf8'));
			const digest = h.digest(); // 32 bytes
			const vec: number[] = [];
			// Map digest bytes into 8 float components in a stable way.
			for (let i = 0; i < 32; i += 4) {
				const chunk = digest.readInt32BE(i);
				vec.push(chunk / 0x7fffffff);
			}
			return vec;
		});
	}
}

type SqliteDeps = {
	sqlite: SqliteModule;
	path: typeof import('path');
	fs: typeof import('fs');
};

function getNodeDeps(): SqliteDeps | undefined {
	try {
		const sqlite = nodeRequire('@vscode/sqlite3') as SqliteModule;
		const path = nodeRequire('path') as typeof import('path');
		const fs = nodeRequire('fs') as typeof import('fs');
		return { sqlite, path, fs };
	} catch (e) {
		// Use console here because we do not have ILogService in this static
		// helper and we want a precise native error for diagnostics.
		console.error('[ExtHostIndexing] getNodeDeps: failed to load @vscode/sqlite3', e);
		return undefined;
	}
}

function dot(a: number[], b: number[]): number {
	const len = Math.min(a.length, b.length);
	let sum = 0;
	for (let i = 0; i < len; i++) {
		sum += a[i] * b[i];
	}
	return sum;
}

function norm(a: number[]): number {
	let sumSq = 0;
	for (let i = 0; i < a.length; i++) {
		const v = a[i];
		sumSq += v * v;
	}
	return Math.sqrt(sumSq);
}

function cosineSimilarityWithQueryNorm(query: number[], queryNorm: number, candidate: number[]): number {
	const candidateNorm = norm(candidate);
	const denom = queryNorm * candidateNorm;
	if (!Number.isFinite(denom) || denom === 0) {
		return 0;
	}
	const score = dot(query, candidate) / denom;
	return Number.isFinite(score) ? score : 0;
}

function computeChunkLengthPenalty(length: number): number {
	// Simple quadratic penalty around a \"sweet spot\" length.
	// Treat 80 lines as ideal; very short/long chunks are penalized more.
	const ideal = 80;
	if (length <= 0) {
		return 1;
	}
	const diff = length - ideal;
	// Normalize by ideal and clamp to [0, 1].
	const raw = Math.min(1, Math.abs(diff) / ideal);
	return raw;
}

function computeFilePathDepthPenalty(filePath: string): number {
	// filePath is rootId/relative/path. Depth is number of segments after rootId.
	const parts = filePath.split('/');
	if (parts.length <= 1) {
		return 0;
	}
	const depth = parts.length - 1;
	// Light penalty that grows slowly with depth, capped at 1.
	const raw = Math.min(1, depth / 10);
	return raw;
}

function computeRecencyBoost(lastIndexedTime: number | null | undefined, now: number): number {
	if (!lastIndexedTime || lastIndexedTime <= 0) {
		return 0;
	}
	const ageMs = Math.max(0, now - lastIndexedTime);
	const dayMs = 24 * 60 * 60 * 1000;
	const ageDays = ageMs / dayMs;
	// Exponential decay over ~30 days; newer files get boost near 1, old ones near 0.
	const tau = 30; // days
	const boost = Math.exp(-ageDays / tau);
	return Number.isFinite(boost) ? boost : 0;
}

type InternalHit = {
	filePath: string;
	chunkId: string;
	cosineSimilarity: number;
	chunkLength?: number;
	fileLastIndexedTime?: number | null;
	chunkLengthPenalty?: number;
	filePathDepthPenalty?: number;
	recencyBoost?: number;
	sameFileBoost?: number;
	compositeScore?: number;
};

function compareCosineOnly(a: InternalHit, b: InternalHit): number {
	if (a.cosineSimilarity !== b.cosineSimilarity) {
		return b.cosineSimilarity - a.cosineSimilarity; // higher cosine first
	}
	if (a.filePath < b.filePath) {
		return -1;
	}
	if (a.filePath > b.filePath) {
		return 1;
	}
	if (a.chunkId < b.chunkId) {
		return -1;
	}
	if (a.chunkId > b.chunkId) {
		return 1;
	}
	return 0;
}

function compareComposite(a: InternalHit, b: InternalHit): number {
	const ac = a.compositeScore ?? a.cosineSimilarity;
	const bc = b.compositeScore ?? b.cosineSimilarity;
	if (ac !== bc) {
		return bc - ac; // higher composite first
	}
	// Tie-break by cosine, then path, then chunkId for determinism.
	if (a.cosineSimilarity !== b.cosineSimilarity) {
		return b.cosineSimilarity - a.cosineSimilarity;
	}
	if (a.filePath < b.filePath) {
		return -1;
	}
	if (a.filePath > b.filePath) {
		return 1;
	}
	if (a.chunkId < b.chunkId) {
		return -1;
	}
	if (a.chunkId > b.chunkId) {
		return 1;
	}
	return 0;
}

/**
 * Classifies SQLite errors into categories for appropriate handling.
 */
type SqliteErrorCategory = 'OpenFailure' | 'BusyOrLocked' | 'Corrupt' | 'FutureSchema' | 'Other';

interface ErrorWithCode extends Error {
	code?: string;
}

function classifySqliteError(err: unknown): SqliteErrorCategory {
	if (!(err instanceof Error)) {
		return 'Other';
	}
	const msg = err.message.toLowerCase();
	const code = (err as ErrorWithCode).code;

	// SQLite error codes and common patterns.
	if (code === 'SQLITE_CANTOPEN' || code === 'SQLITE_IOERR' || msg.includes('cannot open') || msg.includes('unable to open')) {
		return 'OpenFailure';
	}
	if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || msg.includes('database is locked') || msg.includes('database locked')) {
		return 'BusyOrLocked';
	}
	if (code === 'SQLITE_CORRUPT' || msg.includes('database disk image is malformed') || msg.includes('corrupt')) {
		return 'Corrupt';
	}
	if (msg.includes('future schema') || msg.includes('schema version') && msg.includes('not supported')) {
		return 'FutureSchema';
	}
	return 'Other';
}

/**
 * Attempts to open a SQLite database with retry logic for busy/locked errors.
 * Returns the database instance or throws a classified error.
 */
async function openDatabaseWithRetry(
	sqlite: SqliteModule,
	dbPath: string,
	maxRetries: number = 3,
	initialDelayMs: number = 50
): Promise<SqliteDatabase> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return new sqlite.Database(dbPath);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			const category = classifySqliteError(lastError);
			if (category === 'BusyOrLocked' && attempt < maxRetries - 1) {
				// Exponential backoff: 50ms, 100ms, 200ms
				const delay = initialDelayMs * Math.pow(2, attempt);
				await new Promise(resolve => setTimeout(resolve, delay));
				continue;
			}
			// Not a retryable error or out of retries: throw immediately.
			throw lastError;
		}
	}
	throw lastError ?? new Error('Failed to open database after retries');
}

function computeSameFileBoost(fileHitCount: number): number {
	// Small boost that grows with multiple hits from the same file, capped.
	if (fileHitCount <= 1) {
		return 0;
	}
	const raw = Math.min(1, (fileHitCount - 1) / 4);
	return raw;
}

/**
 * Simple ignore pattern matcher for .gitignore and .vybeignore files.
 * Supports basic glob patterns: *, **, !, and path-based matching.
 */
class IgnoreMatcher {
	private patterns: Array<{ pattern: string; negate: boolean }> = [];

	constructor(ignoreContent: string) {
		const lines = ignoreContent.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			// Skip empty lines and comments.
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}
			const negate = trimmed.startsWith('!');
			const pattern = negate ? trimmed.slice(1).trim() : trimmed;
			if (pattern) {
				this.patterns.push({ pattern, negate });
			}
		}
	}

	/**
	 * Checks if a path (relative to the ignore file's directory) matches any ignore pattern.
	 * Returns true if the path should be ignored.
	 */
	matches(relPath: string, isDir: boolean): boolean {
		// Normalize path separators to forward slashes.
		const normalized = relPath.replace(/\\/g, '/');
		let ignored = false;

		for (const { pattern, negate } of this.patterns) {
			if (this.matchPattern(pattern, normalized, isDir)) {
				if (negate) {
					ignored = false; // Negation overrides previous ignores.
				} else {
					ignored = true;
				}
			}
		}

		return ignored;
	}

	private matchPattern(pattern: string, path: string, isDir: boolean): boolean {
		// Handle directory-only patterns (ending with /).
		if (pattern.endsWith('/')) {
			if (!isDir) {
				return false;
			}
			pattern = pattern.slice(0, -1);
		}

		// Convert gitignore pattern to a simple regex.
		// Escape special regex chars except * and ?
		let regexStr = pattern
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')
			.replace(/\*\*/g, '___DOUBLE_STAR___')
			.replace(/\*/g, '[^/]*')
			.replace(/\?/g, '[^/]')
			.replace(/___DOUBLE_STAR___/g, '.*');

		// If pattern doesn't start with /, it matches anywhere in the path.
		if (!pattern.startsWith('/')) {
			regexStr = `.*/${regexStr}`;
		} else {
			regexStr = `^${regexStr}`;
		}

		// If pattern doesn't end with /, it can match files or directories.
		if (!pattern.endsWith('/')) {
			regexStr = `${regexStr}(/.*)?$`;
		} else {
			regexStr = `${regexStr}.*$`;
		}

		try {
			const regex = new RegExp(regexStr);
			return regex.test(path);
		} catch {
			// Invalid regex: fall back to simple string matching.
			return path.includes(pattern);
		}
	}
}

/**
 * Extension-host side implementation of the minimal indexing RPC surface.
 *
 * For now this only exposes a dev-only DB smoke test and a stubbed status
 * method. The real indexing pipeline will be wired through this class once
 * SQLite persistence is proven to work reliably in the extension host.
 */
export class ExtHostIndexing implements ExtHostIndexingShape {

	private readonly pendingDirtyUris = new Set<string>();
	private readonly pendingDeletedUris = new Set<string>();
	private watcherFlushHandle: ReturnType<typeof setTimeout> | undefined;
	private embeddingFlushHandle: ReturnType<typeof setTimeout> | undefined;
	private embeddingRuntime: ILocalEmbeddingRuntime | undefined;
	private embeddingRuntimeInitPromise: Promise<void> | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private modelManager: any | undefined; // Store ModelManager instance to query download status
	private sqliteVectorAvailable: boolean | undefined = undefined; // Cached detection result
	private vectorExtensionManager: { getExtensionPath(): string | undefined; ensureExtension(deps: { fs: typeof import('fs'); path: typeof import('path'); https: typeof import('https') }, token?: CancellationToken): Promise<string | undefined> } | undefined;

	// Phase 10: Concurrency tracking for resource budgets
	private activeFullScans = 0;
	private activeEmbeddingQueues = new Set<string>(); // workspaceId -> active
	private backgroundIndexingTokens = new Map<string, CancellationTokenSource>(); // workspaceId -> token source

	private contextService: ExtHostContext | undefined;

	constructor(
		@IExtHostConfiguration private readonly configurationService: IExtHostConfiguration,
		@ILogService private readonly logService: ILogService,
		@IExtHostInitDataService private readonly initData: IExtHostInitDataService,
		@IExtHostWorkspace private readonly workspaceService: IExtHostWorkspace,
		private readonly fileSystemEvents: ExtHostFileSystemEventService,
		private readonly documentsAndEditors?: IExtHostDocumentsAndEditors,
	) {
		// Phase 11: Initialize context service
		this.contextService = new ExtHostContext(
			this,
			this.logService,
			this.initData,
			this.documentsAndEditors
		);

		// Initialize VectorExtensionManager for auto-download
		// Use same approach as ModelManager: derive userDataPath from globalStorageHome
		try {
			const deps = getNodeDeps();
			if (deps && this.initData.environment.globalStorageHome) {
				const globalStoragePath = this.initData.environment.globalStorageHome.fsPath;
				const userDataPath = deps.path.dirname(deps.path.dirname(globalStoragePath)); // Go up from globalStorage to User, then to userDataPath

				// Dynamically import VectorExtensionManager only in Node context
				import('../../../workbench/services/indexing/node/vectorExtensionManager.js').then(async module => {
					this.vectorExtensionManager = new module.VectorExtensionManager(userDataPath, this.logService);
					// Check if extension exists, if not trigger download immediately
					const extPath = this.vectorExtensionManager.getExtensionPath();
					if (!extPath) {
						// Get Node deps for download
						const deps = getNodeDeps();
						if (deps) {
							try {
								const https = nodeRequire('https') as typeof import('https');
								this.vectorExtensionManager.ensureExtension({ fs: deps.fs, path: deps.path, https }, CancellationToken.None).then(downloadedPath => {
									if (downloadedPath) {
										// Invalidate cache so next detection will find it
										this.sqliteVectorAvailable = undefined;
									}
								}).catch(err => {
									const errMsg = err instanceof Error ? err.message : String(err);
									this.logService.error('[ExtHostIndexing] Auto-download of sqlite-vector extension failed', { error: errMsg });
								});
							} catch (e) {
								const errMsg = e instanceof Error ? e.message : String(e);
								this.logService.error('[ExtHostIndexing] Failed to get https module for auto-download', { error: errMsg });
							}
						}
					}
				}).catch(err => {
					const errMsg = err instanceof Error ? err.message : String(err);
					this.logService.error('[ExtHostIndexing] Failed to initialize VectorExtensionManager', { error: errMsg });
				});
			} else {
				this.logService.trace('[ExtHostIndexing] VectorExtensionManager not initialized: Node deps or globalStorageHome unavailable');
			}
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			this.logService.warn('[ExtHostIndexing] VectorExtensionManager initialization error', { error: errMsg });
		}

		// Dev-only: optionally run the DB smoke test on extension-host startup.
		// Access getConfiguration method which may not be in the interface but exists at runtime
		const configProvider = this.configurationService as IExtHostConfiguration & { getConfiguration?: (section: string) => { get?: <T>(key: string) => T } | undefined };
		const vybeConfig = typeof configProvider.getConfiguration === 'function'
			? configProvider.getConfiguration('vybe')
			: undefined;
		const smokeEnabled = !!(vybeConfig && vybeConfig.get && vybeConfig.get('localIndexing.devDbSmokeTest'));
		if (smokeEnabled) {
			const workspaceId = this.initData.workspace?.id ?? 'default';
			this.$runDbSmokeTest(workspaceId).then(result => {
				if (result.ok) {
					this.logService.info('[ExtHostIndexing] SQLite DB smoke test passed');
				} else {
					this.logService.warn('[ExtHostIndexing] SQLite DB smoke test failed', result.reason);
				}
			}).catch(err => {
				this.logService.error('[ExtHostIndexing] SQLite DB smoke test threw', err);
			});
		}

		// Dev-only: optionally index a small, fixed subset of discovered files
		// on startup to validate incremental indexing and chunk writes.
		const nRaw = vybeConfig && vybeConfig.get && vybeConfig.get('localIndexing.devIndexFirstNFiles');
		const n = typeof nRaw === 'number' ? nRaw : 0;
		if (n > 0) {
			const workspaceId = this.initData.workspace?.id ?? 'default';
			this.devIndexFirstNFiles(workspaceId, n).catch(err => {
				this.logService.error('[ExtHostIndexing] devIndexFirstNFiles failed', err);
			});
		}

		// Dev-only: optionally run golden queries on startup for manual retrieval
		// quality inspection. Disabled by default unless the configuration key
		// `vybe.localIndexing.devRunGoldenQueries` is set to a positive number.
		const goldenRaw = vybeConfig && vybeConfig.get && vybeConfig.get('localIndexing.devRunGoldenQueries');
		const goldenTopK = typeof goldenRaw === 'number' ? goldenRaw : 0;
		if (goldenTopK > 0) {
			const workspaceId = this.initData.workspace?.id ?? 'default';
			this.devRunGoldenQueries(workspaceId, goldenTopK).catch(err => {
				this.logService.error('[ExtHostIndexing] devRunGoldenQueries failed', err);
			});
		}

		// Dev-only: optionally compare vector vs TS retrieval paths.
		const compareRaw = vybeConfig && vybeConfig.get && vybeConfig.get('localIndexing.devCompareRetrievalPaths');
		if (compareRaw && typeof compareRaw === 'string' && compareRaw.trim()) {
			const workspaceId = this.initData.workspace?.id ?? 'default';
			const compareQuery = compareRaw.trim();
			const compareTopK = 10; // Default topK for comparison.
			this.devCompareRetrievalPaths(workspaceId, compareQuery, compareTopK).catch(err => {
				this.logService.error('[ExtHostIndexing] devCompareRetrievalPaths failed', err);
			});
		}

		// Attach background file system listeners for real-time indexing. This
		// uses the IDE's native watcher infrastructure via the ext-host file
		// system event service and never falls back to raw fs.watch.
		this.fileSystemEvents.onFileSystemEvent(e => this.onFileSystemEvents(e));

		// Initialize embedding runtime lazily (ONNX with hash fallback)
		// Store the promise so we can await it when needed
		this.embeddingRuntimeInitPromise = this.initializeEmbeddingRuntime().catch(err => {
			this.logService.error('[ExtHostIndexing] Failed to initialize embedding runtime in constructor', err);
		});
	}

	private async initializeEmbeddingRuntime(): Promise<void> {
		// Lazy initialization: try ONNX first, fallback to hash
		// This matches the behavior of LocalEmbeddingRuntimeContribution
		const deps = getNodeDeps();
		if (!deps) {
			this.embeddingRuntime = new HashEmbeddingRuntime();
			return;
		}

		// Always create a wrapper runtime that tries ONNX first, then falls back to hash
		// This ensures getOrInstallModel is called even if imports fail
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let ModelManager: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let LocalOnnxEmbeddingRuntime: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let modelManager: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let onnxRuntime: any;
		let userDataPath: string | undefined;

		try {
			// Try to import ONNX components
			const modelManagerModule = await import('../../../workbench/services/indexing/node/modelManager.js');
			const onnxRuntimeModule = await import('../../../workbench/services/indexing/node/localOnnxEmbeddingRuntime.js');
			ModelManager = modelManagerModule.ModelManager;
			LocalOnnxEmbeddingRuntime = onnxRuntimeModule.LocalOnnxEmbeddingRuntime;

			// Derive userDataPath from globalStorageHome (e.g., ~/Library/Application Support/code-oss-dev/User/globalStorage -> ~/Library/Application Support/code-oss-dev)
			const globalStoragePath = this.initData.environment.globalStorageHome.fsPath;
			userDataPath = deps.path.dirname(deps.path.dirname(globalStoragePath)); // Go up from globalStorage to User, then to userDataPath

			const modelId = 'coderank-embed';
			modelManager = new ModelManager(modelId, '1.0.0', userDataPath, this.logService);
			this.modelManager = modelManager; // Store for status queries
			onnxRuntime = new LocalOnnxEmbeddingRuntime(this.logService);
		} catch (err) {
			this.logService.warn('[ExtHostIndexing] Failed to import/create ONNX components, will use hash-only fallback', {
				error: err instanceof Error ? err.message : String(err)
			});
			// Continue to create wrapper runtime with hash-only fallback
			// Ensure modelManager is undefined if creation failed
			modelManager = undefined;
			this.modelManager = undefined;
		}

		const hashRuntime = new HashEmbeddingRuntime();

		// Create a wrapper runtime that tries ONNX first, then falls back to hash
		// This wrapper is ALWAYS created, ensuring getOrInstallModel is called when embed() is invoked
		this.embeddingRuntime = {
			modelId: 'auto-embedding',
			version: '1',
			embed: async (texts: string[], token: CancellationToken): Promise<number[][]> => {
				// Try ONNX first if components are available
				if (modelManager && onnxRuntime) {
					try {
						const modelHandle = await modelManager.getOrInstallModel(token);
						try {
							await onnxRuntime.warmup(modelHandle, token);
							const onnxVectors = await onnxRuntime.embed(modelHandle, texts, token);
							return onnxVectors;
						} catch (err) {
							this.logService.warn('[ExtHostIndexing] ONNX runtime failed, falling back to hash runtime', {
								error: err instanceof Error ? err.message : String(err)
							});
							return await hashRuntime.embed(texts, token);
						}
					} catch (err) {
						this.logService.error('[ExtHostIndexing] getOrInstallModel failed, falling back to hash runtime', {
							error: err instanceof Error ? err.message : String(err)
						});
						return await hashRuntime.embed(texts, token);
					}
				} else {
					// ONNX components not available, use hash directly
					return await hashRuntime.embed(texts, token);
				}
			}
		};
	}

	private onFileSystemEvents(events: FileSystemEvents): void {
		// Map low-level FS events into debounced dirty/deleted URI sets. All
		// heavy work happens in the flush, off the hot event path.
		for (const created of events.created) {
			if (created.scheme !== 'file') {
				continue;
			}
			this.pendingDirtyUris.add(created.toString());
		}
		for (const changed of events.changed) {
			if (changed.scheme !== 'file') {
				continue;
			}
			this.pendingDirtyUris.add(changed.toString());
		}
		for (const deleted of events.deleted) {
			if (deleted.scheme !== 'file') {
				continue;
			}
			this.pendingDeletedUris.add(deleted.toString());
		}

		if (this.pendingDirtyUris.size === 0 && this.pendingDeletedUris.size === 0) {
			return;
		}

		if (!this.watcherFlushHandle) {
			this.watcherFlushHandle = setTimeout(() => {
				this.watcherFlushHandle = undefined;
				this.flushWatcherBatches().catch(err => {
					this.logService.error('[ExtHostIndexing] watcher flush failed', err);
				});
			}, 300);
		}
	}

	private async flushWatcherBatches(): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			this.logService.error('[ExtHostIndexing] watcher flush failed - sqlite deps missing');
			return;
		}

		const workspaceId = this.initData.workspace?.id ?? 'default';

		// CRITICAL: Don't process watcher events until the first full scan has completed.
		// This prevents premature indexing of files before the workspace is fully scanned.
		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		let db: SqliteDatabase | undefined;
		try {
			db = await openDatabaseWithRetry(deps.sqlite, dbPath);
			await this.ensureSchema(db, deps);
			const stateRow = await this.readIndexState(db, workspaceId);

			// If lastFullScanTime is undefined, the workspace hasn't been fully scanned yet.
			// Skip processing watcher events - they'll be processed after the full scan completes.
			if (stateRow.lastFullScanTime === undefined) {
				this.logService.trace('[ExtHostIndexing] watcher flush skipped - full scan not completed yet', {
					workspaceId,
					pendingDirty: this.pendingDirtyUris.size,
					pendingDeleted: this.pendingDeletedUris.size
				});
				await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
				return;
			}

			// CRITICAL: Check if workspace is paused BEFORE clearing the pending sets.
			// If paused, don't clear the sets - keep accumulating events for when resume is called.
			const paused = await this.isWorkspacePaused(db, workspaceId);
			if (paused) {
				this.logService.trace('[ExtHostIndexing] watcher flush skipped - indexing paused, accumulating events', {
					workspaceId,
					pendingDirty: this.pendingDirtyUris.size,
					pendingDeleted: this.pendingDeletedUris.size
				});
				await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
				return;
			}

			await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.warn('[ExtHostIndexing] watcher flush check failed', { workspaceId, message });
			if (db) {
				try {
					await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
				} catch {
					// ignore close error
				}
			}
			// If we can't check the state, err on the side of caution and skip processing
			return;
		}

		// Only clear the sets AFTER confirming we're not paused and full scan is complete
		const dirty = Array.from(this.pendingDirtyUris);
		const deleted = Array.from(this.pendingDeletedUris);
		this.pendingDirtyUris.clear();
		this.pendingDeletedUris.clear();

		if (!dirty.length && !deleted.length) {
			return;
		}

		// Process dirty files via the existing incremental indexing path.
		try {
			if (dirty.length) {
				const uris = dirty.map(value => URI.parse(value).toJSON());
				await this.$indexSavedFiles(workspaceId, uris, CancellationToken.None);
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] watcher dirty flush failed', { workspaceId, message });
		}

		// Process deletions directly against SQLite, using the same soft-delete
		// semantics as Phase 3.
		if (deleted.length) {
			const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

			const db = new deps.sqlite.Database(dbPath);
			await this.ensureSchema(db, deps);
			const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
			const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
			const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

			try {
				for (const value of deleted) {
					const uri = URI.parse(value);
					const relPath = this.toWorkspaceRelativePath(uri, deps);
					if (!relPath) {
						continue;
					}
					const prefix = relPath;
					const like = `${prefix}/%`;
					try {
						await exec('BEGIN IMMEDIATE TRANSACTION;');
						// Exact path (file or folder root)
						await run(`DELETE FROM chunks WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
						await run(`DELETE FROM embeddings WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
						// Delete from vector index (non-fatal if table doesn't exist).
						try {
							await run(`DELETE FROM embeddings_vector WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
						} catch {
							// Vector index may not exist, ignore.
						}
						await run(`UPDATE files SET deleted=1 WHERE workspaceId=? AND path=?`, [workspaceId, relPath]);
						// Subtree under this path (folder delete case)
						await run(`DELETE FROM chunks WHERE workspaceId=? AND filePath LIKE ?`, [workspaceId, like]);
						await run(`DELETE FROM embeddings WHERE workspaceId=? AND filePath LIKE ?`, [workspaceId, like]);
						// Vector index is now in embeddings table (BLOB column), no separate table needed.
						await run(`UPDATE files SET deleted=1 WHERE workspaceId=? AND path LIKE ?`, [workspaceId, like]);
						await exec('COMMIT;');
					} catch (e) {
						const message = e instanceof Error ? e.message : String(e);
						this.logService.error('[ExtHostIndexing] watcher delete flush failed', { workspaceId, relPath, message });
						try {
							await exec('ROLLBACK;');
						} catch {
							// ignore rollback error
						}
					}
				}
			} finally {
				try {
					await close();
				} catch {
					// ignore close errors
				}
			}
		}

		this.logService.info('[ExtHostIndexing] watcher flush completed', {
			workspaceId,
			dirtyCount: dirty.length,
			deletedCount: deleted.length
		});

		// Any change to chunks may require embeddings to be (re)computed.
		if (this.embeddingRuntime && dirty.length > 0) {
			if (!this.embeddingFlushHandle) {
				this.embeddingFlushHandle = setTimeout(() => {
					this.embeddingFlushHandle = undefined;
					this.processEmbeddingQueue(workspaceId, CancellationToken.None).catch(err => {
						this.logService.error('[ExtHostIndexing] embedding flush failed', err);
					});
				}, 500);
			}
		}
	}

	private async processEmbeddingQueue(workspaceId: string, token: CancellationToken): Promise<void> {
		this.logService.info('[ExtHostIndexing] processEmbeddingQueue ENTRY', {
			workspaceId,
			hasEmbeddingRuntime: !!this.embeddingRuntime,
			hasInitPromise: !!this.embeddingRuntimeInitPromise,
			activeEmbeddingQueues: Array.from(this.activeEmbeddingQueues),
			featureEnabled: this.isFeatureEnabled('embeddings')
		});

		// Phase 10: Feature gate check
		if (!this.isFeatureEnabled('embeddings')) {
			this.logService.info('[ExtHostIndexing] processEmbeddingQueue EARLY RETURN: embeddings disabled via feature gate', { workspaceId });
			return;
		}

		// Phase 10: Concurrency limit check
		if (this.activeEmbeddingQueues.has(workspaceId)) {
			this.logService.info('[ExtHostIndexing] processEmbeddingQueue EARLY RETURN: embedding queue already active for workspace', { workspaceId });
			return;
		}

		const deps = getNodeDeps();
		if (!deps) {
			this.logService.warn('[ExtHostIndexing] processEmbeddingQueue EARLY RETURN: Node deps unavailable', { workspaceId });
			return;
		}

		// Ensure embedding runtime is initialized
		if (!this.embeddingRuntime) {
			this.logService.info('[ExtHostIndexing] Embedding runtime not initialized, initializing now', { workspaceId });
			if (this.embeddingRuntimeInitPromise) {
				this.logService.info('[ExtHostIndexing] Waiting for existing initialization promise');
				try {
					await this.embeddingRuntimeInitPromise;
				} catch (err) {
					this.logService.error('[ExtHostIndexing] Embedding runtime initialization promise failed', {
						error: err instanceof Error ? err.message : String(err)
					});
				}
			}
			if (!this.embeddingRuntime) {
				this.logService.info('[ExtHostIndexing] Still no runtime after waiting, calling initializeEmbeddingRuntime directly');
				await this.initializeEmbeddingRuntime();
			}
		}
		const runtime = this.embeddingRuntime;
		if (!runtime) {
			this.logService.warn('[ExtHostIndexing] processEmbeddingQueue EARLY RETURN: Embedding runtime not available after initialization', { workspaceId });
			return;
		}

		this.logService.info('[ExtHostIndexing] Embedding runtime ready, processing queue', {
			workspaceId,
			runtimeModelId: runtime.modelId
		});

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);

		// Phase 10: Check paused state
		const paused = await this.isWorkspacePaused(db, workspaceId);
		if (paused) {
			this.logService.trace('[ExtHostIndexing] indexing paused, skipping embedding queue', { workspaceId });
			await new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
			return;
		}

		this.activeEmbeddingQueues.add(workspaceId);
		const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		const startTime = Date.now();
		let processedEmbeddings = 0;

		try {
			for (; ;) {
				if (token.isCancellationRequested) {
					break;
				}

				const elapsed = Date.now() - startTime;
				if (elapsed >= MAX_EMBEDDING_QUEUE_MS || processedEmbeddings >= MAX_EMBEDDINGS_PER_QUEUE_RUN) {
					this.logService.warn('[ExtHostIndexing] embedding queue limits reached; deferring remaining chunks', {
						workspaceId,
						elapsedMs: elapsed,
						processedEmbeddings,
						maxEmbeddingsPerRun: MAX_EMBEDDINGS_PER_QUEUE_RUN,
						maxRunMs: MAX_EMBEDDING_QUEUE_MS
					});
					break;
				}

				this.logService.info('[ExtHostIndexing] Querying for chunks needing embeddings', {
					workspaceId,
					runtimeModelId: runtime.modelId,
					runtimeVersion: runtime.version
				});

				const rows = await all<{ filePath: string; chunkId: string; content: string; contentHash: string }>(
					`SELECT c.filePath, c.chunkId, c.content, c.contentHash
					 FROM chunks c
					 LEFT JOIN embeddings e
					  ON e.workspaceId=c.workspaceId
					 AND e.filePath=c.filePath
					 AND e.chunkId=c.chunkId
					 AND e.embeddingModel=?
					 AND e.embeddingVersion=?
					 WHERE c.workspaceId=?
					 AND (e.rowid IS NULL OR e.contentHash != c.contentHash)
					 LIMIT 32`,
					[runtime.modelId, runtime.version, workspaceId]
				);

				this.logService.info('[ExtHostIndexing] Query returned chunks needing embeddings', {
					workspaceId,
					chunksCount: rows.length,
					runtimeModelId: runtime.modelId,
					runtimeVersion: runtime.version
				});

				if (!rows.length) {
					this.logService.info('[ExtHostIndexing] No more chunks needing embeddings, queue complete', { workspaceId });
					break;
				}

				// Apply per-run embedding count limit before doing any heavy
				// work for this batch.
				if (processedEmbeddings + rows.length > MAX_EMBEDDINGS_PER_QUEUE_RUN) {
					this.logService.warn('[ExtHostIndexing] embedding queue batch would exceed per-run limit; stopping early', {
						workspaceId,
						currentProcessed: processedEmbeddings,
						batchSize: rows.length,
						maxEmbeddingsPerRun: MAX_EMBEDDINGS_PER_QUEUE_RUN
					});
					break;
				}

				const texts = rows.map(r => r.content);
				this.logService.info('[ExtHostIndexing] Calling runtime.embed', {
					workspaceId,
					textsCount: texts.length,
					runtimeModelId: runtime.modelId,
					runtimeVersion: runtime.version
				});

				let vectors: number[][];
				let embeddingSource: 'onnx' | 'hash' | 'unknown' = 'unknown';
				try {
					vectors = await runtime.embed(texts, token);
					const vectorDim = vectors?.[0]?.length ?? 0;

					// Determine embedding source based on vector dimension:
					// Hash runtime produces 8-dimensional vectors
					// ONNX models typically produce 384, 768, or other larger dimensions
					if (vectorDim === 8) {
						embeddingSource = 'hash';
						this.logService.warn('[ExtHostIndexing] ⚠️ HASH EMBEDDINGS DETECTED - Using hash fallback instead of ONNX model', {
							workspaceId,
							vectorDim,
							textsCount: texts.length
						});
					} else if (vectorDim > 8) {
						embeddingSource = 'onnx';
						this.logService.info('[ExtHostIndexing] ✅ ONNX EMBEDDINGS DETECTED - Using ONNX model', {
							workspaceId,
							vectorDim,
							textsCount: texts.length
						});
					}

					this.logService.info('[ExtHostIndexing] runtime.embed completed', {
						workspaceId,
						vectorsCount: vectors?.length,
						vectorDim,
						embeddingSource
					});
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					this.logService.error('[ExtHostIndexing] embedding runtime failed', {
						workspaceId,
						message,
						errorStack: e instanceof Error ? e.stack : undefined
					});
					break;
				}

				if (vectors.length !== rows.length) {
					this.logService.error('[ExtHostIndexing] embedding runtime returned mismatched vector count', {
						expected: rows.length,
						actual: vectors.length
					});
					break;
				}

				const now = Date.now();
				try {
					await exec('BEGIN IMMEDIATE TRANSACTION;');
					for (let i = 0; i < rows.length; i++) {
						const r = rows[i];
						const v = vectors[i];
						// Store vectors as Float32Array BLOB for sqlite-vector scalar functions.
						// Convert number[] to Float32Array, then to Buffer.
						const float32 = new Float32Array(v.length);
						for (let j = 0; j < v.length; j++) {
							float32[j] = Number(v[j]);
						}
						const vectorBlob = Buffer.from(float32.buffer);
						await run(
							`INSERT OR REPLACE INTO embeddings(workspaceId, filePath, chunkId, contentHash, embeddingModel, embeddingVersion, vector, createdAt)
							 VALUES(?,?,?,?,?,?,?,?)`,
							[workspaceId, r.filePath, r.chunkId, r.contentHash, runtime.modelId, runtime.version, vectorBlob, now]
						);

						// Note: upsertVectorIndexRow is no longer needed since we store as BLOB directly.
						// Vectors are now stored as Float32Array BLOB in the embeddings table for sqlite-vector scalar functions.
					}
					await exec('COMMIT;');
					processedEmbeddings += rows.length;
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					this.logService.error('[ExtHostIndexing] embedding batch failed', { workspaceId, message });
					try {
						await exec('ROLLBACK;');
					} catch {
						// ignore rollback errors
					}
					break;
				}
			}
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
			this.activeEmbeddingQueues.delete(workspaceId);
			this.logService.info('[ExtHostIndexing] processEmbeddingQueue completed', {
				workspaceId,
				processedEmbeddings,
				elapsedMs: Date.now() - startTime
			});
		}
	}

	private async ensureSchema(db: SqliteDatabase, _deps: SqliteDeps): Promise<void> {
		const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));

		// Base table for workspace-level metadata and schema versioning.
		await exec(`
			CREATE TABLE IF NOT EXISTS workspaces (
				id TEXT PRIMARY KEY,
				lastIndexedTime INTEGER,
				schemaVersion INTEGER
			);
		`);
		// Per-workspace index lifecycle state and error metadata. This table is
		// append-only in terms of schema and is safe to create unconditionally.
		await exec(`
			CREATE TABLE IF NOT EXISTS index_state (
				workspaceId TEXT PRIMARY KEY,
				state TEXT,
				lastFullScanTime INTEGER,
				lastEmbeddingRunTime INTEGER,
				lastErrorCode TEXT,
				lastErrorMessage TEXT,
				vectorBackfillComplete INTEGER DEFAULT 0,
				paused INTEGER DEFAULT 0,
				pausedReason TEXT,
				degradedReason TEXT,
				rebuilding INTEGER DEFAULT 0,
				backfillingVectorIndex INTEGER DEFAULT 0
			);
		`);
		// Phase 6 migration: Add lastFullScanTime column if it doesn't exist.
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN lastFullScanTime INTEGER;`);
		} catch {
			// Column already exists, ignore.
		}
		// Phase 9 migration: Add vectorBackfillComplete column if it doesn't exist.
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN vectorBackfillComplete INTEGER DEFAULT 0;`);
		} catch {
			// Column already exists, ignore.
		}
		// Phase 10 migration: Add control plane columns if they don't exist.
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN paused INTEGER DEFAULT 0;`);
		} catch {
			// Column already exists, ignore.
		}
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN pausedReason TEXT;`);
		} catch {
			// Column already exists, ignore.
		}
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN degradedReason TEXT;`);
		} catch {
			// Column already exists, ignore.
		}
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN rebuilding INTEGER DEFAULT 0;`);
		} catch {
			// Column already exists, ignore.
		}
		try {
			await exec(`ALTER TABLE index_state ADD COLUMN backfillingVectorIndex INTEGER DEFAULT 0;`);
		} catch {
			// Column already exists, ignore.
		}

		const meta = await get<{ schemaVersion: number }>(
			`SELECT schemaVersion FROM workspaces WHERE id = ?`,
			['__schema__']
		);
		const current = meta?.schemaVersion ?? 0;

		if (current === CURRENT_SCHEMA_VERSION) {
			// Already at expected schema.
			return;
		}

		if (current > CURRENT_SCHEMA_VERSION) {
			// We are running older code against a newer DB schema: mark as degraded
			// and disable writes, but allow reads for status/retrieval if possible.
			// This prevents catastrophic downgrade failures.
			const err = new Error(`[ExtHostIndexing] Future schema version ${current} is not supported (expected ${CURRENT_SCHEMA_VERSION})`) as ErrorWithCode;
			err.code = 'FutureSchema';
			throw err;
		}

		// Fresh database: create the latest schema in one go.
		if (current === 0) {
			await exec(`
				CREATE TABLE IF NOT EXISTS roots (
					workspaceId TEXT,
					rootId TEXT,
					uri TEXT,
					PRIMARY KEY(workspaceId, rootId)
				);
				CREATE TABLE IF NOT EXISTS folders (
					workspaceId TEXT,
					path TEXT,
					parentPath TEXT,
					status TEXT,
					PRIMARY KEY(workspaceId, path)
				);
				CREATE TABLE IF NOT EXISTS files (
					workspaceId TEXT,
					path TEXT,
					folderPath TEXT,
					mtime INTEGER,
					size INTEGER,
					languageId TEXT,
					hash TEXT,
					status TEXT,
					lastIndexedTime INTEGER,
					deleted INTEGER DEFAULT 0,
					PRIMARY KEY(workspaceId, path)
				);
				CREATE TABLE IF NOT EXISTS chunks (
					workspaceId TEXT,
					filePath TEXT,
					chunkId TEXT,
					startLine INTEGER,
					endLine INTEGER,
					content TEXT,
					contentHash TEXT,
					PRIMARY KEY(workspaceId, filePath, chunkId)
				);
				CREATE TABLE IF NOT EXISTS embeddings (
					workspaceId TEXT,
					filePath TEXT,
					chunkId TEXT,
					contentHash TEXT,
					embeddingModel TEXT,
					embeddingVersion TEXT,
					vector BLOB,
					createdAt INTEGER,
					PRIMARY KEY(workspaceId, filePath, chunkId, embeddingModel, embeddingVersion)
				);
				CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspaceId);
				CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspaceId);
				CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(workspaceId, filePath);
				CREATE INDEX IF NOT EXISTS idx_embeddings_workspace ON embeddings(workspaceId, filePath, chunkId);
			`);
		} else if (current === 3) {
			// Migration from previous Phase-3 schema: add roots table, files.deleted,
			// folders.status, and embeddings table.
			await exec(`
				CREATE TABLE IF NOT EXISTS roots (
					workspaceId TEXT,
					rootId TEXT,
					uri TEXT,
					PRIMARY KEY(workspaceId, rootId)
				);
			`);
			await exec(`ALTER TABLE files ADD COLUMN deleted INTEGER DEFAULT 0`);
			await exec(`ALTER TABLE folders ADD COLUMN status TEXT`);
			await exec(`
				CREATE TABLE IF NOT EXISTS embeddings (
					workspaceId TEXT,
					filePath TEXT,
					chunkId TEXT,
					contentHash TEXT,
					embeddingModel TEXT,
					embeddingVersion TEXT,
					vector BLOB,
					createdAt INTEGER,
					PRIMARY KEY(workspaceId, filePath, chunkId, embeddingModel, embeddingVersion)
				);
				CREATE INDEX IF NOT EXISTS idx_embeddings_workspace ON embeddings(workspaceId, filePath, chunkId);
			`);
		} else if (current === 4) {
			// Migration from Phase-4 schema (no embeddings table yet) to Phase-5.
			await exec(`
				CREATE TABLE IF NOT EXISTS embeddings (
					workspaceId TEXT,
					filePath TEXT,
					chunkId TEXT,
					contentHash TEXT,
					embeddingModel TEXT,
					embeddingVersion TEXT,
					vector BLOB,
					createdAt INTEGER,
					PRIMARY KEY(workspaceId, filePath, chunkId, embeddingModel, embeddingVersion)
				);
				CREATE INDEX IF NOT EXISTS idx_embeddings_workspace ON embeddings(workspaceId, filePath, chunkId);
			`);
		} else if (current === 5) {
			// Migration from Phase-5 schema to Phase-6: index_state table is
			// created unconditionally above, so no additional work is needed.
		} else if (current === 6) {
			// Migration from Phase-6 to Phase-7: Add control plane columns.
			// These are added via ALTER TABLE above, so no additional work needed here.
			this.logService.info('[ExtHostIndexing] Migrated schema from 6 to 7 (control plane fields)');
		} else if (current === 1 || current === 2) {
			// Very old schema versions (1 or 2) that may not have workspaceId columns.
			// These schemas are incompatible - we need to rebuild the database.
			// Mark as degraded and suggest rebuild.
			this.logService.warn('[ExtHostIndexing] Detected very old schema version', { current, expected: CURRENT_SCHEMA_VERSION });
			const err = new Error(`[ExtHostIndexing] Database schema version ${current} is too old and incompatible. Please rebuild the index.`) as ErrorWithCode;
			err.code = 'OldSchema';
			throw err;
		} else {
			// Unknown older schema; fail loudly so we don't operate on an unexpected shape.
			throw new Error(`[ExtHostIndexing] Unsupported schema version ${current}`);
		}

		await exec(
			`INSERT OR REPLACE INTO workspaces(id, schemaVersion) VALUES('__schema__', ${CURRENT_SCHEMA_VERSION})`
		);

		// sqlite-vector uses scalar functions on BLOB columns in the embeddings table.
		// No virtual table needed - vectors are stored as BLOB in the existing embeddings table.
		// We'll verify scalar functions are available when needed (in isVectorIndexReady).
	}

	private async readIndexState(db: SqliteDatabase, workspaceId: string): Promise<{
		state?: IndexStateDto;
		lastFullScanTime?: number;
		lastEmbeddingRunTime?: number;
		lastErrorCode?: string;
		lastErrorMessage?: string;
		paused?: boolean;
		pausedReason?: string;
		degradedReason?: string;
		rebuilding?: boolean;
		backfillingVectorIndex?: boolean;
	}> {
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const row = await get<{
			state: IndexStateDto | null;
			lastFullScanTime: number | null;
			lastEmbeddingRunTime: number | null;
			lastErrorCode: string | null;
			lastErrorMessage: string | null;
			paused: number | null;
			pausedReason: string | null;
			degradedReason: string | null;
			rebuilding: number | null;
			backfillingVectorIndex: number | null;
		}>(
			`SELECT state, lastFullScanTime, lastEmbeddingRunTime, lastErrorCode, lastErrorMessage, paused, pausedReason, degradedReason, rebuilding, backfillingVectorIndex FROM index_state WHERE workspaceId=?`,
			[workspaceId]
		);
		if (!row) {
			return {};
		}
		return {
			state: row.state ?? undefined,
			lastFullScanTime: row.lastFullScanTime ?? undefined,
			lastEmbeddingRunTime: row.lastEmbeddingRunTime ?? undefined,
			lastErrorCode: row.lastErrorCode ?? undefined,
			lastErrorMessage: row.lastErrorMessage ?? undefined,
			paused: (row.paused ?? 0) === 1,
			pausedReason: row.pausedReason ?? undefined,
			degradedReason: row.degradedReason ?? undefined,
			rebuilding: (row.rebuilding ?? 0) === 1,
			backfillingVectorIndex: (row.backfillingVectorIndex ?? 0) === 1
		};
	}

	private async updateIndexState(db: SqliteDatabase, workspaceId: string, patch: {
		state?: IndexStateDto;
		lastFullScanTime?: number | null;
		lastEmbeddingRunTime?: number | null;
		lastErrorCode?: string | null;
		lastErrorMessage?: string | null;
		paused?: boolean | null;
		pausedReason?: string | null;
		degradedReason?: string | null;
		rebuilding?: boolean | null;
		backfillingVectorIndex?: boolean | null;
	}): Promise<void> {
		// Build a minimal upsert statement that only touches provided fields.
		const fields: string[] = [];
		const values: SqliteParams = [];
		if (typeof patch.state === 'string') {
			fields.push('state');
			values.push(patch.state);
		}
		if (typeof patch.lastFullScanTime === 'number' || patch.lastFullScanTime === null) {
			fields.push('lastFullScanTime');
			values.push(patch.lastFullScanTime);
		}
		if (typeof patch.lastEmbeddingRunTime === 'number' || patch.lastEmbeddingRunTime === null) {
			fields.push('lastEmbeddingRunTime');
			values.push(patch.lastEmbeddingRunTime);
		}
		if (typeof patch.lastErrorCode === 'string' || patch.lastErrorCode === null) {
			fields.push('lastErrorCode');
			values.push(patch.lastErrorCode);
		}
		if (typeof patch.lastErrorMessage === 'string' || patch.lastErrorMessage === null) {
			fields.push('lastErrorMessage');
			values.push(patch.lastErrorMessage);
		}
		if (typeof patch.paused === 'boolean' || patch.paused === null) {
			fields.push('paused');
			values.push(patch.paused ? 1 : 0);
		}
		if (typeof patch.pausedReason === 'string' || patch.pausedReason === null) {
			fields.push('pausedReason');
			values.push(patch.pausedReason);
		}
		if (typeof patch.degradedReason === 'string' || patch.degradedReason === null) {
			fields.push('degradedReason');
			values.push(patch.degradedReason);
		}
		if (typeof patch.rebuilding === 'boolean' || patch.rebuilding === null) {
			fields.push('rebuilding');
			values.push(patch.rebuilding ? 1 : 0);
		}
		if (typeof patch.backfillingVectorIndex === 'boolean' || patch.backfillingVectorIndex === null) {
			fields.push('backfillingVectorIndex');
			values.push(patch.backfillingVectorIndex ? 1 : 0);
		}
		if (!fields.length) {
			return;
		}

		const columns = ['workspaceId', ...fields];
		const placeholders = columns.map(() => '?').join(',');
		const updateAssignments = fields.map(f => `${f}=excluded.${f}`).join(',');
		const sql = `INSERT INTO index_state(${columns.join(',')}) VALUES(${placeholders})
			ON CONFLICT(workspaceId) DO UPDATE SET ${updateAssignments}`;

		const exec = (sqlText: string, params: SqliteParams) =>
			new Promise<void>((resolve, reject) => db.run(sqlText, params, err => err ? reject(err) : resolve()));
		await exec(sql, [workspaceId, ...values]);
	}

	// Phase 10: Feature gates (config-backed, read-only at runtime)
	private isFeatureEnabled(feature: 'indexing' | 'embeddings' | 'vectorIndex' | 'retrieval'): boolean {
		const configProvider = this.configurationService as IExtHostConfiguration & { getConfiguration?: (section: string) => { get?: <T>(key: string) => T } | undefined };
		const vybeConfig = typeof configProvider.getConfiguration === 'function'
			? configProvider.getConfiguration('vybe')
			: undefined;
		const keyMap = {
			indexing: 'localIndexing.enableIndexing',
			embeddings: 'localIndexing.enableEmbeddings',
			vectorIndex: 'localIndexing.enableVectorIndex',
			retrieval: 'localIndexing.enableRetrieval'
		} as const;
		const key = keyMap[feature];
		const value = vybeConfig && vybeConfig.get && vybeConfig.get(key);
		// Default to enabled if not configured
		return value !== false;
	}

	// Phase 10: Check if workspace is paused
	private async isWorkspacePaused(db: SqliteDatabase, workspaceId: string): Promise<boolean> {
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const row = await get<{ paused: number | null }>(
			`SELECT paused FROM index_state WHERE workspaceId=?`,
			[workspaceId]
		);
		return (row?.paused ?? 0) === 1;
	}

	// Phase 10: Check if workspace is rebuilding
	private async isWorkspaceRebuilding(db: SqliteDatabase, workspaceId: string): Promise<boolean> {
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const row = await get<{ rebuilding: number | null }>(
			`SELECT rebuilding FROM index_state WHERE workspaceId=?`,
			[workspaceId]
		);
		return (row?.rebuilding ?? 0) === 1;
	}

	async $runDbSmokeTest(workspaceId: string): Promise<{ ok: boolean; reason?: string }> {
		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing] DB smoke test failed - native deps missing', reason);
			return { ok: false, reason };
		}

		const basePath = this.initData.environment.workspaceStorageHome.fsPath;
		const dbPath = deps.path.join(basePath, workspaceId || 'default', 'vybe-index.db');
		this.logService.info('[ExtHostIndexing] DB smoke test starting', dbPath);

		try {
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
		} catch (e) {
			const reason = `failed to create DB directory: ${(e as Error).message}`;
			this.logService.error('[ExtHostIndexing] DB smoke test failed', { dbPath, reason });
			return { ok: false, reason };
		}

		const exec = (db: InstanceType<SqliteModule['Database']>, sql: string) =>
			new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
		const run = (db: InstanceType<SqliteModule['Database']>, sql: string, params: SqliteParams = []) =>
			new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
		const get = <T = SqliteRow>(db: InstanceType<SqliteModule['Database']>, sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const close = (db: InstanceType<SqliteModule['Database']>) =>
			new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		// Connection A: create table + insert
		let dbA: InstanceType<SqliteModule['Database']> | undefined;
		try {
			dbA = new deps.sqlite.Database(dbPath);
			await exec(dbA, 'CREATE TABLE IF NOT EXISTS smoke_test (id INTEGER PRIMARY KEY, value TEXT)');
			await run(dbA, 'INSERT INTO smoke_test (value) VALUES (?)', ['hello']);
			this.logService.info('[ExtHostIndexing] DB smoke test insert OK', dbPath);
		} catch (e) {
			const reason = `insert phase failed: ${(e as Error).message}`;
			this.logService.error('[ExtHostIndexing] DB smoke test failed during insert', { dbPath, reason });
			if (dbA) {
				try { await close(dbA); } catch { /* ignore */ }
			}
			return { ok: false, reason };
		} finally {
			if (dbA) {
				try { await close(dbA); } catch { /* ignore */ }
			}
		}

		// Connection B: read back
		let dbB: InstanceType<SqliteModule['Database']> | undefined;
		try {
			dbB = new deps.sqlite.Database(dbPath);
			const row = await get<{ value: string }>(dbB, 'SELECT value FROM smoke_test ORDER BY id LIMIT 1', []);
			const value = row?.value;
			if (value === 'hello') {
				this.logService.info('[ExtHostIndexing] DB smoke test readback OK', { dbPath, value });
				this.logService.info('[ExtHostIndexing] SQLite DB smoke test PASSED', dbPath);
				return { ok: true };
			}
			const reason = `unexpected value: ${String(value)}`;
			this.logService.warn('[ExtHostIndexing] DB smoke test readback mismatch', { dbPath, reason });
			return { ok: false, reason };
		} catch (e) {
			const reason = `readback phase failed: ${(e as Error).message}`;
			this.logService.error('[ExtHostIndexing] DB smoke test failed during readback', { dbPath, reason });
			return { ok: false, reason };
		} finally {
			if (dbB) {
				try { await close(dbB); } catch { /* ignore */ }
			}
		}
	}

	async $getStatus(workspaceId: string): Promise<IndexStatusDto> {
		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing] getStatus failed - native deps missing', reason);
			return {
				workspaceId,
				state: 'error',
				lastErrorCode: 'NativeDepsMissing',
				lastErrorMessage: reason
			};
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		let db: SqliteDatabase | undefined;
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T | undefined>((resolve, reject) => db!.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const close = () => new Promise<void>((resolve, reject) => db?.close(err => err ? reject(err) : resolve()));

		try {
			db = await openDatabaseWithRetry(deps.sqlite, dbPath);
			await this.ensureSchema(db, deps);

			const wsRow = await get<{ lastIndexedTime: number | null; schemaVersion: number | null }>(
				`SELECT lastIndexedTime, schemaVersion FROM workspaces WHERE id=?`,
				[workspaceId]
			);

			const fileRow = await get<{ c: number }>(
				`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND (deleted IS NULL OR deleted=0)`,
				[workspaceId]
			);
			const indexedRow = await get<{ c: number }>(
				`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND status='indexed' AND (deleted IS NULL OR deleted=0)`,
				[workspaceId]
			);
			const chunkRow = await get<{ c: number }>(
				`SELECT COUNT(*) as c FROM chunks WHERE workspaceId=?`,
				[workspaceId]
			);
			const runtime = this.embeddingRuntime;
			let embeddedChunks = 0;
			let embeddingModel: string | undefined;
			if (runtime) {
				const embeddedRow = await get<{ c: number }>(
					`SELECT COUNT(*) as c FROM embeddings WHERE workspaceId=? AND embeddingModel=? AND embeddingVersion=?`,
					[workspaceId, runtime.modelId, runtime.version]
				);
				embeddedChunks = embeddedRow?.c ?? 0;
				embeddingModel = runtime.modelId;
			}

			const totalFiles = fileRow?.c ?? 0;
			const indexedFiles = indexedRow?.c ?? 0;
			const totalChunks = chunkRow?.c ?? 0;

			// Determine actual embedding method being used by checking what embeddings exist in the database
			// Hash embeddings use modelId='hash-embedding', ONNX uses actual model IDs like 'coderank-embed'
			let actualEmbeddingMethod: 'onnx' | 'hash' | 'none' = 'none';
			if (embeddedChunks > 0) {
				const embeddingMethodRow = await get<{ embeddingModel: string; count: number }>(
					`SELECT embeddingModel, COUNT(*) as count
					 FROM embeddings
					 WHERE workspaceId=?
					 GROUP BY embeddingModel
					 ORDER BY count DESC
					 LIMIT 1`,
					[workspaceId]
				);
				if (embeddingMethodRow) {
					if (embeddingMethodRow.embeddingModel === 'hash-embedding') {
						actualEmbeddingMethod = 'hash';
					} else {
						actualEmbeddingMethod = 'onnx';
					}
				}
			}


			const stateRow = await this.readIndexState(db, workspaceId);

			let state: IndexStateDto;
			if (!wsRow && totalFiles === 0 && totalChunks === 0) {
				state = 'idle';
			} else if (stateRow.state) {
				state = stateRow.state;
			} else if (!wsRow) {
				// Legacy DBs without a workspaces row but with files: treat as ready.
				state = 'ready';
			} else {
				// Default legacy behavior: any indexed data implies a ready index.
				state = 'ready';
			}

			// Compute failed and pending embedding counts.
			// Reuse the runtime variable declared above.
			let failedEmbeddingCount = 0;
			let pendingEmbeddingCount = 0;
			if (runtime) {
				// Count chunks that have embeddings with mismatched contentHash (failed/stale).
				const failedRow = await get<{ c: number }>(
					`SELECT COUNT(*) as c FROM embeddings e
					 INNER JOIN chunks c ON e.workspaceId=c.workspaceId AND e.filePath=c.filePath AND e.chunkId=c.chunkId
					 WHERE e.workspaceId=? AND e.embeddingModel=? AND e.embeddingVersion=? AND e.contentHash != c.contentHash`,
					[workspaceId, runtime.modelId, runtime.version]
				);
				failedEmbeddingCount = failedRow?.c ?? 0;

				// Count chunks that have no embeddings yet.
				const pendingRow = await get<{ c: number }>(
					`SELECT COUNT(*) as c FROM chunks c
					 LEFT JOIN embeddings e ON e.workspaceId=c.workspaceId AND e.filePath=c.filePath AND e.chunkId=c.chunkId
					  AND e.embeddingModel=? AND e.embeddingVersion=?
					 WHERE c.workspaceId=? AND e.rowid IS NULL`,
					[runtime.modelId, runtime.version, workspaceId]
				);
				pendingEmbeddingCount = pendingRow?.c ?? 0;
			}

			// Detect retrieval mode and vector index readiness.
			let retrievalMode: 'ts' | 'sqlite-vector' = 'ts';
			let vectorIndexReady = false;
			try {
				const isReady = await this.isVectorIndexReady(db, workspaceId, runtime, deps);
				if (isReady) {
					retrievalMode = 'sqlite-vector';
					vectorIndexReady = true;
					this.logService.info('[ExtHostIndexing] ✅ Vector index ready - using sqlite-vector for queries', { workspaceId });

					// Trigger backfill if vector index just became ready and backfill not completed.
					if (runtime) {
						const stateRow = await get<{ vectorBackfillComplete: number | null }>(
							`SELECT vectorBackfillComplete FROM index_state WHERE workspaceId=?`,
							[workspaceId]
						);
						if (stateRow?.vectorBackfillComplete !== 1) {
							// Backfill not completed. Trigger bounded backfill asynchronously.
							this.populateVectorIndexFromEmbeddings(db, workspaceId, runtime, deps, {
								batchSize: VECTOR_BACKFILL_BATCH_SIZE,
								timeBudgetMs: VECTOR_BACKFILL_TIME_BUDGET_MS
							}).catch(err => {
								this.logService.error('[ExtHostIndexing] vector backfill failed in getStatus', { workspaceId, err });
							});
						}
					}
				}
			} catch (e) {
				// Detection failed, default to TS.
				this.logService.trace('[ExtHostIndexing] vector index readiness check failed in getStatus', e);
			}

			// Model status: Query actual ModelManager status if available, otherwise use runtime-based fallback
			// Also check what embeddings are actually being used (ONNX vs hash)
			let modelDownloadState: 'idle' | 'checking' | 'downloading' | 'extracting' | 'ready' | 'error' | 'hash' = 'idle';
			let modelDownloadProgress = 0;
			let modelDownloadMessage: string | undefined = undefined;

			if (this.modelManager && typeof this.modelManager.getStatus === 'function') {
				try {
					const modelStatus = this.modelManager.getStatus();
					this.logService.info('[ExtHostIndexing] ModelManager status', {
						state: modelStatus.state,
						progress: modelStatus.progress,
						message: modelStatus.message
					});
					// Map ModelInstallState enum to our status string
					// ModelInstallState values: 'notInstalled', 'checking', 'downloading', 'extracting', 'ready', 'error'
					switch (modelStatus.state) {
						case 'notInstalled':
							modelDownloadState = 'idle';
							break;
						case 'checking':
							modelDownloadState = 'checking';
							break;
						case 'downloading':
							modelDownloadState = 'downloading';
							break;
						case 'extracting':
							modelDownloadState = 'extracting';
							break;
						case 'ready':
							modelDownloadState = 'ready';
							break;
						case 'error':
							modelDownloadState = 'error';
							break;
						default:
							modelDownloadState = 'idle';
					}
					modelDownloadProgress = modelStatus.progress ?? 0;
					modelDownloadMessage = modelStatus.message;

					// If model is ready but we're using hash embeddings, override the state
					if (modelDownloadState === 'ready' && actualEmbeddingMethod === 'hash') {
						modelDownloadState = 'hash';
						modelDownloadMessage = 'Hash Embeddings Ready';
					}
				} catch (err) {
					this.logService.warn('[ExtHostIndexing] Failed to get ModelManager status', {
						error: err instanceof Error ? err.message : String(err)
					});
					// Fall back to runtime-based status
					if (actualEmbeddingMethod === 'hash') {
						modelDownloadState = 'hash';
						modelDownloadProgress = 100;
						modelDownloadMessage = 'Hash Embeddings Ready';
					} else {
						modelDownloadState = runtime ? 'ready' : 'idle';
						modelDownloadProgress = runtime ? 100 : 0;
						modelDownloadMessage = runtime ? 'Local hash-based embeddings ready' : undefined;
					}
				}
			} else {
				// No ModelManager available yet - check if initialization is in progress
				if (this.embeddingRuntimeInitPromise) {
					// Initialization is in progress, show checking state
					modelDownloadState = 'checking';
					modelDownloadProgress = 0;
					modelDownloadMessage = 'Initializing model manager...';
				} else if (runtime) {
					// Runtime exists but no ModelManager - check what embeddings are actually being used
					if (actualEmbeddingMethod === 'hash') {
						modelDownloadState = 'hash';
						modelDownloadProgress = 100;
						modelDownloadMessage = 'Hash Embeddings Ready';
					} else {
						modelDownloadState = 'ready';
						modelDownloadProgress = 100;
						modelDownloadMessage = 'Local hash-based embeddings ready';
					}
				} else {
					// No runtime at all
					modelDownloadState = 'idle';
					modelDownloadProgress = 0;
					modelDownloadMessage = undefined;
				}
			}

			// Override model status if we detect hash embeddings are actually being used
			// This ensures "Model Warmed Up" only shows for ONNX, not hash
			if (actualEmbeddingMethod === 'hash' && modelDownloadState === 'ready') {
				modelDownloadState = 'hash';
				modelDownloadProgress = 100;
				modelDownloadMessage = 'Hash Embeddings Ready';
			} else if (actualEmbeddingMethod === 'onnx' && modelDownloadState === 'ready') {
				// Keep "ready" state for ONNX, but ensure message is correct
				if (!modelDownloadMessage || modelDownloadMessage.includes('hash')) {
					modelDownloadMessage = 'Model Warmed Up';
				}
			}

			// Phase 10: Include control plane state
			const result = {
				workspaceId,
				state,
				totalFiles,
				indexedFiles,
				totalChunks,
				lastIndexedTime: wsRow?.lastIndexedTime ?? undefined,
				schemaVersion: wsRow?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
				embeddedChunks,
				embeddingModel,
				lastFullScanTime: stateRow.lastFullScanTime,
				lastEmbeddingRunTime: stateRow.lastEmbeddingRunTime,
				failedEmbeddingCount,
				pendingEmbeddingCount,
				retrievalMode,
				vectorIndexReady,
				lastErrorCode: stateRow.lastErrorCode,
				lastErrorMessage: stateRow.lastErrorMessage,
				paused: stateRow.paused,
				pausedReason: stateRow.pausedReason,
				degradedReason: stateRow.degradedReason,
				rebuilding: stateRow.rebuilding,
				backfillingVectorIndex: stateRow.backfillingVectorIndex,
				modelDownloadState,
				modelDownloadProgress,
				modelDownloadMessage
			};
			return result;
		} catch (e) {
			const category = classifySqliteError(e);
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] getStatus failed', { dbPath, category, message });

			let state: IndexStateDto = 'error';
			let errorCode = 'UnknownError';
			let errorMessage = message;

			if (category === 'FutureSchema') {
				state = 'degraded';
				errorCode = 'FutureSchema';
				errorMessage = `Database schema version is newer than supported. Writes disabled, reads may be limited.`;
			} else if (category === 'Corrupt') {
				state = 'error';
				errorCode = 'CorruptDatabase';
				errorMessage = `Database is corrupted. Rebuild required.`;
			} else if (category === 'OpenFailure') {
				state = 'idle';
				errorCode = 'OpenFailure';
				errorMessage = `Cannot open database file.`;
			} else if (category === 'BusyOrLocked') {
				state = 'degraded';
				errorCode = 'DatabaseLocked';
				errorMessage = `Database is locked by another process.`;
			} else if (message.includes('no such column: workspaceId')) {
				// Schema mismatch: database was created with old schema missing workspaceId columns
				state = 'error';
				errorCode = 'SchemaMismatch';
				errorMessage = `Database schema is incompatible. Please click "Rebuild" to recreate the index.`;
			}

			return {
				workspaceId,
				state,
				lastErrorCode: errorCode,
				lastErrorMessage: errorMessage
			};
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	private workspaceIdToStorageFolder(workspaceId: string): string {
		// For now, use the workspace id directly. This matches how
		// ExtHostStorage decides on the storage folder name.
		return workspaceId || 'default';
	}

	private getDbPathForWorkspace(workspaceId: string, deps: SqliteDeps): string {
		const basePath = this.initData.environment.workspaceStorageHome.fsPath;
		const folder = this.workspaceIdToStorageFolder(workspaceId);
		return deps.path.join(basePath, folder, 'vybe-index.db');
	}

	/**
	 * Detects if sqlite-vector extension is available by attempting to load it.
	 * Results are cached per instance to avoid repeated detection attempts.
	 */
	private async detectSqliteVector(db: SqliteDatabase, deps: SqliteDeps): Promise<boolean> {
		if (this.sqliteVectorAvailable !== undefined) {
			this.logService.trace('[ExtHostIndexing] detectSqliteVector: using cached result', { result: this.sqliteVectorAvailable });
			return this.sqliteVectorAvailable;
		}

		// Check SQLite version first (for diagnostics)
		try {
			const versionPromise = new Promise<string>((resolve, reject) => {
				db.get(`SELECT sqlite_version() as version`, [], (err: Error | null, row: SqliteRow | undefined) => {
					if (err) {
						reject(err);
					} else {
						resolve((row as { version: string })?.version || 'unknown');
					}
				});
			});
			await Promise.race([versionPromise, new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))]);
		} catch {
			// Ignore version check errors
		}

		// First, check if sqlite-vector scalar functions are available (may be statically linked).
		// Use vector_version() as a safe test that won't interfere with real operations.
		try {
			const testPromise = new Promise<string>((resolve, reject) => {
				db.get(`SELECT vector_version() as version`, [], (err: Error | null, row: SqliteRow | undefined) => {
					if (err) {
						reject(err);
					} else {
						const version = (row as { version?: string })?.version || 'unknown';
						resolve(version);
					}
				});
			});

			// Add timeout to prevent blocking
			const timeoutPromise = new Promise<string>((_, reject) => {
				setTimeout(() => reject(new Error('vector_version test timeout')), 1000);
			});

			await Promise.race([testPromise, timeoutPromise]);
			this.sqliteVectorAvailable = true;
			return true;
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			// If error is "no such function: vector_version", extension is not loaded.
			if (errMsg.includes('no such function') || errMsg.includes('timeout')) {
				// Try loading extension from file system.
			} else {
				// Other errors might indicate extension is available but test failed - be conservative.
				this.logService.trace('[ExtHostIndexing] vector_version test failed, assuming not available', { error: errMsg });
			}
		}

		// Try loading sqlite-vector extension from file system.
		// Platform + architecture aware binary selection.
		const hasLoadExtension = typeof (db as SqliteDatabase & { loadExtension?: (path: string, cb?: (err: Error | null) => void) => void }).loadExtension === 'function';

		const possiblePaths: string[] = [];
		if (hasLoadExtension) {
			const platform = process.platform; // 'darwin', 'win32', 'linux'
			const arch = process.arch; // 'x64', 'arm64', 'ia32'
			const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
			const binaryName = `vector-${platform}-${arch}.${extName}`;
			try {
				// Derive userDataPath from globalStorageHome (same approach as constructor)
				let userDataPath: string | undefined;
				if (this.initData.environment.globalStorageHome) {
					const globalStoragePath = this.initData.environment.globalStorageHome.fsPath;
					userDataPath = deps.path.dirname(deps.path.dirname(globalStoragePath)); // Go up from globalStorage to User, then to userDataPath
				}

				if (userDataPath) {
					// First, check if VectorExtensionManager has the path
					if (this.vectorExtensionManager) {
						const extPath = this.vectorExtensionManager.getExtensionPath();
						if (extPath) {
							possiblePaths.push(extPath);
						} else {
							// Extension not found - try to download it (non-blocking)
							// Get https module for download
							try {
								const https = nodeRequire('https') as typeof import('https');
								this.vectorExtensionManager.ensureExtension({ fs: deps.fs, path: deps.path, https }, CancellationToken.None).then(downloadedPath => {
									if (downloadedPath) {
										// Invalidate cache so next detection will find it
										this.sqliteVectorAvailable = undefined;
									}
								}).catch(err => {
									const errMsg = err instanceof Error ? err.message : String(err);
									this.logService.error('[ExtHostIndexing] Auto-download of sqlite-vector extension failed', { error: errMsg });
								});
							} catch (e) {
								const errMsg = e instanceof Error ? e.message : String(e);
								this.logService.warn('[ExtHostIndexing] Failed to get https module for auto-download', { error: errMsg });
							}
						}
					}

					// Version-pinned path: userDataPath/extensions/sqlite-vector/0.9.52/
					const version = '0.9.52'; // Pin to specific version
					// The actual binary is named vector0.dylib/so/dll (not vector-darwin-arm64.dylib)
					const vector0Name = `vector0.${extName}`;
					possiblePaths.push(deps.path.join(userDataPath, 'extensions', 'sqlite-vector', version, vector0Name));
					possiblePaths.push(deps.path.join(userDataPath, 'extensions', 'sqlite-vector', vector0Name));
					// Also try old naming patterns (legacy)
					possiblePaths.push(deps.path.join(userDataPath, 'extensions', 'sqlite-vector', version, binaryName));
					possiblePaths.push(deps.path.join(userDataPath, 'extensions', 'sqlite-vector', binaryName));
					possiblePaths.push(deps.path.join(userDataPath, 'extensions', 'sqlite-vector', version, `vector.${extName}`));
					possiblePaths.push(deps.path.join(userDataPath, 'extensions', 'sqlite-vector', `vector.${extName}`));
				}
			} catch {
				// Ignore path construction errors
			}

			// Try relative paths as fallback
			possiblePaths.push(`./${binaryName}`);
			possiblePaths.push(`./vector.${extName}`);
			possiblePaths.push(binaryName);
			possiblePaths.push(`vector.${extName}`);

			for (const extPath of possiblePaths) {
				try {
					// Check if file exists before trying to load
					if (deps.fs.existsSync(extPath)) {

						// Enable extension loading (some SQLite builds require this)
						try {
							await new Promise<void>((resolve, reject) => {
								db.exec(`PRAGMA load_extension = ON`, (err) => {
									if (err) {
										// PRAGMA might not be supported, but that's okay - continue anyway
										this.logService.trace('[ExtHostIndexing] PRAGMA load_extension not supported or not needed', { error: err.message || String(err) });
										resolve();
									} else {
										resolve();
									}
								});
							});
						} catch {
							// Ignore PRAGMA errors
						}

						await new Promise<void>((resolve, reject) => {
							(db as SqliteDatabase & { loadExtension: (path: string, cb?: (err: Error | null) => void) => void }).loadExtension(extPath, (err: Error | null) => {
								if (err) {
									reject(err);
								} else {
									resolve();
								}
							});
						});

						// Verify it loaded by checking for scalar functions (vector_version)
						try {
							const funcCheckPromise = new Promise<string>((resolve, reject) => {
								// Try to call a simple vector function to verify it's loaded
								// vector_version() is a safe function that just returns a string
								db.get(`SELECT vector_version() as version`, [], (err: Error | null, row: SqliteRow | undefined) => {
									if (err) {
										// Function doesn't exist - extension might not be fully loaded
										reject(err);
									} else {
										const version = (row as { version?: string })?.version || 'unknown';
										resolve(version);
									}
								});
							});
							const funcTimeoutPromise = new Promise<string>((_, reject) => {
								setTimeout(() => reject(new Error('vector function check timeout')), 1000);
							});
							await Promise.race([funcCheckPromise, funcTimeoutPromise]);
							this.sqliteVectorAvailable = true;
							return true;
						} catch {
							// Extension loaded but scalar functions not available, try next path.
							continue;
						}
					}
				} catch {
					// Loading failed, try next path.
					continue;
				}
			}
		}

		// Extension not available - use TS fallback (which works reliably).
		this.sqliteVectorAvailable = false;
		return false;
	}

	/**
	 * Checks if vector index is ready for use (table exists and sqlite-vector available).
	 */
	private async isVectorIndexReady(db: SqliteDatabase, workspaceId: string, runtime: ILocalEmbeddingRuntime | undefined, deps: SqliteDeps): Promise<boolean> {
		if (!runtime) {
			this.logService.trace('[ExtHostIndexing] Vector index not ready: no runtime', { workspaceId });
			return false;
		}

		try {
			const hasVector = await this.detectSqliteVector(db, deps);
			if (!hasVector) {
				this.logService.trace('[ExtHostIndexing] Vector index not ready: sqlite-vector extension not detected', { workspaceId });
				return false;
			}

			// Check if embeddings table exists and has vector BLOB column.
			const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
				new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
			try {
				// Verify embeddings table exists (it should from schema creation)
				await get(`SELECT 1 FROM embeddings LIMIT 1`);
				// Vector index is ready - we use scalar functions on the embeddings table's vector BLOB column.
				return true;
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : String(e);
				this.logService.trace('[ExtHostIndexing] Vector index not ready: embeddings table check failed', { workspaceId, error: errMsg });
				return false;
			}
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			this.logService.trace('[ExtHostIndexing] Vector index not ready: detection failed', { workspaceId, error: errMsg });
			return false;
		}
	}

	/**
	 * Converts a JSON-encoded vector BLOB to a float32 array format compatible with sqlite-vector.
	 */
	private vectorBlobToFloat32(blob: Buffer | string): Float32Array | null {
		try {
			let raw: string;
			if (blob instanceof Buffer) {
				raw = blob.toString('utf8');
			} else {
				raw = String(blob);
			}

			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				return null;
			}

			const float32 = new Float32Array(parsed.length);
			for (let i = 0; i < parsed.length; i++) {
				const v = Number(parsed[i]);
				if (!Number.isFinite(v)) {
					return null;
				}
				float32[i] = v;
			}

			return float32;
		} catch {
			return null;
		}
	}

	// Note: upsertVectorIndexRow was removed - vectors are now stored as BLOB directly during embedding write.

	/**
	 * Populates the vector index from existing embeddings in the embeddings table.
	 * This is called during initial setup or when vector index needs to be rebuilt.
	 * Bounded by batchSize and timeBudgetMs to avoid blocking.
	 */
	private async populateVectorIndexFromEmbeddings(
		db: SqliteDatabase,
		workspaceId: string,
		runtime: ILocalEmbeddingRuntime,
		deps: SqliteDeps,
		options?: { batchSize?: number; timeBudgetMs?: number }
	): Promise<{ populated: number; failed: number; completed: boolean }> {
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		let populated = 0;
		let failed = 0;

		const batchSize = options?.batchSize ?? VECTOR_BACKFILL_BATCH_SIZE;
		const timeBudgetMs = options?.timeBudgetMs ?? VECTOR_BACKFILL_TIME_BUDGET_MS;
		const startTime = Date.now();

		try {
			// Check if vector index is ready.
			const isReady = await this.isVectorIndexReady(db, workspaceId, runtime, deps);
			if (!isReady) {
				this.logService.trace('[ExtHostIndexing] vector index not ready, skipping population', { workspaceId });
				return { populated: 0, failed: 0, completed: false };
			}

			// Check if backfill already completed.
			const stateRow = await get<{ vectorBackfillComplete: number | null }>(
				`SELECT vectorBackfillComplete FROM index_state WHERE workspaceId=?`,
				[workspaceId]
			);
			if (stateRow?.vectorBackfillComplete === 1) {
				this.logService.trace('[ExtHostIndexing] vector backfill already completed', { workspaceId });
				return { populated: 0, failed: 0, completed: true };
			}

			// Read embeddings for this workspace/model/version, excluding those already in vector index.
			for (; ;) {
				// Check time budget.
				const elapsed = Date.now() - startTime;
				if (elapsed >= timeBudgetMs) {
					this.logService.info('[ExtHostIndexing] vector backfill time budget exhausted', {
						workspaceId,
						elapsedMs: elapsed,
						timeBudgetMs,
						populated,
						failed
					});
					return { populated, failed, completed: false };
				}

				// Read batch of embeddings not yet in vector index.
				const rows = await all<{
					filePath: string;
					chunkId: string;
					vector: Buffer | string | null;
				}>(
					`SELECT e.filePath, e.chunkId, e.vector
					 FROM embeddings e
					 WHERE e.workspaceId=? AND e.embeddingModel=? AND e.embeddingVersion=?
					   AND e.vector IS NOT NULL
					 LIMIT ?`,
					[workspaceId, runtime.modelId, runtime.version, batchSize]
				);

				if (!rows.length) {
					// No more embeddings to backfill. Mark as complete.
					const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
					try {
						await run(
							`INSERT INTO index_state(workspaceId, vectorBackfillComplete) VALUES(?, 1)
							 ON CONFLICT(workspaceId) DO UPDATE SET vectorBackfillComplete=1`,
							[workspaceId]
						);
						this.logService.info('[ExtHostIndexing] vector backfill completed', { workspaceId, populated, failed });
					} catch (e) {
						this.logService.warn('[ExtHostIndexing] failed to mark vector backfill complete', { workspaceId });
					}
					return { populated, failed, completed: true };
				}

				for (const row of rows) {
					if (!row.vector) {
						failed++;
						continue;
					}

					// Check if vector is already in BLOB format (Float32Array) or needs conversion from JSON.
					let float32: Float32Array | null = null;

					// Try to parse as Float32Array BLOB first (sqlite-vector format).
					try {
						if (row.vector instanceof Buffer) {
							// Check if it's a valid Float32Array buffer (length should be multiple of 4).
							if (row.vector.length % 4 === 0 && row.vector.length > 0) {
								float32 = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.length / 4);
							}
						}
					} catch {
						// Not a Float32Array BLOB, try JSON parsing.
					}

					// If not Float32Array, try parsing as JSON (legacy format).
					if (!float32) {
						float32 = this.vectorBlobToFloat32(row.vector);
					}

					if (!float32) {
						failed++;
						continue;
					}

					// Update the embeddings row to store as Float32Array BLOB if it was JSON.
					// This ensures sqlite-vector scalar functions can work with it.
					const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
					try {
						const vectorBlob = Buffer.from(float32.buffer);
						await run(
							`UPDATE embeddings SET vector=? WHERE workspaceId=? AND filePath=? AND chunkId=? AND embeddingModel=? AND embeddingVersion=?`,
							[vectorBlob, workspaceId, row.filePath, row.chunkId, runtime.modelId, runtime.version]
						);
						populated++;
					} catch (e) {
						const message = e instanceof Error ? e.message : String(e);
						this.logService.warn('[ExtHostIndexing] failed to update vector to BLOB format', { workspaceId, filePath: row.filePath, chunkId: row.chunkId, message });
						failed++;
					}
				}

				if (rows.length < batchSize) {
					// Last batch. Mark as complete.
					const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
					try {
						await run(
							`INSERT INTO index_state(workspaceId, vectorBackfillComplete) VALUES(?, 1)
							 ON CONFLICT(workspaceId) DO UPDATE SET vectorBackfillComplete=1`,
							[workspaceId]
						);
						this.logService.info('[ExtHostIndexing] vector backfill completed', { workspaceId, populated, failed });
					} catch (e) {
						this.logService.warn('[ExtHostIndexing] failed to mark vector backfill complete', { workspaceId });
					}
					return { populated, failed, completed: true };
				}
			}

		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] populateVectorIndexFromEmbeddings failed', { workspaceId, message });
			return { populated, failed, completed: false };
		}
	}

	/**
	 * Compute a workspace-relative path for the given absolute file URI. The
	 * first path segment is the workspace folder name, followed by the path
	 * relative to that folder. This makes identities stable across workspace
	 * moves.
	 */
	private toWorkspaceRelativePath(uri: URI, deps: SqliteDeps): string | undefined {
		const folders = this.workspaceService.getWorkspaceFolders() ?? [];
		if (!folders.length) {
			return undefined;
		}

		for (const folder of folders) {
			if (folder.uri.scheme !== 'file') {
				continue;
			}
			const folderUri = URI.revive(folder.uri);
			const rootFsPath = folderUri.fsPath;
			// Basic containment check.
			if (uri.fsPath === rootFsPath || uri.fsPath.startsWith(rootFsPath + deps.path.sep)) {
				const rel = deps.path.relative(rootFsPath, uri.fsPath) || '';
				const norm = rel.split(deps.path.sep).join('/');
				const h = createHash('sha256');
				h.update(folderUri.toString(), 'utf8');
				const rootId = h.digest('hex');
				return norm ? `${rootId}/${norm}` : rootId;
			}
		}

		return undefined;
	}

	private uriFromWorkspaceRelativePath(relPath: string, deps: SqliteDeps): URI | undefined {
		const folders = this.workspaceService.getWorkspaceFolders() ?? [];
		if (!folders.length) {
			return undefined;
		}

		const [rootId, ...rest] = relPath.split('/');
		if (!rootId) {
			return undefined;
		}

		for (const folder of folders) {
			if (folder.uri.scheme !== 'file') {
				continue;
			}
			const folderUri = URI.revive(folder.uri);
			const h = createHash('sha256');
			h.update(folderUri.toString(), 'utf8');
			const candidateId = h.digest('hex');
			if (candidateId !== rootId) {
				continue;
			}

			const rootFsPath = folderUri.fsPath;
			const absPath = rest.length ? deps.path.join(rootFsPath, ...rest) : rootFsPath;
			return URI.file(absPath);
		}

		return undefined;
	}

	private chunkFileContent(filePath: string, content: string, maxLines = 200, overlap = 20): { chunkId: string; startLine: number; endLine: number; content: string; contentHash: string }[] {
		const lines = content.split(/\r?\n/);
		const chunks: { chunkId: string; startLine: number; endLine: number; content: string; contentHash: string }[] = [];
		if (lines.length === 0) {
			return chunks;
		}
		const step = Math.max(1, maxLines - overlap);
		for (let start = 0; start < lines.length; start += step) {
			const end = Math.min(lines.length, start + maxLines);
			const startLine = start + 1;
			const endLine = end;
			const slice = lines.slice(start, end);
			const chunkText = slice.join('\n');
			const chunkId = `${filePath}:${startLine}-${endLine}`;
			const contentHash = this.hashContent(chunkText);
			chunks.push({ chunkId, startLine, endLine, content: chunkText, contentHash });
			if (end === lines.length) {
				break;
			}
		}
		return chunks;
	}

	private async indexFileTree(workspaceId: string, roots: UriComponents[], token: CancellationToken): Promise<IndexStatusDto> {
		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing] file-tree index failed - native deps missing', reason);
			throw new Error(reason);
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		this.logService.info('[ExtHostIndexing] file-tree index starting', dbPath);

		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);
		const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
		const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		try {
			// Phase 10: Check paused and rebuilding state
			const paused = await this.isWorkspacePaused(db, workspaceId);
			if (paused) {
				const stateRow = await this.readIndexState(db, workspaceId);
				this.logService.info('[ExtHostIndexing] indexing paused, skipping full scan', { workspaceId, reason: stateRow.pausedReason });
				await close();
				return { workspaceId, state: stateRow.state ?? 'idle', paused: true, pausedReason: stateRow.pausedReason };
			}

			const rebuilding = await this.isWorkspaceRebuilding(db, workspaceId);
			if (rebuilding) {
				this.logService.info('[ExtHostIndexing] workspace is rebuilding, skipping full scan', { workspaceId });
				await close();
				return { workspaceId, state: 'building', rebuilding: true };
			}

			// Phase 10: Time budget tracking
			const startTime = Date.now();

			// Mark the workspace as actively building a full index. This state
			// is persisted so that status queries can accurately reflect that
			// a scan is in progress even across process boundaries.
			await this.updateIndexState(db, workspaceId, {
				state: 'building',
				lastErrorCode: null,
				lastErrorMessage: null
			});

			await exec('BEGIN IMMEDIATE TRANSACTION;');

			// Enumerate workspace roots provided by the renderer. Multi-root is
			// supported by walking each root URI independently.
			const files = new Set<string>();   // workspace-relative file identities: rootId/relPath
			const folders = new Set<string>(); // workspace-relative folder identities: rootId/relPath
			const rootMap = new Map<string, string>(); // rootId -> rootFsPath
			let hitFileScanLimit = false;

			const makeRootId = (folderUri: URI): string => {
				const h = createHash('sha256');
				h.update(folderUri.toString(), 'utf8');
				return h.digest('hex');
			};

			const makeRelative = (rootId: string, rootFsPath: string, absPath: string): string => {
				const rel = deps.path.relative(rootFsPath, absPath) || '';
				const norm = rel.split(deps.path.sep).join('/');
				return norm ? `${rootId}/${norm}` : rootId;
			};

			// Helper to read and parse ignore files for a directory.
			const readIgnoreFiles = async (dirPath: string): Promise<IgnoreMatcher | null> => {
				const gitignorePath = deps.path.join(dirPath, '.gitignore');
				const vybeignorePath = deps.path.join(dirPath, '.vybeignore');
				let combinedContent = '';

				try {
					const gitignoreContent = await deps.fs.promises.readFile(gitignorePath, 'utf8');
					combinedContent += gitignoreContent + '\n';
				} catch {
					// .gitignore doesn't exist, ignore.
				}

				try {
					const vybeignoreContent = await deps.fs.promises.readFile(vybeignorePath, 'utf8');
					combinedContent += vybeignoreContent + '\n';
				} catch {
					// .vybeignore doesn't exist, ignore.
				}

				if (!combinedContent.trim()) {
					return null;
				}

				return new IgnoreMatcher(combinedContent);
			};

			const walk = async (rootId: string, rootFsPath: string, dirFsPath: string, parentRel: string | null, parentMatcher: IgnoreMatcher | null = null) => {
				if (token.isCancellationRequested || hitFileScanLimit) {
					return;
				}
				try {
					if (this.initData.remote?.isRemote) {
						throw new Error('Remote workspace indexing is not supported yet');
					}

					// Read ignore files for this directory and combine with parent matcher.
					const localMatcher = await readIgnoreFiles(dirFsPath);
					const currentMatcher = localMatcher || parentMatcher;

					const entries = await deps.fs.promises.readdir(dirFsPath, { withFileTypes: true });
					this.logService.trace('[ExtHostIndexing] walk dir', { rootId, rootFsPath, dirFsPath, entryCount: entries.length });
					const relDir = makeRelative(rootId, rootFsPath, dirFsPath);

					// Check if this directory itself is ignored (check just the directory name, not full path).
					const dirName = deps.path.basename(dirFsPath);
					if (currentMatcher && currentMatcher.matches(dirName, true)) {
						this.logService.trace('[ExtHostIndexing] skipping ignored directory', { relDir, dirName });
						return;
					}

					if (!folders.has(relDir)) {
						folders.add(relDir);
						await run(
							`INSERT OR REPLACE INTO folders(workspaceId, path, parentPath, status) VALUES(?,?,?,?)`,
							[workspaceId, relDir, parentRel, 'discovered']
						);
					}

					// Type guard: entries from readdir with withFileTypes are Dirent-like objects
					type DirentLike = { name: string; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean };
					for (const entry of entries as DirentLike[]) {
						if (token.isCancellationRequested || hitFileScanLimit) {
							return;
						}
						const entryFsPath = deps.path.join(dirFsPath, entry.name);
						const entryName = entry.name;

						// Check if this entry is ignored.
						if (currentMatcher) {
							const isDir = entry.isDirectory();
							if (currentMatcher.matches(entryName, isDir)) {
								this.logService.trace('[ExtHostIndexing] skipping ignored entry', { entryName, isDir });
								continue;
							}
						}

						if (entry.isDirectory()) {
							await walk(rootId, rootFsPath, entryFsPath, relDir, currentMatcher);
						} else if (entry.isFile()) {
							const relFile = makeRelative(rootId, rootFsPath, entryFsPath);
							files.add(relFile);
							// Progress tracking (verbose logging removed)
							if (files.size >= MAX_FILES_PER_FULL_SCAN) {
								hitFileScanLimit = true;
								this.logService.warn('[ExtHostIndexing] file-tree index file limit reached', {
									workspaceId,
									limit: MAX_FILES_PER_FULL_SCAN
								});
								return;
							}
						}
					}
				} catch (e) {
					this.logService.trace('[ExtHostIndexing] skipping path during walk', dirFsPath, e);
				}
			};

			for (const root of roots) {
				const rootUri = URI.revive(root);
				if (rootUri.scheme !== 'file') {
					const reason = `Non-file root URI not supported: ${rootUri.toString()}`;
					this.logService.error('[ExtHostIndexing] file-tree index failed', reason);
					throw new Error('Local file workspaces only');
				}
				const folderUri = rootUri;
				const rootId = makeRootId(folderUri);
				rootMap.set(rootId, folderUri.fsPath);

				// Persist root mapping for diagnostics and future migrations.
				await run(
					`INSERT OR REPLACE INTO roots(workspaceId, rootId, uri) VALUES(?,?,?)`,
					[workspaceId, rootId, folderUri.toString()]
				);

				await walk(rootId, folderUri.fsPath, folderUri.fsPath, null);
			}

			// Upsert metadata for each file. Full-tree scan is non-destructive with
			// respect to content index state: we only insert missing files as
			// discovered and update mtime/size/folderPath, but we NEVER overwrite
			// existing hash/status/lastIndexedTime.
			let insertedCount = 0;
			for (const relPath of files) {
				// Phase 10: Time budget check
				if (Date.now() - startTime > FULL_SCAN_TIME_BUDGET_MS) {
					this.logService.warn('[ExtHostIndexing] full scan time budget exceeded', { workspaceId, elapsed: Date.now() - startTime });
					hitFileScanLimit = true;
					await this.updateIndexState(db, workspaceId, {
						state: 'degraded',
						degradedReason: 'Time budget exceeded'
					});
					break;
				}
				if (token.isCancellationRequested) {
					break;
				}
				try {
					// Resolve absolute path from workspace + relative path.
					const [rootSegment, ...restParts] = relPath.split('/');
					const rootFsPath = rootMap.get(rootSegment);
					if (!rootFsPath) {
						this.logService.trace('[ExtHostIndexing] skipping file with unknown rootId', { relPath, rootSegment });
						continue;
					}
					const absPath = restParts.length ? deps.path.join(rootFsPath, ...restParts) : rootFsPath;

					const stat = await deps.fs.promises.stat(absPath);
					const mtime = stat.mtimeMs ?? stat.mtime?.getTime() ?? Date.now();
					const size = stat.size ?? 0;
					const folderPath = relPath.includes('/') ? relPath.substring(0, relPath.lastIndexOf('/')) : '';
					await run(
						`INSERT INTO files(workspaceId, path, folderPath, mtime, size, languageId, hash, status, lastIndexedTime)
						 VALUES(?,?,?,?,?,?,NULL,'discovered',NULL)
						 ON CONFLICT(workspaceId, path) DO UPDATE SET
							folderPath=excluded.folderPath,
							mtime=excluded.mtime,
							size=excluded.size`,
						[workspaceId, relPath, folderPath, mtime, size, undefined]
					);
					insertedCount++;
					// Progress tracking (verbose logging removed)
				} catch (e) {
					this.logService.trace('[ExtHostIndexing] failed to index file', relPath, e);
				}
			}

			// Soft-delete files that no longer exist on disk. We mark them as
			// deleted=1 and remove their chunks and embeddings; row compaction
			// can happen later. If the file scan limit was reached we skip this
			// reconciliation step to avoid incorrectly deleting files that were
			// not visited due to the safety cap.
			if (!hitFileScanLimit) {
				const knownFiles = await all<{ path: string }>(`SELECT path FROM files WHERE workspaceId=?`, [workspaceId]);
				for (const row of knownFiles) {
					if (!files.has(row.path)) {
						try {
							await run(`DELETE FROM chunks WHERE workspaceId=? AND filePath=?`, [workspaceId, row.path]);
							await run(`DELETE FROM embeddings WHERE workspaceId=? AND filePath=?`, [workspaceId, row.path]);
							// Vector index is now in embeddings table (BLOB column), no separate table needed.
							await run(`UPDATE files SET deleted=1 WHERE workspaceId=? AND path=?`, [workspaceId, row.path]);
						} catch (e) {
							this.logService.error('[ExtHostIndexing] failed to delete stale file', row.path, e);
							throw e;
						}
					}
				}

				// Remove folders that no longer exist on disk.
				const knownFolders = await all<{ path: string }>(`SELECT path FROM folders WHERE workspaceId=?`, [workspaceId]);
				for (const row of knownFolders) {
					if (!folders.has(row.path)) {
						try {
							await run(`DELETE FROM folders WHERE workspaceId=? AND path=?`, [workspaceId, row.path]);
						} catch (e) {
							this.logService.error('[ExtHostIndexing] failed to delete stale folder', row.path, e);
							throw e;
						}
					}
				}
			} else {
				this.logService.warn('[ExtHostIndexing] skipped stale file/folder reconciliation due to file scan limit', {
					workspaceId,
					limit: MAX_FILES_PER_FULL_SCAN
				});
			}

			// Update workspace metadata.
			const now = Date.now();
			await run(
				`INSERT OR REPLACE INTO workspaces(id, lastIndexedTime, schemaVersion) VALUES(?,?,?)`,
				[workspaceId, now, CURRENT_SCHEMA_VERSION]
			);

			// Compute counts from the DB.
			const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND (deleted IS NULL OR deleted=0)`, [workspaceId]);
			const indexedRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND status='indexed' AND (deleted IS NULL OR deleted=0)`, [workspaceId]);
			const discoveredRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND (status='discovered' OR status IS NULL) AND (deleted IS NULL OR deleted=0)`, [workspaceId]);
			const chunkRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM chunks WHERE workspaceId=?`, [workspaceId]);

			const totalFiles = totalRow?.c ?? 0;
			const indexedFiles = indexedRow?.c ?? 0;
			const discoveredFiles = discoveredRow?.c ?? 0;
			const totalChunks = chunkRow?.c ?? 0;

			this.logService.info('[ExtHostIndexing] indexFileTree: File counts computed', {
				workspaceId,
				totalFiles,
				indexedFiles,
				discoveredFiles,
				totalChunks
			});

			let embeddedChunks = 0;
			let embeddingModel: string | undefined;
			if (this.embeddingRuntime) {
				const embeddedRow = await get<{ c: number }>(
					`SELECT COUNT(*) as c FROM embeddings WHERE workspaceId=? AND embeddingModel=? AND embeddingVersion=?`,
					[workspaceId, this.embeddingRuntime.modelId, this.embeddingRuntime.version]
				);
				embeddedChunks = embeddedRow?.c ?? 0;
				embeddingModel = this.embeddingRuntime.modelId;
			}

			// Mark the workspace index as ready or degraded after a successful
			// full scan. Hitting the file scan limit is considered a degraded
			// state because parts of the tree may not have been visited.
			const finalState: IndexStateDto = hitFileScanLimit ? 'degraded' : 'ready';
			await this.updateIndexState(db, workspaceId, {
				state: finalState,
				lastFullScanTime: now,
				lastErrorCode: null,
				lastErrorMessage: null
			});

			// After setting lastFullScanTime, trigger a flush of any accumulated watcher events
			// that were collected before the full scan completed. This ensures we don't lose
			// file system events that occurred during the initial scan.
			if (this.pendingDirtyUris.size > 0 || this.pendingDeletedUris.size > 0) {
				this.logService.trace('[ExtHostIndexing] triggering watcher flush after full scan', {
					workspaceId,
					pendingDirty: this.pendingDirtyUris.size,
					pendingDeleted: this.pendingDeletedUris.size
				});
				// Schedule the flush asynchronously so it doesn't block the full scan completion
				setTimeout(() => {
					this.flushWatcherBatches().catch(err => {
						this.logService.error('[ExtHostIndexing] post-scan watcher flush failed', { workspaceId, err });
					});
				}, 100);
			}

			// Trigger vector index backfill if vector index is ready and backfill not completed.
			if (this.embeddingRuntime) {
				try {
					const isVectorReady = await this.isVectorIndexReady(db, workspaceId, this.embeddingRuntime, deps);
					if (isVectorReady) {
						const stateRow = await get<{ vectorBackfillComplete: number | null }>(
							`SELECT vectorBackfillComplete FROM index_state WHERE workspaceId=?`,
							[workspaceId]
						);
						if (stateRow?.vectorBackfillComplete !== 1) {
							// Backfill not completed. Trigger bounded backfill asynchronously.
							this.populateVectorIndexFromEmbeddings(db, workspaceId, this.embeddingRuntime, deps, {
								batchSize: VECTOR_BACKFILL_BATCH_SIZE,
								timeBudgetMs: VECTOR_BACKFILL_TIME_BUDGET_MS
							}).catch(err => {
								this.logService.error('[ExtHostIndexing] vector backfill failed in buildFullIndex', { workspaceId, err });
							});
						}
					}
				} catch (e) {
					// Vector index check failed, continue without backfill.
					this.logService.trace('[ExtHostIndexing] vector index check failed in buildFullIndex', e);
				}
			}

			const status: IndexStatusDto = {
				workspaceId,
				state: finalState,
				totalFiles,
				indexedFiles,
				totalChunks,
				lastIndexedTime: now,
				schemaVersion: CURRENT_SCHEMA_VERSION,
				embeddedChunks,
				embeddingModel
			};
			this.logService.info('[ExtHostIndexing] file-tree index completed', { dbPath, totalFiles });
			await exec('COMMIT;');

			// After full index completes, automatically start indexing discovered files in the background
			// This ensures files are actually indexed (not just discovered) after a full scan
			this.logService.info('[ExtHostIndexing] indexFileTree COMPLETED, checking if background indexing needed', {
				workspaceId,
				totalFiles,
				indexedFiles,
				discoveredFiles: totalFiles - indexedFiles,
				totalChunks
			});
			if (totalFiles > indexedFiles) {
				this.logService.info('[ExtHostIndexing] STARTING background indexing', {
					workspaceId,
					totalFiles,
					indexedFiles,
					discoveredFiles: totalFiles - indexedFiles
				});
				this.logService.info('[ExtHostIndexing] triggering background indexing of discovered files', {
					workspaceId,
					totalFiles,
					indexedFiles,
					discoveredFiles: totalFiles - indexedFiles
				});
				// Create a cancellable token for background indexing
				const tokenSource = new CancellationTokenSource();
				this.backgroundIndexingTokens.set(workspaceId, tokenSource);
				// Process discovered files asynchronously in batches
				this.processDiscoveredFiles(workspaceId, tokenSource.token).catch((err: unknown) => {
					if (!tokenSource.token.isCancellationRequested) {
						const message = err instanceof Error ? err.message : String(err);
						this.logService.error('[ExtHostIndexing] background indexing of discovered files failed', { workspaceId, message });
					}
				});
			} else {
				this.logService.info('[ExtHostIndexing] NO background indexing needed - all files already indexed', {
					workspaceId,
					totalFiles,
					indexedFiles,
					totalChunks
				});
			}

			this.logService.info('[ExtHostIndexing] indexFileTree RETURNING status', {
				workspaceId,
				state: status.state,
				totalFiles: status.totalFiles,
				indexedFiles: status.indexedFiles,
				totalChunks: status.totalChunks,
				embeddedChunks: status.embeddedChunks
			});
			return status;
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] file-tree index failed', { dbPath, message });
			try {
				await exec('ROLLBACK;');
			} catch {
				// ignore rollback errors
			}
			// Persist an error state for this workspace so callers can surface a
			// degraded index instead of assuming success.
			try {
				await this.updateIndexState(db, workspaceId, {
					state: 'error',
					lastErrorCode: 'FullIndexFailed',
					lastErrorMessage: message
				});
			} catch {
				// ignore secondary failures
			}
			throw e;
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	async $buildFullIndex(workspaceId: string, roots: UriComponents[], token: CancellationToken): Promise<IndexStatusDto> {
		this.logService.info('[ExtHostIndexing] $buildFullIndex called', { workspaceId, rootCount: roots.length });
		// Phase 10: Feature gate check
		if (!this.isFeatureEnabled('indexing')) {
			this.logService.info('[ExtHostIndexing] indexing disabled via feature gate', { workspaceId });
			return { workspaceId, state: 'idle' };
		}

		// Phase 10: Concurrency limit check
		if (this.activeFullScans >= MAX_CONCURRENT_FULL_SCANS) {
			this.logService.warn('[ExtHostIndexing] full scan rejected: concurrency limit exceeded', { workspaceId, active: this.activeFullScans });
			return { workspaceId, state: 'degraded', degradedReason: 'Concurrency limit exceeded' };
		}

		this.activeFullScans++;
		try {
			const result = await this.indexFileTree(workspaceId, roots, token);
			return result;
		} finally {
			this.activeFullScans--;
		}
	}

	async $refreshPaths(workspaceId: string, uris: UriComponents[], token: CancellationToken): Promise<IndexStatusDto> {
		// Delegate to the incremental saved-file indexer so that we do not
		// rebuild the full tree unless explicitly requested.
		return this.$indexSavedFiles(workspaceId, uris, token);
	}

	/**
	 * Background process to index discovered files in batches.
	 * This is called automatically after buildFullIndex completes.
	 */
	private async processDiscoveredFiles(workspaceId: string, token: CancellationToken): Promise<void> {
		this.logService.info('[ExtHostIndexing] processDiscoveredFiles STARTED', { workspaceId });

		const deps = getNodeDeps();
		if (!deps) {
			this.logService.warn('[ExtHostIndexing] processDiscoveredFiles EARLY RETURN: Node deps unavailable', { workspaceId });
			return;
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		const BATCH_SIZE = 50; // Process 50 files at a time
		const MAX_BATCHES = 200; // Limit to 10,000 files per run to avoid overwhelming the system

		let db: SqliteDatabase | undefined;
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T[]>((resolve, reject) => db!.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const close = () => new Promise<void>((resolve, reject) => db?.close(err => err ? reject(err) : resolve()));

		try {
			db = await openDatabaseWithRetry(deps.sqlite, dbPath);
			await this.ensureSchema(db, deps);
			this.logService.info('[ExtHostIndexing] processDiscoveredFiles: Database opened and schema ensured', { workspaceId });

			let processedBatches = 0;
			let totalProcessed = 0;

			while (processedBatches < MAX_BATCHES && !token.isCancellationRequested) {
				// Check if workspace is paused or rebuilding before each batch
				const paused = await this.isWorkspacePaused(db, workspaceId);
				if (paused) {
					this.logService.info('[ExtHostIndexing] background indexing paused, stopping', { workspaceId });
					break;
				}

				const rebuilding = await this.isWorkspaceRebuilding(db, workspaceId);
				if (rebuilding) {
					this.logService.info('[ExtHostIndexing] background indexing stopped: workspace rebuilding', { workspaceId });
					break;
				}

				// Skip batch if manual sync is active (yield to manual operations)
				if (this.activeFullScans > 0) {
					this.logService.trace('[ExtHostIndexing] background indexing yielding to manual sync', { workspaceId });
					// Wait a bit and check again
					await new Promise(resolve => setTimeout(resolve, 500));
					continue;
				}

				// Get next batch of discovered files
				const rows = await all<{ path: string }>(
					`SELECT path FROM files
					 WHERE workspaceId=? AND (status='discovered' OR status IS NULL) AND (deleted IS NULL OR deleted=0)
					 ORDER BY path LIMIT ?`,
					[workspaceId, BATCH_SIZE]
				);

				if (!rows.length) {
					// No more discovered files to process
					break;
				}

				// Convert paths to URIs
				const uris: UriComponents[] = [];
				for (const row of rows) {
					const uri = this.uriFromWorkspaceRelativePath(row.path, deps);
					if (uri) {
						uris.push(uri.toJSON());
					}
				}

				if (uris.length > 0) {
					// Index this batch (use the cancellable token)
					await this.$indexSavedFiles(workspaceId, uris, token);
					totalProcessed += uris.length;
					this.logService.trace('[ExtHostIndexing] background indexing: processed batch', {
						workspaceId,
						batchSize: uris.length,
						totalProcessed,
						batchNumber: processedBatches + 1
					});
				}

				processedBatches++;

				// Small delay between batches to avoid overwhelming the system
				if (processedBatches < MAX_BATCHES && !token.isCancellationRequested) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}

			if (totalProcessed > 0) {
				this.logService.info('[ExtHostIndexing] background indexing of discovered files completed', {
					workspaceId,
					totalProcessed,
					batches: processedBatches
				});
			}
		} catch (e) {
			// Don't log cancellation as an error
			if (token.isCancellationRequested) {
				this.logService.info('[ExtHostIndexing] background indexing cancelled', { workspaceId });
			} else {
				const message = e instanceof Error ? e.message : String(e);
				this.logService.error('[ExtHostIndexing] processDiscoveredFiles failed', { workspaceId, message });
			}
		} finally {
			// Clean up token tracking
			this.backgroundIndexingTokens.delete(workspaceId);
			if (db) {
				try {
					await close();
				} catch {
					// ignore close errors
				}
			}
		}
	}

	private async devIndexFirstNFiles(workspaceId: string, n: number): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			this.logService.error('[ExtHostIndexing] devIndexFirstNFiles: sqlite not available');
			return;
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		try {
			const rows = await all<{ path: string }>(
				`SELECT path FROM files WHERE workspaceId=? AND status='discovered' LIMIT ?`,
				[workspaceId, n]
			);
			if (!rows.length) {
				this.logService.info('[ExtHostIndexing] devIndexFirstNFiles: no discovered files to index', { workspaceId });
				return;
			}

			const uris: UriComponents[] = [];
			for (const row of rows) {
				const uri = this.uriFromWorkspaceRelativePath(row.path, deps);
				if (!uri) {
					this.logService.trace('[ExtHostIndexing] devIndexFirstNFiles: could not resolve URI for relative path', row.path);
					continue;
				}
				uris.push(uri.toJSON());
			}

			if (!uris.length) {
				return;
			}

			await this.$indexSavedFiles(workspaceId, uris, CancellationToken.None);
		} catch (e) {
			this.logService.error('[ExtHostIndexing] devIndexFirstNFiles error', e);
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	private async devGetVerificationSnapshot(db: SqliteDatabase, workspaceId: string): Promise<{
		totalFiles: number;
		indexedFiles: number;
		totalChunks: number;
		discoveredFilesCount: number;
		deletedFilesCount: number;
	}> {
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));

		const totalRow = await get<{ c: number }>(
			`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND (deleted IS NULL OR deleted=0)`,
			[workspaceId]
		);
		const indexedRow = await get<{ c: number }>(
			`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND status='indexed' AND (deleted IS NULL OR deleted=0)`,
			[workspaceId]
		);
		const discoveredRow = await get<{ c: number }>(
			`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND status='discovered' AND (deleted IS NULL OR deleted=0)`,
			[workspaceId]
		);
		const deletedRow = await get<{ c: number }>(
			`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND deleted=1`,
			[workspaceId]
		);
		const chunkRow = await get<{ c: number }>(
			`SELECT COUNT(*) as c FROM chunks WHERE workspaceId=?`,
			[workspaceId]
		);

		return {
			totalFiles: totalRow?.c ?? 0,
			indexedFiles: indexedRow?.c ?? 0,
			totalChunks: chunkRow?.c ?? 0,
			discoveredFilesCount: discoveredRow?.c ?? 0,
			deletedFilesCount: deletedRow?.c ?? 0
		};
	}

	async $devRunE2EIndexTest(workspaceId: string, roots: UriComponents[], token: CancellationToken): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing][E2E] failed - native deps missing', reason);
			throw new Error(reason);
		}

		if (token.isCancellationRequested) {
			throw new Error('[ExtHostIndexing][E2E] cancelled before start');
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		// 1+2+3: build full index then get status
		const beforeStatus = await this.$buildFullIndex(workspaceId, roots, token);
		const statusBefore = await this.$getStatus(workspaceId);

		// Open DB once for the rest of the test.
		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		try {
			const snapshotBefore = await this.devGetVerificationSnapshot(db, workspaceId);

			this.logService.info('[ExtHostIndexing][E2E] status.before', {
				workspaceId,
				fromBuild: beforeStatus,
				totalFiles: statusBefore.totalFiles,
				indexedFiles: statusBefore.indexedFiles,
				totalChunks: statusBefore.totalChunks,
				lastIndexedTime: statusBefore.lastIndexedTime,
				schemaVersion: statusBefore.schemaVersion,
				discoveredFilesCount: snapshotBefore.discoveredFilesCount,
				deletedFilesCount: snapshotBefore.deletedFilesCount
			});

			// 5: first N discovered files (N=3)
			const N = 3;
			let rows = await all<{ path: string }>(
				`SELECT path FROM files WHERE workspaceId=? AND status='discovered' AND (deleted IS NULL OR deleted=0) ORDER BY path LIMIT ?`,
				[workspaceId, N]
			);
			if (!rows.length && snapshotBefore.totalFiles > 0) {
				// Fallback: pick files that are not yet indexed, even if status
				// was not explicitly marked as discovered.
				rows = await all<{ path: string }>(
					`SELECT path FROM files WHERE workspaceId=? AND (status IS NULL OR status!='indexed') AND (deleted IS NULL OR deleted=0) ORDER BY path LIMIT ?`,
					[workspaceId, N]
				);
			}
			if (!rows.length) {
				this.logService.error('[ExtHostIndexing][E2E] FAIL: no discovered/unindexed files to index', { workspaceId });
				throw new Error('No discovered files available for E2E test');
			}

			const uris: UriComponents[] = [];
			for (const row of rows) {
				const uri = this.uriFromWorkspaceRelativePath(row.path, deps);
				if (!uri) {
					this.logService.error('[ExtHostIndexing][E2E] could not resolve URI for relative path', { path: row.path });
					continue;
				}
				uris.push(uri.toJSON());
			}

			if (!uris.length) {
				this.logService.error('[ExtHostIndexing][E2E] FAIL: resolved 0 URIs from discovered files', { workspaceId });
				throw new Error('No resolvable discovered file URIs for E2E test');
			}

			// 7: index the selected files
			const beforeIndexedFiles = statusBefore.indexedFiles ?? 0;
			const beforeTotalChunks = statusBefore.totalChunks ?? 0;

			await this.$indexSavedFiles(workspaceId, uris, token);

			// 8: get status again
			const statusAfter = await this.$getStatus(workspaceId);
			const snapshotAfter = await this.devGetVerificationSnapshot(db, workspaceId);

			const afterIndexedFiles = statusAfter.indexedFiles ?? 0;
			const afterTotalChunks = statusAfter.totalChunks ?? 0;
			const deltaIndexed = afterIndexedFiles - beforeIndexedFiles;
			const deltaChunks = afterTotalChunks - beforeTotalChunks;

			// 9: diff-style log block
			this.logService.info('[ExtHostIndexing][E2E] diff', {
				workspaceId,
				indexedFiles: { before: beforeIndexedFiles, after: afterIndexedFiles, delta: deltaIndexed },
				totalChunks: { before: beforeTotalChunks, after: afterTotalChunks, delta: deltaChunks },
				beforeSnapshot: snapshotBefore,
				afterSnapshot: snapshotAfter
			});

			// DB state survives restart: $getStatus always opens a fresh connection,
			// so a second call after the operations verifies persisted counts.
			const verifyStatus = await this.$getStatus(workspaceId);

			const passIndexed = deltaIndexed === uris.length;
			const passChunks = (statusAfter.totalChunks ?? 0) > 0;
			const passPersist =
				verifyStatus.indexedFiles === statusAfter.indexedFiles &&
				verifyStatus.totalChunks === statusAfter.totalChunks;

			if (passIndexed && passChunks && passPersist) {
				this.logService.info('[ExtHostIndexing][E2E] PASS', {
					workspaceId,
					N: uris.length,
					indexedFilesBefore: beforeIndexedFiles,
					indexedFilesAfter: afterIndexedFiles,
					totalChunksBefore: beforeTotalChunks,
					totalChunksAfter: afterTotalChunks
				});
			} else {
				this.logService.error('[ExtHostIndexing][E2E] FAIL', {
					workspaceId,
					N: uris.length,
					indexedFilesBefore: beforeIndexedFiles,
					indexedFilesAfter: afterIndexedFiles,
					totalChunksBefore: beforeTotalChunks,
					totalChunksAfter: afterTotalChunks,
					passIndexed,
					passChunks,
					passPersist
				});
				throw new Error('E2E verification failed');
			}
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	/**
	 * Queries the vector index using sqlite-vector nearest-neighbor search.
	 * Returns array of {filePath, chunkId, distance} sorted by distance (ascending).
	 * Returns empty array on error (triggers TS fallback).
	 */
	private async queryVectorIndex(
		db: SqliteDatabase,
		workspaceId: string,
		queryVec: number[],
		model: string,
		version: string,
		topK: number,
		deps: SqliteDeps
	): Promise<Array<{ filePath: string; chunkId: string; distance: number }>> {
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));

		const k = Math.max(1, Math.min(topK, MAX_TOP_K));
		const timeoutMs = 5000; // 5 second timeout
		const startTime = Date.now();

		try {
			// Dimension validation in TypeScript first - enforce expected dimensions before query.
			// This ensures we don't pass invalid vectors to sqlite-vector.
			if (queryVec.length === 0) {
				this.logService.error('[ExtHostIndexing][VectorQuery] empty query vector', { workspaceId });
				return [];
			}

			// Convert query vector to float32 array with validation.
			const queryFloat32 = new Float32Array(queryVec.length);
			for (let i = 0; i < queryVec.length; i++) {
				const v = Number(queryVec[i]);
				if (!Number.isFinite(v)) {
					this.logService.error('[ExtHostIndexing][VectorQuery] invalid query vector value', { index: i, workspaceId });
					return [];
				}
				queryFloat32[i] = v;
			}

			const vectorBlob = Buffer.from(queryFloat32.buffer);
			let vectorResults: Array<{ filePath: string; chunkId: string; distance: number }> = [];

			// Use sqlite-vector scalar functions on embeddings table BLOB column.
			// sqlite-vector provides vector_cosine_distance(), vector_l2_distance(), etc.
			// We use cosine distance for semantic similarity.
			try {
				const distanceRows = await all<{ filePath: string; chunkId: string; distance: number }>(
					`SELECT filePath, chunkId,
					 vector_cosine_distance(vector, ?) as distance
					 FROM embeddings
					 WHERE workspaceId=? AND embeddingModel=? AND embeddingVersion=?
					   AND vector IS NOT NULL
					 ORDER BY distance ASC
					 LIMIT ?`,
					[vectorBlob, workspaceId, model, version, k]
				);

				if (distanceRows.length > 0) {
					vectorResults = distanceRows;
				}
			} catch (e) {
				// Scalar function query failed - sqlite-vector may not be properly loaded or vector column not in BLOB format.
				const errMsg = e instanceof Error ? e.message : String(e);
				this.logService.trace('[ExtHostIndexing] vector_cosine_distance query failed', { error: errMsg });
				// Return empty to trigger TS fallback.
				return [];
			}

			// Check timeout.
			const elapsed = Date.now() - startTime;
			if (elapsed > timeoutMs) {
				this.logService.warn('[ExtHostIndexing][VectorQuery] query exceeded timeout', {
					workspaceId,
					elapsedMs: elapsed,
					timeoutMs
				});
				// Return partial results if available.
			}

			return vectorResults;
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing][VectorQuery] vector query failed', { workspaceId, message });
			return [];
		}
	}

	async $querySimilarChunksInternal(workspaceId: string, query: string, topK: number): Promise<DevSimilarChunkHitDto[]> {
		// Phase 10: Feature gate check
		if (!this.isFeatureEnabled('retrieval')) {
			this.logService.info('[ExtHostIndexing] retrieval disabled via feature gate', { workspaceId });
			return [];
		}

		const deps = getNodeDeps();
		if (!deps) {
			this.logService.error('[ExtHostIndexing][DevQuery] sqlite deps missing');
			return [];
		}

		const runtime = this.embeddingRuntime;
		if (!runtime) {
			this.logService.error('[ExtHostIndexing][DevQuery] embedding runtime not available');
			return [];
		}

		const trimmed = (query ?? '').trim();
		if (!trimmed) {
			this.logService.info('[ExtHostIndexing][DevQuery] empty query; returning 0 results');
			return [];
		}

		const k = Math.max(1, Math.min(typeof topK === 'number' && Number.isFinite(topK) ? Math.floor(topK) : 10, MAX_TOP_K));

		// Phase 10: Time budget tracking
		const startTime = Date.now();

		let queryVectors: number[][];
		try {
			queryVectors = await runtime.embed([trimmed], CancellationToken.None);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing][DevQuery] embedding runtime failed for query', { workspaceId, message });
			return [];
		}

		if (!Array.isArray(queryVectors) || queryVectors.length === 0 || !Array.isArray(queryVectors[0])) {
			this.logService.error('[ExtHostIndexing][DevQuery] embedding runtime returned invalid vector');
			return [];
		}

		const queryVec = queryVectors[0];
		if (!queryVec.length) {
			this.logService.error('[ExtHostIndexing][DevQuery] query embedding is empty');
			return [];
		}

		const queryNorm = norm(queryVec);
		if (!Number.isFinite(queryNorm) || queryNorm === 0) {
			this.logService.error('[ExtHostIndexing][DevQuery] query embedding norm is zero/non-finite');
			return [];
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		// Check if vector index is ready and use it if available.
		let isVectorReady = false;
		try {
			isVectorReady = await this.isVectorIndexReady(db, workspaceId, runtime, deps);
		} catch {
			// Detection failed, fall back to TS scan.
		}

		const hits: InternalHit[] = [];
		let scanned = 0;

		if (isVectorReady) {
			// Use sqlite-vector retrieval path.
			try {
				const vectorResults = await this.queryVectorIndex(db, workspaceId, queryVec, runtime.modelId, runtime.version, k, deps);
				scanned = vectorResults.length;

				// Convert distances to cosine similarities.
				// Note: sqlite-vector may return L2 distance, cosine distance, or other metrics.
				// For now, we assume it returns a distance metric where lower = more similar.
				// We'll convert to cosine similarity by normalizing: similarity = 1 - (distance / max_distance).
				// If distance is already cosine distance, similarity = 1 - distance.
				// This is a heuristic; exact conversion depends on sqlite-vector's distance function.
				for (const result of vectorResults) {
					// For cosine distance: similarity = 1 - distance (clamped to [0, 1]).
					// For L2 distance: we'd need to normalize differently.
					// For now, assume cosine distance and convert.
					const distance = result.distance;
					const cosineSim = Math.max(0, Math.min(1, 1 - distance));
					hits.push({
						filePath: result.filePath,
						chunkId: result.chunkId,
						cosineSimilarity: cosineSim
					});
				}

				this.logService.trace('[ExtHostIndexing][DevQuery] vector search completed', {
					workspaceId,
					queryLength: trimmed.length,
					topK: k,
					resultCount: hits.length
				});
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				this.logService.warn('[ExtHostIndexing][DevQuery] vector search failed, falling back to TS scan', { workspaceId, message });
				// Fall through to TS cosine scan below.
				isVectorReady = false;
			}
		}

		if (!isVectorReady || hits.length === 0) {
			// Use TypeScript cosine scan fallback (existing implementation).
			const pageSize = 256;
			let lastRowId = 0;
			scanned = 0;

			try {
				// Fast path: if there are no embeddings at all for this workspace/model,
				// bail out early.
				const countRow = await get<{ c: number }>(
					`SELECT COUNT(*) as c FROM embeddings WHERE workspaceId=? AND embeddingModel=? AND embeddingVersion=?`,
					[workspaceId, runtime.modelId, runtime.version]
				);
				if (!countRow || (countRow.c ?? 0) === 0) {
					this.logService.info('[ExtHostIndexing][DevQuery] no embeddings for workspace/model', {
						workspaceId,
						embeddingModel: runtime.modelId,
						embeddingVersion: runtime.version
					});
					return [];
				}

				for (; ;) {
					// Phase 10: Time budget check
					const elapsed = Date.now() - startTime;
					if (elapsed > RETRIEVAL_QUERY_TIME_BUDGET_MS) {
						this.logService.warn('[ExtHostIndexing][DevQuery] retrieval query time budget exceeded', {
							workspaceId,
							elapsedMs: elapsed,
							scanned
						});
						break;
					}

					if (scanned >= MAX_EMBEDDINGS_PER_QUERY) {
						this.logService.warn('[ExtHostIndexing][DevQuery] embedding scan limit reached; truncating results', {
							workspaceId,
							scanned,
							maxEmbeddingsPerQuery: MAX_EMBEDDINGS_PER_QUERY
						});
						break;
					}
					const rows = await all<{
						id: number;
						filePath: string;
						chunkId: string;
						vector: Buffer | string | null;
					}>(
						`SELECT rowid as id, filePath, chunkId, vector
					 FROM embeddings
					 WHERE workspaceId=? AND embeddingModel=? AND embeddingVersion=? AND rowid>?
					 ORDER BY rowid
					 LIMIT ?`,
						[workspaceId, runtime.modelId, runtime.version, lastRowId, pageSize]
					);

					if (!rows.length) {
						break;
					}

					for (const row of rows) {
						lastRowId = row.id;
						if (!row.vector) {
							continue;
						}

						let raw: string;
						if (row.vector instanceof Buffer) {
							raw = row.vector.toString('utf8');
						} else {
							raw = String(row.vector);
						}

						let parsed: unknown;
						try {
							parsed = JSON.parse(raw);
						} catch {
							this.logService.error('[ExtHostIndexing][DevQuery] failed to parse embedding vector JSON', { workspaceId, filePath: row.filePath, chunkId: row.chunkId });
							continue;
						}

						if (!Array.isArray(parsed)) {
							continue;
						}

						const vec: number[] = [];
						for (let i = 0; i < parsed.length; i++) {
							const v = Number(parsed[i]);
							if (!Number.isFinite(v)) {
								continue;
							}
							vec.push(v);
						}

						if (!vec.length || vec.length !== queryVec.length) {
							continue;
						}

						const score = cosineSimilarityWithQueryNorm(queryVec, queryNorm, vec);
						if (!Number.isFinite(score)) {
							continue;
						}

						const hit: InternalHit = {
							filePath: row.filePath,
							chunkId: row.chunkId,
							cosineSimilarity: score
						};
						if (hits.length < k) {
							hits.push(hit);
							hits.sort(compareCosineOnly);
						} else {
							const worst = hits[hits.length - 1];
							if (compareCosineOnly(hit, worst) < 0) {
								hits[hits.length - 1] = hit;
								hits.sort(compareCosineOnly);
							}
						}

						scanned++;
					}
				}
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				this.logService.error('[ExtHostIndexing][DevQuery] TS scan failed', { workspaceId, message });
				// Continue with whatever hits we have (may be empty).
			}
		}

		if (!hits.length) {
			this.logService.info('[ExtHostIndexing][DevQuery] no embedding candidates found', { workspaceId, scanned });
			return [];
		}

		let results: DevSimilarChunkHitDto[];
		try {
			try {
				// Resolve additional metadata for ranking signals and snippets
				// from the chunks and files tables for the top-K hits.
				const whereParts: string[] = [];
				const params: SqliteParams = [workspaceId];
				for (const h of hits) {
					whereParts.push('(filePath=? AND chunkId=?)');
					params.push(h.filePath, h.chunkId);
				}

				const chunkRows = await all<{ filePath: string; chunkId: string; content: string | null; startLine: number; endLine: number }>(
					`SELECT filePath, chunkId, content, startLine, endLine
					 FROM chunks
					 WHERE workspaceId=? AND (${whereParts.join(' OR ')})`,
					params
				);

				const contentMap = new Map<string, { content: string; length: number }>();
				for (const row of chunkRows) {
					const key = `${row.filePath}|${row.chunkId}`;
					const text = row.content ?? '';
					const length = Math.max(1, (row.endLine ?? 0) - (row.startLine ?? 0) + 1);
					contentMap.set(key, { content: text, length });
				}

				// Fetch file-level lastIndexedTime for recency.
				const filePaths = Array.from(new Set(hits.map(h => h.filePath)));
				const fileParams: SqliteParams = [workspaceId, ...filePaths];
				const placeholders = filePaths.map(() => '?').join(',');
				const fileRows = await all<{ path: string; lastIndexedTime: number | null }>(
					`SELECT path, lastIndexedTime FROM files WHERE workspaceId=? AND path IN (${placeholders})`,
					fileParams
				);
				const fileTimeMap = new Map<string, number | null>();
				for (const row of fileRows) {
					fileTimeMap.set(row.path, row.lastIndexedTime ?? null);
				}

				// Compute ranking signals and composite scores.
				const now = Date.now();
				const fileHitCounts = new Map<string, number>();
				for (const h of hits) {
					fileHitCounts.set(h.filePath, (fileHitCounts.get(h.filePath) ?? 0) + 1);
				}

				for (const h of hits) {
					const key = `${h.filePath}|${h.chunkId}`;
					const contentInfo = contentMap.get(key);
					const length = contentInfo?.length ?? 0;
					const lengthPenalty = computeChunkLengthPenalty(length);
					const depthPenalty = computeFilePathDepthPenalty(h.filePath);
					const lastIndexedTime = fileTimeMap.get(h.filePath) ?? null;
					const recency = computeRecencyBoost(lastIndexedTime, now);
					const sameFile = computeSameFileBoost(fileHitCounts.get(h.filePath) ?? 1);

					h.chunkLength = length;
					h.fileLastIndexedTime = lastIndexedTime;
					h.chunkLengthPenalty = lengthPenalty;
					h.filePathDepthPenalty = depthPenalty;
					h.recencyBoost = recency;
					h.sameFileBoost = sameFile;

					h.compositeScore =
						W_COSINE * h.cosineSimilarity +
						W_RECENCY * recency +
						W_SAME_FILE * sameFile -
						W_LENGTH * lengthPenalty -
						W_DEPTH * depthPenalty;
				}

				// Sort by composite score with deterministic tie-breakers.
				hits.sort(compareComposite);

				const maxSnippetLength = 400;
				results = hits.map(hit => {
					const key = `${hit.filePath}|${hit.chunkId}`;
					const contentInfo = contentMap.get(key);
					const content = contentInfo?.content ?? '';
					const snippet = content ? content.substring(0, maxSnippetLength) : undefined;
					return {
						filePath: hit.filePath,
						chunkId: hit.chunkId,
						similarityScore: hit.cosineSimilarity,
						compositeScore: hit.compositeScore,
						chunkLengthPenalty: hit.chunkLengthPenalty,
						filePathDepthPenalty: hit.filePathDepthPenalty,
						recencyBoost: hit.recencyBoost,
						sameFileBoost: hit.sameFileBoost,
						snippet
					};
				});
			} catch (signalError) {
				const message = signalError instanceof Error ? signalError.message : String(signalError);
				this.logService.error('[ExtHostIndexing][DevQuery] signal computation failed; falling back to cosine-only', {
					workspaceId,
					message
				});

				// Fallback: cosine-only ranking and snippets from chunks, without
				// any additional signals.
				hits.sort(compareCosineOnly);

				const wherePartsFallback: string[] = [];
				const paramsFallback: SqliteParams = [workspaceId];
				for (const h of hits) {
					wherePartsFallback.push('(filePath=? AND chunkId=?)');
					paramsFallback.push(h.filePath, h.chunkId);
				}

				const chunkRowsFallback = await all<{ filePath: string; chunkId: string; content: string | null }>(
					`SELECT filePath, chunkId, content
				 FROM chunks
				 WHERE workspaceId=? AND (${wherePartsFallback.join(' OR ')})`,
					paramsFallback
				);

				const contentMapFallback = new Map<string, string>();
				for (const row of chunkRowsFallback) {
					const key = `${row.filePath}|${row.chunkId}`;
					contentMapFallback.set(key, row.content ?? '');
				}

				const maxSnippetLength = 400;
				results = hits.map(hit => {
					const key = `${hit.filePath}|${hit.chunkId}`;
					const content = contentMapFallback.get(key) ?? '';
					const snippet = content ? content.substring(0, maxSnippetLength) : undefined;
					return {
						filePath: hit.filePath,
						chunkId: hit.chunkId,
						similarityScore: hit.cosineSimilarity,
						snippet
					};
				});
			}

			this.logService.info('[ExtHostIndexing][DevQuery] completed', {
				workspaceId,
				queryLength: trimmed.length,
				topK: k,
				scanned,
				resultCount: results.length,
				embeddingModel: runtime.modelId,
				embeddingVersion: runtime.version,
				hits: results.map(r => ({
					filePath: r.filePath,
					chunkId: r.chunkId,
					similarityScore: Number.isFinite(r.similarityScore) ? Number(r.similarityScore.toFixed(6)) : r.similarityScore,
					compositeScore: typeof r.compositeScore === 'number' && Number.isFinite(r.compositeScore) ? Number(r.compositeScore.toFixed(6)) : r.compositeScore,
					chunkLengthPenalty: typeof r.chunkLengthPenalty === 'number' ? Number(r.chunkLengthPenalty.toFixed(6)) : r.chunkLengthPenalty,
					filePathDepthPenalty: typeof r.filePathDepthPenalty === 'number' ? Number(r.filePathDepthPenalty.toFixed(6)) : r.filePathDepthPenalty,
					recencyBoost: typeof r.recencyBoost === 'number' ? Number(r.recencyBoost.toFixed(6)) : r.recencyBoost,
					sameFileBoost: typeof r.sameFileBoost === 'number' ? Number(r.sameFileBoost.toFixed(6)) : r.sameFileBoost
				}))
			});

			return results;
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing][DevQuery] failed', { workspaceId, message });
			return [];
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	/**
	 * Dev-only method to compare retrieval results from vector search vs TS fallback.
	 * Logs comparison metrics including overlap, ordering differences, and timing.
	 */
	private async devCompareRetrievalPaths(workspaceId: string, query: string, topK: number): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			this.logService.error('[ExtHostIndexing][DevCompare] sqlite deps missing');
			return;
		}

		const runtime = this.embeddingRuntime;
		if (!runtime) {
			this.logService.error('[ExtHostIndexing][DevCompare] embedding runtime not available');
			return;
		}

		const trimmed = (query ?? '').trim();
		if (!trimmed) {
			this.logService.info('[ExtHostIndexing][DevCompare] empty query');
			return;
		}

		const k = Math.max(1, Math.min(typeof topK === 'number' && Number.isFinite(topK) ? Math.floor(topK) : 10, MAX_TOP_K));

		// Generate query embedding once.
		let queryVectors: number[][];
		try {
			queryVectors = await runtime.embed([trimmed], CancellationToken.None);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing][DevCompare] embedding runtime failed', { workspaceId, message });
			return;
		}

		if (!Array.isArray(queryVectors) || queryVectors.length === 0 || !Array.isArray(queryVectors[0])) {
			this.logService.error('[ExtHostIndexing][DevCompare] invalid query vector');
			return;
		}

		const queryVec = queryVectors[0];
		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		try {
			const isVectorReady = await this.isVectorIndexReady(db, workspaceId, runtime, deps);
			if (!isVectorReady) {
				this.logService.info('[ExtHostIndexing][DevCompare] vector index not ready, skipping comparison', { workspaceId });
				return;
			}

			// Run vector search.
			const vectorStart = Date.now();
			const vectorResults = await this.queryVectorIndex(db, workspaceId, queryVec, runtime.modelId, runtime.version, k, deps);
			const vectorTime = Date.now() - vectorStart;

			// Convert vector results to hit format for comparison.
			const vectorHits = vectorResults.map(r => ({
				filePath: r.filePath,
				chunkId: r.chunkId,
				key: `${r.filePath}|${r.chunkId}`
			}));

			// Run TS fallback (simulate by temporarily disabling vector index).
			// We'll call the actual retrieval method but force TS path by catching vector errors.
			const tsStart = Date.now();
			const tsResults = await this.$querySimilarChunksInternal(workspaceId, query, topK);
			const tsTime = Date.now() - tsStart;

			const tsHits = tsResults.map(r => ({
				filePath: r.filePath,
				chunkId: r.chunkId,
				key: `${r.filePath}|${r.chunkId}`
			}));

			// Compute overlap.
			const vectorSet = new Set(vectorHits.map(h => h.key));
			const tsSet = new Set(tsHits.map(h => h.key));
			const intersection = new Set([...vectorSet].filter(x => tsSet.has(x)));
			const union = new Set([...vectorSet, ...tsSet]);
			const overlapPercent = union.size > 0 ? (intersection.size / union.size) * 100 : 0;

			// Compute top-10 ordering similarity (Jaccard index of top-10).
			const topN = Math.min(10, Math.max(vectorHits.length, tsHits.length));
			const vectorTopN = vectorHits.slice(0, topN).map(h => h.key);
			const tsTopN = tsHits.slice(0, topN).map(h => h.key);
			const topNIntersection = new Set(vectorTopN.filter(x => tsTopN.includes(x)));
			const topNUnion = new Set([...vectorTopN, ...tsTopN]);
			const topNOverlapPercent = topNUnion.size > 0 ? (topNIntersection.size / topNUnion.size) * 100 : 0;

			// Log comparison.
			this.logService.info('[ExtHostIndexing][DevCompare] retrieval path comparison', {
				workspaceId,
				query: trimmed,
				topK: k,
				vectorResults: {
					count: vectorHits.length,
					timeMs: vectorTime
				},
				tsResults: {
					count: tsHits.length,
					timeMs: tsTime
				},
				overlap: {
					overlapCount: intersection.size,
					totalUnique: union.size,
					overlapPercent: Number(overlapPercent.toFixed(2))
				},
				top10Ordering: {
					overlapCount: topNIntersection.size,
					totalUnique: topNUnion.size,
					overlapPercent: Number(topNOverlapPercent.toFixed(2))
				},
				timing: {
					vectorMs: vectorTime,
					tsMs: tsTime,
					speedup: tsTime > 0 ? Number((tsTime / vectorTime).toFixed(2)) : undefined
				}
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing][DevCompare] comparison failed', { workspaceId, message });
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	private async devRunGoldenQueries(workspaceId: string, topK: number): Promise<void> {
		for (const query of GOLDEN_QUERIES) {
			try {
				const hits = await this.$querySimilarChunksInternal(workspaceId, query, topK);
				this.logService.info('[ExtHostIndexing][DevQuery][Golden]', {
					workspaceId,
					query,
					topK,
					resultCount: hits.length,
					hits: hits.map(h => ({
						filePath: h.filePath,
						chunkId: h.chunkId,
						similarityScore: Number.isFinite(h.similarityScore) ? Number(h.similarityScore.toFixed(6)) : h.similarityScore,
						compositeScore: typeof h.compositeScore === 'number' && Number.isFinite(h.compositeScore) ? Number(h.compositeScore.toFixed(6)) : h.compositeScore,
						chunkLengthPenalty: typeof h.chunkLengthPenalty === 'number' ? Number(h.chunkLengthPenalty.toFixed(6)) : h.chunkLengthPenalty,
						filePathDepthPenalty: typeof h.filePathDepthPenalty === 'number' ? Number(h.filePathDepthPenalty.toFixed(6)) : h.filePathDepthPenalty,
						recencyBoost: typeof h.recencyBoost === 'number' ? Number(h.recencyBoost.toFixed(6)) : h.recencyBoost,
						sameFileBoost: typeof h.sameFileBoost === 'number' ? Number(h.sameFileBoost.toFixed(6)) : h.sameFileBoost
					}))
				});
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				this.logService.error('[ExtHostIndexing][DevQuery][Golden] query failed', { workspaceId, query, message });
			}
		}
	}

	async $indexSavedFiles(workspaceId: string, uris: UriComponents[], token: CancellationToken): Promise<IndexStatusDto> {
		// Phase 10: Feature gate check
		if (!this.isFeatureEnabled('indexing')) {
			this.logService.info('[ExtHostIndexing] indexing disabled via feature gate', { workspaceId });
			return { workspaceId, state: 'idle' };
		}

		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing] indexSavedFiles failed - native deps missing', reason);
			throw new Error(reason);
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		const db = new deps.sqlite.Database(dbPath);
		await this.ensureSchema(db, deps);

		// Phase 10: Check paused and rebuilding state
		const paused = await this.isWorkspacePaused(db, workspaceId);
		if (paused) {
			const stateRow = await this.readIndexState(db, workspaceId);
			this.logService.info('[ExtHostIndexing] indexing paused, skipping saved files', { workspaceId, reason: stateRow.pausedReason });
			await new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
			return { workspaceId, state: stateRow.state ?? 'idle', paused: true, pausedReason: stateRow.pausedReason };
		}

		const rebuilding = await this.isWorkspaceRebuilding(db, workspaceId);
		if (rebuilding) {
			this.logService.info('[ExtHostIndexing] workspace is rebuilding, skipping saved files', { workspaceId });
			await new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
			return { workspaceId, state: 'building', rebuilding: true };
		}
		const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
		const run = (sql: string, params: SqliteParams = []) => new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) => new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		let skipped = 0;
		let reindexed = 0;
		let writtenChunks = 0;
		let chunksBudgetRemaining = MAX_CHUNKS_PER_INDEX_SAVED_FILES;

		try {
			for (const uriComponents of uris) {
				if (token.isCancellationRequested || chunksBudgetRemaining <= 0) {
					break;
				}

				const uri = URI.revive(uriComponents);
				if (uri.scheme !== 'file') {
					this.logService.error('[ExtHostIndexing] indexSavedFiles skipped non-file URI', uri.toString());
					continue;
				}

				const relPath = this.toWorkspaceRelativePath(uri, deps);
				if (!relPath) {
					this.logService.trace('[ExtHostIndexing] indexSavedFiles skipped URI outside workspace', uri.toString());
					continue;
				}

				let stat: import('fs').Stats;
				try {
					stat = await deps.fs.promises.stat(uri.fsPath);
				} catch {
					// File no longer exists: ensure a row exists and mark it deleted=1
					// while removing its chunks, all in a single transaction.
					try {
						await exec('BEGIN IMMEDIATE TRANSACTION;');
						await run(`DELETE FROM chunks WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
						await run(`DELETE FROM embeddings WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
						// Delete from vector index (non-fatal if table doesn't exist).
						try {
							await run(`DELETE FROM embeddings_vector WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
						} catch {
							// Vector index may not exist, ignore.
						}
						await run(
							`INSERT INTO files(workspaceId, path, folderPath, mtime, size, languageId, hash, status, lastIndexedTime, deleted)
							 VALUES(?,?,?,?,?,?,?,?,?,1)
							 ON CONFLICT(workspaceId, path) DO UPDATE SET deleted=1`,
							[workspaceId, relPath, '', 0, 0, undefined, null, 'discovered', null]
						);
						await exec('COMMIT;');
					} catch (err) {
						this.logService.error('[ExtHostIndexing] failed to delete missing file during indexSavedFiles', { relPath, err });
						try { await exec('ROLLBACK;'); } catch { /* ignore */ }
					}
					continue;
				}

				const content = await deps.fs.promises.readFile(uri.fsPath, 'utf8');
				const fileHash = this.hashContent(content);

				const existing = await get<{ hash: string | null; status: string | null }>(
					`SELECT hash, status FROM files WHERE workspaceId=? AND path=?`,
					[workspaceId, relPath]
				);

				if (existing && existing.hash === fileHash && existing.status === 'indexed') {
					skipped++;
					continue;
				}

				const chunks = this.chunkFileContent(relPath, content);
				if (chunks.length > chunksBudgetRemaining) {
					this.logService.warn('[ExtHostIndexing] indexSavedFiles chunk budget exhausted, deferring remaining files', {
						workspaceId,
						relPath,
						remainingBudget: chunksBudgetRemaining,
						requestedChunks: chunks.length
					});
					break;
				}
				const mtime = stat.mtimeMs ?? (stat.mtime instanceof Date ? stat.mtime.getTime() : Date.now());
				const size = stat.size ?? 0;
				const folderPath = relPath.includes('/') ? relPath.substring(0, relPath.lastIndexOf('/')) : '';
				const now = Date.now();

				try {
					await exec('BEGIN IMMEDIATE TRANSACTION;');

					await run(`DELETE FROM chunks WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
					await run(`DELETE FROM embeddings WHERE workspaceId=? AND filePath=?`, [workspaceId, relPath]);
					// Vector index is now in embeddings table (BLOB column), no separate table needed.
					await run(
						`INSERT OR REPLACE INTO files(workspaceId, path, folderPath, mtime, size, languageId, hash, status, lastIndexedTime, deleted)
						 VALUES(?,?,?,?,?,?,?,?,?,0)`,
						[workspaceId, relPath, folderPath, mtime, size, undefined, fileHash, 'indexed', now]
					);

					// Batched chunk inserts for this file while respecting the
					// per-call chunk budget.
					for (const c of chunks) {
						if (chunksBudgetRemaining <= 0) {
							this.logService.warn('[ExtHostIndexing] indexSavedFiles chunk budget reached mid-file; remaining chunks will be indexed in a later run', {
								workspaceId,
								relPath
							});
							break;
						}
						await run(
							`INSERT OR REPLACE INTO chunks(workspaceId, filePath, chunkId, startLine, endLine, content, contentHash) VALUES(?,?,?,?,?,?,?)`,
							[workspaceId, relPath, c.chunkId, c.startLine, c.endLine, c.content, c.contentHash]
						);
						writtenChunks++;
						chunksBudgetRemaining--;
					}

					await exec('COMMIT;');
					reindexed++;
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					this.logService.error('[ExtHostIndexing] indexSavedFiles transaction failed', { relPath, message });
					try {
						await exec('ROLLBACK;');
					} catch {
						// ignore rollback failure
					}

					// Mark file as errored in a best-effort follow-up.
					try {
						const nowError = Date.now();
						await run(
							`INSERT OR REPLACE INTO files(workspaceId, path, folderPath, mtime, size, languageId, hash, status, lastIndexedTime, deleted)
							 VALUES(?,?,?,?,?,?,?,?,?,0)`,
							[workspaceId, relPath, folderPath, mtime, size, undefined, fileHash, 'error', nowError]
						);
					} catch {
						// ignore secondary failures
					}
				}
			}

			const workspaceNow = Date.now();
			await run(
				`INSERT OR REPLACE INTO workspaces(id, lastIndexedTime, schemaVersion) VALUES(?,?,?)`,
				[workspaceId, workspaceNow, CURRENT_SCHEMA_VERSION]
			);

			const fileRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND (deleted IS NULL OR deleted=0)`, [workspaceId]);
			const indexedRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND status='indexed' AND (deleted IS NULL OR deleted=0)`, [workspaceId]);
			const chunkRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM chunks WHERE workspaceId=?`, [workspaceId]);

			const totalFiles = fileRow?.c ?? 0;
			const indexedFiles = indexedRow?.c ?? 0;
			const totalChunks = chunkRow?.c ?? 0;

			let embeddedChunks = 0;
			let embeddingModel: string | undefined;
			if (this.embeddingRuntime) {
				const embeddedRow = await get<{ c: number }>(
					`SELECT COUNT(*) as c FROM embeddings WHERE workspaceId=? AND embeddingModel=? AND embeddingVersion=?`,
					[workspaceId, this.embeddingRuntime.modelId, this.embeddingRuntime.version]
				);
				embeddedChunks = embeddedRow?.c ?? 0;
				embeddingModel = this.embeddingRuntime.modelId;
			}

			this.logService.info('[ExtHostIndexing] indexSavedFiles summary', {
				workspaceId,
				totalFiles,
				indexedFiles,
				skipped,
				reindexed,
				writtenChunks,
				totalChunks,
				embeddedChunks
			});

			// Incremental indexing keeps the index in a ready state as long as
			// the underlying DB and schema are healthy.
			await this.updateIndexState(db, workspaceId, {
				state: 'ready',
				lastErrorCode: null,
				lastErrorMessage: null
			});

			// Schedule background embeddings for any newly written or updated
			// chunks. This is fire-and-forget and must not block indexing.
			this.logService.info('[ExtHostIndexing] Checking if embedding queue should be scheduled', {
				workspaceId,
				hasEmbeddingRuntime: !!this.embeddingRuntime,
				totalChunks,
				hasInitPromise: !!this.embeddingRuntimeInitPromise,
				hasFlushHandle: !!this.embeddingFlushHandle
			});

			// Wait for embedding runtime initialization if it's still in progress
			if (!this.embeddingRuntime && this.embeddingRuntimeInitPromise) {
				this.logService.info('[ExtHostIndexing] Waiting for embedding runtime initialization to complete');
				try {
					await this.embeddingRuntimeInitPromise;
					this.logService.info('[ExtHostIndexing] Embedding runtime initialization completed, runtime available', {
						hasEmbeddingRuntime: !!this.embeddingRuntime
					});
				} catch (err) {
					this.logService.warn('[ExtHostIndexing] Embedding runtime initialization failed, will not schedule embeddings', {
						error: err instanceof Error ? err.message : String(err)
					});
				}
			}

			if (this.embeddingRuntime && totalChunks > 0) {
				if (!this.embeddingFlushHandle) {
					console.log('[ExtHostIndexing] ========== Scheduling processEmbeddingQueue ==========', {
						workspaceId,
						totalChunks,
						delay: '500ms',
						timestamp: new Date().toISOString()
					});
					this.logService.info('[ExtHostIndexing] Scheduling processEmbeddingQueue', {
						workspaceId,
						totalChunks,
						delay: '500ms'
					});
					this.embeddingFlushHandle = setTimeout(() => {
						this.embeddingFlushHandle = undefined;
						this.logService.info('[ExtHostIndexing] processEmbeddingQueue timeout fired, calling processEmbeddingQueue');
						this.processEmbeddingQueue(workspaceId, CancellationToken.None).catch(err => {
							this.logService.error('[ExtHostIndexing] embedding flush failed', err);
						});
					}, 500);
				} else {
					this.logService.trace('[ExtHostIndexing] Embedding flush already scheduled, skipping');
				}
			} else {
				if (!this.embeddingRuntime) {
					this.logService.info('[ExtHostIndexing] Not scheduling embedding queue - embedding runtime not available');
				}
				if (totalChunks === 0) {
					this.logService.info('[ExtHostIndexing] Not scheduling embedding queue - no chunks to embed');
				}
			}

			return {
				workspaceId,
				state: 'ready',
				totalFiles,
				indexedFiles,
				totalChunks,
				lastIndexedTime: workspaceNow,
				schemaVersion: CURRENT_SCHEMA_VERSION,
				embeddedChunks,
				embeddingModel
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] indexSavedFiles failed', { dbPath, message });
			throw e;
		} finally {
			try {
				await close();
			} catch {
				// ignore close errors
			}
		}
	}

	private hashContent(text: string): string {
		const hash = createHash('sha256');
		hash.update(Buffer.from(text, 'utf8'));
		return hash.digest('hex');
	}

	async $deleteIndex(workspaceId: string): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing] deleteIndex failed - native deps missing', reason);
			throw new Error(reason);
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		this.logService.info('[ExtHostIndexing] deleting workspace index', { workspaceId, dbPath });

		// Cancel any active background indexing for this workspace
		const tokenSource = this.backgroundIndexingTokens.get(workspaceId);
		if (tokenSource) {
			tokenSource.cancel();
			this.backgroundIndexingTokens.delete(workspaceId);
			this.logService.info('[ExtHostIndexing] cancelled background indexing for deleted workspace', { workspaceId });
		}

		// Delete the database file if it exists
		try {
			await deps.fs.promises.unlink(dbPath);
			this.logService.info('[ExtHostIndexing] deleted index database', { workspaceId, dbPath });
		} catch (e) {
			const errorWithCode = e as ErrorWithCode;
			if (errorWithCode.code !== 'ENOENT') {
				// File doesn't exist is fine, but other errors should be logged.
				const message = e instanceof Error ? e.message : String(e);
				this.logService.warn('[ExtHostIndexing] failed to delete database file (may not exist)', { dbPath, message });
				throw e; // Re-throw if it's not a "file not found" error
			} else {
				this.logService.info('[ExtHostIndexing] database file does not exist (already deleted)', { dbPath });
			}
		}
	}

	async $rebuildWorkspaceIndex(workspaceId: string, reason?: string): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			const reason = 'require(@vscode/sqlite3) not available in extension host';
			this.logService.error('[ExtHostIndexing] rebuildWorkspaceIndex failed - native deps missing', reason);
			throw new Error(reason);
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		this.logService.info('[ExtHostIndexing] rebuilding workspace index', { workspaceId, dbPath, reason });

		// Cancel any active background indexing for this workspace
		const tokenSource = this.backgroundIndexingTokens.get(workspaceId);
		if (tokenSource) {
			tokenSource.cancel();
			this.backgroundIndexingTokens.delete(workspaceId);
			this.logService.info('[ExtHostIndexing] cancelled background indexing for rebuilt workspace', { workspaceId });
		}

		try {
			// Delete the database file FIRST if it exists (before trying to open it).
			// This avoids errors when trying to query an incompatible schema.
			try {
				await deps.fs.promises.unlink(dbPath);
				this.logService.info('[ExtHostIndexing] deleted existing database', { dbPath });
			} catch (e) {
				const errorWithCode = e as ErrorWithCode;
				if (errorWithCode.code !== 'ENOENT') {
					// File doesn't exist is fine, but other errors should be logged.
					const message = e instanceof Error ? e.message : String(e);
					this.logService.warn('[ExtHostIndexing] failed to delete database file (may not exist)', { dbPath, message });
				}
			}

			// Open a fresh database and initialize with correct schema.
			let db: SqliteDatabase | undefined;
			try {
				await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
				db = await openDatabaseWithRetry(deps.sqlite, dbPath);
				await this.ensureSchema(db, deps);

				// Reset index state to idle and clear rebuilding flag.
				await this.updateIndexState(db, workspaceId, {
					state: 'idle',
					lastFullScanTime: null,
					lastEmbeddingRunTime: null,
					lastErrorCode: null,
					lastErrorMessage: null,
					rebuilding: false,
					paused: false,
					pausedReason: null,
					degradedReason: null
				});

				this.logService.info('[ExtHostIndexing] workspace index rebuild completed', { workspaceId, reason });
			} finally {
				if (db) {
					try {
						await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
					} catch {
						// ignore close errors
					}
				}
			}
		} catch (e) {
			const category = classifySqliteError(e);
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] rebuildWorkspaceIndex failed', { workspaceId, dbPath, category, message });
			throw e;
		}
	}

	// Phase 10: Control plane methods
	async $pauseIndexing(workspaceId: string, reason?: string): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			throw new Error('require(@vscode/sqlite3) not available in extension host');
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		let db: SqliteDatabase | undefined;
		try {
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
			db = await openDatabaseWithRetry(deps.sqlite, dbPath);
			await this.ensureSchema(db, deps);

			await this.updateIndexState(db, workspaceId, {
				paused: true,
				pausedReason: reason ?? 'Manual pause'
			});

			this.logService.info('[ExtHostIndexing] indexing paused', { workspaceId, reason });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] pauseIndexing failed', { workspaceId, message });
			throw e;
		} finally {
			if (db) {
				try {
					await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
				} catch {
					// ignore close errors
				}
			}
		}
	}

	async $resumeIndexing(workspaceId: string): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			throw new Error('require(@vscode/sqlite3) not available in extension host');
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		let db: SqliteDatabase | undefined;
		try {
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
			db = await openDatabaseWithRetry(deps.sqlite, dbPath);
			await this.ensureSchema(db, deps);

			await this.updateIndexState(db, workspaceId, {
				paused: false,
				pausedReason: null
			});

			this.logService.info('[ExtHostIndexing] indexing resumed', { workspaceId });

			// After resuming, process any file changes that accumulated while paused
			// File watcher events were collected in pendingDirtyUris/pendingDeletedUris
			// but not processed because isWorkspacePaused returned true in $indexSavedFiles
			const hasPendingChanges = this.pendingDirtyUris.size > 0 || this.pendingDeletedUris.size > 0;
			if (hasPendingChanges) {
				this.logService.info('[ExtHostIndexing] processing accumulated file changes after resume', {
					workspaceId,
					pendingDirty: this.pendingDirtyUris.size,
					pendingDeleted: this.pendingDeletedUris.size
				});
				// Trigger flush of accumulated watcher events
				// Use a small delay to ensure the pause state update is committed to the database
				setTimeout(() => {
					this.flushWatcherBatches().catch(err => {
						this.logService.error('[ExtHostIndexing] failed to flush watcher batches after resume', { workspaceId, err });
					});
				}, 100);
			} else {
				this.logService.info('[ExtHostIndexing] no accumulated file changes to process after resume', { workspaceId });
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] resumeIndexing failed', { workspaceId, message });
			throw e;
		} finally {
			if (db) {
				try {
					await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
				} catch {
					// ignore close errors
				}
			}
		}
	}

	async $triggerVectorBackfill(workspaceId: string): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			throw new Error('require(@vscode/sqlite3) not available in extension host');
		}

		const runtime = this.embeddingRuntime;
		if (!runtime) {
			throw new Error('No embedding runtime available');
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		let db: SqliteDatabase | undefined;
		try {
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
			db = await openDatabaseWithRetry(deps.sqlite, dbPath);
			await this.ensureSchema(db, deps);

			// Check if vector index is ready
			const isReady = await this.isVectorIndexReady(db, workspaceId, runtime, deps);
			if (!isReady) {
				throw new Error('Vector index is not available');
			}

			// Set backfilling flag
			await this.updateIndexState(db, workspaceId, {
				backfillingVectorIndex: true
			});

			// Trigger backfill
			await this.populateVectorIndexFromEmbeddings(db, workspaceId, runtime, deps, {
				batchSize: VECTOR_BACKFILL_BATCH_SIZE,
				timeBudgetMs: VECTOR_BACKFILL_TIME_BUDGET_MS
			});

			// Clear backfilling flag
			await this.updateIndexState(db, workspaceId, {
				backfillingVectorIndex: false
			});

			this.logService.info('[ExtHostIndexing] vector backfill triggered', { workspaceId });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] triggerVectorBackfill failed', { workspaceId, message });
			// Clear backfilling flag on error
			if (db) {
				try {
					await this.updateIndexState(db, workspaceId, {
						backfillingVectorIndex: false
					});
				} catch {
					// ignore state update errors
				}
			}
			throw e;
		} finally {
			if (db) {
				try {
					await new Promise<void>((resolve, reject) => db!.close(err => err ? reject(err) : resolve()));
				} catch {
					// ignore close errors
				}
			}
		}
	}

	// Phase 11: Context assembly RPC methods
	async $devAssembleContextForQuery(
		workspaceId: string,
		query: string,
		options: { maxChars?: number; maxTokens?: number },
		token: CancellationToken
	): Promise<ContextItemDto[]> {
		if (!this.contextService) {
			this.logService.warn('[ExtHostIndexing] context service not initialized');
			return [];
		}

		try {
			const contextItems = await this.contextService.assembleContextForQuery(
				workspaceId,
				query,
				{
					maxChars: options.maxChars,
					maxTokens: options.maxTokens,
					preferIndexed: true,
					preferRecent: true,
					preferActive: true
				},
				token
			);

			return contextItems.map(item => ({
				filePath: item.filePath,
				snippet: item.snippet,
				startLine: item.startLine,
				endLine: item.endLine,
				score: item.score,
				reason: item.reason
			}));
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] context assembly failed', { workspaceId, query, message });
			return [];
		}
	}

	async $devGetRepoOverview(workspaceId: string, token: CancellationToken): Promise<RepoOverviewDto> {
		if (!this.contextService) {
			this.logService.warn('[ExtHostIndexing] context service not initialized');
			return {
				totalFiles: 0,
				indexedFiles: 0,
				totalChunks: 0,
				folders: [],
				recentFiles: []
			};
		}

		try {
			const overview = await this.contextService.getRepoOverview(workspaceId, token);
			return {
				totalFiles: overview.totalFiles,
				indexedFiles: overview.indexedFiles,
				totalChunks: overview.totalChunks,
				folders: overview.folders.map(f => ({
					path: f.path,
					fileCount: f.fileCount,
					totalSize: f.totalSize,
					languages: f.languages
				})),
				recentFiles: overview.recentFiles.map(f => ({
					path: f.path,
					lastIndexedTime: f.lastIndexedTime,
					size: f.size,
					languageId: f.languageId
				}))
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostIndexing] repo overview failed', { workspaceId, message });
			return {
				totalFiles: 0,
				indexedFiles: 0,
				totalChunks: 0,
				folders: [],
				recentFiles: []
			};
		}
	}
}

