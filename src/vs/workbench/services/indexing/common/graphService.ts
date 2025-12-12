/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DefinitionInfo, ProjectGraphEdge, ReferenceInfo, SymbolEntry } from './languageAdapter.js';

export const IGraphService = createDecorator<IGraphService>('graphService');

export interface GraphNode {
	readonly id: string;
	readonly uri: URI;
	readonly languageId?: string;
	readonly kind?: string;
	readonly name?: string;
}

export interface GraphStats {
	readonly nodes: number;
	readonly edges: number;
}

export interface IGraphService {
	readonly _serviceBrand: undefined;

	updateFromFile(uri: URI, symbols: SymbolEntry[], definitions: DefinitionInfo[], references: ReferenceInfo[], edges: ProjectGraphEdge[], workspace?: any, token?: CancellationToken): Promise<void>;
	removeFile(uri: URI, workspace?: any, token?: CancellationToken): Promise<void>;

	getDefinitions(id: string, workspace?: any, token?: CancellationToken): Promise<DefinitionInfo[]>;
	getReferences(id: string, workspace?: any, token?: CancellationToken): Promise<ReferenceInfo[]>;
	getNeighbors(id: string, workspace?: any, token?: CancellationToken): Promise<ProjectGraphEdge[]>;

	getFileGraph(uri: URI, workspace?: any, token?: CancellationToken): Promise<ProjectGraphEdge[]>;
	getStats(workspace?: any): Promise<GraphStats>;
}

