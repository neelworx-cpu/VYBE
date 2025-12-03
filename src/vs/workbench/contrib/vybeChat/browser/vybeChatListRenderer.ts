/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat List Renderer
 * Renders chat messages (requests/responses) - placeholder for Build 1 UI integration
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChatTreeItem } from '../../chat/browser/chat.js';

export class VybeChatListRenderer extends Disposable {
	constructor() {
		super();
	}

	render(parent: HTMLElement): void {
		parent.classList.add('vybe-chat-list-renderer');

		// VYBE: Placeholder - will be replaced with Build 1 UI
		const placeholder = document.createElement('div');
		placeholder.className = 'vybe-chat-list-placeholder';
		placeholder.textContent = 'VYBE Chat List Renderer - UI coming from Build 1';
		placeholder.style.padding = '20px';
		placeholder.style.textAlign = 'center';
		placeholder.style.color = 'var(--vscode-foreground)';
		parent.appendChild(placeholder);
	}

	renderItem(item: ChatTreeItem): void {
		// VYBE: Item rendering will be implemented with Build 1 UI
	}

	clear(): void {
		// VYBE: Clear logic will be implemented with Build 1 UI
	}
}

