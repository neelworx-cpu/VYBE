/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ExtHostContext, ExtHostIndexingShape, MainContext } from '../common/extHost.protocol.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';

let _extHostIndexing: ExtHostIndexingShape | undefined;

export function getExtHostIndexingProxy(): ExtHostIndexingShape | undefined {
	return _extHostIndexing;
}

/**
 * Main-thread side of the indexing RPC surface. Its primary responsibility
 * is to materialize the {@link ExtHostIndexingShape} proxy so renderer
 * services can call into the extension host without directly depending on
 * the extension host plumbing.
 */
@extHostNamedCustomer(MainContext.MainThreadIndexing)
export class MainThreadIndexing extends Disposable {

	constructor(context: IExtHostContext) {
		super();
		_extHostIndexing = context.getProxy(ExtHostContext.ExtHostIndexing);
	}
}


