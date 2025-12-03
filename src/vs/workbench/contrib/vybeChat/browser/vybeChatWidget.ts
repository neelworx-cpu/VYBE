/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Widget
 * Main chat widget component - placeholder for Build 1 UI integration
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';

export class VybeChatWidget extends Disposable {
	constructor(
		readonly location: ChatAgentLocation
	) {
		super();
	}

	render(parent: HTMLElement): void {
		parent.classList.add('vybe-chat-widget');

		// VYBE: Placeholder - will be replaced with Build 1 UI
		const placeholder = document.createElement('div');
		placeholder.className = 'vybe-chat-widget-placeholder';
		placeholder.textContent = 'VYBE Chat Widget - UI coming from Build 1';
		placeholder.style.padding = '20px';
		placeholder.style.textAlign = 'center';
		placeholder.style.color = 'var(--vscode-foreground)';
		parent.appendChild(placeholder);
	}

	layout(height: number, width: number): void {
		// VYBE: Layout logic will be implemented with Build 1 UI
	}

	setVisible(visible: boolean): void {
		// VYBE: Visibility logic will be implemented with Build 1 UI
	}

	focusInput(): void {
		// VYBE: Focus logic will be implemented with Build 1 UI
	}

	get isEmpty(): boolean {
		return true; // VYBE: Placeholder
	}
}

