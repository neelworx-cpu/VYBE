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

		// Constants for Cursor structure matching
		const COLLAPSED_HEIGHT = 31.5; // Height when collapsed (matches Cursor)
		const EXPANDED_MAX_HEIGHT = 700; // Max height when expanded (matches Cursor)
		const EMPTY_LINE_HEIGHT = 73; // Spacer height (matches input height)

		// When attached to human message, use Cursor's HTML structure
		if (this.isAttachedToHuman) {
			// Root: .human-execution-message-bottom (matches Cursor structure)
			const humanMessageBottom = $('div', {
				class: 'human-execution-message-bottom',
				style: `
					margin-top: -${EMPTY_LINE_HEIGHT}px;
					position: relative;
				`
			});

			// Main container: .todo-summary-sticky-container (matches Cursor structure)
			const stickyContainer = $('div', {
				class: 'todo-summary-sticky-container',
				style: `
					overflow: hidden;
					box-sizing: border-box;
					opacity: 1;
					background-color: ${attachedBg};
					border: 1px solid ${attachedBorder};
					border-radius: 8px;
					${this.isExpanded ? `max-height: ${EXPANDED_MAX_HEIGHT}px;` : `height: ${COLLAPSED_HEIGHT}px;`}
				`
			});

			// Spacer: .todo-summary-empty-line (matches Cursor structure)
			const emptyLine = $('div', {
				class: 'todo-summary-empty-line',
				style: `
					opacity: 0;
					height: ${EMPTY_LINE_HEIGHT}px;
				`
			});

			// Transition wrapper for height animation (matches Cursor structure)
			const transitionWrapper = $('div', {
				style: `
					transition: height 0.25s ease-in-out, max-height 0.25s ease-in-out;
					overflow: hidden;
					${this.isExpanded ? `max-height: ${EXPANDED_MAX_HEIGHT}px; height: auto;` : `max-height: ${COLLAPSED_HEIGHT}px; height: ${COLLAPSED_HEIGHT}px;`}
				`
			});

			// Header: .todo-summary-content.todo-summary-content-clickable (matches Cursor structure)
			this.headerElement = $('div', {
				class: 'todo-summary-content todo-summary-content-clickable',
				style: `
					height: ${COLLAPSED_HEIGHT}px;
					display: flex;
					align-items: center;
					gap: 6px;
					cursor: pointer;
					padding: 0 12px;
				`
			});

			// Icon container (16px width, matches Cursor structure)
			const iconContainer = $('div', {
				style: `
					width: 16px;
					display: flex;
					justify-content: center;
					align-items: center;
					flex-shrink: 0;
				`
			});

			// Update icon (will show check-circled when all completed, chevron otherwise)
			this.updateIcon();

			// Text span (matches Cursor structure)
			const textSpan = $('span', {
				style: `
					font-size: 12px;
					white-space: nowrap;
					color: var(--vscode-foreground);
				`
			});
			this.updateHeaderText(textSpan);

			// Assemble header
			iconContainer.appendChild(this.iconElement!);
			this.headerElement.appendChild(iconContainer);
			this.headerElement.appendChild(textSpan);

			// Expanded content container (todo list)
			this.expandedContent = $('div', {
				style: `
					display: ${this.isExpanded ? 'block' : 'none'};
					padding: 8px 12px;
				`
			});

			// Todo list container
			this.todoListContainer = $('.todo-summary-list', {
				style: 'padding: 0px;'
			});

			// Render todo items
			this.renderTodoItems();
			this.expandedContent.appendChild(this.todoListContainer!);

			// Assemble Cursor structure
			transitionWrapper.appendChild(this.headerElement);
			if (this.isExpanded) {
				transitionWrapper.appendChild(this.expandedContent);
			}
			stickyContainer.appendChild(emptyLine);
			stickyContainer.appendChild(transitionWrapper);
			humanMessageBottom.appendChild(stickyContainer);

			// Click handler for expand/collapse
			this._register(dom.addDisposableListener(this.headerElement, 'click', () => {
				this.toggleExpanded();
			}));

			return humanMessageBottom;
		}

		// Non-attached todos (in AI response area) - keep existing VYBE structure
		const outerContainer = $('.vybe-chat-todo-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'todo',
			'data-part-id': this.partId || '',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				background-color: var(--vscode-titleBar-activeBackground);
				border: 1px solid var(--vscode-panel-border);
				border-radius: 4px;
				margin: 4px 0px;
				width: auto;
				box-sizing: border-box;
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
			style: 'padding: 8px 12px;'
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

		// Header (always clickable for collapse/expand)
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

		// Icon container
		const iconContainer = $('div', {
			style: `
				display: flex;
				align-items: center;
				justify-content: center;
				flex-shrink: 0;
			`
		});

		// Header text container
		this.headerTextElement = $('.collapsible-header-text', {
			style: `
				flex: 1;
				min-width: 0px;
				display: flex;
				align-items: center;
				overflow: hidden;
				gap: 8px;
				color: var(--vscode-foreground);
				transition: opacity 0.1s ease-in;
				font-size: 12px;
			`
		});

		// Icon (chevron)
		this.updateIcon();

		// Text wrapper
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

		// Assemble header
		iconContainer.appendChild(this.iconElement!);
		this.headerElement.appendChild(iconContainer);
		this.headerTextElement.appendChild(textWrapper);
		this.headerElement.appendChild(this.headerTextElement);

		// Update header text
		this.updateHeaderText(textWrapper);

		// Click handler
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

		// When attached to human and all todos are completed, show check-circled (matches Cursor)
		if (this.isAttachedToHuman) {
			const completedCount = this.items.filter(item => item.status === 'completed').length;
			const totalCount = this.items.length;
			const allCompleted = completedCount === totalCount && totalCount > 0;

			if (allCompleted) {
				// All completed: show check-circled icon (16px, matches Cursor)
				this.iconElement = $('span.codicon.codicon-check-circled', {
					style: `
						font-size: 16px;
						flex-shrink: 0;
						color: var(--vscode-foreground);
						display: flex;
						align-items: center;
						justify-content: center;
					`
				});
			} else {
				// Not all completed: show chevron (rotated when expanded)
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
		} else {
			// Non-attached: always show chevron - rotate based on expanded state
			// 90deg (pointing down) when expanded, 0deg (pointing right) when collapsed
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
	}

	private updateHeaderText(textWrapper?: HTMLElement): void {
		// For attached todos (Cursor structure), text span is directly in header
		// For non-attached todos, text span is in headerTextElement
		if (this.isAttachedToHuman) {
			// Find text span directly in header (second child after icon container)
			if (!textWrapper && this.headerElement) {
				// Text span is the second child (after icon container)
				const children = Array.from(this.headerElement.children);
				if (children.length >= 2) {
					textWrapper = children[1] as HTMLElement;
				}
			}
		} else {
			// Non-attached: use headerTextElement
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

		// Count text - use "To-dos" to match Cursor format
		const countText = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.7;
				white-space: nowrap;
			`
		});

		if (completedCount === 0) {
			// No tasks completed: "0 of 6 To-dos" (matches Cursor)
			countText.textContent = `0 of ${totalCount} To-dos`;
		} else if (completedCount === totalCount) {
			// All tasks completed: "6 of 6 To-dos Completed" (matches Cursor)
			countText.textContent = `${completedCount} of ${totalCount} To-dos Completed`;
		} else {
			// Some tasks completed: "1 of 6 To-dos Completed" (matches Cursor)
			countText.textContent = `${completedCount} of ${totalCount} To-dos Completed`;
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

		// Find icon container (different selectors for attached vs non-attached)
		let iconContainer: HTMLElement | null = null;
		if (this.isAttachedToHuman) {
			// For attached: find div with width: 16px
			iconContainer = this.headerElement?.querySelector('div[style*="width: 16px"]') as HTMLElement | null;
		} else {
			// For non-attached: find div with justify-content: center
			iconContainer = this.headerElement?.querySelector('div[style*="justify-content: center"]') as HTMLElement | null;
		}

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

		// Update transition wrapper height for attached todos (Cursor structure)
		if (this.isAttachedToHuman) {
			const transitionWrapper = this.expandedContent?.parentElement;
			if (transitionWrapper && transitionWrapper !== this.headerElement) {
				const COLLAPSED_HEIGHT = 31.5;
				const EXPANDED_MAX_HEIGHT = 700;
				if (this.isExpanded) {
					transitionWrapper.style.maxHeight = `${EXPANDED_MAX_HEIGHT}px`;
					transitionWrapper.style.height = 'auto';
				} else {
					transitionWrapper.style.maxHeight = `${COLLAPSED_HEIGHT}px`;
					transitionWrapper.style.height = `${COLLAPSED_HEIGHT}px`;
				}
			}

			// Update sticky container height
			const stickyContainer = transitionWrapper?.parentElement;
			if (stickyContainer && stickyContainer.classList.contains('todo-summary-sticky-container')) {
				const COLLAPSED_HEIGHT = 31.5;
				if (this.isExpanded) {
					stickyContainer.style.height = '';
					stickyContainer.style.maxHeight = '700px';
				} else {
					stickyContainer.style.height = `${COLLAPSED_HEIGHT}px`;
					stickyContainer.style.maxHeight = '';
				}
			}
		}

		// Update header text (to show "Running to-do" when collapsed)
		this.updateHeaderText();
	}

	updateContent(data: Partial<IVybeChatTodoContent>): void {
		if (data.items && data.items.length >= 2) {
			this.items = data.items;
			this.renderTodoItems();
			// Update icon in case completion status changed
			this.updateIcon();
			// Update icon in DOM
			if (this.isAttachedToHuman) {
				const iconContainer = this.headerElement?.querySelector('div[style*="width: 16px"]') as HTMLElement | null;
				if (iconContainer && this.iconElement) {
					while (iconContainer.firstChild) {
						iconContainer.removeChild(iconContainer.firstChild);
					}
					iconContainer.appendChild(this.iconElement);
				}
			} else {
				const iconContainer = this.headerElement?.querySelector('div[style*="justify-content: center"]') as HTMLElement | null;
				if (iconContainer && this.iconElement) {
					while (iconContainer.firstChild) {
						iconContainer.removeChild(iconContainer.firstChild);
					}
					iconContainer.appendChild(this.iconElement);
				}
			}
		}

		if (data.currentRunningTodo !== undefined) {
			this.currentRunningTodo = data.currentRunningTodo;
			this.updateHeaderText();
		}

		if (data.isExpanded !== undefined) {
			// Allow expand/collapse even when attached to human
			this.isExpanded = data.isExpanded;
			if (this.expandedContent) {
				this.expandedContent.style.display = this.isExpanded ? 'block' : 'none';
			}
			this.updateIcon();

			// Update transition wrapper height for attached todos (Cursor structure)
			if (this.isAttachedToHuman) {
				const transitionWrapper = this.expandedContent?.parentElement;
				if (transitionWrapper && transitionWrapper !== this.headerElement) {
					const COLLAPSED_HEIGHT = 31.5;
					const EXPANDED_MAX_HEIGHT = 700;
					if (this.isExpanded) {
						transitionWrapper.style.maxHeight = `${EXPANDED_MAX_HEIGHT}px`;
						transitionWrapper.style.height = 'auto';
					} else {
						transitionWrapper.style.maxHeight = `${COLLAPSED_HEIGHT}px`;
						transitionWrapper.style.height = `${COLLAPSED_HEIGHT}px`;
					}
				}

				// Update sticky container height
				const stickyContainer = transitionWrapper?.parentElement;
				if (stickyContainer && stickyContainer.classList.contains('todo-summary-sticky-container')) {
					const COLLAPSED_HEIGHT = 31.5;
					if (this.isExpanded) {
						stickyContainer.style.height = '';
						stickyContainer.style.maxHeight = '700px';
					} else {
						stickyContainer.style.height = `${COLLAPSED_HEIGHT}px`;
						stickyContainer.style.maxHeight = '';
					}
				}
			}

			// Update icon in DOM
			if (this.isAttachedToHuman) {
				const iconContainer = this.headerElement?.querySelector('div[style*="width: 16px"]') as HTMLElement | null;
				if (iconContainer && this.iconElement) {
					while (iconContainer.firstChild) {
						iconContainer.removeChild(iconContainer.firstChild);
					}
					iconContainer.appendChild(this.iconElement);
				}
			} else {
				const iconContainer = this.headerElement?.querySelector('div[style*="justify-content: center"]') as HTMLElement | null;
				if (iconContainer && this.iconElement) {
					while (iconContainer.firstChild) {
						iconContainer.removeChild(iconContainer.firstChild);
					}
					iconContainer.appendChild(this.iconElement);
				}
			}
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

