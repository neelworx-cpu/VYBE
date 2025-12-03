/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Sessions Service
 * Wrapper around upstream IChatSessionsService to maintain compatibility
 */

import { IChatSessionsService } from '../../chat/common/chatSessionsService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IVybeChatSessionsService = createDecorator<IVybeChatSessionsService>('vybeChatSessionsService');

export interface IVybeChatSessionsService {
	readonly _serviceBrand: undefined;
	// VYBE: Add VYBE-specific sessions service methods here
	// For now, we delegate to upstream IChatSessionsService
}

export class VybeChatSessionsService implements IVybeChatSessionsService {
	declare readonly _serviceBrand: undefined;

	constructor(
		// VYBE: Reserved for future use
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService
	) {
		// VYBE: Initialize VYBE-specific sessions service
		// Currently unused but reserved for future VYBE-specific session management
		// Access the service to avoid unused variable error
		void this._chatSessionsService;
	}
}

