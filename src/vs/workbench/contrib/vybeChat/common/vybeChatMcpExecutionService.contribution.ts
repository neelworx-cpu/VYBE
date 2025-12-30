/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat MCP Execution Service Contribution
 */

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVybeChatMcpExecutionService } from './vybeChatMcpExecutionService.js';
import { VybeChatMcpExecutionService } from './vybeChatMcpExecutionService.js';

registerSingleton(IVybeChatMcpExecutionService, VybeChatMcpExecutionService, InstantiationType.Delayed);

