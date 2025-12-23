/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Diff Service Contribution
 * Registers the diff computation service implementation.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeDiffService } from '../../common/vybeDiffService.js';
import { VybeDiffServiceImpl } from '../vybeDiffServiceImpl.js';

registerSingleton(IVybeDiffService, VybeDiffServiceImpl, InstantiationType.Delayed);

