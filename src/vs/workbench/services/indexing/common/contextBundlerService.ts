/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

export const IContextBundlerService = createDecorator<IContextBundlerService>('contextBundlerService');

export interface ContextQuery {
	readonly workspace: IWorkspaceIdentifier;
	readonly queryText?: string;
	readonly focusUri?: URI;
	readonly maxSnippets?: number;
	readonly maxTokens?: number;
}

export interface ContextSnippet {
	readonly uri: URI;
	readonly snippet: string;
	readonly score?: number;
	readonly range?: { startLineNumber: number; endLineNumber: number };
	readonly provenance?: Array<'lexical' | 'vector' | 'graph'>;
}

export interface ContextSymbol {
	readonly id: string;
	readonly name: string;
	readonly kind?: string;
	readonly uri: URI;
	readonly languageId?: string;
}

export interface ContextDependency {
	readonly from: string;
	readonly to: string;
	readonly kind: string;
}

export interface ContextBundle {
	readonly snippets: ContextSnippet[];
	readonly symbols: ContextSymbol[];
	readonly dependencies: ContextDependency[];
	readonly recencyInfo?: { lastIndexedTime?: number; state?: 'uninitialized' | 'indexing' | 'ready' | 'stale' };
	readonly engineMetadata?: { selectionStrategy: 'hybrid' | 'lexical' | 'vector'; indexFreshness: 'fresh' | 'stale' | 'building' | 'uninitialized'; embeddingModel?: string };
}

export interface IContextBundlerService {
	readonly _serviceBrand: undefined;
	getContextForMcp(query: ContextQuery, token?: CancellationToken): Promise<ContextBundle>;
}

