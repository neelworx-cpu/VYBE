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
import { EmbeddingRecord, IEmbeddingStore, VectorHit } from '../common/embeddingStore.js';
import { CONFIG_ENABLE_LOCAL_EMBEDDINGS, CONFIG_ENABLE_LOCAL_INDEXING } from '../common/indexingConfiguration.js';
import { DBManager } from './dbUtils.js';
import { CREATE_TABLES, DELETE_EMBEDDINGS_FOR_URI, SELECT_ALL, SELECT_BY_HASH, UPSERT_EMBEDDING } from './embeddingStore.sql.js';

interface InternalEmbedding {
	record: EmbeddingRecord;
	norm: number;
}

export class EmbeddingStore extends Disposable implements IEmbeddingStore {
	declare readonly _serviceBrand: undefined;

	private readonly byUri = new ResourceMap<EmbeddingRecord[]>();
	private readonly byChunkHash = new Map<string, EmbeddingRecord[]>();
	private readonly dbManager: DBManager;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
	) {
		super();
		this.dbManager = new DBManager(environmentService, fileService);
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING)
			&& !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS);
	}

	async storeEmbeddings(records: EmbeddingRecord[], workspace?: any, _token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		if (await this.ensureDb(workspace)) {
			const ws = workspace ?? { id: 'default', configPath: URI.file('') };
			const handle = await this.dbManager.open(ws);
			const db = handle.db;
			if (!db) {
				return;
			}
			for (const record of records) {
				await this.dbManager.run(db, UPSERT_EMBEDDING, [
					record.chunkId,
					record.uri.toString(),
					record.languageId ?? null,
					record.chunkHash ?? null,
					Buffer.from(Float32Array.from(record.embedding).buffer),
					this.norm(record.embedding),
					record.embedding.length
				]);
			}
		}
		for (const record of records) {
			const existing = this.byUri.get(record.uri) ?? [];
			existing.push(record);
			this.byUri.set(record.uri, existing);
			if (record.chunkHash) {
				const list = this.byChunkHash.get(record.chunkHash) ?? [];
				list.push(record);
				this.byChunkHash.set(record.chunkHash, list);
			}
		}
	}

	async removeEmbeddingsForUri(uri: URI, workspace?: any, _token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		if (await this.ensureDb(workspace)) {
			const ws = workspace ?? { id: 'default', configPath: URI.file('') };
			const handle = await this.dbManager.open(ws);
			const db = handle.db;
			if (!db) {
				return;
			}
			await this.dbManager.run(db, DELETE_EMBEDDINGS_FOR_URI, [uri.toString()]);
		}
		const removed = this.byUri.get(uri);
		if (removed) {
			for (const rec of removed) {
				if (rec.chunkHash) {
					const list = this.byChunkHash.get(rec.chunkHash);
					if (list) {
						this.byChunkHash.set(rec.chunkHash, list.filter(r => r.chunkId !== rec.chunkId));
					}
				}
			}
		}
		this.byUri.delete(uri);
	}

	async getNearest(queryEmbedding: number[], k: number = 20, offset: number = 0, workspace?: any, _token?: CancellationToken): Promise<VectorHit[]> {
		if (!this.isEnabled()) {
			return [];
		}
		const all: InternalEmbedding[] = [];
		if (await this.ensureDb(workspace)) {
			const ws = workspace ?? { id: 'default', configPath: URI.file('') };
			const handle = await this.dbManager.open(ws);
			const db = handle.db;
			if (!db) {
				return [];
			}
			const rows = await this.dbManager.all<any>(db, SELECT_ALL, [k * 5, offset]); // simple pagination
			for (const row of rows) {
				const vector = Array.from(new Float32Array(Buffer.from(row.vector)));
				all.push({
					record: {
						chunkId: row.chunkId,
						uri: URI.parse(row.uri),
						embedding: vector,
						languageId: row.languageId,
						chunkHash: row.chunkHash
					},
					norm: row.norm
				});
			}
		} else {
			for (const recs of this.byUri.values()) {
				for (const rec of recs) {
					all.push({ record: rec, norm: this.norm(rec.embedding) });
				}
			}
		}
		const qNorm = this.norm(queryEmbedding);
		const scored: VectorHit[] = [];
		for (const emb of all) {
			const score = this.cosine(queryEmbedding, qNorm, emb.record.embedding, emb.norm);
			scored.push({
				uri: emb.record.uri,
				chunkId: emb.record.chunkId,
				score,
				languageId: emb.record.languageId
			});
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(offset, offset + k);
	}

	async getByHash(chunkHash: string, workspace?: any, _token?: CancellationToken): Promise<EmbeddingRecord[]> {
		if (!this.isEnabled()) {
			return [];
		}
		if (await this.ensureDb(workspace)) {
			const ws = workspace ?? { id: 'default', configPath: URI.file('') };
			const handle = await this.dbManager.open(ws);
			const db = handle.db;
			if (!db) {
				return [];
			}
			const rows = await this.dbManager.all<any>(db, SELECT_BY_HASH, [chunkHash]);
			return rows.map(r => ({
				chunkId: r.chunkId,
				uri: URI.parse(r.uri),
				embedding: Array.from(new Float32Array(Buffer.from(r.vector))),
				languageId: r.languageId,
				chunkHash: r.chunkHash
			}));
		}
		return this.byChunkHash.get(chunkHash) ?? [];
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

	private norm(vec: number[]): number {
		let sum = 0;
		for (const v of vec) {
			sum += v * v;
		}
		return Math.sqrt(sum);
	}

	private cosine(a: number[], aNorm: number, b: number[], bNorm: number): number {
		let dot = 0;
		const len = Math.min(a.length, b.length);
		for (let i = 0; i < len; i++) {
			dot += a[i] * b[i];
		}
		const denom = aNorm * bNorm || 1;
		return dot / denom;
	}
}

