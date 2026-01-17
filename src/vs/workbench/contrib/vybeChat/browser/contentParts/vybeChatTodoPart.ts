/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatTodoContent, ITodoItem } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

/**
 * Renders todo list summary in AI responses.
 * Can appear in AI response area (with sticky/collapse) or attached to human message (always expanded).
 * Minimum 2 todos required to display.
 */
export class VybeChatTodoPart extends VybeChatContentPart {
	private items: ITodoItem[] = [];
	private isExpanded: boolean;
	private isAttachedToHuman: boolean;
	private currentRunningTodo: string | undefined;
	private partId: string | undefined;

	// DOM elements
	private headerElement: HTMLElement | undefined;
	private headerTextElement: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private expandedContent: HTMLElement | undefined;
	private todoListContainer: HTMLElement | undefined;

	// Streaming update callback (optional)
	public onStreamingUpdate?: () => void;

	constructor(content: IVybeChatTodoContent) {
		super('todo');

		// Minimum 2 todos required
		if (content.items.length < 2) {
			// Return empty container if less than 2 todos
			this.items = [];
		} else {
			this.items = content.items;
		}

		this.partId = content.id;
		this.isExpanded = content.isExpanded ?? true; // Default to expanded when first created
		this.isAttachedToHuman = content.isAttachedToHuman ?? false;
		this.currentRunningTodo = content.currentRunningTodo;
	}

	private isDarkTheme(): boolean {
		// Check if document body has dark theme class or use media query
		if (typeof document !== 'undefined') {
			const body = document.body;
			if (body.classList.contains('vs-dark') || body.classList.contains('hc-black')) {
				return true;
			}
			// Fallback: check computed style
			const computedStyle = window.getComputedStyle(body);
			const bgColor = computedStyle.backgroundColor;
			// Simple heuristic: if background is dark, theme is dark
			if (bgColor) {
				const rgb = bgColor.match(/\d+/g);
				if (rgb && rgb.length >= 3) {
					const r = parseInt(rgb[0]);
					const g = parseInt(rgb[1]);
					const b = parseInt(rgb[2]);
					// If average is less than 128, it's likely dark
					return (r + g + b) / 3 < 128;
				}
			}
		}
		return false;
	}

