/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Transform loader that replaces import.meta.dirname in TypeScript source
// This must run BEFORE tsx processes the file
// Loaders run in reverse order, so this runs first when specified last

export async function resolve(specifier, context, nextResolve) {
	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	// For TypeScript files, read and transform before tsx processes them
	if ((url.endsWith('.ts') || url.endsWith('.mts')) && !url.includes('node_modules')) {
		try {
			const filePath = fileURLToPath(url);
			let source = readFileSync(filePath, 'utf8');

			// Check if file uses import.meta.dirname
			if (source.includes('import.meta.dirname')) {
				console.error(`[TRANSFORM] Processing ${url}`);
				// Check existing imports
				const hasFileURLToPath = source.includes('fileURLToPath');
				const hasDirname = source.includes('dirname') && /import.*dirname.*from/.test(source);

				// Add imports if needed - check the import statements more carefully
				let needsUrlImport = !hasFileURLToPath || !/import\s+.*fileURLToPath.*from\s+['"]url['"]/.test(source);
				let needsPathImport = !hasDirname || !/import\s+.*dirname.*from\s+['"]path['"]/.test(source);

				// util.ts already has path import, but might need fileURLToPath from url
				if (needsUrlImport && !source.includes("from 'url'") && !source.includes('from "url"')) {
					// Find the last import statement and add after it
					const importMatch = source.match(/(import\s+.*from\s+['"][^'"]+['"];?\s*\n)/g);
					if (importMatch) {
						const lastImport = importMatch[importMatch.length - 1];
						const lastImportIndex = source.lastIndexOf(lastImport);
						source = source.slice(0, lastImportIndex + lastImport.length) +
							"import { fileURLToPath } from 'url';\n" +
							source.slice(lastImportIndex + lastImport.length);
					} else {
						source = "import { fileURLToPath } from 'url';\n" + source;
					}
				}

				// Replace import.meta.dirname with dirname(fileURLToPath(import.meta.url))
				source = source.replace(
					/\bimport\.meta\.dirname\b/g,
					`dirname(fileURLToPath(import.meta.url))`
				);

				return {
					format: 'module',
					source,
					shortCircuit: true
				};
			}
		} catch (e) {
			// If we can't read the file, fall through to next loader
			console.error('Transform error:', e.message);
		}
	}

	return nextLoad(url, context);
}

