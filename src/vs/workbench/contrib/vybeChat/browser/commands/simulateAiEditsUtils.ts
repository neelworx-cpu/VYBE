/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEV-ONLY utilities for simulating AI-style code edits in E2E tests
 * DO NOT use in production code paths
 */

import { URI } from '../../../../../base/common/uri.js';

export interface MarkerInfo {
	type: 'replace' | 'insert' | 'delete';
	startIndex: number;
	endIndex?: number;
	markerLine: number;
	content?: string; // Content between START/END markers
}

export interface FunctionInfo {
	name: string;
	startLine: number;
	endLine: number;
	bodyStart: number;
	bodyEnd: number;
	fullMatch: string;
}

/**
 * Find all VYBE_TEST markers in the content
 */
export function findMarkers(content: string): MarkerInfo[] {
	const markers: MarkerInfo[] = [];
	const lines = content.split('\n');
	let charIndex = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineStartIndex = charIndex;

		// Check for REPLACE markers
		const replaceStartMatch = line.match(/\[VYBE_TEST_REPLACE_START\]/);
		const replaceEndMatch = line.match(/\[VYBE_TEST_REPLACE_END\]/);
		if (replaceStartMatch) {
			markers.push({
				type: 'replace',
				startIndex: lineStartIndex + (replaceStartMatch.index ?? 0),
				markerLine: i + 1
			});
		}
		if (replaceEndMatch) {
			const lastReplace = markers.filter(m => m.type === 'replace' && !m.endIndex).pop();
			if (lastReplace) {
				lastReplace.endIndex = lineStartIndex + (replaceEndMatch.index ?? 0);
				// Extract content between markers
				lastReplace.content = content.substring(lastReplace.startIndex, lastReplace.endIndex);
			}
		}

		// Check for INSERT marker
		const insertMatch = line.match(/\[VYBE_TEST_INSERT\]/);
		if (insertMatch) {
			markers.push({
				type: 'insert',
				startIndex: lineStartIndex + (insertMatch.index ?? 0),
				markerLine: i + 1
			});
		}

		// Check for DELETE markers
		const deleteStartMatch = line.match(/\[VYBE_TEST_DELETE_START\]/);
		const deleteEndMatch = line.match(/\[VYBE_TEST_DELETE_END\]/);
		if (deleteStartMatch) {
			markers.push({
				type: 'delete',
				startIndex: lineStartIndex + (deleteStartMatch.index ?? 0),
				markerLine: i + 1
			});
		}
		if (deleteEndMatch) {
			const lastDelete = markers.filter(m => m.type === 'delete' && !m.endIndex).pop();
			if (lastDelete) {
				lastDelete.endIndex = lineStartIndex + (deleteEndMatch.index ?? 0);
				lastDelete.content = content.substring(lastDelete.startIndex, lastDelete.endIndex);
			}
		}

		charIndex += line.length + 1; // +1 for newline
	}

	return markers;
}

/**
 * Apply marker-based edits to content
 */
export function applyMarkerBasedEdits(content: string, markers: MarkerInfo[]): string {
	let modified = content;
	// Process in reverse order to maintain indices
	const sortedMarkers = [...markers].sort((a, b) => (b.startIndex ?? 0) - (a.startIndex ?? 0));

	for (const marker of sortedMarkers) {
		if (marker.type === 'replace' && marker.endIndex) {
			// Replace content between markers
			const before = modified.substring(0, marker.startIndex);
			const after = modified.substring(marker.endIndex);
			const newContent = generateRealisticEdit(marker.content || '', 'replace');
			modified = before + newContent + after;
		} else if (marker.type === 'insert') {
			// Insert new code after marker
			const insertIndex = modified.indexOf('[VYBE_TEST_INSERT]', marker.startIndex);
			if (insertIndex !== -1) {
				const before = modified.substring(0, insertIndex);
				const after = modified.substring(insertIndex);
				const newContent = generateRealisticEdit('', 'insert');
				modified = before + newContent + '\n' + after;
			}
		} else if (marker.type === 'delete' && marker.endIndex) {
			// Delete content between markers
			const before = modified.substring(0, marker.startIndex);
			const after = modified.substring(marker.endIndex);
			modified = before + after;
		}
	}

	// Remove all markers
	modified = modified.replace(/\[VYBE_TEST_(REPLACE|INSERT|DELETE)(_START|_END)?\]/g, '');

	return modified;
}

/**
 * Detect functions in TypeScript/JavaScript code
 */
