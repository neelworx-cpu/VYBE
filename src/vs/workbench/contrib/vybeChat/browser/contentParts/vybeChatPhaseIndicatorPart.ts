/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatPhaseIndicatorContent } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';
import './media/vybeChatPhaseIndicator.css';

const $ = dom.$;
const { scheduleAtNextAnimationFrame, getWindow } = dom;

/**
 * Renders "Planning next steps" phase indicator.
 * Appears when agent enters planning phase and can appear multiple times during a conversation.
 */
export class VybeChatPhaseIndicatorPart extends VybeChatContentPart {
	private textElement: HTMLElement | undefined;
	private isStreaming = false;

	constructor(content: IVybeChatPhaseIndicatorContent) {
		super('phaseIndicator');
		this.isStreaming = content.isStreaming ?? false;
	}

	protected createDomNode(): HTMLElement {
		// Main container - matches Cursor's structure
		const container = $('.simulated-thinking-container.simulated-thinking-container-group-summary', {
			'data-message-role': 'ai',
			'data-message-kind': 'phaseIndicator',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				background-color: var(--composer-pane-background);
				opacity: 1;
			`
		});

		// Text element with shine animation when streaming
		this.textElement = $('span', {
			style: `
				display: inline;
				font-family: -apple-system, "system-ui", sans-serif;
				font-size: 12px;
				line-height: 18.2px;
				color: var(--vscode-foreground);
			`
		});
		this.textElement.textContent = 'Planning next steps';
		// Apply shine animation class if streaming. Use requestAnimationFrame so the node
		// is in the DOM and CSS is applied before the animation starts (fixes plain-text
		// appearance when part is added at stream start before any backend event).
		if (this.isStreaming) {
			this.textElement.classList.add('make-shine');
			const win = getWindow(container);
			scheduleAtNextAnimationFrame(win, () => {
				if (this.textElement && !this.textElement.isConnected) {
					return;
				}
				this.textElement?.classList.remove('make-shine');
				// Force reflow so the animation restarts
				void this.textElement?.offsetHeight;
				this.textElement?.classList.add('make-shine');
			});
		}

		container.appendChild(this.textElement);

		return container;
	}

	updateContent(data: IVybeChatPhaseIndicatorContent): void {
		const wasStreaming = this.isStreaming;
		this.isStreaming = data.isStreaming ?? false;

		if (this.textElement) {
			// Update shine animation class based on streaming state
			if (this.isStreaming && !wasStreaming) {
				// Start streaming - add shine animation
				this.textElement.classList.add('make-shine');
			} else if (!this.isStreaming && wasStreaming) {
				// Stop streaming - remove shine animation
				this.textElement.classList.remove('make-shine');
			}
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'phaseIndicator') {
			return false;
		}
		// Phase indicators are considered the same if they're both planning phase
		// This allows replacing old ones with new ones
		return true;
	}
}

