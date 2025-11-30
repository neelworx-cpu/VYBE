/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM loader to polyfill import.meta.dirname for Node 18.x compatibility
// import.meta.dirname was added in Node 20.11.0

export async function load(url, context, nextLoad) {
	const result = await nextLoad(url, context);

	// Only process JavaScript/TypeScript files
	if (result.format === 'module' || url.endsWith('.ts') || url.endsWith('.mjs') || url.endsWith('.js')) {
		// Inject polyfill at the beginning of the module
		if (result.source && typeof result.source === 'string') {
			const polyfillCode = `
// Polyfill import.meta.dirname for Node 18.x
if (!import.meta.dirname) {
	const { fileURLToPath } = await import('url');
	const { dirname } = await import('path');
	Object.defineProperty(import.meta, 'dirname', {
		get() {
			return dirname(fileURLToPath(import.meta.url));
		},
		enumerable: true,
		configurable: true
	});
}
`;
			result.source = polyfillCode + result.source;
		}
	}

	return result;
}