	protected createDomNode(): HTMLElement {
		// Don't render if less than 2 todos
		if (this.items.length < 2) {
			const emptyContainer = $('div', { style: 'display: none;' });
			return emptyContainer;
		}

		const isDark = this.isDarkTheme();

		// When attached, match input box styling for seamless look
		// Input box: Dark #212427 bg, #383838 border; Light #eceff2 bg, #d9d9d9 border
		const attachedBg = isDark ? '#212427' : '#eceff2';
		const attachedBorder = isDark ? '#383838' : '#d9d9d9';

		// Main container - use composer background color (matches theme)
		// When attached to human message, overlap by border radius to seamlessly connect borders and background
		// The container overlaps the input box by 8px, covering the bottom rounded corners
		const outerContainer = $('.vybe-chat-todo-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'todo',
			'data-part-id': this.partId || '',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				background-color: ${this.isAttachedToHuman ? attachedBg : 'var(--vscode-titleBar-activeBackground)'};
				border: ${this.isAttachedToHuman ? `1px solid ${attachedBorder}` : '1px solid var(--vscode-panel-border)'};
				border-top: ${this.isAttachedToHuman ? 'none' : '1px solid var(--vscode-panel-border)'};
				border-radius: ${this.isAttachedToHuman ? '0px 0px 8px 8px' : '4px'};
				margin: ${this.isAttachedToHuman ? '0px' : '4px 0px'};
				width: ${this.isAttachedToHuman ? '100%' : 'auto'};
				box-sizing: border-box;
				opacity: 1;
				z-index: ${this.isAttachedToHuman ? '1' : '99'};
				${this.isAttachedToHuman ? 'overflow: hidden;' : ''}
			`
		});

		// Transparent wrapper
		const transparentWrapper = $('div', {
			style: 'background-color: transparent;'
		});

		// Tool former message container - add padding inside border
		// When attached, add extra 8px top padding to account for the overlap
		const toolFormerMessage = $('.composer-tool-former-message', {
			style: `padding: ${this.isAttachedToHuman ? '16px 12px 8px 12px' : '8px 12px'};`
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

		// Header (always clickable for collapse/expand) - match document Section 5
		this.headerElement = $('div', {
			style: `
				display: flex;
				flex-direction: row;
				align-items: center;
				column-gap: 6px;
				row-gap: 6px;
				cursor: pointer;
				width: 100%;
				max-width: 100%;
				box-sizing: border-box;
				overflow: hidden;
				font-size: 12px;
			`
		});

		// Icon container - center align for header (no padding-top needed for single-line alignment)
		const iconContainer = $('div', {
			style: `
				display: flex;
				align-items: center;
				justify-content: center;
				flex-shrink: 0;
			`
		});

		// Header text container - simplified to match document
		this.headerTextElement = $('.collapsible-header-text', {
			style: `
				flex: 1;
				min-width: 0px;
				display: flex;
				align-items: center;
				overflow: hidden;
				gap: 8px; /* Match todo items gap between icon and text */
				color: var(--vscode-foreground);
				transition: opacity 0.1s ease-in;
				font-size: 12px;
			`
		});

		// Icon (circle when collapsed, chevron when expanded)
		this.updateIcon();

		// Text wrapper - match document Section 9
		const textWrapper = $('span', {
			style: `
				font-size: 12px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				flex-grow: 1;
				min-width: 0px;
				color: var(--vscode-foreground);
			`
		});

		// Assemble header - match document structure: iconContainer + headerTextElement
		iconContainer.appendChild(this.iconElement!);
		this.headerElement.appendChild(iconContainer);
		this.headerTextElement.appendChild(textWrapper);
		this.headerElement.appendChild(this.headerTextElement);

		// Update header text after DOM is assembled
		this.updateHeaderText(textWrapper);

		// Click handler for expand/collapse (always enabled, even when attached to human)
		this._register(dom.addDisposableListener(this.headerElement, 'click', () => {
			this.toggleExpanded();
		}));

		// Expanded content container
		this.expandedContent = $('.collapsible-clean-children', {
			style: `
				padding-left: 0px;
				overflow-anchor: none;
				display: ${this.isExpanded ? 'block' : 'none'};
			`
		});

		// Todo list container
		this.todoListContainer = $('.todo-summary-list', {
			style: 'padding: 0px;'
		});

		// Render todo items
		this.renderTodoItems();

		// Assemble DOM
		this.expandedContent.appendChild(this.todoListContainer!);
		collapsibleContainer.appendChild(this.headerElement);
		if (this.isExpanded) {
			collapsibleContainer.appendChild(this.expandedContent);
		}
		toolFormerMessage.appendChild(collapsibleContainer);
		transparentWrapper.appendChild(toolFormerMessage);
		outerContainer.appendChild(transparentWrapper);

		return outerContainer;
	}

	private updateIcon(): void {
		if (this.iconElement) {
			this.iconElement.remove();
		}

		// Always show chevron - rotate based on expanded state
		// 90deg (pointing down) when expanded, 0deg (pointing right) when collapsed
		// Match todo item codicon styling exactly for alignment
		this.iconElement = $('span.codicon.codicon-chevron-right', {
			style: `
				font-size: 12px;
				color: var(--vscode-foreground);
				opacity: 0.4;
				display: flex;
				align-items: center;
				justify-content: center;
				flex-shrink: 0;
				transition: opacity 0.1s;
				transform-origin: 50% 50%;
				transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out;
				transform: ${this.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
			`
		});
	}

	private updateHeaderText(textWrapper?: HTMLElement): void {
		if (!this.headerTextElement) {
			return;
		}

		// Use provided textWrapper or find it
		if (!textWrapper) {
			// Find text wrapper (second child after icon container, or search by class/attribute)
			textWrapper = this.headerTextElement.querySelector('span[style*="flex: 0 1 auto"]') as HTMLElement;
			if (!textWrapper) {
				// Fallback: try to find by index
				textWrapper = this.headerTextElement.children[1] as HTMLElement;
			}
		}
		if (!textWrapper) {
			console.warn('[VybeChatTodoPart] Text wrapper not found');
			return;
		}

		// Clear existing text (use DOM manipulation for TrustedHTML compliance)
		while (textWrapper.firstChild) {
			textWrapper.removeChild(textWrapper.firstChild);
		}

		// If collapsed and there's a running todo, show "Running to-do: [text]"
		if (!this.isExpanded && this.currentRunningTodo) {
			const runningText = $('span', {
				style: `
					color: var(--vscode-foreground);
					opacity: 0.7;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				`
			});
			runningText.textContent = `Running to-do: ${this.currentRunningTodo}`;
			textWrapper.appendChild(runningText);
			return;
		}

		// Normal count display - show "x of y To-Dos" or "x of y To-Dos Completed"
		const completedCount = this.items.filter(item => item.status === 'completed').length;
		const totalCount = this.items.length;

		// Count text - use "To-Dos" with proper capitalization
		const countText = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.7;
				white-space: nowrap;
			`
		});

		if (completedCount === 0) {
			// No tasks completed: "0 of 6 To-Dos"
			countText.textContent = `0 of ${totalCount} To-Dos`;
		} else if (completedCount === totalCount) {
			// All tasks completed: "6 of 6 To-Dos Completed"
			countText.textContent = `${completedCount} of ${totalCount} To-Dos Completed`;
		} else {
			// Some tasks completed: "1 of 6 To-Dos Completed"
			countText.textContent = `${completedCount} of ${totalCount} To-Dos Completed`;
		}

		textWrapper.appendChild(countText);
	}

