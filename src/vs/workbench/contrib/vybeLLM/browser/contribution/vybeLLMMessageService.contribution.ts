/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Message Service Contribution
 * Registers the LLM message service implementation.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeLLMMessageService } from '../../common/vybeLLMMessageService.js';
import { VybeLLMMessageService } from '../../common/vybeLLMMessageService.js';

registerSingleton(IVybeLLMMessageService, VybeLLMMessageService, InstantiationType.Delayed);


