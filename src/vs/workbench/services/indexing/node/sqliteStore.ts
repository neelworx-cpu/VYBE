/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative } from '../../../../base/common/platform.js';

// Node-only lazy requires to avoid bundling in browser/renderer.
type SqliteModule = {
	Database: new (...args: any[]) => {
		run(sql: string, params: any[], cb?: (err: Error | null) => void): void;
		get(sql: string, params: any[], cb?: (err: Error | null, row: any) => void): void;
		all(sql: string, params: any[], cb?: (err: Error | null, rows: any[]) => void): void;
		prepare(sql: string): {
			run(params: any[], cb?: (err: Error | null) => void): void;
			finalize(cb?: (err: Error | null) => void): void;
		};
		exec(sql: string, cb: (err: Error | null) => void): void;
		serialize(cb: () => void): void;
		close(cb: (err: Error | null) => void): void;
	};
};

type SqliteDatabase = InstanceType<SqliteModule['Database']>;

function getNodeDeps(): { sqlite: SqliteModule; path: typeof import('path'); fs: typeof import('fs') } | undefined {
	if (!isNative || typeof require !== 'function') {
		return undefined;
	}
	try {
		const sqlite = require('@vscode/sqlite3') as SqliteModule;
		const path = require('path') as typeof import('path');
		const fs = require('fs') as typeof import('fs');
		return { sqlite, path, fs };
	} catch {
		return undefined;
	}
}
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

export interface StoredChunk {
	id: string;
	uri: URI;
	workspace: string;
	content: string;
	startLine: number;
	endLine: number;
	startChar: number;
	endChar: number;
	languageId: string;
	score: number;
	hash: string;
}

export interface StoredEmbedding {
	chunkId: string;
	uri: URI;
	workspace: string;
	languageId: string;
	model: string;
	dim: number;
	norm: number;
	vector: Float32Array;
}

export interface FileMeta {
	filePath: string;
	workspace: string;
	lastModified: number;
	hash: string;
	size?: number;
}

interface MetadataEntry {
	key: string;
	value: string;
}

export class SqliteStore {
	private readonly dbCache = new Map<string, InstanceType<SqliteModule['Database']>>();

	/**
	 * When true, the store is considered inert for the lifetime of the
	 * process. This typically happens when `@vscode/sqlite3` cannot be
	 * loaded or when the database cannot be opened at all. All operations
	 * will become no-ops in this case.
	 */
	private dbUnavailable = false;
	private dbUnavailableReason: string | undefined;

	constructor(
		private readonly environmentService: IEnvironmentService,
		_fileService: IFileService,
		private readonly logService: ILogService,
	) { }

	private workspaceKey(workspace: IWorkspaceIdentifier): string {
		return workspace.id ?? workspace.configPath.fsPath;
	}

	private dbPath(workspace: IWorkspaceIdentifier, path: typeof import('path')): string {
		const storageHome = this.environmentService.workspaceStorageHome.fsPath;
		const workspaceId = workspace.id ?? path.basename(workspace.configPath.fsPath);
		return path.join(storageHome, workspaceId, 'vybe-index.db');
	}

	/**
	 * Returns the effective on-disk database path for the given workspace
	 * when running in a native environment. When SQLite is not available,
	 * this returns undefined so callers can surface a meaningful diagnostic.
	 */
	getDbPath(workspace: IWorkspaceIdentifier): string | undefined {
		const deps = getNodeDeps();
		if (!deps) {
			return undefined;
		}
		return this.dbPath(workspace, deps.path);
	}

	/**
	 * Whether the underlying SQLite store is available. When this returns
	 * false, callers should treat the index as unavailable and surface an
	 * error state instead of pretending the index is simply empty.
	 */
	isAvailable(): boolean {
		if (this.dbUnavailable) {
			return false;
		}
		const deps = getNodeDeps();
		if (!deps) {
			this.markUnavailable('Native sqlite dependencies are not available; local index store is disabled.');
			return false;
		}
		return true;
	}

	getUnavailableReason(): string | undefined {
		return this.dbUnavailableReason;
	}

	private markUnavailable(message: string, dbPath?: string): void {
		if (this.dbUnavailable) {
			return;
		}
		this.dbUnavailable = true;
		this.dbUnavailableReason = dbPath ? `${message} (db: ${dbPath})` : message;
		this.logService.warn('[SqliteStore] ' + this.dbUnavailableReason);
	}

