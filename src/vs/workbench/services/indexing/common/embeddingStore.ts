/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IEmbeddingStore = createDecorator<IEmbeddingStore>('embeddingStore');

export interface EmbeddingRecord {
	readonly chunkId: string;
	readonly uri: URI;
	readonly embedding: number[];
	readonly languageId?: string;
	readonly chunkHash?: string;
}

export interface VectorHit {
	readonly uri: URI;
	readonly chunkId: string;
	readonly score: number;
	readonly languageId?: string;
}

export interface IEmbeddingStore {
	readonly _serviceBrand: undefined;
	storeEmbeddings(records: EmbeddingRecord[], workspace?: any, token?: CancellationToken): Promise<void>;
	removeEmbeddingsForUri(uri: URI, workspace?: any, token?: CancellationToken): Promise<void>;
	getNearest(queryEmbedding: number[], k?: number, offset?: number, workspace?: any, token?: CancellationToken): Promise<VectorHit[]>;
	getByHash(chunkHash: string, workspace?: any, token?: CancellationToken): Promise<EmbeddingRecord[]>;
}

