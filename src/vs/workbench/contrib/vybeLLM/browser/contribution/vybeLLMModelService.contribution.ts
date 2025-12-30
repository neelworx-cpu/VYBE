/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Model Service Contribution
 * Registers the model service implementation.
 */

import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IVybeLLMModelService } from '../../common/vybeLLMModelService.js';
import { VybeLLMModelService } from '../../common/vybeLLMModelService.js';

registerSingleton(IVybeLLMModelService, VybeLLMModelService, InstantiationType.Delayed);