	private async open(workspace: IWorkspaceIdentifier): Promise<InstanceType<SqliteModule['Database']> | undefined> {
		if (this.dbUnavailable) {
			return undefined;
		}
		const key = this.workspaceKey(workspace);
		const existing = this.dbCache.get(key);
		if (existing) {
			return existing;
		}
		const deps = getNodeDeps();
		if (!deps) {
			this.markUnavailable('Failed to load @vscode/sqlite3; local index store is disabled.');
			return undefined;
		}
		const dbPath = this.dbPath(workspace, deps.path);
		if (!dbPath) {
			return undefined;
		}
		try {
			await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
			// eslint-disable-next-line new-cap
			const db = new deps.sqlite.Database(dbPath);
			this.dbCache.set(key, db);
			await this.initialize(db);
			return db;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.markUnavailable(`Failed to open SQLite database: ${message}`, dbPath);
			return undefined;
		}
	}

	private async initialize(db: InstanceType<SqliteModule['Database']>): Promise<void> {
		const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
		await exec(`
			PRAGMA journal_mode=WAL;
			PRAGMA synchronous = NORMAL;
			PRAGMA temp_store = MEMORY;
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT,
				workspace TEXT,
				uri TEXT,
				content TEXT,
				startLine INTEGER,
				endLine INTEGER,
				startChar INTEGER,
				endChar INTEGER,
				languageId TEXT,
				score REAL,
				hash TEXT,
				PRIMARY KEY(id, workspace)
			);
			CREATE TABLE IF NOT EXISTS embeddings (
				chunkId TEXT,
				workspace TEXT,
				uri TEXT,
				languageId TEXT,
				model TEXT,
				dim INTEGER,
				norm REAL,
				vector BLOB,
				PRIMARY KEY(chunkId, workspace)
			);
			CREATE TABLE IF NOT EXISTS files (
				filePath TEXT,
				workspace TEXT,
				lastModified INTEGER,
				hash TEXT,
				size INTEGER,
				PRIMARY KEY(filePath, workspace)
			);
			CREATE TABLE IF NOT EXISTS metadata (
				key TEXT,
				workspace TEXT,
				value TEXT,
				PRIMARY KEY(key, workspace)
			);
			CREATE INDEX IF NOT EXISTS idx_chunks_workspace_uri ON chunks(workspace, uri);
			CREATE INDEX IF NOT EXISTS idx_embeddings_workspace ON embeddings(workspace);
			CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace);
			CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);
		`);
	}