	private renderTodoItems(): void {
		if (!this.todoListContainer) {
			return;
		}

		// Clear existing items (use DOM manipulation instead of innerHTML for TrustedHTML compliance)
		while (this.todoListContainer.firstChild) {
			this.todoListContainer.removeChild(this.todoListContainer.firstChild);
		}

		// Sort items by order
		const sortedItems = [...this.items].sort((a, b) => a.order - b.order);

		for (const item of sortedItems) {
			const todoItem = this.createTodoItemElement(item);
			this.todoListContainer.appendChild(todoItem);
		}
	}

	private createTodoItemElement(item: ITodoItem): HTMLElement {
		const itemContainer = $('.todo-summary-item', {
			style: 'display: flex; align-items: flex-start; gap: 8px; padding: 4px 0px;'
		});

		// Indicator container - align with first line of text
		const indicatorContainer = $('.todo-indicator-container', {
			style: `
				display: flex;
				align-items: flex-start;
				justify-content: center;
				flex-shrink: 0;
				padding-top: 2px; /* Align with first line of text */
			`
		});

		// Indicator based on status - use codicons
		let iconClass: string;
		if (item.status === 'completed') {
			// Completed: circle-large-filled
			iconClass = 'codicon codicon-circle-large-filled';
		} else if (item.status === 'in-progress') {
			// In-progress: arrow-circle-right
			iconClass = 'codicon codicon-arrow-circle-right';
		} else {
			// Pending: circle-large
			iconClass = 'codicon codicon-circle-large';
		}

		const indicator = $('span', {
			class: iconClass,
			style: `
				font-size: 12px;
				color: var(--vscode-foreground);
				opacity: ${item.status === 'pending' ? '0.4' : '1'};
				display: flex;
				align-items: center;
				justify-content: center;
				flex-shrink: 0;
				transition: opacity 0.1s;
			`
		});

		// Item content
		const itemContent = $('.todo-summary-item-content', {
			style: `
				flex: 1;
				font-size: 12px;
				line-height: 1.4;
				color: var(--vscode-foreground);
				opacity: ${item.status === 'completed' ? '0.6' : '0.9'};
				text-decoration: ${item.status === 'completed' ? 'line-through' : 'none'};
				display: flex;
				align-items: center;
			`
		});
		itemContent.textContent = item.text;

		// Assemble
		indicatorContainer.appendChild(indicator);
		itemContainer.appendChild(indicatorContainer);
		itemContainer.appendChild(itemContent);

		return itemContainer;
	}

	private toggleExpanded(): void {
		// Allow collapse/expand even when attached to human
		this.isExpanded = !this.isExpanded;

		// Update icon
		this.updateIcon();
		const iconContainer = this.headerElement?.querySelector('div[style*="justify-content: center"]') as HTMLElement | null;
		if (iconContainer && this.iconElement) {
			// Clear existing icon (use DOM manipulation instead of innerHTML for TrustedHTML compliance)
			while (iconContainer.firstChild) {
				iconContainer.removeChild(iconContainer.firstChild);
			}
			iconContainer.appendChild(this.iconElement);
		}

		// Update expanded content visibility
		if (this.expandedContent) {
			this.expandedContent.style.display = this.isExpanded ? 'block' : 'none';
		}

		// Update header text (to show "Running to-do" when collapsed)
		this.updateHeaderText();
	}

	updateContent(data: Partial<IVybeChatTodoContent>): void {
		if (data.items && data.items.length >= 2) {
			this.items = data.items;
			this.renderTodoItems();
		}

		if (data.currentRunningTodo !== undefined) {
			this.currentRunningTodo = data.currentRunningTodo;
			this.updateHeaderText();
		}

		if (data.isExpanded !== undefined && !this.isAttachedToHuman) {
			this.isExpanded = data.isExpanded;
			if (this.expandedContent) {
				this.expandedContent.style.display = this.isExpanded ? 'block' : 'none';
			}
			this.updateIcon();
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'todo') {
			return false;
		}
		const otherPart = other as VybeChatTodoPart;
		return (
			this.partId === otherPart.partId &&
			this.items.length === otherPart.items.length &&
			JSON.stringify(this.items) === JSON.stringify(otherPart.items)
		);
	}
}

