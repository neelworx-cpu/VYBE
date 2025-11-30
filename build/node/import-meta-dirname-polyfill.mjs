/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Polyfill import.meta.dirname for Node 18.x compatibility
// import.meta.dirname was added in Node 20.11.0
if (!import.meta.dirname) {
	Object.defineProperty(import.meta, 'dirname', {
		get() {
			return dirname(fileURLToPath(import.meta.url));
		},
		enumerable: true,
		configurable: true
	});
}

export {};

