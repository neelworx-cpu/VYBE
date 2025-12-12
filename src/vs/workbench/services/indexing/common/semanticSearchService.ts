/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISemanticSearchService = createDecorator<ISemanticSearchService>('semanticSearchService');

export interface SemanticSearchOptions {
	readonly workspace: URI | undefined;
	readonly maxResults?: number;
}

export interface SemanticSearchResult {
	readonly uri: URI;
	readonly score: number;
	readonly snippet?: string;
	readonly range?: { startLineNumber: number; endLineNumber: number };
	readonly provenance: Array<'lexical' | 'vector' | 'graph'>;
	readonly languageId?: string;
}

export interface ISemanticSearchService {
	readonly _serviceBrand: undefined;
	search(query: string, options?: SemanticSearchOptions, token?: CancellationToken): Promise<SemanticSearchResult[]>;
}