export function detectFunctions(content: string): FunctionInfo[] {
	const functions: FunctionInfo[] = [];
	const lines = content.split('\n');

	// Regex patterns for different function types
	const functionPatterns = [
		// function name() { ... }
		/function\s+([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/g,
		// const name = () => { ... } or const name = function() { ... }
		/(?:const|let|var)\s+([_$a-zA-Z][_$a-zA-Z0-9]*)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\))\s*\{/g,
		// async function name() { ... }
		/async\s+function\s+([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/g,
		// class.method() { ... }
		/(?:public|private|protected|static)?\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/g
	];

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];

		for (const pattern of functionPatterns) {
			pattern.lastIndex = 0; // Reset regex
			const match = pattern.exec(line);
			if (match) {
				const functionName = match[1] || 'anonymous';
				const startLine = lineIndex + 1;

				// Find function body end by counting braces
				let braceDepth = 0;
				let foundOpeningBrace = false;
				let endLine = startLine;

				for (let i = lineIndex; i < lines.length; i++) {
					const currentLine = lines[i];
					for (const char of currentLine) {
						if (char === '{') {
							braceDepth++;
							foundOpeningBrace = true;
						} else if (char === '}') {
							braceDepth--;
							if (braceDepth === 0 && foundOpeningBrace) {
								endLine = i + 1;
								break;
							}
						}
					}
					if (braceDepth === 0 && foundOpeningBrace) {
						break;
					}
				}

				if (foundOpeningBrace && endLine > startLine) {
					// Find body start (first line after opening brace)
					let bodyStart = startLine;
					for (let i = lineIndex; i < lines.length; i++) {
						if (lines[i].includes('{')) {
							bodyStart = i + 2; // Next line after opening brace
							break;
						}
					}

					// Find body end (last line before closing brace)
					let bodyEnd = endLine - 1;

					const fullMatch = lines.slice(lineIndex, endLine).join('\n');

					functions.push({
						name: functionName,
						startLine,
						endLine,
						bodyStart,
						bodyEnd,
						fullMatch
					});
				}
			}
		}
	}

	return functions;
}

/**
 * Apply heuristic edits when no markers are found
 */
export function applyHeuristicEdits(content: string, uri: URI): string {
	const functions = detectFunctions(content);
	if (functions.length === 0) {
		// No functions found, make simple edits
		return applySimpleHeuristicEdits(content);
	}

	let modified = content;

	// Sort functions by start line
	const sortedFunctions = [...functions].sort((a, b) => a.startLine - b.startLine);

	// Apply edits sequentially, recalculating after each edit
	// Edit 1: Replace first function body
	if (sortedFunctions.length > 0) {
		const firstFunc = sortedFunctions[0];
		const lines = modified.split('\n');
		const beforeBody = lines.slice(0, firstFunc.bodyStart - 1).join('\n');
		const bodyLines = lines.slice(firstFunc.bodyStart - 1, firstFunc.bodyEnd);
		const afterBody = lines.slice(firstFunc.bodyEnd).join('\n');
		const newBody = generateEnhancedFunctionBody(bodyLines.join('\n'), firstFunc.name);
		modified = beforeBody + '\n' + newBody + '\n' + afterBody;
		// Re-detect functions after this edit for subsequent edits
		const updatedFunctions = detectFunctions(modified);
		if (updatedFunctions.length > 0) {
			sortedFunctions[0] = updatedFunctions[0]; // Update reference
		}
	}

	// Edit 2: Replace middle function body (if exists)
	if (sortedFunctions.length >= 3) {
		const middleIndex = Math.floor(sortedFunctions.length / 2);
		const middleFunc = sortedFunctions[middleIndex];
		const lines = modified.split('\n');
		const beforeBody = lines.slice(0, middleFunc.bodyStart - 1).join('\n');
		const bodyLines = lines.slice(middleFunc.bodyStart - 1, middleFunc.bodyEnd);
		const afterBody = lines.slice(middleFunc.bodyEnd).join('\n');
		const newBody = generateOptimizedFunctionBody(bodyLines.join('\n'), middleFunc.name);
		modified = beforeBody + '\n' + newBody + '\n' + afterBody;
	}

	// Edit 3: Replace last function body
	if (sortedFunctions.length >= 2) {
		const lastFunc = sortedFunctions[sortedFunctions.length - 1];
		const lines = modified.split('\n');
		const beforeBody = lines.slice(0, lastFunc.bodyStart - 1).join('\n');
		const bodyLines = lines.slice(lastFunc.bodyStart - 1, lastFunc.bodyEnd);
		const afterBody = lines.slice(lastFunc.bodyEnd).join('\n');
		const newBody = generateRefactoredFunctionBody(bodyLines.join('\n'), lastFunc.name);
		modified = beforeBody + '\n' + newBody + '\n' + afterBody;
	}

	// Edit 4: Insert new helper function after first function
	if (sortedFunctions.length > 0) {
		const firstFunc = sortedFunctions[0];
		const lines = modified.split('\n');
		const insertLine = Math.min(firstFunc.endLine, lines.length);
		const before = lines.slice(0, insertLine).join('\n');
		const after = lines.slice(insertLine).join('\n');
		const newHelper = generateNewHelperFunction();
		modified = before + '\n\n' + newHelper + '\n' + after;
	}

	// Edit 5: Delete unused imports or comment blocks
	modified = deleteUnusedCode(modified);

	return modified;
}

/**
 * Apply simple heuristic edits when no functions are found
 */
function applySimpleHeuristicEdits(content: string): string {
	const lines = content.split('\n');
	let modified = content;

	// Add a comment block
	if (lines.length > 0) {
		modified = '// AI-enhanced code\n' + modified;
	}

	// Add a new variable or constant
	const insertIndex = Math.min(5, lines.length);
	const before = lines.slice(0, insertIndex).join('\n');
	const after = lines.slice(insertIndex).join('\n');
	modified = before + '\nconst aiGeneratedValue = "test";\n' + after;

	return modified;
}

/**
 * Generate realistic code edit based on type
 */
export function generateRealisticEdit(originalContent: string, type: 'replace' | 'insert' | 'delete'): string {
	if (type === 'delete') {
		return '';
	}

	if (type === 'insert') {
		return generateNewHelperFunction();
	}

	// type === 'replace'
	if (originalContent.trim().length === 0) {
		return generateNewHelperFunction();
	}

	// Enhance existing content
	return generateEnhancedFunctionBody(originalContent, 'function');
}

/**
 * Generate enhanced function body with error handling and logging
 */
function generateEnhancedFunctionBody(originalBody: string, functionName: string): string {
	const indent = originalBody.match(/^(\s*)/)?.[1] || '  ';
	return `${indent}try {
${indent}  // Enhanced with error handling
${indent}  console.log('Executing ${functionName}');
${originalBody.split('\n').map(line => indent + '  ' + line.trim()).join('\n')}
${indent}  return result;
${indent}} catch (error) {
${indent}  console.error('Error in ${functionName}:', error);
${indent}  throw error;
${indent}}`;
}

/**
 * Generate optimized function body
 */
function generateOptimizedFunctionBody(originalBody: string, functionName: string): string {
	const indent = originalBody.match(/^(\s*)/)?.[1] || '  ';
	return `${indent}// Optimized version
${indent}const startTime = performance.now();
${originalBody.split('\n').map(line => indent + line.trim()).join('\n')}
${indent}const endTime = performance.now();
${indent}console.log('${functionName} took', endTime - startTime, 'ms');`;
}

/**
 * Generate refactored function body
 */
function generateRefactoredFunctionBody(originalBody: string, functionName: string): string {
	const indent = originalBody.match(/^(\s*)/)?.[1] || '  ';
	return `${indent}// Refactored for better maintainability
${indent}const result = (() => {
${originalBody.split('\n').map(line => indent + '  ' + line.trim()).join('\n')}
${indent}})();
${indent}return result;`;
}

/**
 * Generate new helper function
 */
function generateNewHelperFunction(): string {
	return `// AI-generated helper function
function aiHelperFunction(input: any): any {
  try {
    // Process input with enhanced logic
    const processed = typeof input === 'string' ? input.trim() : String(input);
    console.log('Processing:', processed);
    return processed;
  } catch (error) {
    console.error('Helper function error:', error);
    throw error;
  }
}`;
}

/**
 * Delete unused code (imports, comments)
 */
function deleteUnusedCode(content: string): string {
	const lines = content.split('\n');
	const filtered: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Skip unused import patterns (simple heuristic)
		if (line.startsWith('import ') && line.includes('// unused')) {
			continue;
		}

		// Skip large comment blocks (more than 3 consecutive comment lines)
		if (line.startsWith('//') || line.startsWith('/*')) {
			let commentBlockSize = 1;
			for (let j = i + 1; j < lines.length && j < i + 10; j++) {
				const nextLine = lines[j].trim();
				if (nextLine.startsWith('//') || nextLine.startsWith('/*') || nextLine.startsWith('*')) {
					commentBlockSize++;
				} else {
					break;
				}
			}
			if (commentBlockSize > 3) {
				// Skip this large comment block
				i += commentBlockSize - 1;
				continue;
			}
		}

		filtered.push(lines[i]);
	}

	return filtered.join('\n');
}

