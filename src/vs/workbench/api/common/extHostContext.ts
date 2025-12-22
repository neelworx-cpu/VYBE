/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { URI } from '../../../base/common/uri.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DevSimilarChunkHitDto } from './extHost.protocol.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
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
	};
};


type SqliteDeps = {
	sqlite: SqliteModule;
	fs: typeof import('fs');
	path: typeof import('path');
};

const nodeRequire = createRequire(import.meta.url);

function getNodeDeps(): SqliteDeps | undefined {
	try {
		const sqlite = nodeRequire('@vscode/sqlite3') as SqliteModule;
		const fs = nodeRequire('fs');
		const path = nodeRequire('path');
		return { sqlite, fs, path };
	} catch (e) {
		return undefined;
	}
}

// Phase 11: Context assembly types
export interface ContextItem {
	readonly filePath: string;
	readonly snippet: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly score: number;
	readonly reason: string; // e.g., "semantic_match", "recent_file", "active_file"
}

export interface ContextAssemblyOptions {
	readonly maxChars?: number;
	readonly maxTokens?: number; // Optional, approximate (4 chars per token)
	readonly preferIndexed?: boolean;
	readonly preferRecent?: boolean;
	readonly preferActive?: boolean;
}

export interface RepoOverview {
	readonly totalFiles: number;
	readonly indexedFiles: number;
	readonly totalChunks: number;
	readonly folders: Array<{
		readonly path: string;
		readonly fileCount: number;
		readonly totalSize: number;
		readonly languages: Record<string, number>;
	}>;
	readonly recentFiles: Array<{
		readonly path: string;
		readonly lastIndexedTime: number;
		readonly size: number;
		readonly languageId?: string;
	}>;
}

// Phase 11: Time budgets
const CONTEXT_ASSEMBLY_TIME_BUDGET_MS = 5_000; // 5 seconds
const REPO_OVERVIEW_TIME_BUDGET_MS = 2_000; // 2 seconds
const DEFAULT_MAX_CHARS = 50_000;

// Phase 11: Helper to approximate tokens (4 chars per token)
function approximateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

// Phase 11: Helper to check if two line ranges overlap
function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
	return !(end1 < start2 || end2 < start1);
}

// Phase 11: Helper to merge adjacent chunks from same file
function mergeAdjacentChunks(chunks: Array<{ filePath: string; startLine: number; endLine: number; content: string }>): Array<{ filePath: string; startLine: number; endLine: number; content: string }> {
	const byFile = new Map<string, Array<{ startLine: number; endLine: number; content: string }>>();
	for (const chunk of chunks) {
		if (!byFile.has(chunk.filePath)) {
			byFile.set(chunk.filePath, []);
		}
		byFile.get(chunk.filePath)!.push({ startLine: chunk.startLine, endLine: chunk.endLine, content: chunk.content });
	}

	const merged: Array<{ filePath: string; startLine: number; endLine: number; content: string }> = [];
	for (const [filePath, fileChunks] of byFile) {
		// Sort by start line
		fileChunks.sort((a, b) => a.startLine - b.startLine);

		// Merge adjacent or overlapping chunks
		let current = fileChunks[0];
		for (let i = 1; i < fileChunks.length; i++) {
			const next = fileChunks[i];
			// If adjacent (end + 1 = start) or overlapping, merge
			if (next.startLine <= current.endLine + 1) {
				current = {
					startLine: current.startLine,
					endLine: Math.max(current.endLine, next.endLine),
					content: current.content + '\n' + next.content
				};
			} else {
				merged.push({ filePath, ...current });
				current = next;
			}
		}
		merged.push({ filePath, ...current });
	}

	return merged;
}

/**
 * Phase 11: Context assembly engine that transforms retrieved chunks into
 * bounded, deterministic context packages suitable for LLM prompts.
 */
export class ExtHostContext {
	constructor(
		private readonly indexingService: { $querySimilarChunksInternal(workspaceId: string, query: string, topK: number): Promise<DevSimilarChunkHitDto[]> },
		private readonly logService: ILogService,
		private readonly initData: IExtHostInitDataService,
		private readonly documentsAndEditors?: IExtHostDocumentsAndEditors
	) {
		// Phase 11: Context service initialized
	}

