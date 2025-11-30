/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Transform loader that replaces import.meta.dirname with polyfill code
// This runs before tsx processes the file

export async function load(url, context, nextLoad) {
	const result = await nextLoad(url, context);

	// Only process TypeScript files
	if (url.endsWith('.ts') && result.source && typeof result.source === 'string') {
		// Replace import.meta.dirname with the equivalent code
		// This needs to work in both ESM and CommonJS contexts after tsx transpilation
		const transformed = result.source.replace(
			/\bimport\.meta\.dirname\b/g,
			`(import.meta.dirname || (() => { const { fileURLToPath } = require('url'); const { dirname } = require('path'); return dirname(fileURLToPath(import.meta.url)); })())`
		);

		result.source = transformed;
	}

	return result;
}

