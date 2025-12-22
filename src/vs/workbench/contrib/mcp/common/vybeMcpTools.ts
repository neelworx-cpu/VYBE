/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

// Authoritative MCP-aligned contracts
export interface IDEContextSnippet {
	uri: string;
	snippet: string;
	score: number;
	range: {
		startLine: number;
		endLine: number;
		startChar: number;
		endChar: number;
	};
	provenance: string[];
	languageId: string;
}

export interface IDEContextSymbol {
	id: string;
	name: string;
	kind: string;
	uri: string;
	range?: {
		startLine: number;
		endLine: number;
	};
	languageId: string;
}

export interface IDEContextBundle {
	state: 'ready' | 'stale' | 'uninitialized' | 'error';
	snippets: IDEContextSnippet[];
	symbols: IDEContextSymbol[];
	dependencies: string[];
	recencyInfo: {
		lastIndexedTime?: number;
		state: string;
	};
	engineMetadata: {
		selectionStrategy?: string;
		indexFreshness?: string;
		embeddingModel?: string;
	};
}

export interface IndexStatusDTO {
	state: 'ready' | 'stale' | 'uninitialized' | 'indexing' | 'error';
	lastIndexedTime?: number;
	totalFiles?: number;
	indexedFiles?: number;
	totalChunks?: number;
	embeddedChunks?: number;
	embeddingModel?: string;
	/**
	 * Optional on-disk path to the underlying index database. Exposed only
	 * for diagnostics and support tooling; callers must not read or mutate
	 * the file directly.
	 */
	dbPath?: string;
}

export interface MergedContextBundle {
	ide: IDEContextBundle;
	router: unknown;
	combinedSnippets: unknown[];
	combinedSymbols: IDEContextSymbol[];
	metadata: {
		ide_used: boolean;
		fallback_reason?: string;
		total_snippets: number;
		total_symbols: number;
	};
}

// Tool request/response wrappers
export interface GetContextForMcpRequest {
	workspaceId: string;
	queryText?: string;
	focusUri?: string;
	maxSnippets?: number;
	maxTokens?: number;
	languageIds?: string[];
}

export interface GetContextForMcpResponse extends IDEContextBundle { }

export interface SearchHybridRequest {
	workspaceId: string;
	query: string;
	maxResults?: number;
	languageIds?: string[];
}

export interface SearchHybridResult {
	uri: string;
	score: number;
	snippet?: string;
	range?: { startLine: number; endLine: number; startChar: number; endChar: number };
	provenance: Array<'lexical' | 'vector' | 'graph'>;
	languageId: string;
}

export interface SearchHybridResponse {
	results: SearchHybridResult[];
}

export interface ListIndexStatusRequest {
	workspaceId: string;
}

export interface ListIndexStatusResponse extends IndexStatusDTO {
	workspaceId: string;
	errorMessage?: string;
}

export interface RefreshIndexRequest {
	workspaceId: string;
	uris?: string[];
	mode?: 'incremental' | 'full';
}

export interface RefreshIndexResponse {
	accepted: boolean;
	state: 'indexing' | 'ready' | 'uninitialized' | 'error';
	message?: string;
}

export function disabledContextResponse(): GetContextForMcpResponse {
	return {
		state: 'uninitialized',
		snippets: [],
		symbols: [],
		dependencies: [],
		recencyInfo: { state: 'uninitialized' },
		engineMetadata: {}
	};
}

export function disabledSearchResponse(): SearchHybridResponse {
	return { results: [] };
}

export function disabledStatusResponse(workspaceId: string): ListIndexStatusResponse {
	return { workspaceId, state: 'uninitialized' };
}

export function disabledRefreshResponse(): RefreshIndexResponse {
	return { accepted: false, state: 'uninitialized', message: 'Local indexing disabled' };
}

export function parseWorkspaceId(id: string): IWorkspaceIdentifier {
	return { id, configPath: URI.file(id) };
}

