/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart } from './vybeChatContentPart.js';
import type { IVybeChatListedContent, IVybeChatDirectoryContent, IVybeChatGreppedContent } from './vybeChatContentPart.js';
import { VybeChatReadingFilesPart, IVybeChatReadingFilesContent } from './vybeChatReadingFilesPart.js';
import { VybeChatSearchedPart, IVybeChatSearchedContent } from './vybeChatSearchedPart.js';
import { VybeChatGreppedPart } from './vybeChatGreppedPart.js';
import { VybeChatListedPart } from './vybeChatListedPart.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

/**
 * Action types in an explored block.
 */
export type ExploredActionType = 'read' | 'searched' | 'grepped' | 'listed' | 'directory';

/**
 * Data for a single action in an explored block.
 */
export interface ExploredAction {
	type: ExploredActionType;
	data: IVybeChatReadingFilesContent | IVybeChatSearchedContent | IVybeChatGreppedContent | IVybeChatListedContent | IVybeChatDirectoryContent;
}

/**
 * Data for explored content parts.
 */
export interface IVybeChatExploredContent {
	kind: 'explored';
	actions: ExploredAction[];
	isStreaming?: boolean;
}

/**
 * Renders "Explored" blocks that group multiple actions (Read, Searched, Listed, Directory).
 * Shows a collapsible header with counts, and individual action blocks when expanded.
 */
export class VybeChatExploredPart extends VybeChatContentPart {
	private container: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private actions: ExploredAction[] = [];
	private isStreaming = false;
	private isExpanded = false;
	private actionContainers: Map<number, HTMLElement> = new Map();
	private partId: string | undefined;
	private editorService: IEditorService | undefined;
	private fileService: IFileService | undefined;
	private notificationService: INotificationService | undefined;

	constructor(
		content: IVybeChatExploredContent,
		editorService?: IEditorService,
		fileService?: IFileService,
		notificationService?: INotificationService
	) {
		super('explored');
		this.partId = (content as any).id ?? undefined;
		this.actions = content.actions || [];
		this.isStreaming = content.isStreaming ?? false;
		this.editorService = editorService;
		this.fileService = fileService;
		this.notificationService = notificationService;
	}

