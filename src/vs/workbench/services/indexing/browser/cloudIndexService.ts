/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAnyWorkspaceIdentifier, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IndexState, IndexStatus, IIndexService } from '../common/indexService.js';
import { IVoyageEmbeddingService } from '../common/voyageEmbeddingService.js';
import { IPineconeVectorStore, VectorRecord } from '../common/pineconeVectorStore.js';
import { chunkByLines } from '../node/chunking.js';
import { getUserId, getNamespace, getVectorId, getWorkspacePath } from '../common/namespaceUtils.js';
import { CONFIG_CLOUD_INDEXING_ENABLED, CONFIG_CHUNK_SIZE_LINES, CONFIG_CLOUD_EMBEDDING_BATCH_SIZE } from '../common/indexingConfiguration.js';
import { IndexWatcher, WatcherEvent } from '../node/indexWatcher.js';


interface PersistedCloudIndexStatus {
	readonly version: 1 | 2; // Version 1 is legacy, version 2 includes checkpoint
	readonly totalFiles: number;
	readonly indexedFiles: number;
	readonly totalChunks: number;
	readonly embeddedChunks: number;
	readonly lastFullScanTime?: number;
	readonly lastIndexedTime?: number;
	readonly lastUpdated: number;
	/** Monotonic run ID to identify indexing runs - prevents mixing state from different runs */
	readonly runId?: number;
	/** State of the run when persisted: 'running' | 'paused' | 'complete' | 'interrupted' */
	readonly runState?: 'running' | 'paused' | 'complete' | 'interrupted';
	/**
	 * Checkpoint: set of relative file paths that have been successfully indexed in current run.
	 * Limited to a bounded size (e.g., 5000 paths) to prevent storage bloat.
	 * When exceeded, we store a hash of the set instead.
	 */
	readonly completedFilePaths?: string[];
	/** Hash of completed file paths when list exceeds max size */
	readonly completedFileSetHash?: string;
}

const CHECKPOINT_MAX_FILE_PATHS = 5000;

const CLOUD_INDEX_STATUS_STORAGE_KEY_PREFIX = 'vybe.cloudIndexing.status.';

/** Simple hash for file path sets (FNV-1a) */
function hashFilePathSet(paths: Set<string>): string {
	const sorted = Array.from(paths).sort();
	let hash = 0x811c9dc5;
	for (const path of sorted) {
		for (let i = 0; i < path.length; i++) {
			hash ^= path.charCodeAt(i);
			hash = (hash * 0x01000193) >>> 0;
		}
	}
	return hash.toString(16);
}

/**
 * Cloud-based index service using Voyage AI and Pinecone.
 * Replaces the broken local SQLite indexing system.
 */
