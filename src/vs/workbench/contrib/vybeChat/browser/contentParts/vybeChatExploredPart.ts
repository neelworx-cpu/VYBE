/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart } from './vybeChatContentPart.js';
import type { IVybeChatListedContent, IVybeChatDirectoryContent } from './vybeChatContentPart.js';
import { VybeChatReadingFilesPart, IVybeChatReadingFilesContent } from './vybeChatReadingFilesPart.js';
import { VybeChatSearchedPart, IVybeChatSearchedContent } from './vybeChatSearchedPart.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

/**
 * Action types in an explored block.
 */
export type ExploredActionType = 'read' | 'searched' | 'listed' | 'directory';

/**
 * Data for a single action in an explored block.
 */
export interface ExploredAction {
	type: ExploredActionType;
	data: IVybeChatReadingFilesContent | IVybeChatSearchedContent | IVybeChatListedContent | IVybeChatDirectoryContent;
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

		// "Explored" text
		const exploredText = $('span', {
			style: `
				color: var(--cursor-text-secondary);
				white-space: nowrap;
				flex-shrink: 0;
			`
		});
		exploredText.textContent = 'Explored';

		// Counts text
		const countsText = this.generateCountsText();
		const countsSpan = $('span', {
			style: `
				margin-left: 4px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				min-width: 0px;
			`
		});
		countsSpan.textContent = countsText;

		// Chevron icon (collapsed state)
		const chevronIcon = $('div.codicon.codicon-chevron-right', {
			style: `
				color: var(--vscode-foreground);
				line-height: 12px;
				width: 12px;
				height: 12px;
				display: flex;
				justify-content: center;
				align-items: center;
				transform-origin: 50% 50%;
				transition: transform 0.15s ease-in-out;
				flex-shrink: 0;
				cursor: pointer;
				opacity: 0.55;
				transform: rotate(0deg);
				font-size: 12px;
				margin-left: 4px;
			`
		});

		// Build header hierarchy
		textInner.appendChild(exploredText);
		textInner.appendChild(countsSpan);
		textWrapper.appendChild(textInner);
		headerText.appendChild(textWrapper);
		headerText.appendChild(chevronIcon);
		headerContent.appendChild(headerText);
		this.headerElement.appendChild(headerContent);

		// Collapsible children (action blocks) - collapsed by default
		const collapsibleChildren = $('.collapsible-clean-children', {
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

	private generateCountsText(): string {
		const counts: string[] = [];
		let directoryCount = 0;
		let fileCount = 0;
		let searchCount = 0;
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
				case 'listed':
					listCount++;
					break;
			}
		});

		if (directoryCount > 0) {
			counts.push(`${directoryCount} ${directoryCount === 1 ? 'directory' : 'directories'}`);
		}
		if (fileCount > 0) {
			counts.push(`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`);
		}
		if (searchCount > 0) {
			counts.push(`${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`);
		}
		if (listCount > 0) {
			counts.push(`${listCount} ${listCount === 1 ? 'list' : 'lists'}`);
		}

		return counts.length > 0 ? counts.join(', ') : '';
	}

	private createActionBlock(action: ExploredAction, index: number): HTMLElement | null {
		// Consistent spacing for all action blocks (same as Read spacing)
		const actionContainer = $('div', {
			style: `
				margin-top: 0px;
				padding: 0px;
			`
		});

		switch (action.type) {
			case 'read':
				if (action.data.kind === 'readingFiles') {
					const readPart = new VybeChatReadingFilesPart(action.data, this.editorService, this.fileService, this.notificationService);
					actionContainer.appendChild(readPart.domNode);
					this.actionContainers.set(index, actionContainer);
					return actionContainer;
				}
				break;

			case 'searched':
				if (action.data.kind === 'searched') {
					const searchedPart = new VybeChatSearchedPart(action.data, this.editorService, this.fileService, this.notificationService);
					actionContainer.appendChild(searchedPart.domNode);
					this.actionContainers.set(index, actionContainer);
					return actionContainer;
				}
				break;

			case 'listed':
			case 'directory': {
				// Simple block for listed/directory
				const simpleBlock = $('div', {
					style: `
						display: flex;
						flex-direction: row;
						align-items: center;
						gap: 4px;
						padding: 0px;
					`
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
				actionText.textContent = action.type === 'listed' ? 'Listed' : 'Directory';

				const nameSpan = $('span', {
					style: `
						margin-left: 4px;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						min-width: 0px;
					`
				});
				nameSpan.textContent = (action.data as { name: string }).name;

				textInner.appendChild(actionText);
				textInner.appendChild(nameSpan);
				textWrapper.appendChild(textInner);
				headerText.appendChild(textWrapper);
				simpleBlock.appendChild(headerText);
				actionContainer.appendChild(simpleBlock);
				this.actionContainers.set(index, actionContainer);
				return actionContainer;
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
			// Update counts text
			const countsText = this.generateCountsText();
			// Find the counts span (second span after "Explored")
			const textInner = this.container?.querySelector('.collapsible-header-text span span div');
			if (textInner && textInner.children.length > 1) {
				const countsSpan = textInner.children[1] as HTMLElement;
				if (countsSpan) {
					countsSpan.textContent = countsText;
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
