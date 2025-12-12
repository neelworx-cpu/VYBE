/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface Position {
	readonly lineNumber: number;
	readonly column: number;
}

export interface Range {
	readonly start: Position;
	readonly end: Position;
}

export interface Chunk {
	readonly id: string;
	readonly uri: URI;
	readonly languageId?: string;
	readonly content: string;
	readonly range?: Range;
}

export const enum SymbolKind {
	Unknown = 'unknown',
	File = 'file',
	Module = 'module',
	Class = 'class',
	Interface = 'interface',
	Enum = 'enum',
	Function = 'function',
	Method = 'method',
	Property = 'property',
	Variable = 'variable',
	Constant = 'constant',
	Namespace = 'namespace',
	Type = 'type',
	Struct = 'struct',
	Trait = 'trait',
	Record = 'record'
}

export interface SymbolLocation {
	readonly uri: URI;
	readonly range?: Range;
	readonly languageId?: string;
}

export interface SymbolReference {
	readonly location: SymbolLocation;
	readonly kind?: string;
}

export interface SymbolImport {
	readonly from: string; // module path or symbol id
	readonly symbol?: string;
}

export interface SymbolExport {
	readonly symbol: string;
	readonly as?: string;
}

export interface SymbolEntry {
	readonly id: string;
	readonly name: string;
	readonly kind: SymbolKind;
	readonly location: SymbolLocation;
	readonly containerName?: string;
	readonly references: SymbolReference[];
	readonly exports: SymbolExport[];
	readonly imports: SymbolImport[];
}

export interface DefinitionInfo extends SymbolEntry { }
export interface ReferenceInfo extends SymbolReference { }

export const enum ProjectGraphEdgeKind {
	Import = 'import',
	Export = 'export',
	Call = 'call',
	Extends = 'extends',
	Implements = 'implements',
	Uses = 'uses'
}

export interface ProjectGraphEdge {
	readonly from: string; // symbol or node id
	readonly to: string; // symbol or node id
	readonly kind: ProjectGraphEdgeKind;
	readonly uri: URI;
	readonly languageId?: string;
}

export interface FileMetadata {
	readonly uri: URI;
	readonly languageId?: string;
	readonly size?: number;
}

export interface LanguageAdapter {
	readonly languageId: string;
	readonly extensions: readonly string[];
	canHandle(uri: URI, languageId: string | undefined): boolean;

	extractFileMetadata(documentText: string, uri: URI, languageId: string | undefined): Promise<FileMetadata | undefined>;
	extractSymbols(documentText: string, uri: URI, languageId: string | undefined): Promise<SymbolEntry[]>;
	extractDefinitions(documentText: string, uri: URI, languageId: string | undefined): Promise<DefinitionInfo[]>;
	extractReferences(documentText: string, uri: URI, languageId: string | undefined): Promise<ReferenceInfo[]>;
	extractGraphEdges(documentText: string, uri: URI, languageId: string | undefined): Promise<ProjectGraphEdge[]>;
	generateEmbeddableChunks(documentText: string, uri: URI, languageId: string | undefined): Promise<Chunk[]>;
}

export interface ILanguageAdapterService {
	readonly _serviceBrand: undefined;
	registerLanguageAdapter(adapter: LanguageAdapter): IDisposable;
	getAdapter(uri: URI, languageId: string | undefined): LanguageAdapter | undefined;
	getAll(): readonly LanguageAdapter[];
}

export const ILanguageAdapterService = createDecorator<ILanguageAdapterService>('languageAdapterService');