export class CloudIndexService extends Disposable implements IIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IndexStatus>());
	readonly onDidChangeStatus: Event<IndexStatus> = this._onDidChangeStatus.event;

	private readonly statusMap = new Map<string, IndexStatus>();
	private readonly watchers = new Map<string, IndexWatcher>();
	private readonly userId = getUserId();
	private readonly pausedWorkspaces = new Set<string>();
	private readonly activeIndexingOperations = new Map<string, Promise<IndexStatus>>();
	private autoIndexTriggered = false; // Prevent multiple auto-index triggers

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IVoyageEmbeddingService private readonly voyageService: IVoyageEmbeddingService,
		@IPineconeVectorStore private readonly pineconeStore: IPineconeVectorStore,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Listen for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_CLOUD_INDEXING_ENABLED)) {
				this.logService.info('[CloudIndexService] Cloud indexing enabled state changed');
				// Auto-index when enabled
				if (this.isEnabled()) {
					this.triggerAutoIndex();
				}
			}
		}));

		// Auto-index on workspace folder changes
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(async (e) => {
			if (e.added.length > 0 && this.isEnabled()) {
				// Reset flag when new folders are added to allow re-indexing
				this.autoIndexTriggered = false;
				setTimeout(() => this.triggerAutoIndex(), 1000);
			}
		}));

		// Auto-index if workspace is already open when service initializes
		// Use longer delay to ensure workspace and file service are fully ready
		setTimeout(async () => {
			if (this.isEnabled()) {
				// Wait a bit more to ensure file system is ready
				await new Promise(resolve => setTimeout(resolve, 2000));
				this.triggerAutoIndex();
			}
		}, 1000);
	}

	/**
	 * Trigger auto-indexing with proper workspace identifier conversion
	 * Prevents multiple triggers using a flag
	 */
	private triggerAutoIndex(): void {
		if (this.autoIndexTriggered) {
			this.logService.trace('[CloudIndexService] Auto-index already triggered, skipping');
			return;
		}

		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.folders.length === 0) {
			return;
		}

		// Convert IWorkspace to IAnyWorkspaceIdentifier
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);

		this.autoIndexTriggered = true;
		this.autoIndexIfNeeded(workspaceIdentifier).catch(err => {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.error('[CloudIndexService] Auto-index trigger failed:', message);
			// Reset flag on failure to allow retry
			this.autoIndexTriggered = false;
		});
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED) ?? false;
	}

	private resolveWorkspacePath(workspace: IAnyWorkspaceIdentifier): string {
		// Primary: workspace identifier-derived path
		const fromIdentifier = this.getWorkspacePathFromIdentifier(workspace);
		if (fromIdentifier) {
			return fromIdentifier;
		}

		// Fallback: current workspace folders (more reliable than configPath for multi-root)
		const currentWorkspace = this.workspaceContextService.getWorkspace();
		if (currentWorkspace.folders.length > 0) {
			return currentWorkspace.folders[0].uri.fsPath;
		}

		return '';
	}

	private getWorkspaceKey(workspace: IAnyWorkspaceIdentifier): string {
		return this.resolveWorkspacePath(workspace) || 'default';
	}

	private getWorkspacePathFromIdentifier(workspace: IAnyWorkspaceIdentifier): string {
		// Convert IAnyWorkspaceIdentifier to format expected by getWorkspacePath
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			return getWorkspacePath({ uri: workspace.uri });
		} else if (isWorkspaceIdentifier(workspace)) {
			// For multi-root workspaces, use configPath or first folder
			// We need to get folders from workspace context, but for now use configPath
			if (workspace.configPath) {
				return workspace.configPath.fsPath;
			}
			return '';
		}
		return '';
	}

	private getStatusStorageKey(workspacePath: string): string {
		// Use a stable, filesystem-safe key derived from the namespace (userId + workspace hash)
		const namespace = getNamespace(this.userId, workspacePath);
		return `${CLOUD_INDEX_STATUS_STORAGE_KEY_PREFIX}${namespace.replace(/[:]/g, '_')}`;
	}

	private loadPersistedStatus(workspacePath: string): PersistedCloudIndexStatus | undefined {
		try {
			const raw = this.storageService.get(this.getStatusStorageKey(workspacePath), StorageScope.WORKSPACE, '');
			if (!raw) {
				return undefined;
			}
			const parsed = JSON.parse(raw) as PersistedCloudIndexStatus;
			// Accept both version 1 (legacy) and version 2 (with checkpoint)
			if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) {
				return undefined;
			}
			return parsed;
		} catch {
			return undefined;
		}
	}

	private savePersistedStatus(
		workspacePath: string,
		status: IndexStatus,
		checkpoint?: {
			runId: number;
			runState: 'running' | 'paused' | 'complete' | 'interrupted';
			completedFiles: Set<string>;
		}
	): void {
		const totalFiles = status.totalFiles ?? 0;
		const indexedFiles = status.indexedFiles ?? 0;
		const totalChunks = status.totalChunks ?? 0;
		const embeddedChunks = status.embeddedChunks ?? 0;

		// Only persist meaningful snapshots
		if (totalFiles === 0 && indexedFiles === 0 && totalChunks === 0 && embeddedChunks === 0) {
			return;
		}

		// Build checkpoint fields
		let completedFilePaths: string[] | undefined;
		let completedFileSetHash: string | undefined;

		if (checkpoint && checkpoint.completedFiles.size > 0) {
			if (checkpoint.completedFiles.size <= CHECKPOINT_MAX_FILE_PATHS) {
				completedFilePaths = Array.from(checkpoint.completedFiles);
			} else {
				// Too many files - store hash instead
				completedFileSetHash = hashFilePathSet(checkpoint.completedFiles);
			}
		}

		const payload: PersistedCloudIndexStatus = {
			version: 2,
			totalFiles,
			indexedFiles,
			totalChunks,
			embeddedChunks,
			lastFullScanTime: status.lastFullScanTime,
			lastIndexedTime: status.lastIndexedTime,
			lastUpdated: Date.now(),
			runId: checkpoint?.runId,
			runState: checkpoint?.runState,
			completedFilePaths,
			completedFileSetHash,
		};

		try {
			this.storageService.store(
				this.getStatusStorageKey(workspacePath),
				JSON.stringify(payload),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE
			);
		} catch {
			// best-effort
		}
	}

	private clearPersistedStatus(workspacePath: string): void {
		try {
			this.storageService.remove(this.getStatusStorageKey(workspacePath), StorageScope.WORKSPACE);
		} catch {
			// best-effort
		}
	}

	private async getStatusInternal(workspace: IAnyWorkspaceIdentifier): Promise<IndexStatus> {
		const key = this.getWorkspaceKey(workspace);
		const existing = this.statusMap.get(key);
		if (existing) {
			// Preserve existing status, especially if it's in Indexing state
			// Only update paused state if it changed
			if (existing.paused !== this.pausedWorkspaces.has(key)) {
				const updated = { ...existing, paused: this.pausedWorkspaces.has(key) };
				this.statusMap.set(key, updated);
				return updated;
			}
			return existing;
		}

		// If there's any active indexing operation, return that status instead of creating a new Idle one
		// This handles key mismatches between different representations of the same workspace
		if (this.statusMap.size > 0 && this.activeIndexingOperations.size > 0) {
			// Return the status of the first active indexing operation
			for (const [activeKey] of this.activeIndexingOperations) {
				const activeStatus = this.statusMap.get(activeKey);
				if (activeStatus && (activeStatus.state === IndexState.Indexing || activeStatus.state === IndexState.Building)) {
					this.logService.trace(`[CloudIndexService] Returning active indexing status for key "${activeKey}" instead of creating Idle status for key "${key}"`);
					return activeStatus;
				}
			}
		}

		// Also check if there's any indexing status in the map (handles case where indexing just started)
		for (const [, status] of this.statusMap) {
			if (status.state === IndexState.Indexing || status.state === IndexState.Building) {
				this.logService.trace(`[CloudIndexService] Found active indexing status, returning it instead of creating Idle status`);
				return status;
			}
		}

		// Restore last known status snapshot (restart persistence)
		const workspacePath = this.resolveWorkspacePath(workspace);
		if (workspacePath) {
			const persisted = this.loadPersistedStatus(workspacePath);
			if (persisted) {
				// Determine state based on checkpoint runState and completion status
				const looksComplete = persisted.runState === 'complete' ||
					(typeof persisted.lastFullScanTime === 'number' && persisted.totalFiles > 0 && persisted.indexedFiles >= persisted.totalFiles);
				const wasInterrupted = persisted.runState === 'interrupted' || persisted.runState === 'running';
				const wasPaused = persisted.runState === 'paused';

				// Task D: State machine rules
				// - 'complete' → Ready
				// - 'paused' → Indexing with paused=true (resumable)
				// - 'interrupted' or 'running' → Degraded (needs resume)
				// - Otherwise, infer from counts

				let state: IndexState;
				let paused = false;
				let degradedReason: string | undefined;

				if (looksComplete) {
					state = IndexState.Ready;
				} else if (wasPaused) {
					state = IndexState.Indexing;
					paused = true;
				} else if (wasInterrupted) {
					state = IndexState.Degraded;
					degradedReason = `Indexing was interrupted (${persisted.indexedFiles.toLocaleString()} of ${persisted.totalFiles.toLocaleString()} files). Click Sync to resume.`;
				} else if (persisted.indexedFiles > 0) {
					// Partial progress but no explicit state - treat as degraded
					state = IndexState.Degraded;
					degradedReason = `Index incomplete. Click Sync to continue.`;
				} else {
					// No progress yet
					state = IndexState.Idle;
				}

				const restored: IndexStatus = {
					workspace,
					state,
					totalFiles: persisted.totalFiles,
					indexedFiles: persisted.indexedFiles,
					totalChunks: persisted.totalChunks,
					embeddedChunks: persisted.embeddedChunks,
					lastFullScanTime: looksComplete ? persisted.lastFullScanTime : undefined,
					lastIndexedTime: looksComplete ? (persisted.lastIndexedTime ?? persisted.lastFullScanTime) : undefined,
					lastUpdated: persisted.lastUpdated,
					paused,
					degradedReason,
					modelDownloadState: 'ready',
				};
				this.statusMap.set(key, restored);
				return restored;
			}
		}

		// Create initial status - cloud indexing doesn't use model downloads
		const status: IndexStatus = {
			workspace,
			state: IndexState.Idle,
			totalFiles: 0,
			indexedFiles: 0,
			totalChunks: 0,
			embeddedChunks: 0,
			paused: this.pausedWorkspaces.has(key),
			modelDownloadState: 'ready', // Cloud indexing uses API, no model download needed
		};

		this.statusMap.set(key, status);
		return status;
	}

	async getStatus(workspace: IAnyWorkspaceIdentifier): Promise<IndexStatus> {
		return this.getStatusInternal(workspace);
	}

	private async autoIndexIfNeeded(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		try {
			if (!this.isEnabled()) {
				return;
			}

			const key = this.getWorkspaceKey(workspace);

			// Check if indexing is already in progress
			if (this.activeIndexingOperations.has(key)) {
				this.logService.trace('[CloudIndexService] Auto-index skipped: indexing already in progress');
				return;
			}

			const workspacePath = this.resolveWorkspacePath(workspace);

			// If Pinecone is empty but we have a persisted snapshot, clear it to avoid showing stale "Ready"
			if (workspacePath) {
				try {
					const namespace = getNamespace(this.userId, workspacePath);
					const stats = await this.pineconeStore.getNamespaceStats(namespace);
					if (stats.vectorCount === 0) {
						this.clearPersistedStatus(workspacePath);
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					this.logService.warn(`[CloudIndexService] Pinecone stats check failed: ${message}`);
				}
			}

			// Wait a bit to ensure file service is ready before starting indexing work
			await new Promise(resolve => setTimeout(resolve, 500));

			const status = await this.getStatus(workspace);

			// Check if we should auto-index:
			// 1. State is idle/uninitialized (no index yet)
			// 2. No full scan has been completed yet (lastFullScanTime is missing/null)
			const shouldAutoIndex =
				status.state === IndexState.Idle ||
				status.state === IndexState.Uninitialized ||
				!status.lastFullScanTime;

			if (shouldAutoIndex) {
				this.logService.info('[CloudIndexService] Auto-indexing workspace');
				// Don't await - let it run in background to avoid blocking
				this.buildFullIndex(workspace, CancellationToken.None).catch(err => {
					const message = err instanceof Error ? err.message : String(err);
					this.logService.error('[CloudIndexService] Auto-index failed', { message });
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			this.logService.error('[CloudIndexService] auto-index check failed', { message, stack });
		}
	}

	async buildFullIndex(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus> {
		if (!this.isEnabled()) {
			this.logService.trace('[CloudIndexService] Cloud indexing is disabled');
			return this.getStatusInternal(workspace);
		}

		const key = this.getWorkspaceKey(workspace);

		// TASK 6: Prevent duplicate indexing operations
		if (this.activeIndexingOperations.has(key)) {
			this.logService.info('[CloudIndexService] Indexing already in progress, returning existing operation');
			return this.activeIndexingOperations.get(key)!;
		}

		// Create and track the indexing promise
		const indexingPromise = this.doBuildFullIndex(workspace, key, token);
		this.activeIndexingOperations.set(key, indexingPromise);

		try {
			return await indexingPromise;
		} finally {
			this.activeIndexingOperations.delete(key);
		}
	}

	private async doBuildFullIndex(workspace: IAnyWorkspaceIdentifier, key: string, token?: CancellationToken): Promise<IndexStatus> {
		const workspacePath = this.resolveWorkspacePath(workspace);

		if (!workspacePath) {
			this.logService.warn('[CloudIndexService] Cannot index: no workspace path');
			return this.getStatusInternal(workspace);
		}

		// Generate a unique run ID for this indexing session
		const runId = Date.now();

		// Load any existing checkpoint to resume from
		const existingCheckpoint = this.loadPersistedStatus(workspacePath);
		const canResume = existingCheckpoint &&
			existingCheckpoint.runState !== 'complete' &&
			existingCheckpoint.completedFilePaths &&
			existingCheckpoint.completedFilePaths.length > 0;

		// If we're starting from scratch (no usable checkpoint), purge old namespace
		// to avoid mixing old vectors with the new run.
		if (!canResume) {
			const namespace = getNamespace(this.userId, workspacePath);
			try {
				await this.pineconeStore.deleteNamespace(namespace);
				this.logService.info(`[CloudIndexService] Purged namespace before fresh indexing: ${namespace}`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this.logService.warn(`[CloudIndexService] Failed to purge namespace before fresh indexing: ${message}`);
			}
		}

		// Build set of already-indexed files from checkpoint
		const completedFiles = new Set<string>(
			canResume && existingCheckpoint?.completedFilePaths
				? existingCheckpoint.completedFilePaths
				: []
		);

		if (canResume && completedFiles.size > 0) {
			this.logService.info(`[CloudIndexService] Resuming from checkpoint: ${completedFiles.size} files already indexed`);
		} else {
			this.logService.info(`[CloudIndexService] Starting full index build for workspace: ${workspacePath}`);
		}

		// Update status to Building
		const status: IndexStatus = {
			workspace,
			state: IndexState.Building,
			totalFiles: 0,
			indexedFiles: canResume ? completedFiles.size : 0,
			totalChunks: canResume ? (existingCheckpoint?.totalChunks ?? 0) : 0,
			embeddedChunks: canResume ? (existingCheckpoint?.embeddedChunks ?? 0) : 0,
			paused: this.pausedWorkspaces.has(key),
			modelDownloadState: 'ready', // Cloud indexing uses API, no model download needed
		};
		this.statusMap.set(key, status);
		this._onDidChangeStatus.fire(status);
		this.savePersistedStatus(workspacePath, status, { runId, runState: 'running', completedFiles });

		try {
			// Discover all files in workspace
			const allFiles = await this.discoverFiles(workspace, token);
			this.logService.info(`[CloudIndexService] Discovered ${allFiles.length} files to index`);

			// Filter out already-indexed files if resuming
			const files = canResume
				? allFiles.filter(f => {
					const relativePath = f.fsPath.replace(workspacePath, '').replace(/^\/+/, '');
					return !completedFiles.has(relativePath);
				})
				: allFiles;

			if (canResume && files.length < allFiles.length) {
				this.logService.info(`[CloudIndexService] Skipping ${allFiles.length - files.length} already-indexed files, ${files.length} remaining`);
			}

			// Update total files and change state to Indexing when we start processing
			const statusWithTotal: IndexStatus = {
				...status,
				state: IndexState.Indexing, // Change from Building to Indexing when processing starts
				totalFiles: allFiles.length, // Total is all files, not just remaining
				indexedFiles: completedFiles.size, // Start from checkpoint count
				modelDownloadState: 'ready', // Ensure modelDownloadState is always set for cloud indexing
			};
			this.statusMap.set(key, statusWithTotal);
			this._onDidChangeStatus.fire(statusWithTotal);
			this.savePersistedStatus(workspacePath, statusWithTotal, { runId, runState: 'running', completedFiles });

			// Index files in batches
			const chunkSize = this.configurationService.getValue<number>(CONFIG_CHUNK_SIZE_LINES) ?? 200;
			const embeddingBatchSize = this.configurationService.getValue<number>(CONFIG_CLOUD_EMBEDDING_BATCH_SIZE) ?? 50;

			// Use local counters as source of truth during indexing - start from checkpoint
			let indexedCount = completedFiles.size;
			let totalChunks = canResume ? (existingCheckpoint?.totalChunks ?? 0) : 0;
			let embeddedChunks = canResume ? (existingCheckpoint?.embeddedChunks ?? 0) : 0;
			let lastStatusUpdateTime = 0;
			let lastCheckpointSaveTime = Date.now();
			const STATUS_UPDATE_DEBOUNCE_MS = 100; // Debounce status updates to every 100ms
			const CHECKPOINT_SAVE_INTERVAL_MS = 10000; // Save checkpoint every 10 seconds

			// Process files sequentially with small delay to avoid rate limits
			for (const file of files) {
				if (token?.isCancellationRequested) {
					break;
				}

				// Check pause state and wait if paused
				while (this.pausedWorkspaces.has(key) && !token?.isCancellationRequested) {
					// Update status to show paused state
					const pausedStatus: IndexStatus = {
						...statusWithTotal,
						state: IndexState.Indexing,
						indexedFiles: indexedCount,
						totalChunks,
						embeddedChunks,
						paused: true,
						modelDownloadState: 'ready',
					};
					this.statusMap.set(key, pausedStatus);
					this._onDidChangeStatus.fire(pausedStatus);
					this.savePersistedStatus(workspacePath, pausedStatus, { runId, runState: 'paused', completedFiles });

					// Wait and poll for resume
					await new Promise(resolve => setTimeout(resolve, 100));
				}

				if (token?.isCancellationRequested) {
					break;
				}

				const relativePath = file.fsPath.replace(workspacePath, '').replace(/^\/+/, '');

				try {
					// Only increment counter AFTER successful indexFile (includes Pinecone upsert)
					const chunkCount = await this.indexFile(workspace, file, chunkSize, embeddingBatchSize, token);

					// Success! Now increment counters and track completed file
					totalChunks += chunkCount;
					embeddedChunks += chunkCount;
					indexedCount++;
					completedFiles.add(relativePath);

					// Debounced status updates - update every N ms or every 10 files
					const now = Date.now();
					const shouldUpdateStatus = (now - lastStatusUpdateTime >= STATUS_UPDATE_DEBOUNCE_MS) || (indexedCount % 10 === 0);

					if (shouldUpdateStatus) {
						lastStatusUpdateTime = now;
						const progressStatus: IndexStatus = {
							...statusWithTotal,
							state: IndexState.Indexing,
							indexedFiles: indexedCount,
							totalChunks,
							embeddedChunks,
							paused: false,
							modelDownloadState: 'ready',
						};
						this.statusMap.set(key, progressStatus);
						this._onDidChangeStatus.fire(progressStatus);

						// Periodically save checkpoint (every 10 seconds or every 100 files)
						if (now - lastCheckpointSaveTime >= CHECKPOINT_SAVE_INTERVAL_MS || indexedCount % 100 === 0) {
							lastCheckpointSaveTime = now;
							this.savePersistedStatus(workspacePath, progressStatus, { runId, runState: 'running', completedFiles });
						}
					}

					// Reduced delay for higher rate limits (2,000 RPM = ~33 req/sec)
					// 50ms between files allows ~20 files/sec, well under limit
					await new Promise(resolve => setTimeout(resolve, 50));
				} catch (error) {
					// Don't increment counters on error - file wasn't actually indexed
					this.logService.error(`[CloudIndexService] Failed to index file ${file.fsPath}:`, error);
					// Continue with next file even if one fails
				}
			}

			// Finalize status:
			// - If paused, keep state as Indexing with paused=true
			// - If completed successfully, mark Ready and persist lastFullScanTime
			// - If interrupted/cancelled/partial, do NOT mark Ready (prevents fake "100% 45 files" after restart)
			let finalStatus: IndexStatus;
			const isPaused = this.pausedWorkspaces.has(key);
			const wasCancelled = !!token?.isCancellationRequested;
			const isComplete = indexedCount >= allFiles.length; // Compare against all files, not just remaining

			if (isPaused) {
				// Still paused - keep in Indexing state with paused flag
				finalStatus = {
					...statusWithTotal,
					state: IndexState.Indexing,
					indexedFiles: indexedCount,
					totalChunks,
					embeddedChunks,
					paused: true,
					modelDownloadState: 'ready',
				};
				this.statusMap.set(key, finalStatus);
				this._onDidChangeStatus.fire(finalStatus);
				this.savePersistedStatus(workspacePath, finalStatus, { runId, runState: 'paused', completedFiles });
				this.logService.info(`[CloudIndexService] Indexing paused: ${indexedCount} files, ${totalChunks} chunks`);
			} else if (!wasCancelled && isComplete) {
				// Completed successfully - mark as ready
				const now = Date.now();
				finalStatus = {
					...statusWithTotal,
					state: IndexState.Ready,
					indexedFiles: indexedCount,
					totalChunks,
					embeddedChunks,
					lastFullScanTime: now,
					lastIndexedTime: now,
					paused: false,
					modelDownloadState: 'ready', // Ensure modelDownloadState is always set for cloud indexing
				};
				this.statusMap.set(key, finalStatus);
				this._onDidChangeStatus.fire(finalStatus);
				// Clear checkpoint on successful completion
				this.savePersistedStatus(workspacePath, finalStatus, { runId, runState: 'complete', completedFiles });
				this.logService.info(`[CloudIndexService] Full index build complete: ${indexedCount} files, ${totalChunks} chunks`);
			} else {
				// Interrupted or partial - do not claim Ready, save checkpoint for resume
				finalStatus = {
					...statusWithTotal,
					state: IndexState.Degraded,
					indexedFiles: indexedCount,
					totalChunks,
					embeddedChunks,
					paused: false,
					degradedReason: wasCancelled
						? 'Indexing was interrupted. Click Sync to resume from checkpoint.'
						: `Indexing partially complete (${indexedCount.toLocaleString()} of ${allFiles.length.toLocaleString()} files). Click Sync to resume.`,
					modelDownloadState: 'ready',
				};
				this.statusMap.set(key, finalStatus);
				this._onDidChangeStatus.fire(finalStatus);
				// Save checkpoint so we can resume later
				this.savePersistedStatus(workspacePath, finalStatus, { runId, runState: 'interrupted', completedFiles });
				this.logService.warn(`[CloudIndexService] Full index build incomplete: ${indexedCount}/${allFiles.length} files, cancelled=${wasCancelled}`);
			}

			// Validate by checking Pinecone stats (only when Ready)
			if (finalStatus.state === IndexState.Ready) {
				try {
					const namespace = getNamespace(this.userId, workspacePath);
					const stats = await this.pineconeStore.getNamespaceStats(namespace);

					if (stats.vectorCount !== totalChunks) {
						this.logService.warn(`[CloudIndexService] Pinecone vector count mismatch: expected ${totalChunks}, got ${stats.vectorCount}`);
					} else {
						this.logService.info(`[CloudIndexService] Pinecone validation passed: ${stats.vectorCount} vectors indexed`);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					this.logService.warn(`[CloudIndexService] Pinecone validation failed: ${msg}`);
				}
			}

			// Start file watcher for incremental updates (only when Ready)
			if (finalStatus.state === IndexState.Ready) {
				this.startWatcher(workspace);
			}

			return finalStatus;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[CloudIndexService] Full index build failed: ${message}`);

			const errorStatus: IndexStatus = {
				...status,
				state: IndexState.Error,
				errorMessage: message,
			};
			this.statusMap.set(key, errorStatus);
			this._onDidChangeStatus.fire(errorStatus);
			return errorStatus;
		}
	}

	private async discoverFiles(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<URI[]> {
		const workspacePath = this.resolveWorkspacePath(workspace);

		if (!workspacePath) {
			this.logService.warn('[CloudIndexService] Cannot discover files: no workspace path');
			return [];
		}

		const rootUri = URI.file(workspacePath);
		const files: URI[] = [];

		try {
			// Simple recursive file discovery
			// In production, this should respect .gitignore and .cursorignore
			const entries = await this.fileService.resolve(rootUri);
			if (!entries) {
				this.logService.warn('[CloudIndexService] File service returned no entries for workspace');
				return [];
			}
			await this.discoverFilesRecursive(entries.resource, files, token);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[CloudIndexService] File discovery failed: ${message}`, error);
		}

		return files;
	}

	private async discoverFilesRecursive(dir: URI, files: URI[], token?: CancellationToken, depth = 0): Promise<void> {
		if (token?.isCancellationRequested || depth > 20) {
			return; // Prevent infinite recursion
		}

		try {
			const entries = await this.fileService.resolve(dir);
			if (entries.children) {
				for (const child of entries.children) {
					if (token?.isCancellationRequested) {
						return;
					}

					if (child.isDirectory) {
						// Skip node_modules, .git, etc.
						const name = child.name.toLowerCase();
						if (name === 'node_modules' || name === '.git' || name === '.vscode' || name === 'dist' || name === 'build') {
							continue;
						}
						await this.discoverFilesRecursive(child.resource, files, token, depth + 1);
					} else if (child.isFile) {
						// Only index text files (simple extension check)
						const ext = child.name.split('.').pop()?.toLowerCase();
						const textExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'hpp', 'cs', 'php', 'rb', 'swift', 'kt', 'scala', 'md', 'txt', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss', 'less'];
						if (ext && textExtensions.includes(ext)) {
							files.push(child.resource);
						}
					}
				}
			}
		} catch (error) {
			// Ignore permission errors
			this.logService.trace(`[CloudIndexService] Could not read directory ${dir.fsPath}:`, error);
		}
	}

	private async indexFile(
		workspace: IAnyWorkspaceIdentifier,
		uri: URI,
		chunkSize: number,
		embeddingBatchSize: number,
		token?: CancellationToken
	): Promise<number> {
		const key = this.getWorkspaceKey(workspace);
		if (token?.isCancellationRequested || this.pausedWorkspaces.has(key)) {
			return 0;
		}

		try {
			// Read file content
			const content = await this.fileService.readFile(uri);
			const text = content.value.toString();

			// Chunk the file
			const chunks = chunkByLines(text, uri, undefined, chunkSize);

			if (chunks.length === 0) {
				return 0;
			}

			// Get workspace path and namespace
			const workspacePath = this.resolveWorkspacePath(workspace);
			if (!workspacePath) {
				return 0;
			}
			const namespace = getNamespace(this.userId, workspacePath);
			const relativePath = uri.fsPath.replace(workspacePath, '').replace(/^\/+/, '');

			// Generate embeddings in batches
			const vectors: VectorRecord[] = [];
			for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
				const key = this.getWorkspaceKey(workspace);
				if (token?.isCancellationRequested || this.pausedWorkspaces.has(key)) {
					break;
				}

				// Add delay between embedding batches to avoid rate limits
				// With 2,000 RPM (33 req/sec), we can use 30ms delay = ~33 requests/second
				// Using 30ms to stay well under the limit
				if (i > 0) {
					await new Promise(resolve => setTimeout(resolve, 30));
				}

				const batch = chunks.slice(i, i + embeddingBatchSize);
				const texts = batch.map(c => c.content);
				const embeddings = await this.voyageService.embed(texts, 'document');

				// Create vector records
				for (let j = 0; j < batch.length; j++) {
					const chunk = batch[j];
					const vectorId = getVectorId(workspacePath, relativePath, i + j);
					vectors.push({
						id: vectorId,
						values: embeddings[j],
						metadata: {
							userId: this.userId,
							workspaceId: workspacePath,
							workspacePath,
							filePath: relativePath,
							startLine: chunk.range?.start.lineNumber ?? 1,
							endLine: chunk.range?.end.lineNumber ?? 1,
							languageId: chunk.languageId || '',
							content: chunk.content.substring(0, 1000),
							indexedAt: Date.now(),
						},
					});
				}
			}

			// Upsert to Pinecone
			if (vectors.length > 0) {
				await this.pineconeStore.upsert(namespace, vectors);
			}

			return chunks.length;
		} catch (error) {
			this.logService.error(`[CloudIndexService] Failed to index file ${uri.fsPath}:`, error);
			throw error;
		}
	}

	async refreshPaths(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus> {
		if (!this.isEnabled()) {
			return this.getStatusInternal(workspace);
		}

		const key = this.getWorkspaceKey(workspace);
		const status = await this.getStatusInternal(workspace);
		const chunkSize = this.configurationService.getValue<number>(CONFIG_CHUNK_SIZE_LINES) ?? 200;
		const embeddingBatchSize = this.configurationService.getValue<number>(CONFIG_CLOUD_EMBEDDING_BATCH_SIZE) ?? 50;

		// Update status to Indexing
		const indexingStatus: IndexStatus = {
			...status,
			state: IndexState.Indexing,
		};
		this.statusMap.set(key, indexingStatus);
		this._onDidChangeStatus.fire(indexingStatus);

		try {
			for (const uri of uris) {
				const key = this.getWorkspaceKey(workspace);
				if (token?.isCancellationRequested || this.pausedWorkspaces.has(key)) {
					break;
				}
				await this.indexFile(workspace, uri, chunkSize, embeddingBatchSize, token);
			}

			const finalStatus: IndexStatus = {
				...status,
				state: IndexState.Ready,
			};
			this.statusMap.set(key, finalStatus);
			this._onDidChangeStatus.fire(finalStatus);
			return finalStatus;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const errorStatus: IndexStatus = {
				...status,
				state: IndexState.Error,
				errorMessage: message,
			};
			this.statusMap.set(key, errorStatus);
			this._onDidChangeStatus.fire(errorStatus);
			return errorStatus;
		}
	}

	private startWatcher(workspace: IAnyWorkspaceIdentifier): void {
		const key = this.getWorkspaceKey(workspace);
		if (this.watchers.has(key)) {
			return; // Already watching
		}

		const workspacePath = this.resolveWorkspacePath(workspace);
		if (!workspacePath) {
			return;
		}

		const rootUri = URI.file(workspacePath);
		const watcher = new IndexWatcher(this.fileService, [rootUri]);

		watcher.onDidBatch(async (event: WatcherEvent) => {
			if (this.pausedWorkspaces.has(key)) {
				return;
			}

			// Index changed/added files
			const filesToIndex = [...event.added, ...event.changed];
			if (filesToIndex.length > 0) {
				await this.refreshPaths(workspace, filesToIndex);
			}

			// Delete vectors for removed files
			if (event.deleted.length > 0) {
				// TODO: Implement deletion
				this.logService.trace(`[CloudIndexService] Files deleted (not yet handled): ${event.deleted.length}`);
			}
		});

		watcher.start();
		this.watchers.set(key, watcher);
		this._register(watcher);
	}

	async indexSavedFiles?(workspace: IAnyWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus> {
		return this.refreshPaths(workspace, uris, token);
	}

	async deleteIndex?(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<void> {
		const key = this.getWorkspaceKey(workspace);
		const workspacePath = this.resolveWorkspacePath(workspace);

		if (!workspacePath) {
			return;
		}

		const namespace = getNamespace(this.userId, workspacePath);
		await this.pineconeStore.deleteNamespace(namespace);

		// Stop watcher
		const watcher = this.watchers.get(key);
		if (watcher) {
			watcher.stop();
			this.watchers.delete(key);
		}

		// Clear persisted snapshot and reset paused state
		this.clearPersistedStatus(workspacePath);
		this.pausedWorkspaces.delete(key);

		// Clear status + notify UI
		const idleStatus: IndexStatus = {
			workspace,
			state: IndexState.Idle,
			totalFiles: 0,
			indexedFiles: 0,
			totalChunks: 0,
			embeddedChunks: 0,
			paused: false,
			modelDownloadState: 'ready',
		};
		this.statusMap.set(key, idleStatus);
		this._onDidChangeStatus.fire(idleStatus);
	}

	async pause(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		const key = this.getWorkspaceKey(workspace);
		this.pausedWorkspaces.add(key);
		const status = await this.getStatusInternal(workspace);
		this._onDidChangeStatus.fire({ ...status, paused: true, pausedReason: reason });
	}

	async resume(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		const key = this.getWorkspaceKey(workspace);
		this.pausedWorkspaces.delete(key);
		const status = await this.getStatusInternal(workspace);
		this._onDidChangeStatus.fire({ ...status, paused: false });
	}

	async rebuildWorkspaceIndex(workspace: IAnyWorkspaceIdentifier, reason?: string): Promise<void> {
		// Delete and rebuild
		await this.deleteIndex?.(workspace);
		await this.buildFullIndex(workspace);
	}

	/**
	 * Get diagnostics for the index - used for debugging and verification.
	 * Task F: Provides verification & diagnostics to validate Pinecone contents.
	 */
	async getDiagnostics(workspace: IAnyWorkspaceIdentifier, token?: CancellationToken): Promise<{
		workspace: IAnyWorkspaceIdentifier;
		state: IndexState;
		totalFiles: number;
		indexedFiles: number;
		totalChunks: number;
		embeddedChunks: number;
		embeddingModel?: string;
		lastIndexedTime?: number;
		lastError?: string;
		// Extended diagnostics
		namespace?: string;
		pineconeVectorCount?: number;
		pineconeConnected?: boolean;
		checkpointRunId?: number;
		checkpointRunState?: string;
		checkpointFilesCount?: number;
		sampleQueryHitCount?: number;
	}> {
		const status = await this.getStatusInternal(workspace);
		const workspacePath = this.resolveWorkspacePath(workspace);

		const diagnostics: ReturnType<typeof this.getDiagnostics> extends Promise<infer T> ? T : never = {
			workspace: status.workspace,
			state: status.state,
			totalFiles: status.totalFiles ?? 0,
			indexedFiles: status.indexedFiles ?? 0,
			totalChunks: status.totalChunks ?? 0,
			embeddedChunks: status.embeddedChunks ?? 0,
			embeddingModel: 'voyage-code-3',
			lastIndexedTime: status.lastIndexedTime,
			lastError: status.errorMessage || status.degradedReason,
		};

		if (workspacePath) {
			const namespace = getNamespace(this.userId, workspacePath);
			diagnostics.namespace = namespace;

			// Load checkpoint info
			const checkpoint = this.loadPersistedStatus(workspacePath);
			if (checkpoint) {
				diagnostics.checkpointRunId = checkpoint.runId;
				diagnostics.checkpointRunState = checkpoint.runState;
				diagnostics.checkpointFilesCount = checkpoint.completedFilePaths?.length ?? 0;
			}

			// Try to get Pinecone stats
			try {
				const stats = await this.pineconeStore.getNamespaceStats(namespace);
				diagnostics.pineconeVectorCount = stats.vectorCount;
				diagnostics.pineconeConnected = true;
			} catch (err) {
				diagnostics.pineconeConnected = false;
				this.logService.trace('[CloudIndexService] Diagnostics: Failed to get Pinecone stats', err);
			}

			// Try a sample query to verify search works
			try {
				// Only if we have vectors
				if (diagnostics.pineconeVectorCount && diagnostics.pineconeVectorCount > 0) {
					const testEmbedding = await this.voyageService.embed(['test query'], 'query');
					if (testEmbedding.length > 0) {
						const results = await this.pineconeStore.query(namespace, testEmbedding[0], 5);
						diagnostics.sampleQueryHitCount = results.length;
					}
				}
			} catch (err) {
				this.logService.trace('[CloudIndexService] Diagnostics: Sample query failed', err);
				diagnostics.sampleQueryHitCount = 0;
			}
		}

		return diagnostics;
	}
}
