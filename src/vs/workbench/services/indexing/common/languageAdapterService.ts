/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { extname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageAdapterService, LanguageAdapter } from './languageAdapter.js';

export class LanguageAdapterService extends Disposable implements ILanguageAdapterService {
	declare readonly _serviceBrand: undefined;

	private readonly adapters: LanguageAdapter[] = [];

	registerLanguageAdapter(adapter: LanguageAdapter): IDisposable {
		this.adapters.push(adapter);
		return toDisposable(() => {
			const index = this.adapters.indexOf(adapter);
			if (index >= 0) {
				this.adapters.splice(index, 1);
			}
		});
	}

	getAdapter(uri: URI, languageId: string | undefined): LanguageAdapter | undefined {
		// Prefer explicit language match, fall back to extension-based match.
		for (const adapter of this.adapters) {
			if (adapter.canHandle(uri, languageId)) {
				return adapter;
			}
		}
		const extension = extname(uri.path).toLowerCase();
		for (const adapter of this.adapters) {
			if (adapter.extensions.includes(extension)) {
				return adapter;
			}
		}
		return undefined;
	}

	getAll(): readonly LanguageAdapter[] {
		return this.adapters;
	}
}

