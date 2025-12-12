/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Chunk } from '../common/languageAdapter.js';

export interface ChunkingOptions {
	maxLinesPerChunk?: number;
}

// Optional TS loader to avoid static dependency in browser builds.
let tsImpl: typeof import('typescript') | undefined;
function tryGetTypescript(): typeof import('typescript') | undefined {
	if (tsImpl) {
		return tsImpl;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const gRequire: any = (typeof require !== 'undefined') ? require : undefined;
	if (!gRequire) {
		return undefined;
	}
	try {
		tsImpl = gRequire('typescript');
	} catch {
		tsImpl = undefined;
	}
	return tsImpl;
}

function toRange(sf: any, node: any) {
	const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
	const end = sf.getLineAndCharacterOfPosition(node.getEnd());
	return {
		startLine: start.line + 1,
		endLine: end.line + 1,
		startChar: start.character,
		endChar: end.character
	};
}

export class ChunkingService {
	constructor(private readonly options: ChunkingOptions = {}) { }

	chunkDocument(uri: URI, languageId: string | undefined, content: string): Chunk[] {
		const ts = tryGetTypescript();
		if (ts && (languageId === 'typescript' || languageId === 'javascript')) {
			const sf = ts.createSourceFile(uri.fsPath, content, ts.ScriptTarget.Latest, true);
			const chunks: Chunk[] = [];
			sf.forEachChild(node => {
				if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node)) {
					const range = toRange(sf, node);
					const snippet = content.slice(node.getStart(sf), node.getEnd());
					chunks.push({
						id: `${uri.toString()}::${range.startLine}-${range.endLine}`,
						uri,
						languageId,
						content: snippet,
						range: {
							start: { lineNumber: range.startLine, column: range.startChar + 1 },
							end: { lineNumber: range.endLine, column: range.endChar + 1 }
						}
					});
				}
			});
			if (chunks.length) {
				return chunks;
			}
		}

		// Fallback line-based chunking
		const maxLines = this.options.maxLinesPerChunk ?? 200;
		const lines = content.split(/\r?\n/);
		const result: Chunk[] = [];
		let start = 0;
		let idx = 0;
		while (start < lines.length) {
			const end = Math.min(start + maxLines, lines.length);
			const snippet = lines.slice(start, end).join('\n');
			result.push({
				id: `${uri.toString()}::chunk::${idx++}`,
				uri,
				languageId,
				content: snippet,
				range: {
					start: { lineNumber: start + 1, column: 1 },
					end: { lineNumber: end, column: 1 }
				}
			});
			start = end;
		}
		return result;
	}
}

