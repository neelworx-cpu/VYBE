/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from '../esbuild-webview-common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'preview-src');
const outDir = path.join(__dirname, 'media');

run({
	entryPoints: {
		'index': path.join(srcDir, 'index.ts'),
		'codicon': path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.ttf': 'dataurl',
		}
	}
}, process.argv);