	private getDbPathForWorkspace(workspaceId: string, deps: SqliteDeps): string {
		const basePath = this.initData.environment.workspaceStorageHome.fsPath;
		const folder = workspaceId || 'default';
		return deps.path.join(basePath, folder, 'vybe-index.db');
	}

	/**
	 * Phase 11: Assemble context for a query with budget enforcement.
	 */
	async assembleContextForQuery(
		workspaceId: string,
		query: string,
		options: ContextAssemblyOptions,
		token: CancellationToken
	): Promise<ContextItem[]> {
		const startTime = Date.now();
		const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
		const maxTokens = options.maxTokens;

		try {
			// Step 1: Get semantic matches via retrieval
			const topK = 50; // Get more candidates than needed for filtering
			const hits = await this.indexingService.$querySimilarChunksInternal(workspaceId, query, topK);

			if (hits.length === 0) {
				this.logService.info('[ExtHostContext] no semantic matches found', { workspaceId, query });
				return [];
			}

			// Step 2: Fetch full chunk content from DB
			const deps = getNodeDeps();
			if (!deps) {
				this.logService.warn('[ExtHostContext] sqlite deps missing, returning partial context');
				// Return what we have from retrieval (snippets may be truncated)
				return hits.map(hit => ({
					filePath: hit.filePath,
					snippet: hit.snippet ?? '',
					startLine: 0,
					endLine: 0,
					score: hit.compositeScore ?? hit.similarityScore,
					reason: 'semantic_match'
				}));
			}

			const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

			const db = new deps.sqlite.Database(dbPath);
			const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
				new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
			const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

			try {
				// Fetch chunk details
				const chunkKeys = hits.map(h => ({ filePath: h.filePath, chunkId: h.chunkId }));
				const whereParts: string[] = [];
				const params: SqliteParams = [workspaceId];
				for (const key of chunkKeys) {
					whereParts.push('(filePath=? AND chunkId=?)');
					params.push(key.filePath, key.chunkId);
				}

				const chunkRows = await all<{ filePath: string; chunkId: string; content: string | null; startLine: number; endLine: number }>(
					`SELECT filePath, chunkId, content, startLine, endLine
					 FROM chunks
					 WHERE workspaceId=? AND (${whereParts.join(' OR ')})`,
					params
				);

				// Fetch file metadata for preferences
				const filePaths = Array.from(new Set(hits.map(h => h.filePath)));
				const fileParams: SqliteParams = [workspaceId, ...filePaths];
				const placeholders = filePaths.map(() => '?').join(',');
				const fileRows = await all<{ path: string; status: string | null; lastIndexedTime: number | null }>(
					`SELECT path, status, lastIndexedTime FROM files WHERE workspaceId=? AND path IN (${placeholders})`,
					fileParams
				);

				const fileMetadata = new Map<string, { status: string | null; lastIndexedTime: number | null }>();
				for (const row of fileRows) {
					fileMetadata.set(row.path, { status: row.status, lastIndexedTime: row.lastIndexedTime });
				}

				// Get active/open files if available
				// File paths in DB are stored as rootId/relativePath, so we need to map
				// absolute editor URIs to DB paths by querying the roots table.
				const activeFileDbPaths = new Set<string>();
				if (options.preferActive && this.documentsAndEditors) {
					try {
						// Get root mappings from DB
						const rootRows = await all<{ rootId: string; uri: string }>(
							`SELECT rootId, uri FROM roots WHERE workspaceId=?`,
							[workspaceId]
						);
						const rootMap = new Map<string, string>(); // rootId -> rootUri
						for (const row of rootRows) {
							rootMap.set(row.rootId, row.uri);
						}

						const activeEditor = this.documentsAndEditors.activeEditor();
						if (activeEditor?.document?.uri) {
							const uri = activeEditor.document.uri;
							if (uri.scheme === 'file') {
								// Find matching root and compute relative path
								for (const [rootId, rootUriStr] of rootMap) {
									const rootUri = URI.parse(rootUriStr);
									if (uri.fsPath.startsWith(rootUri.fsPath)) {
										const relPath = deps.path.relative(rootUri.fsPath, uri.fsPath);
										const dbPath = `${rootId}/${relPath.split(deps.path.sep).join('/')}`;
										activeFileDbPaths.add(dbPath);
										break;
									}
								}
							}
						}
						const allEditors = this.documentsAndEditors.allEditors();
						for (const editor of allEditors) {
							const editorValue = editor.value;
							if (editorValue?.document?.uri) {
								const uri = editorValue.document.uri;
								if (uri.scheme === 'file') {
									for (const [rootId, rootUriStr] of rootMap) {
										const rootUri = URI.parse(rootUriStr);
										if (uri.fsPath.startsWith(rootUri.fsPath)) {
											const relPath = deps.path.relative(rootUri.fsPath, uri.fsPath);
											const dbPath = `${rootId}/${relPath.split(deps.path.sep).join('/')}`;
											activeFileDbPaths.add(dbPath);
											break;
										}
									}
								}
							}
						}
					} catch (e) {
						// Active files unavailable, continue without them
						this.logService.trace('[ExtHostContext] could not get active files', e);
					}
				}

				// Build chunk map
				const chunkMap = new Map<string, { content: string; startLine: number; endLine: number }>();
				for (const row of chunkRows) {
					const key = `${row.filePath}|${row.chunkId}`;
					chunkMap.set(key, {
						content: row.content ?? '',
						startLine: row.startLine ?? 0,
						endLine: row.endLine ?? 0
					});
				}

				// Step 3: Apply assembly rules (deduplicate, collapse, prefer)
				const chunksWithMetadata: Array<{
					filePath: string;
					startLine: number;
					endLine: number;
					content: string;
					score: number;
					reason: string;
					isActive: boolean;
					isIndexed: boolean;
					lastIndexedTime: number | null;
				}> = [];

				for (const hit of hits) {
					const key = `${hit.filePath}|${hit.chunkId}`;
					const chunkData = chunkMap.get(key);
					if (!chunkData) {
						continue; // Skip if chunk not found
					}

					const metadata = fileMetadata.get(hit.filePath);
					const isActive = activeFileDbPaths.has(hit.filePath);
					const isIndexed = metadata?.status === 'indexed';

					chunksWithMetadata.push({
						filePath: hit.filePath,
						startLine: chunkData.startLine,
						endLine: chunkData.endLine,
						content: chunkData.content,
						score: hit.compositeScore ?? hit.similarityScore,
						reason: isActive ? 'active_file' : (isIndexed ? 'indexed_file' : 'semantic_match'),
						isActive,
						isIndexed,
						lastIndexedTime: metadata?.lastIndexedTime ?? null
					});
				}

				// Deduplicate overlapping chunks from same file
				const deduplicated: typeof chunksWithMetadata = [];
				const byFile = new Map<string, typeof chunksWithMetadata>();
				for (const chunk of chunksWithMetadata) {
					if (!byFile.has(chunk.filePath)) {
						byFile.set(chunk.filePath, []);
					}
					byFile.get(chunk.filePath)!.push(chunk);
				}

				for (const [, fileChunks] of byFile) {
					// Sort by start line
					fileChunks.sort((a, b) => a.startLine - b.startLine);

					// Remove overlapping chunks (keep highest scoring)
					const nonOverlapping: typeof chunksWithMetadata = [];
					for (const chunk of fileChunks) {
						let overlaps = false;
						for (const existing of nonOverlapping) {
							if (rangesOverlap(chunk.startLine, chunk.endLine, existing.startLine, existing.endLine)) {
								overlaps = true;
								// Keep the one with higher score
								if (chunk.score > existing.score) {
									const idx = nonOverlapping.indexOf(existing);
									nonOverlapping[idx] = chunk;
								}
								break;
							}
						}
						if (!overlaps) {
							nonOverlapping.push(chunk);
						}
					}
					deduplicated.push(...nonOverlapping);
				}

				// Collapse adjacent chunks
				const collapsed = mergeAdjacentChunks(deduplicated);

				// Rebuild with metadata
				const collapsedWithMetadata: typeof chunksWithMetadata = [];
				for (const collapsedChunk of collapsed) {
					// Find original chunks that contributed to this merged chunk
					const contributing = deduplicated.filter(c =>
						c.filePath === collapsedChunk.filePath &&
						rangesOverlap(c.startLine, c.endLine, collapsedChunk.startLine, collapsedChunk.endLine)
					);
					if (contributing.length > 0) {
						// Use max score and most specific reason
						const maxScore = Math.max(...contributing.map(c => c.score));
						const reasons = contributing.map(c => c.reason);
						const reason = reasons.includes('active_file') ? 'active_file' :
							reasons.includes('indexed_file') ? 'indexed_file' : 'semantic_match';

						collapsedWithMetadata.push({
							filePath: collapsedChunk.filePath,
							startLine: collapsedChunk.startLine,
							endLine: collapsedChunk.endLine,
							content: collapsedChunk.content,
							score: maxScore,
							reason,
							isActive: contributing.some(c => c.isActive),
							isIndexed: contributing.some(c => c.isIndexed),
							lastIndexedTime: contributing[0]?.lastIndexedTime ?? null
						});
					}
				}

				// Step 4: Sort by preference order
				collapsedWithMetadata.sort((a, b) => {
					// 1. Active files first (if preferActive)
					if (options.preferActive) {
						if (a.isActive && !b.isActive) return -1;
						if (!a.isActive && b.isActive) return 1;
					}
					// 2. Indexed over discovered (if preferIndexed)
					if (options.preferIndexed) {
						if (a.isIndexed && !b.isIndexed) return -1;
						if (!a.isIndexed && b.isIndexed) return 1;
					}
					// 3. Recent files (if preferRecent)
					if (options.preferRecent) {
						const aTime = a.lastIndexedTime ?? 0;
						const bTime = b.lastIndexedTime ?? 0;
						if (aTime !== bTime) {
							return bTime - aTime; // Higher time = more recent
						}
					}
					// 4. Higher semantic score
					return b.score - a.score;
				});

				// Step 5: Enforce budget
				const result: ContextItem[] = [];
				let totalChars = 0;
				let totalTokens = 0;

				for (const chunk of collapsedWithMetadata) {
					// Check time budget
					if (Date.now() - startTime > CONTEXT_ASSEMBLY_TIME_BUDGET_MS) {
						this.logService.warn('[ExtHostContext] time budget exceeded', {
							workspaceId,
							elapsed: Date.now() - startTime,
							itemsAdded: result.length
						});
						break;
					}

					if (token.isCancellationRequested) {
						break;
					}

					const chunkChars = chunk.content.length;
					const chunkTokens = approximateTokens(chunkChars);

					// Check if adding this chunk would exceed budget
					if (totalChars + chunkChars > maxChars) {
						// Try to add partial chunk if there's room
						const remainingChars = maxChars - totalChars;
						if (remainingChars > 100) { // Only if meaningful amount left
							const partialContent = chunk.content.substring(0, remainingChars);
							result.push({
								filePath: chunk.filePath,
								snippet: partialContent,
								startLine: chunk.startLine,
								endLine: chunk.startLine + Math.floor(remainingChars / 50), // Rough estimate
								score: chunk.score,
								reason: chunk.reason + '_truncated'
							});
							totalChars += remainingChars;
							totalTokens += approximateTokens(remainingChars);
						}
						break;
					}

					if (maxTokens && totalTokens + chunkTokens > maxTokens) {
						break;
					}

					result.push({
						filePath: chunk.filePath,
						snippet: chunk.content,
						startLine: chunk.startLine,
						endLine: chunk.endLine,
						score: chunk.score,
						reason: chunk.reason
					});

					totalChars += chunkChars;
					totalTokens += chunkTokens;
				}

				this.logService.info('[ExtHostContext] context assembled', {
					workspaceId,
					queryLength: query.length,
					requestedMaxChars: maxChars,
					requestedMaxTokens: maxTokens,
					actualChars: totalChars,
					actualTokens: totalTokens,
					itemsCount: result.length,
					timeMs: Date.now() - startTime
				});

				return result;
			} finally {
				await close();
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostContext] context assembly failed', { workspaceId, query, message });
			// Return empty context on error
			return [];
		}
	}

