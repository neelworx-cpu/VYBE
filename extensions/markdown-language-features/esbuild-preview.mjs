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
	entryPoints: [
		path.join(srcDir, 'index.ts'),
		path.join(srcDir, 'pre'),
	],
	srcDir,
	outdir: outDir,
}, process.argv);
