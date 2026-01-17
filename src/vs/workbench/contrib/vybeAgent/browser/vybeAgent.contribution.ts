/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Agent Contribution
 *
 * Registers the VybeAgentService with the workbench.
 */

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVybeAgentService } from '../common/vybeAgentService.js';
import { VybeAgentServiceImpl } from './vybeAgentServiceImpl.js';

// Register the service
registerSingleton(IVybeAgentService, VybeAgentServiceImpl, InstantiationType.Delayed);






