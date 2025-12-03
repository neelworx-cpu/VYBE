/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Service
 * Wrapper around upstream IChatService to maintain compatibility
 */

import { IChatService } from '../../chat/common/chatService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IVybeChatService = createDecorator<IVybeChatService>('vybeChatService');

export interface IVybeChatService {
	readonly _serviceBrand: undefined;
	// VYBE: Add VYBE-specific chat service methods here
	// For now, we delegate to upstream IChatService
}

export class VybeChatService implements IVybeChatService {
	declare readonly _serviceBrand: undefined;

	constructor(
		// VYBE: Reserved for future use
		@IChatService private readonly _chatService: IChatService
	) {
		// VYBE: Initialize VYBE-specific chat service
		// Currently unused but reserved for future VYBE-specific chat functionality
		// Access the service to avoid unused variable error
		void this._chatService;
	}
}

