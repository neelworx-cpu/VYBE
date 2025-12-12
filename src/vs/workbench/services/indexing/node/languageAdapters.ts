/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILanguageAdapterService, LanguageAdapter, ProjectGraphEdge, ProjectGraphEdgeKind, SymbolEntry, SymbolKind, SymbolReference, Chunk, Range } from '../common/languageAdapter.js';
import { chunkByLines } from './chunking.js';

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

type TsModule = typeof import('typescript');
type TsNode = import('typescript').Node;
type TsSourceFile = import('typescript').SourceFile;
type TsSyntaxKind = import('typescript').SyntaxKind;

let tsRuntime: TsModule | undefined;
function getTs(): TsModule | undefined {
	if (tsRuntime) {
		return tsRuntime;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const gRequire: any = (typeof require !== 'undefined') ? require : undefined;
	if (!gRequire) {
		return undefined;
	}
	try {
		tsRuntime = gRequire('typescript') as TsModule;
	} catch {
		tsRuntime = undefined;
	}
	return tsRuntime;
}

function toRange(ts: TsModule, sf: TsSourceFile, node: TsNode): Range {
	const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
	const end = sf.getLineAndCharacterOfPosition(node.getEnd());
	return {
		start: { lineNumber: start.line + 1, column: start.character + 1 },
		end: { lineNumber: end.line + 1, column: end.character + 1 }
	};
}

function tsKindToSymbolKind(ts: TsModule, kind: TsSyntaxKind): SymbolKind {
	switch (kind) {
		case ts.SyntaxKind.ClassDeclaration: return SymbolKind.Class;
		case ts.SyntaxKind.InterfaceDeclaration: return SymbolKind.Interface;
		case ts.SyntaxKind.EnumDeclaration: return SymbolKind.Enum;
		case ts.SyntaxKind.FunctionDeclaration: return SymbolKind.Function;
		case ts.SyntaxKind.MethodDeclaration: return SymbolKind.Method;
		case ts.SyntaxKind.PropertyDeclaration: return SymbolKind.Property;
		case ts.SyntaxKind.VariableDeclaration: return SymbolKind.Variable;
		case ts.SyntaxKind.ModuleDeclaration: return SymbolKind.Module;
		default: return SymbolKind.Unknown;
	}
}

class TypeScriptLanguageAdapter implements LanguageAdapter {
	readonly languageId = 'typescript';
	readonly extensions = TS_EXTENSIONS;

	canHandle(uri: URI, languageId: string | undefined): boolean {
		if (languageId && (languageId === 'typescript' || languageId === 'javascript')) {
			return true;
		}
		const path = uri.path.toLowerCase();
		return this.extensions.some(ext => path.endsWith(ext));
	}

	async extractFileMetadata(_text: string, uri: URI, languageId: string | undefined) {
		return { uri, languageId };
	}

	async extractSymbols(text: string, uri: URI, languageId: string | undefined): Promise<SymbolEntry[]> {
		const ts = getTs();
		if (!ts) {
			return [];
		}
		const sf = ts.createSourceFile(uri.fsPath, text, ts.ScriptTarget.Latest, true);
		const symbols: SymbolEntry[] = [];

		const visit = (node: TsNode, container?: string) => {
			if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isFunctionDeclaration(node)) {
				const name = node.name?.getText(sf) ?? '<anonymous>';
				const id = `${uri.toString()}::${name}::${node.pos}`;
				symbols.push({
					id,
					name,
					kind: tsKindToSymbolKind(ts, node.kind),
					location: { uri, range: toRange(ts, sf, node), languageId },
					containerName: container,
					references: [],
					imports: [],
					exports: []
				});
			}
			node.forEachChild((child: TsNode) => visit(child, container));
		};

		visit(sf, undefined);
		return symbols;
	}

	async extractDefinitions(text: string, uri: URI, languageId: string | undefined) {
		const ts = getTs();
		if (!ts) { return []; }
		// For now, treat top-level symbols as definitions.
		const symbols = await this.extractSymbols(text, uri, languageId);
		return symbols.map(s => ({
			...s
		}));
	}

	async extractReferences(_text: string, _uri: URI, _languageId: string | undefined): Promise<SymbolReference[]> {
		// Reference extraction is not implemented yet.
		return [];
	}

	async extractGraphEdges(text: string, uri: URI, languageId: string | undefined): Promise<ProjectGraphEdge[]> {
		const ts = getTs();
		if (!ts) { return []; }
		const sf = ts.createSourceFile(uri.fsPath, text, ts.ScriptTarget.Latest, true);
		const edges: ProjectGraphEdge[] = [];

		const addImportEdge = (moduleName: string) => {
			edges.push({
				from: uri.toString(),
				to: moduleName,
				kind: ProjectGraphEdgeKind.Import,
				uri,
				languageId
			});
		};

		sf.forEachChild(node => {
			if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
				const moduleName = node.moduleSpecifier.text;
				addImportEdge(moduleName);
			}
			if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
				const moduleName = node.moduleSpecifier.text;
				edges.push({
					from: uri.toString(),
					to: moduleName,
					kind: ProjectGraphEdgeKind.Export,
					uri,
					languageId
				});
			}
		});

		return edges;
	}

	async generateEmbeddableChunks(text: string, uri: URI, languageId: string | undefined): Promise<Chunk[]> {
		const rawChunks = chunkByLines(text, uri, languageId);
		return rawChunks.map((c, idx) => ({
			...c,
			id: `${uri.toString()}::chunk::${idx}`,
		}));
	}
}

class EmptyLanguageAdapter implements LanguageAdapter {
	constructor(readonly languageId: string, readonly extensions: readonly string[]) { }

	canHandle(uri: URI, languageId: string | undefined): boolean {
		if (languageId && languageId === this.languageId) {
			return true;
		}
		const path = uri.path.toLowerCase();
		return this.extensions.some(ext => path.endsWith(ext));
	}

	async extractFileMetadata(_text: string, uri: URI, languageId: string | undefined) {
		return { uri, languageId };
	}
	async extractSymbols(): Promise<SymbolEntry[]> { return []; }
	async extractDefinitions(): Promise<SymbolEntry[]> { return []; }
	async extractReferences(): Promise<SymbolReference[]> { return []; }
	async extractGraphEdges(): Promise<ProjectGraphEdge[]> { return []; }
	async generateEmbeddableChunks(_text: string, _uri: URI): Promise<Chunk[]> { return []; }
}

const skeletonAdapters: LanguageAdapter[] = [
	new EmptyLanguageAdapter('python', ['.py']),
	new EmptyLanguageAdapter('go', ['.go']),
	new EmptyLanguageAdapter('rust', ['.rs']),
	new EmptyLanguageAdapter('java', ['.java']),
	new EmptyLanguageAdapter('csharp', ['.cs']),
	new EmptyLanguageAdapter('cpp', ['.cpp', '.cc', '.cxx', '.h', '.hpp']),
	new EmptyLanguageAdapter('php', ['.php']),
	new EmptyLanguageAdapter('ruby', ['.rb']),
	new EmptyLanguageAdapter('swift', ['.swift']),
	new EmptyLanguageAdapter('kotlin', ['.kt', '.kts']),
	new EmptyLanguageAdapter('json', ['.json', '.jsonc', '.yaml', '.yml']),
];

export function registerDefaultLanguageAdapters(service: ILanguageAdapterService): IDisposable {
	const store = new DisposableStore();
	store.add(service.registerLanguageAdapter(new TypeScriptLanguageAdapter()));
	for (const adapter of skeletonAdapters) {
		store.add(service.registerLanguageAdapter(adapter));
	}
	return store;
}

