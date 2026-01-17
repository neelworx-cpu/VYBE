/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostIndexingShape } from './extHost.protocol.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IPineconeVectorStore } from '../../services/indexing/common/pineconeVectorStore.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';

/**
 * Extension-host side implementation of the minimal indexing RPC surface.
 *
 * Local indexing has been removed - cloud indexing (Voyage AI + Pinecone) is now the only method.
 * This class now only exposes Pinecone RPC methods for cloud-based vector operations.
 */
export class ExtHostIndexing implements ExtHostIndexingShape {

	// Local indexing properties removed - cloud indexing is now the only method
	private pineconeService: IPineconeVectorStore | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		private readonly instantiationService?: IInstantiationService,
	) {
		// Local indexing initialization removed - cloud indexing is now the only method
		// ContextService removed - it was local-only (SQLite-based)
		// File system event listeners removed - cloud indexing handles file watching differently
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// All local indexing RPC methods removed - cloud indexing is now the only method
	// Dev context methods removed - they were local-only (SQLite-based)
	// ═══════════════════════════════════════════════════════════════════════════════

	// ═══════════════════════════════════════════════════════════════════════════════
	// Pinecone Vector Store RPC Methods
	// ═══════════════════════════════════════════════════════════════════════════════

	private async getPineconeService(): Promise<IPineconeVectorStore> {
		if (!this.pineconeService) {
			// Get from service registry via instantiation service
			if (this.instantiationService) {
				try {
					this.pineconeService = this.instantiationService.invokeFunction(accessor => accessor.get(IPineconeVectorStore));
					this.logService.trace('[ExtHostIndexing] Pinecone service retrieved from service registry');
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.logService.error('[ExtHostIndexing] Failed to get Pinecone service from registry', message);
					// Fall through to create directly
				}
			}

			// Fallback: create directly if service registry access failed
			if (!this.pineconeService) {
				try {
					const { PineconeVectorStoreImpl } = await import('../../services/indexing/node/pineconeVectorStoreImpl.js');

					// PineconeVectorStoreImpl now always fetches from Supabase (no secret storage needed)
					this.pineconeService = new PineconeVectorStoreImpl(
						this.logService
					);
					this.logService.trace('[ExtHostIndexing] Pinecone service created directly');
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.logService.error('[ExtHostIndexing] Failed to create Pinecone service', message);
					throw error;
				}
			}
		}
		return this.pineconeService;
	}

	async $pineconeTestConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			const service = await this.getPineconeService();
			return await service.testConnection();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('[ExtHostIndexing] Pinecone test connection failed', message);
			return { success: false, error: message };
		}
	}

	async $pineconeUpsert(namespace: string, vectors: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }>): Promise<void> {
		const service = await this.getPineconeService();
		await service.upsert(namespace, vectors.map(v => ({
			id: v.id,
			values: v.values,
			metadata: {
				userId: String(v.metadata.userId || ''),
				workspaceId: String(v.metadata.workspaceId || ''),
				workspacePath: String(v.metadata.workspacePath || ''),
				filePath: String(v.metadata.filePath || ''),
				startLine: Number(v.metadata.startLine || 0),
				endLine: Number(v.metadata.endLine || 0),
				languageId: String(v.metadata.languageId || ''),
				content: String(v.metadata.content || ''),
				indexedAt: Number(v.metadata.indexedAt || 0),
			}
		})));
	}

	async $pineconeQuery(namespace: string, vector: number[], topK: number): Promise<Array<{ id: string; score: number; metadata: Record<string, string | number> }>> {
		const service = await this.getPineconeService();
		const results = await service.query(namespace, vector, topK);
		return results.map(r => ({
			id: r.id,
			score: r.score,
			metadata: {
				userId: r.metadata.userId,
				workspaceId: r.metadata.workspaceId,
				workspacePath: r.metadata.workspacePath,
				filePath: r.metadata.filePath,
				startLine: r.metadata.startLine,
				endLine: r.metadata.endLine,
				languageId: r.metadata.languageId,
				content: r.metadata.content,
				indexedAt: r.metadata.indexedAt,
			}
		}));
	}

	async $pineconeDelete(namespace: string, ids: string[]): Promise<void> {
		const service = await this.getPineconeService();
		await service.delete(namespace, ids);
	}

	async $pineconeDeleteNamespace(namespace: string): Promise<void> {
		const service = await this.getPineconeService();
		await service.deleteNamespace(namespace);
	}

	async $pineconeGetNamespaceStats(namespace: string): Promise<{ vectorCount: number; dimension: number }> {
		const service = await this.getPineconeService();
		const stats = await service.getNamespaceStats(namespace);
			return {
			vectorCount: stats.vectorCount,
			dimension: stats.dimension,
		};
	}
}
