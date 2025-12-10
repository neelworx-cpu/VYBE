/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IFileMetadata, SearchType } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { URI } from '../../../../../base/common/uri.js';

const $ = dom.$;

/**
 * Data for searched content parts.
 */
export interface IVybeChatSearchedContent {
	kind: 'searched';
	query: string;
	files: Array<{
		name: string;
		path?: string;
		lineRange?: { start: number; end: number };
	}>;
	isStreaming?: boolean;
}

/**
 * Renders "Searched..." blocks in AI responses.
 * Shows search queries and matching files.
 */
export class VybeChatSearchedPart extends VybeChatContentPart {
	private container: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private searchedTextElement: HTMLElement | undefined;
	private filenameElement: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private query: string = '';
	private searchType: SearchType = 'codebase';
	private files: Array<IFileMetadata> = [];
	private isStreaming = false;
	private partId: string | undefined;
	private editorService: IEditorService | undefined;
	private fileService: IFileService | undefined;
	private notificationService: INotificationService | undefined;

	constructor(
		content: IVybeChatSearchedContent,
		editorService?: IEditorService,
		fileService?: IFileService,
		notificationService?: INotificationService
	) {
		super('searched');
		this.partId = (content as any).id ?? undefined;
		this.query = content.query || '';
		this.searchType = (content as any).searchType ?? 'codebase';
		this.files = content.files || [];
		this.isStreaming = content.isStreaming ?? false;
		this.editorService = editorService;
		this.fileService = fileService;
		this.notificationService = notificationService;
	}

