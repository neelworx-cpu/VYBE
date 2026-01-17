/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart } from './vybeChatContentPart.js';
import type { IVybeChatListedContent } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

/**
 * Renders "Listed directory" blocks in AI responses.
 * Shows directories being listed by the AI.
 * Similar design to VybeChatReadingFilesPart.
 */
export class VybeChatListedPart extends VybeChatContentPart {
	private container: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private listTextElement: HTMLElement | undefined;
	private directoryElement: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private directoryName: string = '';
	private isStreaming = false;
	private partId: string | undefined;

	constructor(content: IVybeChatListedContent) {
		super('listed');
		this.partId = content.id ?? undefined;
		this.directoryName = content.name || '';
		this.isStreaming = content.isStreaming ?? false;
	}

	protected createDomNode(): HTMLElement {
		// Main container
		const outerContainer = $('.vybe-chat-listed-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'listed',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				background-color: var(--composer-pane-background);
				opacity: 1;
				z-index: 99;
			`
		});

		// Transparent wrapper
		const transparentWrapper = $('div', {
			style: 'background-color: transparent;'
		});

		// Tool former message container
		const toolFormerMessage = $('.composer-tool-former-message', {
			style: 'padding: 0px;'
		});

		// Collapsible container
		const collapsibleContainer = $('.collapsible-clean', {
			style: `
				display: flex;
				flex-direction: column;
				gap: 2px;
				overflow-anchor: none;
			`
		});

		// Header (clickable)
		this.headerElement = $('div', {
			style: `
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 4px;
				cursor: pointer;
				width: 100%;
				max-width: 100%;
				box-sizing: border-box;
				overflow: hidden;
			`
		});

		// Header content wrapper
		const headerContent = $('div', {
			style: 'display: flex; gap: 4px; overflow: hidden;'
		});

		// Header text
		const headerText = $('.collapsible-header-text', {
			style: `
				flex: 0 1 auto;
				min-width: 0px;
				display: flex;
				align-items: center;
				overflow: hidden;
				gap: 4px;
				color: var(--vscode-foreground);
				transition: opacity 0.1s ease-in;
				font-size: 12px;
			`
		});

		// Text wrapper
		const textWrapper = $('span', {
			style: `
				flex: 0 1 auto;
				min-width: 0px;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			`
		});

		// Inner text container
		const textInner = $('div', {
			style: 'display: flex; align-items: center; overflow: hidden;'
		});

		// "Listed" or "Listing" text - same styling as "Read"/"Reading"
		this.listTextElement = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.6;
				white-space: nowrap;
				flex-shrink: 0;
			`
		});
		this.listTextElement.textContent = this.isStreaming ? 'Listing' : 'Listed';

		// Loading spinner (when streaming)
		if (this.isStreaming) {
			this.iconElement = $('div.codicon.codicon-loading.codicon-modifier-spin', {
				style: `
					color: var(--vscode-foreground);
					opacity: 0.55;
					line-height: 12px;
					width: 12px;
					height: 12px;
					display: flex;
					justify-content: center;
					align-items: center;
					flex-shrink: 0;
					font-size: 12px;
					margin-left: 4px;
				`
			});
		}

		// Directory name - same styling as filename
		this.directoryElement = $('span.edit-header-filename', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.4;
				margin-left: 4px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				min-width: 0px;
			`
		});
		this.directoryElement.textContent = this.directoryName || '.';

		// Build header hierarchy
		textInner.appendChild(this.listTextElement);
		textInner.appendChild(this.directoryElement);
		textWrapper.appendChild(textInner);
		headerText.appendChild(textWrapper);
		// Add loading spinner if streaming
		if (this.iconElement) {
			headerText.appendChild(this.iconElement);
		}
		headerContent.appendChild(headerText);
		this.headerElement.appendChild(headerContent);

		// Build container hierarchy
		collapsibleContainer.appendChild(this.headerElement);
		toolFormerMessage.appendChild(collapsibleContainer);
		transparentWrapper.appendChild(toolFormerMessage);
		outerContainer.appendChild(transparentWrapper);

		this.container = outerContainer;

		// Store ID on container for tracking
		if (this.partId) {
			outerContainer.setAttribute('data-part-id', this.partId);
		}

		return outerContainer;
	}

	updateContent(data: IVybeChatListedContent): void {
		// Update ID if provided
		if (data.id !== undefined && data.id !== this.partId) {
			this.partId = data.id;
			if (this.container && this.partId) {
				this.container.setAttribute('data-part-id', this.partId);
			}
		}

		// Update directory name
		if (data.name !== undefined) {
			this.directoryName = data.name;
			if (this.directoryElement) {
				this.directoryElement.textContent = this.directoryName || '.';
			}
		}

		const wasStreaming = this.isStreaming;
		if (data.isStreaming !== undefined) {
			this.isStreaming = data.isStreaming;

			// Update "Listed" / "Listing" text
			if (this.listTextElement) {
				this.listTextElement.textContent = this.isStreaming ? 'Listing' : 'Listed';
			}

			// Handle streaming -> complete transition (remove spinner)
			if (wasStreaming && !this.isStreaming && this.iconElement) {
				this.iconElement.remove();
				this.iconElement = undefined;
			}

			// Handle complete -> streaming transition (add spinner)
			if (!wasStreaming && this.isStreaming && this.headerElement) {
				const headerText = this.headerElement.querySelector('.collapsible-header-text');
				if (headerText) {
					this.iconElement = $('div.codicon.codicon-loading.codicon-modifier-spin', {
						style: `
							color: var(--vscode-foreground);
							opacity: 0.55;
							line-height: 12px;
							width: 12px;
							height: 12px;
							display: flex;
							justify-content: center;
							align-items: center;
							flex-shrink: 0;
							font-size: 12px;
							margin-left: 4px;
						`
					});
					headerText.appendChild(this.iconElement);
				}
			}
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'listed') {
			return false;
		}
		const otherContent = other as unknown as VybeChatListedPart;
		return this.directoryName === otherContent.directoryName &&
			this.isStreaming === otherContent.isStreaming;
	}
}






