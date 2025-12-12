/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CONFIG_SECTION = 'vybe';

export const CONFIG_ENABLE_LOCAL_INDEXING = 'vybe.localIndexing.enabled';
export const CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH = 'vybe.search.localSemanticEnabled';
export const CONFIG_ENABLE_LOCAL_INDEX_WATCHER = 'vybe.localIndexing.enableWatcher';
export const CONFIG_ENABLE_LOCAL_EMBEDDINGS = 'vybe.localIndexing.enableEmbeddings';
export const CONFIG_MAX_CONCURRENT_JOBS = 'vybe.localIndexing.maxConcurrentJobs';
export const CONFIG_INDEX_BATCH_SIZE = 'vybe.localIndexing.batchSize';
export const CONFIG_INDEX_DEBOUNCE_MS = 'vybe.localIndexing.debounceMs';
export const CONFIG_INDEX_STORAGE_PATH = 'vybe.localIndexing.storagePath'; // optional override
export const CONFIG_EMBEDDING_MODEL = 'vybe.localIndexing.embeddingModel';
export const CONFIG_EMBEDDING_BATCH_SIZE = 'vybe.localIndexing.embeddingBatchSize';
export const CONFIG_SEARCH_TOP_K = 'vybe.localIndexing.searchTopK';
export const CONFIG_LEXICAL_ROW_LIMIT = 'vybe.localIndexing.lexicalRowLimit';

export const indexingConfigurationProperties = {
	[CONFIG_ENABLE_LOCAL_INDEXING]: {
		type: 'boolean',
		default: false,
		description: 'Enable VYBE local indexing and semantic engine. When disabled, behavior matches upstream VS Code.',
	},
	[CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH]: {
		type: 'boolean',
		default: false,
		description: 'Use the local semantic engine for AI text search when available. Falls back to existing providers when disabled.',
	},
	[CONFIG_ENABLE_LOCAL_INDEX_WATCHER]: {
		type: 'boolean',
		default: false,
		description: 'Enable file system watcher for local indexing. Requires vybe.localIndexing.enabled.',
	},
	[CONFIG_ENABLE_LOCAL_EMBEDDINGS]: {
		type: 'boolean',
		default: false,
		description: 'Enable local embedding generation and storage for semantic search. Requires vybe.localIndexing.enabled.',
	},
	[CONFIG_MAX_CONCURRENT_JOBS]: {
		type: 'number',
		default: 2,
		minimum: 1,
		description: 'Maximum concurrent indexing jobs when local indexing is enabled.',
	},
	[CONFIG_INDEX_BATCH_SIZE]: {
		type: 'number',
		default: 20,
		minimum: 1,
		description: 'Maximum files per indexing batch.',
	},
	[CONFIG_INDEX_DEBOUNCE_MS]: {
		type: 'number',
		default: 500,
		minimum: 0,
		description: 'Debounce delay (ms) for batching file change events into indexing jobs.',
	},
	[CONFIG_INDEX_STORAGE_PATH]: {
		type: 'string',
		default: '',
		description: 'Optional override path for local index storage. When empty, uses workspace/profile default locations.',
	},
	[CONFIG_EMBEDDING_MODEL]: {
		type: 'string',
		default: 'nomic-ai/CodeRankEmbed',
		description: 'Embedding model identifier used for local semantic search.'
	},
	[CONFIG_EMBEDDING_BATCH_SIZE]: {
		type: 'number',
		default: 16,
		minimum: 1,
		description: 'Batch size for embedding generation requests.'
	},
	[CONFIG_SEARCH_TOP_K]: {
		type: 'number',
		default: 50,
		minimum: 1,
		description: 'Maximum vector neighbors to consider per semantic search.'
	},
	[CONFIG_LEXICAL_ROW_LIMIT]: {
		type: 'number',
		default: 200,
		minimum: 1,
		description: 'Maximum rows returned from lexical search per query.'
	}
} as const;

