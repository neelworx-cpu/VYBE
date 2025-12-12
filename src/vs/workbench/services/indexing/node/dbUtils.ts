/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative } from '../../../../base/common/platform.js';

type SqliteModule = {
	Database: new (...args: unknown[]) => {
		close(cb: (err: Error | null) => void): void;
		run(sql: string, params: unknown[], cb: (err: Error | null) => void): void;
		get(sql: string, params: unknown[], cb: (err: Error | null, row: unknown) => void): void;
		all(sql: string, params: unknown[], cb: (err: Error | null, rows: unknown[]) => void): void;
		exec(sql: string, cb: (err: Error | null) => void): void;
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
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

export interface WorkspaceDB {
	db: SqliteDatabase | undefined;
	path: string;
}

export class DBManager {
	private readonly cache = new Map<string, WorkspaceDB>();

	constructor(
		private readonly environmentService: IEnvironmentService,
		private readonly fileService: IFileService,
	) { }

	getWorkspaceDbPath(workspace: IWorkspaceIdentifier): string {
		const deps = getNodeDeps();
		if (!deps) {
			return '';
		}
		const storageHome = this.environmentService.workspaceStorageHome.fsPath;
		const workspaceId = workspace.id ?? deps.path.basename(workspace.configPath.fsPath);
		return deps.path.join(storageHome, workspaceId, 'vybe-index.db');
	}

	async open(workspace: IWorkspaceIdentifier): Promise<WorkspaceDB> {
		const deps = getNodeDeps();
		if (!deps) {
			return { db: undefined, path: '' };
		}
		const key = workspace.id ?? workspace.configPath.fsPath;
		const existing = this.cache.get(key);
		if (existing) {
			return existing;
		}
		const dbPath = this.getWorkspaceDbPath(workspace);
		if (!dbPath) {
			return { db: undefined, path: '' };
		}
		await deps.fs.promises.mkdir(deps.path.dirname(dbPath), { recursive: true });
		const db = new deps.sqlite.Database(dbPath);
		const handle: WorkspaceDB = { db, path: dbPath };
		this.cache.set(key, handle);
		return handle;
	}

	getCached(workspace: IWorkspaceIdentifier): WorkspaceDB | undefined {
		const key = workspace.id ?? workspace.configPath.fsPath;
		return this.cache.get(key);
	}

	async exists(workspace: IWorkspaceIdentifier): Promise<boolean> {
		const dbPath = this.getWorkspaceDbPath(workspace);
		return this.fileService.exists(URI.file(dbPath));
	}

	async close(workspace: IWorkspaceIdentifier): Promise<void> {
		const key = workspace.id ?? workspace.configPath.fsPath;
		const handle = this.cache.get(key);
		if (handle && handle.db) {
			await new Promise<void>((resolve, reject) => {
				handle.db!.close(err => err ? reject(err) : resolve());
			});
			this.cache.delete(key);
		}
	}

	async runMaintenanceIfNeeded(workspace: IWorkspaceIdentifier, enabled: boolean): Promise<void> {
		if (!enabled) {
			return;
		}
		if (!(await this.exists(workspace))) {
			return;
		}
		const handle = await this.open(workspace);
		if (!handle.db) { return; }
		await this.exec(handle.db, 'PRAGMA journal_mode/WAL;');
		// VACUUM only on demand; not each startup. Caller controls when to invoke.
	}

	async exec(db: SqliteDatabase, sql: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			db.exec(sql, (err: Error | null) => err ? reject(err) : resolve());
		});
	}

	async run(db: SqliteDatabase, sql: string, params: unknown[] = []): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			db.run(sql, params, (err: Error | null) => err ? reject(err) : resolve());
		});
	}

	async get<T = unknown>(db: SqliteDatabase, sql: string, params: unknown[] = []): Promise<T | undefined> {
		return new Promise<T | undefined>((resolve, reject) => {
			db.get(sql, params, (err: Error | null, row: unknown) => err ? reject(err) : resolve(row as T | undefined));
		});
	}

	async all<T = unknown>(db: SqliteDatabase, sql: string, params: unknown[] = []): Promise<T[]> {
		return new Promise<T[]>((resolve, reject) => {
			db.all(sql, params, (err: Error | null, rows: unknown[]) => err ? reject(err) : resolve(rows as T[]));
		});
	}
}

