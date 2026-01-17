/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatTodoItemContent } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

/**
 * Renders individual todo item indicators in AI responses.
 * Shows "Started to-do" or "Completed to-do" messages as agent works through tasks.
 */
export class VybeChatTodoItemPart extends VybeChatContentPart {
	private statusText: string;
	private todoText: string;
	private toolCallId: string | undefined;

	constructor(content: IVybeChatTodoItemContent) {
		super('todoItem');
		this.statusText = content.status === 'started' ? 'Started to-do' : 'Completed to-do';
		this.todoText = content.text;
		this.toolCallId = content.toolCallId;
	}

	protected createDomNode(): HTMLElement {
		// Main container - no padding (message page already has 18px padding)
		const outerContainer = $('.composer-message-group', {
			style: 'padding: 0px; opacity: 1;'
		});

		const messageGroup = $('.composer-message-group.composer-new-convo-summary', {
			style: 'padding: 0px 2px; cursor: pointer;'
		});

		// Message container with data attributes
		const messageContainer = $('div', {
			'data-tool-call-id': this.toolCallId || '',
			'data-tool-status': this.statusText === 'Started to-do' ? 'started' : 'completed',
			'data-message-role': 'ai',
			'data-message-kind': 'tool',
			class: 'relative composer-rendered-message hide-if-empty composer-message-blur composer-grouped-toolformer-message composer-summary-single-message',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				opacity: 1;
				z-index: 99;
			`
		});

		// Tool former message container
		const toolFormerMessage = $('.composer-tool-former-message', {
			style: 'padding: 0px;'
		});

		// Content wrapper - ensure proper width constraints for truncation
		const contentWrapper = $('div', {
			style: `
				padding-left: 0px;
				padding-right: 2px;
				display: flex;
				min-width: 0;
				width: 100%;
				box-sizing: border-box;
			`
		});

		// Hover target span - ensure width constraints
		const hoverTarget = $('span.tool-summary-hover-target', {
			style: `
				display: flex;
				min-width: 0;
				flex: 1;
				overflow: hidden;
			`
		});

		// Main text container - ensure proper truncation
		const textContainer = $('div', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.6;
				font-weight: normal;
				font-size: 12px;
				display: flex;
				align-items: center;
				gap: 4px;
				padding-top: 2px;
				padding-bottom: 2px;
				min-width: 0;
				flex: 1;
				overflow: hidden;
			`
		});

		// Status text ("Started to-do" or "Completed to-do")
		const statusSpan = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.7;
				font-weight: normal;
				white-space: nowrap;
				flex-shrink: 0;
			`
		});
		statusSpan.textContent = this.statusText;

		// Check icon
		const checkIcon = $('span.codicon.codicon-check-circled', {
			style: `
				vertical-align: middle;
				margin: 0px 2px;
				font-size: 16px;
				color: var(--vscode-foreground);
				opacity: 0.6;
				padding-bottom: 1px;
				display: contents;
				flex-shrink: 0;
			`
		});

		// Todo text (truncated) - ensure proper ellipsis truncation
		const todoTextSpan = $('span.truncate-one-line', {
			style: `
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				min-width: 0;
				flex: 1;
				max-width: 100%;
			`
		});
		todoTextSpan.textContent = this.todoText;

		// Assemble DOM
		textContainer.appendChild(statusSpan);
		textContainer.appendChild(checkIcon);
		textContainer.appendChild(todoTextSpan);
		hoverTarget.appendChild(textContainer);
		contentWrapper.appendChild(hoverTarget);
		toolFormerMessage.appendChild(contentWrapper);
		messageContainer.appendChild(toolFormerMessage);
		messageGroup.appendChild(messageContainer);
		outerContainer.appendChild(messageGroup);

		return outerContainer;
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'todoItem') {
			return false;
		}
		const otherPart = other as VybeChatTodoItemPart;
		return this.todoText === otherPart.todoText && this.statusText === otherPart.statusText;
	}
}