	async close(workspace: IWorkspaceIdentifier): Promise<void> {
		const key = this.workspaceKey(workspace);
		const db = this.dbCache.get(key);
		if (db) {
			await new Promise<void>((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
			this.dbCache.delete(key);
		}
	}

	async writeFile(workspace: IWorkspaceIdentifier, meta: FileMeta): Promise<void> {
		const db = await this.open(workspace);
		if (!db) { return; }
		await this.run(db, `INSERT OR REPLACE INTO files(filePath,workspace,lastModified,hash,size) VALUES(?,?,?,?,?)`, [meta.filePath, this.workspaceKey(workspace), meta.lastModified, meta.hash, meta.size ?? 0]);
	}

	async getFile(workspace: IWorkspaceIdentifier, filePath: string): Promise<FileMeta | undefined> {
		const db = await this.open(workspace);
		if (!db) { return undefined; }
		const row = await this.get<any>(db, `SELECT filePath,lastModified,hash,size FROM files WHERE filePath=? AND workspace=?`, [filePath, this.workspaceKey(workspace)]);
		return row ? { filePath: row.filePath, workspace: this.workspaceKey(workspace), lastModified: row.lastModified, hash: row.hash, size: row.size } : undefined;
	}

	async getFileHash(workspace: IWorkspaceIdentifier, filePath: string): Promise<string | undefined> {
		const db = await this.open(workspace);
		if (!db) { return undefined; }
		const row = await this.get<any>(db, `SELECT hash FROM files WHERE filePath=? AND workspace=?`, [filePath, this.workspaceKey(workspace)]);
		return row?.hash;
	}

	async listFiles(workspace: IWorkspaceIdentifier): Promise<FileMeta[]> {
		const db = await this.open(workspace);
		if (!db) { return []; }
		const rows = await this.all<any>(db, `SELECT filePath,lastModified,hash,size FROM files WHERE workspace=?`, [this.workspaceKey(workspace)]);
		return rows.map(r => ({ filePath: r.filePath, workspace: this.workspaceKey(workspace), lastModified: r.lastModified, hash: r.hash, size: r.size }));
	}

	async deleteFile(workspace: IWorkspaceIdentifier, filePath: string): Promise<void> {
		const db = await this.open(workspace);
		if (!db) { return; }
		const ws = this.workspaceKey(workspace);
		await this.run(db, `DELETE FROM embeddings WHERE workspace=? AND chunkId IN (SELECT id FROM chunks WHERE workspace=? AND uri=?)`, [ws, ws, URI.file(filePath).toString()]);
		await this.run(db, `DELETE FROM chunks WHERE workspace=? AND uri=?`, [ws, URI.file(filePath).toString()]);
		await this.run(db, `DELETE FROM files WHERE workspace=? AND filePath=?`, [ws, filePath]);
	}

	async writeChunks(workspace: IWorkspaceIdentifier, chunks: StoredChunk[]): Promise<void> {
		const db = await this.open(workspace);
		if (!db) { return; }
		const ws = this.workspaceKey(workspace);
		const insert = db.prepare(`INSERT OR REPLACE INTO chunks(id,workspace,uri,content,startLine,endLine,startChar,endChar,languageId,score,hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
		await new Promise<void>((resolve, reject) => db.serialize(() => {
			for (const c of chunks) {
				insert.run([
					c.id,
					ws,
					c.uri.toString(),
					c.content,
					c.startLine,
					c.endLine,
					c.startChar,
					c.endChar,
					c.languageId,
					c.score,
					c.hash
				]);
			}
			insert.finalize(err => err ? reject(err) : resolve());
		}));
	}

	async readChunks(workspace: IWorkspaceIdentifier, uri: URI): Promise<StoredChunk[]> {
		const db = await this.open(workspace);
		if (!db) { return []; }
		const ws = this.workspaceKey(workspace);
		const rows = await this.all<any>(db, `SELECT * FROM chunks WHERE workspace=? AND uri=?`, [ws, uri.toString()]);
		return rows.map(r => ({
			id: r.id,
			uri: URI.parse(r.uri),
			workspace: r.workspace,
			content: r.content,
			startLine: r.startLine,
			endLine: r.endLine,
			startChar: r.startChar,
			endChar: r.endChar,
			languageId: r.languageId,
			score: r.score,
			hash: r.hash
		}));
	}

	async upsertEmbeddings(workspace: IWorkspaceIdentifier, embeddings: StoredEmbedding[]): Promise<void> {
		const db = await this.open(workspace);
		if (!db) { return; }
		const ws = this.workspaceKey(workspace);
		const insert = db.prepare(`INSERT OR REPLACE INTO embeddings(chunkId, workspace, uri, languageId, model, dim, norm, vector) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`);
		await new Promise<void>((resolve, reject) => db.serialize(() => {
			for (const e of embeddings) {
				insert.run([e.chunkId, ws, e.uri.toString(), e.languageId, e.model, e.dim, e.norm, Buffer.from(e.vector.buffer)]);
			}
			insert.finalize(err => err ? reject(err) : resolve());
		}));
	}

	async getEmbeddings(workspace: IWorkspaceIdentifier, chunkIds: string[]): Promise<Map<string, StoredEmbedding>> {
		const map = new Map<string, StoredEmbedding>();
		if (!chunkIds.length) { return map; }
		const db = await this.open(workspace);
		if (!db) { return map; }
		const placeholders = chunkIds.map(() => '?').join(',');
		const rows = await this.all<any>(db, `SELECT * FROM embeddings WHERE workspace=? AND chunkId IN (${placeholders})`, [this.workspaceKey(workspace), ...chunkIds]);
		for (const r of rows) {
			map.set(r.chunkId, {
				chunkId: r.chunkId,
				uri: URI.parse(r.uri),
				workspace: r.workspace,
				languageId: r.languageId,
				model: r.model,
				dim: r.dim,
				norm: r.norm,
				vector: new Float32Array(Buffer.from(r.vector).buffer)
			});
		}
		return map;
	}

	async nearestVectors(workspace: IWorkspaceIdentifier, query: Float32Array, topK: number): Promise<{ chunkId: string; score: number }[]> {
		const db = await this.open(workspace);
		if (!db) { return []; }
		const ws = this.workspaceKey(workspace);
		const rows = await this.all<any>(db, `SELECT chunkId, vector, norm FROM embeddings WHERE workspace=? LIMIT ?`, [ws, Math.max(topK * 5, topK)]);
		const qNorm = this.norm(query);
		const scored: { chunkId: string; score: number }[] = [];
		for (const r of rows) {
			const vec = new Float32Array(Buffer.from(r.vector).buffer);
			const score = this.cosine(query, qNorm, vec, r.norm);
			scored.push({ chunkId: r.chunkId, score });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK);
	}

	async searchLexical(workspace: IWorkspaceIdentifier, terms: string[], limit: number): Promise<StoredChunk[]> {
		if (!terms.length) {
			return [];
		}
		const db = await this.open(workspace);
		if (!db) { return []; }
		const likeClauses = terms.map(() => `content LIKE ?`).join(' OR ');
		const params = terms.map(t => `%${t}%`);
		const rows = await this.all<any>(db, `SELECT * FROM chunks WHERE workspace=? AND (${likeClauses}) LIMIT ?`, [this.workspaceKey(workspace), ...params, limit]);
		return rows.map(r => ({
			id: r.id,
			uri: URI.parse(r.uri),
			workspace: r.workspace,
			content: r.content,
			startLine: r.startLine,
			endLine: r.endLine,
			startChar: r.startChar,
			endChar: r.endChar,
			languageId: r.languageId,
			score: r.score,
			hash: r.hash
		}));
	}

	async getChunksByIds(workspace: IWorkspaceIdentifier, ids: string[]): Promise<StoredChunk[]> {
		if (!ids.length) { return []; }
		const db = await this.open(workspace);
		if (!db) { return []; }
		const placeholders = ids.map(() => '?').join(',');
		const rows = await this.all<any>(db, `SELECT * FROM chunks WHERE workspace=? AND id IN (${placeholders})`, [this.workspaceKey(workspace), ...ids]);
		return rows.map(r => ({
			id: r.id,
			uri: URI.parse(r.uri),
			workspace: r.workspace,
			content: r.content,
			startLine: r.startLine,
			endLine: r.endLine,
			startChar: r.startChar,
			endChar: r.endChar,
			languageId: r.languageId,
			score: r.score,
			hash: r.hash
		}));
	}

	private norm(vec: Float32Array): number {
		let sum = 0;
		for (let i = 0; i < vec.length; i++) {
			sum += vec[i] * vec[i];
		}
		return Math.sqrt(sum);
	}

	private cosine(a: Float32Array, aNorm: number, b: Float32Array, bNorm: number): number {
		let dot = 0;
		const len = Math.min(a.length, b.length);
		for (let i = 0; i < len; i++) {
			dot += a[i] * b[i];
		}
		const denom = aNorm * bNorm || 1;
		return dot / denom;
	}

	async updateMetadata(workspace: IWorkspaceIdentifier, entries: MetadataEntry[]): Promise<void> {
		const db = await this.open(workspace);
		if (!db) { return; }
		const ws = this.workspaceKey(workspace);
		const stmt = db.prepare(`INSERT OR REPLACE INTO metadata(key,workspace,value) VALUES(?,?,?)`);
		await new Promise<void>((resolve, reject) => db.serialize(() => {
			for (const e of entries) {
				stmt.run([e.key, ws, e.value]);
			}
			stmt.finalize(err => err ? reject(err) : resolve());
		}));
	}

	async readMetadata(workspace: IWorkspaceIdentifier, key: string): Promise<string | undefined> {
		const db = await this.open(workspace);
		if (!db) { return undefined; }
		const row = await this.get<any>(db, `SELECT value FROM metadata WHERE key=? AND workspace=?`, [key, this.workspaceKey(workspace)]);
		return row?.value;
	}

	async fileCount(workspace: IWorkspaceIdentifier): Promise<number> {
		const db = await this.open(workspace);
		if (!db) { return 0; }
		const row = await this.get<any>(db, `SELECT COUNT(*) as c FROM files WHERE workspace=?`, [this.workspaceKey(workspace)]);
		return row?.c ?? 0;
	}

	async chunkCount(workspace: IWorkspaceIdentifier): Promise<number> {
		const db = await this.open(workspace);
		if (!db) { return 0; }
		const row = await this.get<any>(db, `SELECT COUNT(*) as c FROM chunks WHERE workspace=?`, [this.workspaceKey(workspace)]);
		return row?.c ?? 0;
	}

	async embeddingCount(workspace: IWorkspaceIdentifier): Promise<number> {
		const db = await this.open(workspace);
		if (!db) { return 0; }
		const row = await this.get<any>(db, `SELECT COUNT(*) as c FROM embeddings WHERE workspace=?`, [this.workspaceKey(workspace)]);
		return row?.c ?? 0;
	}

	static hashContent(content: string): string {
		let hash = 0x811c9dc5;
		for (let i = 0; i < content.length; i++) {
			hash ^= content.charCodeAt(i);
			hash = (hash * 0x01000193) >>> 0;
		}
		return hash.toString(16);
	}

	private run(db: SqliteDatabase, sql: string, params: any[] = []): Promise<void> {
		return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
	}
	private get<T = any>(db: SqliteDatabase, sql: string, params: any[] = []): Promise<T | undefined> {
		return new Promise<T | undefined>((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined)));
	}
	private all<T = any>(db: SqliteDatabase, sql: string, params: any[] = []): Promise<T[]> {
		return new Promise<T[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[])));
	}
}

