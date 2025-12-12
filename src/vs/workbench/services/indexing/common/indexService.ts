/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IIndexService = createDecorator<IIndexService>('indexService');

export const enum IndexState {
	Uninitialized = 'uninitialized',
	Indexing = 'indexing',
	Ready = 'ready',
	Stale = 'stale',
	Error = 'error'
}

export interface IndexStatus {
	readonly workspace: IWorkspaceIdentifier;
	readonly state: IndexState;
	readonly indexedFileCount?: number;
	readonly lastUpdated?: number;
	readonly lastIndexedTime?: number;
	readonly totalFiles?: number;
	readonly indexedFiles?: number;
	readonly embeddingModel?: string;
	readonly errorMessage?: string;
}

export interface IndexRequest {
	readonly uri: URI;
	readonly languageId?: string;
	readonly content?: string;
	readonly workspace?: IWorkspaceIdentifier;
}

export interface IIndexService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeStatus: Event<IndexStatus>;

	buildFullIndex(workspace: IWorkspaceIdentifier, token?: CancellationToken): Promise<IndexStatus>;
	refreshPaths(workspace: IWorkspaceIdentifier, uris: URI[], token?: CancellationToken): Promise<IndexStatus>;
	getStatus(workspace: IWorkspaceIdentifier): Promise<IndexStatus>;
}

