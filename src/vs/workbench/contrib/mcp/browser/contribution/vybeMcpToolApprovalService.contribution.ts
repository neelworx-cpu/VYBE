/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE MCP Tool Approval Service Contribution
 * Registers the approval service as a singleton.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeMcpToolApprovalService } from '../../common/vybeMcpToolApprovalService.js';
import { VybeMcpToolApprovalServiceImpl } from '../vybeMcpToolApprovalServiceImpl.js';

registerSingleton(IVybeMcpToolApprovalService, VybeMcpToolApprovalServiceImpl, InstantiationType.Delayed);

