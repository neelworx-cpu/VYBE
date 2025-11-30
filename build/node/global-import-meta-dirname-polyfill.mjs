/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Global polyfill for import.meta.dirname that works in both ESM and CommonJS contexts
// This must run FIRST before any other loaders

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Polyfill import.meta.dirname globally
if (typeof import.meta !== 'undefined' && !import.meta.dirname) {
	try {
		Object.defineProperty(import.meta, 'dirname', {
			get() {
				try {
					return dirname(fileURLToPath(import.meta.url));
				} catch {
					// Fallback for CommonJS context
					if (typeof __filename !== 'undefined') {
						return dirname(__filename);
					}
					return process.cwd();
				}
			},
			enumerable: true,
			configurable: true
		});
	} catch (e) {
		// import.meta might not be extensible, try alternative approach
		console.error('[POLYFILL] Could not polyfill import.meta.dirname:', e.message);
	}
}

// Also patch it for CommonJS contexts via global
if (typeof globalThis !== 'undefined') {
	globalThis.__importMetaDirnamePolyfill = (url) => {
		try {
			return dirname(fileURLToPath(url));
		} catch {
			if (typeof __filename !== 'undefined') {
				return dirname(__filename);
			}
			return process.cwd();
		}
	};
}

export {};

