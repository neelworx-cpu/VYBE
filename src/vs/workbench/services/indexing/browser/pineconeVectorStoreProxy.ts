/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPineconeVectorStore, VectorRecord, QueryResult, NamespaceStats } from '../common/pineconeVectorStore.js';
import { getExtHostIndexingProxy } from '../../../api/browser/mainThreadIndexing.js';

/**
 * Browser-side proxy implementation of {@link IPineconeVectorStore} that forwards
 * calls to the extension host where the Node.js Pinecone SDK runs.
 * This is necessary because the Pinecone SDK is a Node.js-only package and
 * cannot be imported in the browser/renderer process.
 */
export class PineconeVectorStoreProxy extends Disposable implements IPineconeVectorStore {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	private async getProxy() {
		// Get proxy dynamically (it may not be available at construction time)
		// Wait for extension host to be ready (retry up to 5 times with 200ms delay)
		let extHostIndexing = getExtHostIndexingProxy();
		if (!extHostIndexing) {
			let retries = 0;
			while (!extHostIndexing && retries < 5) {
				await new Promise(resolve => setTimeout(resolve, 200));
				extHostIndexing = getExtHostIndexingProxy();
				retries++;
			}
		}

		if (!extHostIndexing) {
			throw new Error('Extension host indexing proxy not available');
		}

		return extHostIndexing;
	}

	async testConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			const proxy = await this.getProxy();
			return await proxy.$pineconeTestConnection();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[PineconeVectorStoreProxy] Test connection failed:', message);
			return { success: false, error: message };
		}
	}

	async upsert(namespace: string, vectors: VectorRecord[]): Promise<void> {
		try {
			const proxy = await this.getProxy();
			await proxy.$pineconeUpsert(
				namespace,
				vectors.map(v => ({
					id: v.id,
					values: v.values,
					metadata: {
						userId: v.metadata.userId,
						workspaceId: v.metadata.workspaceId,
						workspacePath: v.metadata.workspacePath,
						filePath: v.metadata.filePath,
						startLine: v.metadata.startLine,
						endLine: v.metadata.endLine,
						languageId: v.metadata.languageId,
						content: v.metadata.content,
						indexedAt: v.metadata.indexedAt,
					}
				}))
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[PineconeVectorStoreProxy] Upsert failed:', message);
			throw error;
		}
	}

	async query(namespace: string, vector: number[], topK: number): Promise<QueryResult[]> {
		try {
			const proxy = await this.getProxy();
			const results = await proxy.$pineconeQuery(namespace, vector, topK);
			return results.map(r => ({
				id: r.id,
				score: r.score,
				metadata: {
					userId: String(r.metadata.userId || ''),
					workspaceId: String(r.metadata.workspaceId || ''),
					workspacePath: String(r.metadata.workspacePath || ''),
					filePath: String(r.metadata.filePath || ''),
					startLine: Number(r.metadata.startLine || 0),
					endLine: Number(r.metadata.endLine || 0),
					languageId: String(r.metadata.languageId || ''),
					content: String(r.metadata.content || ''),
					indexedAt: Number(r.metadata.indexedAt || 0),
				}
			}));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[PineconeVectorStoreProxy] Query failed:', message);
			throw error;
		}
	}

	async delete(namespace: string, ids: string[]): Promise<void> {
		try {
			const proxy = await this.getProxy();
			await proxy.$pineconeDelete(namespace, ids);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[PineconeVectorStoreProxy] Delete failed:', message);
			throw error;
		}
	}

	async deleteNamespace(namespace: string): Promise<void> {
		try {
			const proxy = await this.getProxy();
			await proxy.$pineconeDeleteNamespace(namespace);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[PineconeVectorStoreProxy] Delete namespace failed:', message);
			throw error;
		}
	}

	async getNamespaceStats(namespace: string): Promise<NamespaceStats> {
		try {
			const proxy = await this.getProxy();
			const stats = await proxy.$pineconeGetNamespaceStats(namespace);
			return {
				vectorCount: stats.vectorCount,
				dimension: stats.dimension,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[PineconeVectorStoreProxy] Get namespace stats failed:', message);
			throw error;
		}
	}
}
