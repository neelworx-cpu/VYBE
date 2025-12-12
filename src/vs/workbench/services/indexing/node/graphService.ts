/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { DefinitionInfo, ProjectGraphEdge, ReferenceInfo, SymbolEntry } from '../common/languageAdapter.js';
import { GraphStats, IGraphService } from '../common/graphService.js';
import { CONFIG_ENABLE_LOCAL_INDEXING } from '../common/indexingConfiguration.js';
import { DBManager } from './dbUtils.js';
import { CREATE_TABLES, DELETE_EDGES_FOR_URI, DELETE_SYMBOLS_FOR_URI, INSERT_EDGE, SELECT_DEFS, SELECT_GRAPH_FOR_URI, SELECT_NEIGHBORS, SELECT_REFS, SELECT_STATS, UPSERT_SYMBOL } from './graphService.sql.js';

/**
 * Stubbed graph service.
 * Phase 1 keeps data in-memory only and does not influence existing behaviors.
 */
export class GraphService extends Disposable implements IGraphService {
	declare readonly _serviceBrand: undefined;

	private readonly dbManager: DBManager;
	private readonly symbolsByFile = new ResourceMap<SymbolEntry[]>();
	private readonly edgesByFile = new ResourceMap<ProjectGraphEdge[]>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
	) {
		super();
		this.dbManager = new DBManager(environmentService, fileService);
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING);
	}

	private async ensureDb(workspace?: any): Promise<boolean> {
		if (!this.isEnabled()) {
			return false;
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		if (!handle.db) {
			return false;
		}
		await this.dbManager.exec(handle.db, CREATE_TABLES);
		return true;
	}

	async updateFromFile(uri: URI, symbols: SymbolEntry[], definitions: DefinitionInfo[], references: ReferenceInfo[], edges: ProjectGraphEdge[], workspace?: any, _token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			this.symbolsByFile.set(uri, symbols);
			this.edgesByFile.set(uri, edges);
			return;
		}
		if (!await this.ensureDb(workspace)) {
			return;
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return; }
		await this.dbManager.run(db, DELETE_EDGES_FOR_URI, [uri.toString(), uri.toString()]);
		await this.dbManager.run(db, DELETE_SYMBOLS_FOR_URI, [uri.toString()]);
		for (const s of symbols) {
			const r = s.location.range;
			await this.dbManager.run(db, UPSERT_SYMBOL, [
				s.id, uri.toString(), s.location.languageId, s.name, s.kind, s.containerName ?? null,
				r?.start.lineNumber ?? null, r?.start.column ?? null, r?.end.lineNumber ?? null, r?.end.column ?? null, s.location.uri ? s.location.uri.toString() : null
			]);
		}
		for (const e of edges) {
			await this.dbManager.run(db, INSERT_EDGE, [e.from, e.to, e.kind]);
		}
	}

	async removeFile(uri: URI, workspace?: any, _token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			this.symbolsByFile.delete(uri);
			this.edgesByFile.delete(uri);
			return;
		}
		if (!await this.ensureDb(workspace)) {
			return;
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return; }
		await this.dbManager.run(db, DELETE_EDGES_FOR_URI, [uri.toString(), uri.toString()]);
		await this.dbManager.run(db, DELETE_SYMBOLS_FOR_URI, [uri.toString()]);
	}

	async getDefinitions(id: string, workspace?: any, _token?: CancellationToken): Promise<DefinitionInfo[]> {
		if (!this.isEnabled()) {
			return [];
		}
		if (!await this.ensureDb(workspace)) {
			return [];
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return []; }
		const rows = await this.dbManager.all<any>(db, SELECT_DEFS, [id]);
		return rows.map(r => ({
			id: r.id,
			name: r.name,
			kind: r.kind,
			location: {
				uri: URI.parse(r.uri),
				languageId: r.languageId,
				range: r.startLine ? {
					start: { lineNumber: r.startLine, column: r.startColumn ?? 1 },
					end: { lineNumber: r.endLine ?? r.startLine, column: r.endColumn ?? 1 }
				} : undefined
			},
			containerName: r.container,
			references: [],
			imports: [],
			exports: []
		}));
	}

	async getReferences(id: string, workspace?: any, _token?: CancellationToken): Promise<ReferenceInfo[]> {
		if (!this.isEnabled()) {
			return [];
		}
		if (!await this.ensureDb(workspace)) {
			return [];
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return []; }
		const rows = await this.dbManager.all<any>(db, SELECT_REFS, [id]);
		return rows.map(r => ({
			location: { uri: URI.parse(''), range: undefined }
		}));
	}

	async getNeighbors(id: string, workspace?: any, _token?: CancellationToken): Promise<ProjectGraphEdge[]> {
		if (!this.isEnabled()) {
			return [];
		}
		if (!await this.ensureDb(workspace)) {
			return [];
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return []; }
		const rows = await this.dbManager.all<any>(db, SELECT_NEIGHBORS, [id, id]);
		return rows.map(r => ({
			from: r.from_id,
			to: r.to_id,
			kind: r.edge_type,
			uri: URI.parse(''),
			languageId: undefined
		}));
	}

	async getFileGraph(uri: URI, workspace?: any, _token?: CancellationToken): Promise<ProjectGraphEdge[]> {
		if (!this.isEnabled()) {
			return this.edgesByFile.get(uri) ?? [];
		}
		if (!await this.ensureDb(workspace)) {
			return [];
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return []; }
		const rows = await this.dbManager.all<any>(db, SELECT_GRAPH_FOR_URI, [uri.toString(), uri.toString()]);
		return rows.map(r => ({
			from: r.from_id,
			to: r.to_id,
			kind: r.edge_type,
			uri,
			languageId: undefined
		}));
	}

	async getStats(workspace?: any): Promise<GraphStats> {
		if (!this.isEnabled()) {
			return { nodes: 0, edges: 0 };
		}
		if (!await this.ensureDb(workspace)) {
			return { nodes: 0, edges: 0 };
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const handle = await this.dbManager.open(ws);
		const db = handle.db;
		if (!db) { return { nodes: 0, edges: 0 }; }
		const row = await this.dbManager.get<any>(db, SELECT_STATS);
		return { nodes: row?.nodes ?? 0, edges: row?.edges ?? 0 };
	}
}

