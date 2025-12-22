/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAiEmbeddingVectorService } from '../../aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { Chunk } from '../common/languageAdapter.js';
import { CONFIG_ENABLE_LOCAL_EMBEDDINGS, CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_EMBEDDING_MODEL, CONFIG_EMBEDDING_BATCH_SIZE } from '../common/indexingConfiguration.js';
import { SqliteStore, StoredEmbedding } from './sqliteStore.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { ModelHandle } from '../common/embeddingRuntime.js';
import { LocalHashEmbeddingRuntime } from './localEmbeddingRuntime.js';

export class EmbeddingService {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly embeddingVectorService: IAiEmbeddingVectorService,
		private readonly store: SqliteStore,
		private readonly logService: ILogService,
	) { }

	private readonly localRuntime = new LocalHashEmbeddingRuntime();

	private isEnabled(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING)
			&& !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS);
	}

	async embedChunks(workspace: IWorkspaceIdentifier, chunks: Chunk[], token?: CancellationToken): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}

		let model = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed';
		if (model === 'nomic-ai/CodeRankEmbed') {
			model = 'coderank-embed';
		}
		const batchSize = this.configurationService.getValue<number>(CONFIG_EMBEDDING_BATCH_SIZE) ?? 16;

		const records: StoredEmbedding[] = [];
		const batchChunks: Chunk[] = [];

		for (const c of chunks) {
			const existing = await this.store.getEmbeddings(workspace, [c.id]);
			if (existing.has(c.id)) {
				continue;
			}
			batchChunks.push({ ...c, content: c.content, id: c.id });

			if (batchChunks.length >= batchSize) {
				await this.processBatch(workspace, batchChunks.splice(0, batchChunks.length), model, records, token);
			}
		}

		if (batchChunks.length) {
			await this.processBatch(workspace, batchChunks, model, records, token);
		}

		if (records.length) {
			await this.store.upsertEmbeddings(workspace, records);
			await this.store.updateMetadata(workspace, [
				{ key: 'embeddingModel', value: model },
				{ key: 'lastIndexedTime', value: Date.now().toString() }
			]);
		}
	}

	private async processBatch(workspace: IWorkspaceIdentifier, batch: Chunk[], model: string, out: StoredEmbedding[], token?: CancellationToken): Promise<void> {
		if (!batch.length) {
			return;
		}
		let vectors: number[][];
		const contents = batch.map(b => b.content);

		this.logService.info('[EmbeddingService] processBatch called', {
			workspace: workspace.id ?? workspace.configPath?.fsPath,
			batchSize: batch.length,
			model,
			embeddingServiceEnabled: this.embeddingVectorService.isEnabled()
		});

		try {
			// Prefer any registered embedding provider (remote or extension).
			if (this.embeddingVectorService.isEnabled()) {
				this.logService.info('[EmbeddingService] Calling embeddingVectorService.getEmbeddingVector', {
					workspace: workspace.id ?? workspace.configPath?.fsPath,
					contentsCount: contents.length
				});
				vectors = await this.embeddingVectorService.getEmbeddingVector(contents, token ?? CancellationToken.None) as number[][];
				this.logService.info('[EmbeddingService] getEmbeddingVector returned', {
					workspace: workspace.id ?? workspace.configPath?.fsPath,
					vectorsCount: vectors?.length,
					vectorDim: vectors?.[0]?.length
				});
			} else {
				this.logService.warn('[EmbeddingService] embeddingVectorService.isEnabled() returned false', {
					workspace: workspace.id ?? workspace.configPath?.fsPath
				});
				throw new Error('No embedding providers registered');
			}
		} catch (err) {
			// Fallback to the local hash-based runtime when no provider is
			// available or the call fails. This keeps embeddings fully local
			// while we iterate on a true ONNX-based runtime.
			this.logService.trace('[EmbeddingService] falling back to LocalHashEmbeddingRuntime for batch', {
				workspace: workspace.id ?? workspace.configPath.fsPath,
				error: err instanceof Error ? err.message : String(err)
			});

			const handle: ModelHandle = {
				modelId: model,
				modelVersion: '1',
				modelPath: ''
			};
			try {
				vectors = await this.localRuntime.embed(handle, contents, token ?? CancellationToken.None);
			} catch (fallbackError) {
				this.logService.warn('[EmbeddingService] LocalHashEmbeddingRuntime failed; skipping batch', {
					workspace: workspace.id ?? workspace.configPath.fsPath,
					error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
				});
				return;
			}
		}
		for (let i = 0; i < vectors.length; i++) {
			const vec = Float32Array.from(vectors[i]);
			const norm = this.norm(vec);
			out.push({
				chunkId: batch[i].id,
				uri: batch[i].uri,
				workspace: workspace.id ?? workspace.configPath.fsPath,
				languageId: batch[i].languageId ?? 'plaintext',
				model,
				dim: vec.length,
				norm,
				vector: vec,
			});
		}
	}

	private norm(vec: Float32Array): number {
		let sum = 0;
		for (let i = 0; i < vec.length; i++) {
			sum += vec[i] * vec[i];
		}
		return Math.sqrt(sum);
	}
}

