/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pre-build script to transform import.meta.dirname in build TypeScript files
// This runs before any build tasks

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'glob';
const globSync = pkg.glob || pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const buildDir = path.join(__dirname, '..');

async function transformFile(filePath) {
	let source = fs.readFileSync(filePath, 'utf8');

	if (!source.includes('import.meta.dirname')) {
		return false;
	}

	// Check if file already has fileURLToPath import
	const hasFileURLToPath = /import\s+.*fileURLToPath.*from\s+['"]url['"]/.test(source);
	const hasDirname = /import\s+.*dirname.*from\s+['"]path['"]/.test(source);

	// Add imports if needed
	if (!hasFileURLToPath) {
		// Find the last import and add after it
		const importLines = source.match(/^import\s+.*from\s+['"][^'"]+['"];?\s*$/gm);
		if (importLines && importLines.length > 0) {
			const lastImport = importLines[importLines.length - 1];
			const lastImportIndex = source.lastIndexOf(lastImport);
			source = source.slice(0, lastImportIndex + lastImport.length) +
				"\nimport { fileURLToPath } from 'url';" +
				source.slice(lastImportIndex + lastImport.length);
		} else {
			source = "import { fileURLToPath } from 'url';\n" + source;
		}
	}

	// Replace import.meta.dirname
	source = source.replace(
		/\bimport\.meta\.dirname\b/g,
		`dirname(fileURLToPath(import.meta.url))`
	);

	fs.writeFileSync(filePath, source, 'utf8');
	return true;
}

async function main() {
	const files = await glob('**/*.ts', {
		cwd: buildDir,
		ignore: ['**/node_modules/**', '**/*.d.ts']
	});

	let transformed = 0;
	for (const file of files) {
		const filePath = path.join(buildDir, file);
		if (transformFile(filePath)) {
			transformed++;
		}
	}

	console.log(`[TRANSFORM] Transformed ${transformed} files`);
}

main().catch(console.error);

