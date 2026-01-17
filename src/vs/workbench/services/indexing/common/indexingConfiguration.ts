/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';

export const CONFIG_SECTION = 'vybe';

// Cloud indexing configuration (local indexing removed)
export const CONFIG_CLOUD_INDEXING_ENABLED = 'vybe.cloudIndexing.enabled';
export const CONFIG_PINECONE_INDEX_NAME = 'vybe.cloudIndexing.pineconeIndex';
export const CONFIG_CHUNK_SIZE_LINES = 'vybe.cloudIndexing.chunkSizeLines';
export const CONFIG_CLOUD_EMBEDDING_BATCH_SIZE = 'vybe.cloudIndexing.embeddingBatchSize';

export const indexingConfigurationProperties: IStringDictionary<IConfigurationPropertySchema> = {
	[CONFIG_CLOUD_INDEXING_ENABLED]: {
		type: 'boolean',
		default: false,
		description: 'Enable cloud-based codebase indexing for semantic search and retrieval.'
	},
	[CONFIG_PINECONE_INDEX_NAME]: {
		type: 'string',
		default: 'vybe',
		description: 'Shared Pinecone index name for all users. User isolation is provided via namespaces.'
	},
	[CONFIG_CHUNK_SIZE_LINES]: {
		type: 'number',
		default: 200,
		minimum: 1,
		description: 'Number of lines per code chunk when indexing files.'
	},
	[CONFIG_CLOUD_EMBEDDING_BATCH_SIZE]: {
		type: 'number',
		default: 50,
		minimum: 1,
		maximum: 128,
		description: 'Batch size for embedding generation requests to Voyage AI.'
	}
};

