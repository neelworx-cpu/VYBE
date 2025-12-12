/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Chunk } from '../common/languageAdapter.js';
import { ITextShardStore, LexicalHit } from '../common/textShardStore.js';
import { CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_LEXICAL_ROW_LIMIT } from '../common/indexingConfiguration.js';
import { SqliteStore } from './sqliteStore.js';
// simple FNV-1a hash to avoid node 'crypto' in browser contexts
function fnv1a(content: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		hash ^= content.charCodeAt(i);
		hash = (hash * 0x01000193) >>> 0;
	}
	return hash.toString(16);
}

interface TokenInfo {
	tf: number;
	positions: number[];
}

/**
 * TextShardStore with in-memory fallback; persistent path prepared for later enhancements.
 * All operations are gated on vybe.localIndexing.enabled.
 */
export class TextShardStore extends Disposable implements ITextShardStore {
	declare readonly _serviceBrand: undefined;

	private readonly inMemoryChunks = new ResourceMap<Chunk[]>();
	private readonly tokenPostings = new Map<string, Map<string, TokenInfo>>(); // term -> chunkId -> info
	private readonly chunkMeta = new Map<string, { uri: URI; languageId?: string; range?: { startLineNumber: number; endLineNumber: number }; content: string; hash: string }>();
	private docCount = 0;
	private totalDocLength = 0;
	private readonly sqliteStore: SqliteStore;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.sqliteStore = new SqliteStore(environmentService, fileService, this.logService);
	}

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING);
	}

	private hashContent(content: string, uri: URI, extra?: string): string {
		let combined = uri.toString() + '::' + content;
		if (extra) {
			combined += '::' + extra;
		}
		return fnv1a(combined);
	}

	async indexDocument(uri: URI, languageId: string | undefined, chunks: Chunk[], workspace?: any, _token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}

		await this.removeDocument(uri, workspace);

		let docLen = 0;
		for (const chunk of chunks) {
			const content = chunk.content;
			const hash = this.hashContent(content, chunk.uri, chunk.id);
			this.chunkMeta.set(chunk.id, {
				uri,
				languageId,
				range: chunk.range ? { startLineNumber: chunk.range.start.lineNumber, endLineNumber: chunk.range.end.lineNumber } : undefined,
				content,
				hash
			});
			const terms = this.tokenize(content);
			docLen += terms.length;
			this.addPostings(chunk.id, terms);
		}
		this.inMemoryChunks.set(uri, chunks);
		this.docCount++;
		this.totalDocLength += docLen;

		await this.persistDocument(uri, languageId, chunks, workspace);
	}

	async removeDocument(uri: URI, workspace?: any, _token?: CancellationToken): Promise<void> {
		if (this.isEnabled()) {
			await this.removeDocumentPersistent(uri, workspace);
		}

		const chunks = this.inMemoryChunks.get(uri);
		if (chunks) {
			for (const chunk of chunks) {
				this.chunkMeta.delete(chunk.id);
				this.removePostings(chunk.id);
			}
			this.inMemoryChunks.delete(uri);
			this.docCount = Math.max(0, this.docCount - 1);
		}
	}

	async searchLexical(query: string, maxResults: number = 20, workspace?: any, _token?: CancellationToken): Promise<LexicalHit[]> {
		if (!this.isEnabled()) {
			return [];
		}

		// If we have persistent data, prefer DB-backed search; otherwise fall back to in-memory.
		if (await this.ensureDbInitialized(workspace)) {
			const limit = Math.min(maxResults, this.configurationService.getValue<number>(CONFIG_LEXICAL_ROW_LIMIT) ?? maxResults);
			return this.searchLexicalPersistent(query, limit, workspace);
		}

		const terms = this.tokenize(query);
		if (!terms.length || this.docCount === 0) {
			return [];
		}

		const scores = new Map<string, number>();
		const avgDocLen = this.totalDocLength > 0 ? this.totalDocLength / this.docCount : 0;
		const k1 = 1.5;
		const b = 0.75;

		for (const term of terms) {
			const postings = this.tokenPostings.get(term);
			if (!postings) {
				continue;
			}
			const df = postings.size;
			const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);
			for (const [chunkId, info] of postings) {
				const docLen = this.chunkMeta.get(chunkId)?.content.length ?? 0;
				const tf = info.tf;
				const score = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / (avgDocLen || 1)))));
				scores.set(chunkId, (scores.get(chunkId) ?? 0) + score);
			}
		}

		const hits: LexicalHit[] = [];
		for (const [chunkId, score] of scores) {
			const meta = this.chunkMeta.get(chunkId);
			if (!meta) {
				continue;
			}
			hits.push({
				uri: meta.uri,
				score,
				snippet: meta.content.slice(0, 500),
				range: meta.range,
				languageId: meta.languageId,
				chunkId
			});
		}

		hits.sort((a, b) => b.score - a.score);
		return hits.slice(0, maxResults);
	}

	async clear(_token?: CancellationToken): Promise<void> {
		this.inMemoryChunks.clear();
		this.tokenPostings.clear();
		this.chunkMeta.clear();
		this.docCount = 0;
		this.totalDocLength = 0;
	}

	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.split(/[^a-z0-9_]+/)
			.filter(Boolean);
	}

	private addPostings(chunkId: string, terms: string[]): void {
		const tfMap = new Map<string, TokenInfo>();
		let position = 0;
		for (const term of terms) {
			const info = tfMap.get(term) ?? { tf: 0, positions: [] };
			info.tf += 1;
			info.positions.push(position++);
			tfMap.set(term, info);
		}
		for (const [term, info] of tfMap) {
			let posting = this.tokenPostings.get(term);
			if (!posting) {
				posting = new Map<string, TokenInfo>();
				this.tokenPostings.set(term, posting);
			}
			posting.set(chunkId, info);
		}
	}

	private removePostings(chunkId: string): void {
		for (const [term, posting] of this.tokenPostings) {
			posting.delete(chunkId);
			if (posting.size === 0) {
				this.tokenPostings.delete(term);
			}
		}
	}

	private async ensureDbInitialized(_workspace?: any): Promise<boolean> {
		if (!this.isEnabled()) {
			return false;
		}
		return true; // sqliteStore initializes lazily
	}

	private async persistDocument(uri: URI, languageId: string | undefined, chunks: Chunk[], workspace?: any): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const filePath = uri.fsPath;
		let lastModified = Date.now();
		let size = 0;
		try {
			const stat = await this.fileService.stat(uri);
			lastModified = stat.mtime ?? lastModified;
			size = stat.size ?? 0;
		} catch {
			// ignore
		}
		const docHash = this.hashContent(chunks.map(c => c.content).join('\n'), uri);
		await this.sqliteStore.writeFile(ws, { filePath, workspace: ws.id ?? ws.configPath.fsPath, lastModified, hash: docHash, size });

		const storedChunks = chunks.map(c => ({
			id: c.id,
			workspace: ws.id ?? ws.configPath.fsPath,
			uri,
			content: c.content,
			startLine: c.range?.start.lineNumber ?? 1,
			endLine: c.range?.end.lineNumber ?? (c.range?.start.lineNumber ?? 1),
			startChar: c.range?.start.column ?? 1,
			endChar: c.range?.end.column ?? 1,
			languageId: c.languageId ?? (languageId ?? 'plaintext'),
			score: 0,
			hash: this.hashContent(c.content, c.uri, c.id)
		}));
		await this.sqliteStore.writeChunks(ws, storedChunks);
	}

	private async removeDocumentPersistent(uri: URI, workspace?: any): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		await this.sqliteStore.deleteFile(ws, uri.fsPath);
	}

	private async searchLexicalPersistent(query: string, maxResults: number, workspace?: any): Promise<LexicalHit[]> {
		const ws = workspace ?? { id: 'default', configPath: URI.file('') };
		const terms = this.tokenize(query);
		if (!terms.length) {
			return [];
		}
		const rows = await this.sqliteStore.searchLexical(ws, terms, maxResults);
		const hits: LexicalHit[] = rows.map(r => ({
			uri: r.uri,
			score: r.score ?? 0,
			snippet: r.content.slice(0, 500),
			range: { startLineNumber: r.startLine, endLineNumber: r.endLine },
			languageId: r.languageId,
			chunkId: r.id
		}));
		hits.sort((a, b) => b.score - a.score);
		return hits.slice(0, maxResults);
	}
}

