/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Chunk, Range } from '../common/languageAdapter.js';

const DEFAULT_MAX_LINES = 200;

function fnv1a(content: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		hash ^= content.charCodeAt(i);
		hash = (hash * 0x01000193) >>> 0;
	}
	return hash.toString(16);
}

export function hashContent(content: string, uri: URI, extra?: string): string {
	let combined = uri.toString() + '::' + content;
	if (extra) {
		combined += '::' + extra;
	}
	return fnv1a(combined);
}

export function lineCount(text: string): number {
	return text.split(/\r?\n/).length;
}

export function chunkByLines(text: string, uri: URI, languageId: string | undefined, maxLines: number = DEFAULT_MAX_LINES): Chunk[] {
	const lines = text.split(/\r?\n/);
	const chunks: Chunk[] = [];
	let start = 0;
	let chunkIndex = 0;

	while (start < lines.length) {
		const endExclusive = Math.min(start + maxLines, lines.length);
		const content = lines.slice(start, endExclusive).join('\n');
		const range: Range = {
			start: { lineNumber: start + 1, column: 1 },
			end: { lineNumber: endExclusive, column: 1 }
		};
		const chunkId = `${uri.toString()}::chunk::${chunkIndex}`;
		chunks.push({
			id: chunkId,
			uri,
			languageId,
			content,
			range
		});
		start = endExclusive;
		chunkIndex++;
	}

	if (chunks.length === 0) {
		chunks.push({
			id: `${uri.toString()}::chunk::0`,
			uri,
			languageId,
			content: text,
			range: {
				start: { lineNumber: 1, column: 1 },
				end: { lineNumber: lineCount(text), column: 1 }
			}
		});
	}

	return chunks;
}