	/**
	 * Phase 11: Get repo overview with folder structure and recent files.
	 */
	async getRepoOverview(workspaceId: string, token: CancellationToken): Promise<RepoOverview> {
		const startTime = Date.now();
		const deps = getNodeDeps();
		if (!deps) {
			this.logService.warn('[ExtHostContext] sqlite deps missing for repo overview');
			return {
				totalFiles: 0,
				indexedFiles: 0,
				totalChunks: 0,
				folders: [],
				recentFiles: []
			};
		}

		const dbPath = this.getDbPathForWorkspace(workspaceId, deps);
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });

		const db = new deps.sqlite.Database(dbPath);
		const all = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
		const get = <T = SqliteRow>(sql: string, params: SqliteParams = []) =>
			new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
		const close = () => new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));

		try {
			// Check time budget
			if (Date.now() - startTime > REPO_OVERVIEW_TIME_BUDGET_MS) {
				this.logService.warn('[ExtHostContext] repo overview time budget exceeded before start');
				return {
					totalFiles: 0,
					indexedFiles: 0,
					totalChunks: 0,
					folders: [],
					recentFiles: []
				};
			}

			// Get basic counts
			const totalFilesRow = await get<{ c: number }>(
				`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND (deleted IS NULL OR deleted=0)`,
				[workspaceId]
			);
			const indexedFilesRow = await get<{ c: number }>(
				`SELECT COUNT(*) as c FROM files WHERE workspaceId=? AND status='indexed' AND (deleted IS NULL OR deleted=0)`,
				[workspaceId]
			);
			const totalChunksRow = await get<{ c: number }>(
				`SELECT COUNT(*) as c FROM chunks WHERE workspaceId=?`,
				[workspaceId]
			);

			const totalFiles = totalFilesRow?.c ?? 0;
			const indexedFiles = indexedFilesRow?.c ?? 0;
			const totalChunks = totalChunksRow?.c ?? 0;

			// Get folder structure
			const folderRows = await all<{ folderPath: string; fileCount: number; totalSize: number; languageId: string | null }>(
				`SELECT folderPath, COUNT(*) as fileCount, SUM(size) as totalSize, languageId
				 FROM files
				 WHERE workspaceId=? AND (deleted IS NULL OR deleted=0) AND folderPath IS NOT NULL
				 GROUP BY folderPath, languageId`,
				[workspaceId]
			);

			// Aggregate by folder (combine language stats)
			const folderMap = new Map<string, { fileCount: number; totalSize: number; languages: Record<string, number> }>();
			for (const row of folderRows) {
				const folderPath = row.folderPath ?? '';
				if (!folderMap.has(folderPath)) {
					folderMap.set(folderPath, { fileCount: 0, totalSize: 0, languages: {} });
				}
				const folder = folderMap.get(folderPath)!;
				folder.fileCount += row.fileCount ?? 0;
				folder.totalSize += row.totalSize ?? 0;
				if (row.languageId) {
					folder.languages[row.languageId] = (folder.languages[row.languageId] ?? 0) + (row.fileCount ?? 0);
				}
			}

			const folders = Array.from(folderMap.entries()).map(([path, data]) => ({
				path,
				fileCount: data.fileCount,
				totalSize: data.totalSize,
				languages: data.languages
			}));

			// Get recent files
			const recentFileRows = await all<{ path: string; lastIndexedTime: number; size: number; languageId: string | null }>(
				`SELECT path, lastIndexedTime, size, languageId
				 FROM files
				 WHERE workspaceId=? AND lastIndexedTime IS NOT NULL AND (deleted IS NULL OR deleted=0)
				 ORDER BY lastIndexedTime DESC
				 LIMIT 50`,
				[workspaceId]
			);

			const recentFiles = recentFileRows.map(row => ({
				path: row.path,
				lastIndexedTime: row.lastIndexedTime ?? 0,
				size: row.size ?? 0,
				languageId: row.languageId ?? undefined
			}));

			this.logService.info('[ExtHostContext] repo overview computed', {
				workspaceId,
				totalFiles,
				indexedFiles,
				totalChunks,
				foldersCount: folders.length,
				recentFilesCount: recentFiles.length,
				timeMs: Date.now() - startTime
			});

			return {
				totalFiles,
				indexedFiles,
				totalChunks,
				folders,
				recentFiles
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[ExtHostContext] repo overview failed', { workspaceId, message });
			return {
				totalFiles: 0,
				indexedFiles: 0,
				totalChunks: 0,
				folders: [],
				recentFiles: []
			};
		} finally {
			await close();
		}
	}
}

