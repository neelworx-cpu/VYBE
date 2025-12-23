/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Checkpoint Service Contribution
 * Registers the checkpoint service as a singleton.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeCheckpointService } from '../../common/vybeCheckpointService.js';
import { VybeCheckpointServiceImpl } from '../vybeCheckpointServiceImpl.js';

registerSingleton(IVybeCheckpointService, VybeCheckpointServiceImpl, InstantiationType.Delayed);