	protected createDomNode(): HTMLElement {
		// Main container
		const outerContainer = $('.vybe-chat-searched-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'searched',
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

		// Header (not clickable - no collapse)
		this.headerElement = $('div', {
			style: `
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 4px;
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

		// "Searched" or "Searching" text - same styling as "Read"/"Reading"
		// Include search type for clarity
		this.searchedTextElement = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.6;
				white-space: nowrap;
				flex-shrink: 0;
			`
		});
		const searchTypeLabel = this.searchType === 'codebase' ? '' : ` ${this.searchType}`;
		this.searchedTextElement.textContent = this.isStreaming ? `Searching${searchTypeLabel}` : `Searched${searchTypeLabel}`;

		// Loading spinner (when streaming) - same as thinking block
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

		// Filename - same styling as Read ("for 12s") - VYBE green on hover
		this.filenameElement = $('span.edit-header-filename', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.4;
				margin-left: 4px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				min-width: 0px;
				cursor: pointer;
				transition: color 0.2s ease;
			`
		});

		// Set display text (filename if files exist, otherwise query for web searches)
		if (this.files.length === 1) {
			const file = this.files[0];
			let displayText = file.name;
			if (file.lineRange) {
				displayText += ` L${file.lineRange.start}-${file.lineRange.end}`;
			}
			this.filenameElement.textContent = displayText;

			// Show error state if file doesn't exist
			if (file.exists === false) {
				this.filenameElement.style.opacity = '0.5';
				this.filenameElement.style.textDecoration = 'line-through';
			}

			// Make filename clickable to open file with VYBE green hover
			if ((file.path || file.uri) && this.editorService) {
				this._register(dom.addDisposableListener(this.filenameElement, 'mouseenter', () => {
					if (file.exists !== false) {
						this.filenameElement!.style.color = '#3ecf8e'; // VYBE green
					}
				}));
				this._register(dom.addDisposableListener(this.filenameElement, 'mouseleave', () => {
					this.filenameElement!.style.color = 'var(--vscode-foreground)';
				}));
				this._register(dom.addDisposableListener(this.filenameElement, 'click', (e) => {
					e.stopPropagation();
					this.openFile(file);
				}));
			}
		} else if (this.files.length > 1) {
			this.filenameElement.textContent = `${this.files.length} files`;
		} else {
			// No files (web search, semantic search) - show query
			this.filenameElement.textContent = this.query || '...';
			// No hover/click for query-only searches
		}

		// Build header hierarchy
		textInner.appendChild(this.searchedTextElement);
		textInner.appendChild(this.filenameElement);
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

	private async openFile(file: IFileMetadata): Promise<void> {
		if (!this.editorService) {
			return;
		}

		// Determine file URI
		let fileUri: URI;
		try {
			if (file.uri) {
				fileUri = URI.parse(file.uri);
			} else if (file.path) {
				fileUri = URI.file(file.path);
			} else {
				if (this.notificationService) {
					this.notificationService.warn(`Cannot open file: ${file.name} (no path or URI provided)`);
				}
				return;
			}
		} catch (error) {
			if (this.notificationService) {
				this.notificationService.error(`Invalid file path: ${file.path || file.uri}`);
			}
			return;
		}

		// Validate file exists (if fileService available)
		if (this.fileService && file.exists === false) {
			if (this.notificationService) {
				this.notificationService.warn(`File not found: ${file.name}`);
			}
			return;
		}

		// Validate line range
		let lineRange = file.lineRange;
		if (lineRange) {
			if (lineRange.start < 1) {
				lineRange.start = 1;
			}
			if (lineRange.end < lineRange.start) {
				lineRange.end = lineRange.start;
			}
		}

		try {
			const editorInput: any = {
				resource: fileUri
			};

			if (lineRange) {
				editorInput.options = {
					selection: {
						startLineNumber: lineRange.start,
						startColumn: 1,
						endLineNumber: lineRange.end,
						endColumn: 1
					}
				};
			}

			await this.editorService.openEditor(editorInput);
		} catch (error) {
			if (this.notificationService) {
				this.notificationService.error(`Failed to open file: ${file.name}. ${error instanceof Error ? error.message : String(error)}`);
			} else {
				console.error('[VYBE] Failed to open file:', error);
			}
		}
	}

	updateContent(data: IVybeChatSearchedContent): void {
		// Update ID if provided
		const dataId = (data as any).id;
		if (dataId !== undefined && dataId !== this.partId) {
			this.partId = dataId;
			if (this.container && this.partId) {
				this.container.setAttribute('data-part-id', this.partId);
			}
		}

		// Update search type
		const dataSearchType = (data as any).searchType;
		if (dataSearchType !== undefined) {
			this.searchType = dataSearchType;
		}

		// Handle errors
		const dataError = (data as any).error;
		if (dataError !== undefined) {
			if (this.filenameElement) {
				this.filenameElement.textContent = `Error: ${dataError.message}`;
				this.filenameElement.style.opacity = '0.5';
				this.filenameElement.style.color = 'var(--vscode-errorForeground)';
			}
			return;
		}

		if (data.query !== undefined) {
			this.query = data.query;
		}
		if (data.files) {
			this.files = data.files;
			// Update filename/query display
			if (this.filenameElement) {
				if (this.files.length === 1) {
					const file = this.files[0];
					let displayText = file.name;
					if (file.lineRange) {
						displayText += ` L${file.lineRange.start}-${file.lineRange.end}`;
					}
					this.filenameElement.textContent = displayText;

					// Update error state
					if (file.exists === false) {
						this.filenameElement.style.opacity = '0.5';
						this.filenameElement.style.textDecoration = 'line-through';
					} else {
						this.filenameElement.style.opacity = '0.4';
						this.filenameElement.style.textDecoration = 'none';
					}
				} else if (this.files.length > 1) {
					this.filenameElement.textContent = `${this.files.length} files`;
				} else {
					this.filenameElement.textContent = this.query || '...';
				}
			}
		}

		const wasStreaming = this.isStreaming;
		if (data.isStreaming !== undefined) {
			this.isStreaming = data.isStreaming;

			// Update "Searched" / "Searching" text with search type
			if (this.searchedTextElement) {
				const searchTypeLabel = this.searchType === 'codebase' ? '' : ` ${this.searchType}`;
				this.searchedTextElement.textContent = this.isStreaming ? `Searching${searchTypeLabel}` : `Searched${searchTypeLabel}`;
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
		if (other.kind !== 'searched') {
			return false;
		}
		const otherContent = other as unknown as VybeChatSearchedPart;
		return this.query === otherContent.query &&
			JSON.stringify(this.files) === JSON.stringify(otherContent.files) &&
			this.isStreaming === otherContent.isStreaming;
	}
}

