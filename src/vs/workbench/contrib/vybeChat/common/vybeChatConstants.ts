/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Constants
 */

export const VYBE_CHAT_VIEW_CONTAINER_ID_PREFIX = 'workbench.panel.vybeChat';

export const VYBE_CHAT_VIEW_ID_PREFIX = 'workbench.panel.vybeChat.view.chat';

/**
 * Generate a unique view container ID for a chat session
 * Each session gets its own container so it appears as a separate tab
 */
export function getVybeChatViewContainerId(sessionId: string): string {
	return `${VYBE_CHAT_VIEW_CONTAINER_ID_PREFIX}.${sessionId}`;
}

/**
 * Generate a unique view ID for a chat session
 */
export function getVybeChatViewId(sessionId: string): string {
	return `${VYBE_CHAT_VIEW_ID_PREFIX}.${sessionId}`;
}

/**
 * Extract session ID from view container ID
 */
export function getSessionIdFromViewContainerId(containerId: string): string | undefined {
	if (containerId.startsWith(VYBE_CHAT_VIEW_CONTAINER_ID_PREFIX + '.')) {
		return containerId.substring(VYBE_CHAT_VIEW_CONTAINER_ID_PREFIX.length + 1);
	}
	return undefined;
}

/**
 * Extract session ID from view ID
 */
export function getSessionIdFromViewId(viewId: string): string | undefined {
	if (viewId.startsWith(VYBE_CHAT_VIEW_ID_PREFIX + '.')) {
		return viewId.substring(VYBE_CHAT_VIEW_ID_PREFIX.length + 1);
	}
	return undefined;
}

/**
 * Default label for new chat sessions
 */
export const VYBE_CHAT_NEW_CHAT_LABEL = 'New Chat';

/**
 * Default session ID for the initial chat tab that always exists
 */
export const VYBE_CHAT_DEFAULT_SESSION_ID = 'default-new-chat';