	protected createDomNode(): HTMLElement {
		// Main container
		const outerContainer = $('.vybe-chat-explored-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'explored',
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

		// Collapsible container - use composer-summary-title-container class (matches Cursor)
		const collapsibleContainer = $('.collapsible-clean.composer-summary-title-container', {
			style: `
				display: flex;
				flex-direction: column;
				gap: 0px;
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

		// Header text - use composer-summary-title-container class (matches Cursor)
		const headerText = $('.collapsible-header-text', {
			style: `
				flex: 0 1 auto;
				min-width: 0px;
				display: flex;
				align-items: center;
				overflow: hidden;
				gap: 2px;
				color: var(--cursor-text-secondary);
				transition: opacity 0.1s ease-in;
				font-size: 12px;
			`
		});

		// Text wrapper - use composer-summary-title class (matches Cursor)
		const textWrapper = $('span.composer-summary-title.truncate-one-line', {
			style: `
				flex: 0 1 auto;
				min-width: 0px;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			`
		});

		// "Explored" text
		const exploredText = $('span', {
			style: `
				color: var(--cursor-text-secondary);
				white-space: nowrap;
				flex-shrink: 0;
				margin-right: 4px;
			`
		});
		exploredText.textContent = 'Explored';

		// Counts text - use tool-summary-hover-target structure (matches Cursor)
		const countsContainer = this.generateCountsHTML();

		// Chevron icon - matches Cursor styling
		const chevronIcon = $('div.codicon.codicon-chevron-right', {
			style: `
				color: var(--vscode-foreground);
				line-height: 14px;
				width: 21px;
				height: auto;
				display: flex;
				justify-content: flex-start;
				align-items: center;
				transform-origin: 45% 55%;
				transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out, color 0.1s ease-in;
				flex-shrink: 0;
				cursor: pointer;
				opacity: 0.6;
				transform: rotate(0deg);
				font-size: 18px;
			`
		});

		// Build header hierarchy
		textWrapper.appendChild(exploredText);
		if (countsContainer) {
			textWrapper.appendChild(countsContainer);
		}
		headerText.appendChild(textWrapper);
		headerText.appendChild(chevronIcon);
		headerContent.appendChild(headerText);
		this.headerElement.appendChild(headerContent);

		// Collapsible children (action blocks) - collapsed by default
		// Use composer-summary-title-container-children class (matches Cursor)
		const collapsibleChildren = $('.collapsible-clean-children.composer-summary-title-container-children', {
			style: `
				padding-left: 0px;
				overflow-anchor: none;
				display: none;
			`
		});

		// Render action blocks
		this.actions.forEach((action, index) => {
			const actionBlock = this.createActionBlock(action, index);
			if (actionBlock) {
				collapsibleChildren.appendChild(actionBlock);
			}
		});

		// Toggle expand/collapse
		this.headerElement.addEventListener('click', () => {
			this.isExpanded = !this.isExpanded;
			if (this.isExpanded) {
				collapsibleChildren.style.display = 'block';
				chevronIcon.style.transform = 'rotate(90deg)';
			} else {
				collapsibleChildren.style.display = 'none';
				chevronIcon.style.transform = 'rotate(0deg)';
			}
		});

		// Build container hierarchy
		collapsibleContainer.appendChild(this.headerElement);
		collapsibleContainer.appendChild(collapsibleChildren);
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

	/**
	 * Generate counts HTML structure matching Cursor's format.
	 * Returns a container with tool-summary-hover-target spans.
	 */
	private generateCountsHTML(): HTMLElement | null {
		let directoryCount = 0;
		let fileCount = 0;
		let searchCount = 0;
		let grepCount = 0;
		let listCount = 0;

		this.actions.forEach(action => {
			switch (action.type) {
				case 'directory':
					directoryCount++;
					break;
				case 'read':
					if (action.data.kind === 'readingFiles') {
						fileCount += action.data.files.length;
					}
					break;
				case 'searched':
					searchCount++;
					break;
				case 'grepped':
					grepCount++;
					break;
				case 'listed':
					listCount++;
					break;
			}
		});

		// Create container for all count spans
		const container = document.createDocumentFragment();

		// Add file count
		if (fileCount > 0) {
			const fileSpan = $('span.tool-summary-hover-target', {
				style: 'margin-left: 0px;'
			});
			const restSpan = $('span.truncate-one-line.composer-run-title-rest');
			restSpan.textContent = fileCount.toString();
			const objectSpan = $('span.truncate-one-line.composer-run-title-object');
			objectSpan.textContent = ` ${fileCount === 1 ? 'file' : 'files'}`;
			fileSpan.appendChild(restSpan);
			fileSpan.appendChild(objectSpan);
			container.appendChild(fileSpan);

			// Add comma if more counts follow
			if (searchCount > 0 || listCount > 0 || directoryCount > 0) {
				const commaSpan = $('span.composer-summary-comma');
				commaSpan.textContent = ' ';
				container.appendChild(commaSpan);
			}
		}

		// Add search count
		if (searchCount > 0) {
			const searchSpan = $('span.tool-summary-hover-target', {
				style: 'margin-left: 0px;'
			});
			const restSpan = $('span.truncate-one-line.composer-run-title-rest');
			restSpan.textContent = searchCount.toString();
			const objectSpan = $('span.truncate-one-line.composer-run-title-object');
			objectSpan.textContent = ` ${searchCount === 1 ? 'search' : 'searches'}`;
			searchSpan.appendChild(restSpan);
			searchSpan.appendChild(objectSpan);
			container.appendChild(searchSpan);

			// Add comma if more counts follow
			if (grepCount > 0 || listCount > 0 || directoryCount > 0) {
				const commaSpan = $('span.composer-summary-comma');
				commaSpan.textContent = ' ';
				container.appendChild(commaSpan);
			}
		}

		// Add grep count
		if (grepCount > 0) {
			const grepSpan = $('span.tool-summary-hover-target', {
				style: 'margin-left: 0px;'
			});
			const restSpan = $('span.truncate-one-line.composer-run-title-rest');
			restSpan.textContent = grepCount.toString();
			const objectSpan = $('span.truncate-one-line.composer-run-title-object');
			objectSpan.textContent = ` ${grepCount === 1 ? 'grep' : 'greps'}`;
			grepSpan.appendChild(restSpan);
			grepSpan.appendChild(objectSpan);
			container.appendChild(grepSpan);

			// Add comma if more counts follow
			if (listCount > 0 || directoryCount > 0) {
				const commaSpan = $('span.composer-summary-comma');
				commaSpan.textContent = ' ';
				container.appendChild(commaSpan);
			}
		}

		// Add list count
		if (listCount > 0) {
			const listSpan = $('span.tool-summary-hover-target', {
				style: 'margin-left: 0px;'
			});
			const restSpan = $('span.truncate-one-line.composer-run-title-rest');
			restSpan.textContent = listCount.toString();
			const objectSpan = $('span.truncate-one-line.composer-run-title-object');
			objectSpan.textContent = ` ${listCount === 1 ? 'list' : 'lists'}`;
			listSpan.appendChild(restSpan);
			listSpan.appendChild(objectSpan);
			container.appendChild(listSpan);

			// Add comma if more counts follow
			if (directoryCount > 0) {
				const commaSpan = $('span.composer-summary-comma');
				commaSpan.textContent = ' ';
				container.appendChild(commaSpan);
			}
		}

		// Add directory count
		if (directoryCount > 0) {
			const dirSpan = $('span.tool-summary-hover-target', {
				style: 'margin-left: 0px;'
			});
			const restSpan = $('span.truncate-one-line.composer-run-title-rest');
			restSpan.textContent = directoryCount.toString();
			const objectSpan = $('span.truncate-one-line.composer-run-title-object');
			objectSpan.textContent = ` ${directoryCount === 1 ? 'directory' : 'directories'}`;
			dirSpan.appendChild(restSpan);
			dirSpan.appendChild(objectSpan);
			container.appendChild(dirSpan);
		}

		// Return a wrapper div if we have content, null otherwise
		if (container.childNodes.length > 0) {
			const wrapper = $('span');
			wrapper.appendChild(container);
			return wrapper;
		}

		return null;
	}

	private createActionBlock(action: ExploredAction, index: number): HTMLElement | null {
		// Wrap action in composer-rendered-message composer-grouped-toolformer-message (matches Cursor)
		const messageWrapper = $('div', {
			className: 'composer-rendered-message hide-if-empty composer-message-blur composer-grouped-toolformer-message',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				background-color: var(--composer-pane-background);
				opacity: 1;
				z-index: 99;
			`
		});

		const transparentWrapper = $('div', {
			style: 'background-color: transparent;'
		});

		switch (action.type) {
			case 'read':
				if (action.data.kind === 'readingFiles') {
					const readPart = new VybeChatReadingFilesPart(action.data, this.editorService, this.fileService, this.notificationService);
					transparentWrapper.appendChild(readPart.domNode);
					messageWrapper.appendChild(transparentWrapper);
					this.actionContainers.set(index, messageWrapper);
					return messageWrapper;
				}
				break;

			case 'searched':
				if (action.data.kind === 'searched') {
					const searchedPart = new VybeChatSearchedPart(action.data, this.editorService, this.fileService, this.notificationService);
					transparentWrapper.appendChild(searchedPart.domNode);
					messageWrapper.appendChild(transparentWrapper);
					this.actionContainers.set(index, messageWrapper);
					return messageWrapper;
				}
				break;

			case 'grepped':
				if (action.data.kind === 'grepped') {
					const greppedPart = new VybeChatGreppedPart(action.data);
					transparentWrapper.appendChild(greppedPart.domNode);
					messageWrapper.appendChild(transparentWrapper);
					this.actionContainers.set(index, messageWrapper);
					return messageWrapper;
				}
				break;

			case 'listed': {
				// Use the same structure as read/searched - create a proper content part
				const listedPart = new VybeChatListedPart(action.data as IVybeChatListedContent);
				transparentWrapper.appendChild(listedPart.domNode);
				messageWrapper.appendChild(transparentWrapper);
				this.actionContainers.set(index, messageWrapper);
				return messageWrapper;
			}

			case 'directory': {
					// Directory - simple block for now
					const toolFormerMessage = $('.composer-tool-former-message', {
						style: 'padding: 0px;'
					});

					const collapsibleClean = $('.collapsible-clean', {
						style: `
							display: flex;
							flex-direction: column;
							gap: 2px;
							overflow-anchor: none;
						`
					});

					const header = $('div', {
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

					const headerContent = $('div', {
						style: 'display: flex; gap: 4px; overflow: hidden;'
					});

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

					const textWrapper = $('span', {
						style: `
							flex: 0 1 auto;
							min-width: 0px;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
						`
					});

					const textInner = $('div', {
						style: 'display: flex; align-items: center; overflow: hidden;'
					});

					const actionText = $('span', {
						style: `
							color: var(--cursor-text-secondary);
							white-space: nowrap;
							flex-shrink: 0;
						`
					});
					actionText.textContent = 'Directory';

					const nameSpan = $('span.edit-header-filename', {
						style: `
							margin-left: 4px;
							overflow: hidden;
							text-overflow: ellipsis;
							white-space: nowrap;
							min-width: 0px;
							color: var(--vscode-foreground);
							opacity: 0.4;
						`
					});
					nameSpan.textContent = (action.data as { name: string }).name;

					textInner.appendChild(actionText);
					textInner.appendChild(nameSpan);
					textWrapper.appendChild(textInner);
					headerText.appendChild(textWrapper);
					headerContent.appendChild(headerText);
					header.appendChild(headerContent);
					collapsibleClean.appendChild(header);
					toolFormerMessage.appendChild(collapsibleClean);
					transparentWrapper.appendChild(toolFormerMessage);
					messageWrapper.appendChild(transparentWrapper);
					this.actionContainers.set(index, messageWrapper);
					return messageWrapper;
			}
		}

		return null;
	}

	updateContent(data: IVybeChatExploredContent): void {
		// Update ID if provided
		const dataId = (data as any).id;
		if (dataId !== undefined && dataId !== this.partId) {
			this.partId = dataId;
			if (this.container && this.partId) {
				this.container.setAttribute('data-part-id', this.partId);
			}
		}

		if (data.actions) {
			this.actions = data.actions;
			// Update counts HTML structure
			const countsHTML = this.generateCountsHTML();
			// Find the counts container (second child after "Explored" text in composer-summary-title)
			const summaryTitle = this.container?.querySelector('.composer-summary-title');
			if (summaryTitle && summaryTitle.children.length > 1) {
				const oldCountsContainer = summaryTitle.children[1];
				if (oldCountsContainer && countsHTML) {
					oldCountsContainer.replaceWith(countsHTML);
				} else if (countsHTML) {
					summaryTitle.appendChild(countsHTML);
				}
			}
			// Re-render action blocks if expanded
			if (this.isExpanded) {
				const collapsibleChildren = this.container?.querySelector('.collapsible-clean-children');
				if (collapsibleChildren) {
					collapsibleChildren.innerHTML = '';
					this.actionContainers.clear();
					this.actions.forEach((action, index) => {
						const actionBlock = this.createActionBlock(action, index);
						if (actionBlock) {
							collapsibleChildren.appendChild(actionBlock);
						}
					});
				}
			}
		}
		if (data.isStreaming !== undefined) {
			this.isStreaming = data.isStreaming;
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'explored') {
			return false;
		}
		const otherContent = other as unknown as VybeChatExploredPart;
		return JSON.stringify(this.actions) === JSON.stringify(otherContent.actions) &&
			this.isStreaming === otherContent.isStreaming;
	}
}
