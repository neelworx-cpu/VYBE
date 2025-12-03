/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Agents
 * Wrapper around upstream IChatAgentService to maintain compatibility
 */

import { IChatAgentService } from '../../chat/common/chatAgents.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IVybeChatAgentService = createDecorator<IVybeChatAgentService>('vybeChatAgentService');

export interface IVybeChatAgentService {
	readonly _serviceBrand: undefined;
	// VYBE: Add VYBE-specific agent service methods here
	// For now, we delegate to upstream IChatAgentService
}

export class VybeChatAgentService implements IVybeChatAgentService {
	declare readonly _serviceBrand: undefined;

	constructor(
		// VYBE: Reserved for future use
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
	) {
		// VYBE: Initialize VYBE-specific agent service
		// Currently unused but reserved for future VYBE-specific agent management
		// Access the service to avoid unused variable error
		void this._chatAgentService;
	}
}

