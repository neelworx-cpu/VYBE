/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Edit Service Contribution
 * Registers the edit transaction service implementation.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeEditService } from '../../common/vybeEditService.js';
import { VybeEditServiceImpl } from '../vybeEditServiceImpl.js';

registerSingleton(IVybeEditService, VybeEditServiceImpl, InstantiationType.Delayed);

