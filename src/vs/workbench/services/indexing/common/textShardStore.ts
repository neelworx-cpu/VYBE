/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Chunk } from './languageAdapter.js';

export const ITextShardStore = createDecorator<ITextShardStore>('textShardStore');

export interface LexicalHit {
	readonly uri: URI;
	readonly score: number;
	readonly snippet?: string;
	readonly range?: { startLineNumber: number; endLineNumber: number };
	readonly languageId?: string;
	readonly chunkId?: string;
}

export interface ITextShardStore {
	readonly _serviceBrand: undefined;
	indexDocument(uri: URI, languageId: string | undefined, chunks: Chunk[], workspace?: any, token?: CancellationToken): Promise<void>;
	removeDocument(uri: URI, workspace?: any, token?: CancellationToken): Promise<void>;
	searchLexical(query: string, maxResults?: number, workspace?: any, token?: CancellationToken): Promise<LexicalHit[]>;
	clear(token?: CancellationToken): Promise<void>;
}

