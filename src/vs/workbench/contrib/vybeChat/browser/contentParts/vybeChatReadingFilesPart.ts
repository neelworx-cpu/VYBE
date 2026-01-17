/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IFileMetadata } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { URI } from '../../../../../base/common/uri.js';

const $ = dom.$;

/**
 * Data for reading files content parts.
 */
export interface IVybeChatReadingFilesContent {
	kind: 'readingFiles';
	id?: string;
	files: Array<{
		name: string;
		path?: string;
		lineRange?: { start: number; end: number };
	}>;
	isStreaming?: boolean;
	error?: { code: string; message: string };
}

/**
 * Renders "Read filename" blocks in AI responses.
 * Shows files being read by the AI.
 */
export class VybeChatReadingFilesPart extends VybeChatContentPart {
	private container: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private headerTextElement: HTMLElement | undefined;
	private readTextElement: HTMLElement | undefined;
	private filenameElement: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private files: Array<IFileMetadata> = [];
	private isStreaming = false;
	private partId: string | undefined;
	private editorService: IEditorService | undefined;
	private fileService: IFileService | undefined;
	private notificationService: INotificationService | undefined;

	constructor(
		content: IVybeChatReadingFilesContent,
		editorService?: IEditorService,
		fileService?: IFileService,
		notificationService?: INotificationService
	) {
		super('readingFiles');
		this.partId = content.id;
		this.files = content.files || [];
		this.isStreaming = content.isStreaming ?? false;
		this.editorService = editorService;
		this.fileService = fileService;
		this.notificationService = notificationService;

		// Store ID on container for tracking
		if (this.partId) {
			this.container?.setAttribute('data-part-id', this.partId);
		}
	}

	protected createDomNode(): HTMLElement {
		// Main container
		const outerContainer = $('.vybe-chat-reading-files-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'readingFiles',
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
		this.headerTextElement = $('.collapsible-header-text', {
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

		// "Read" or "Reading" text - same styling as "Thought"/"Thinking"
		this.readTextElement = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.6;
				white-space: nowrap;
				flex-shrink: 0;
			`
		});
		this.readTextElement.textContent = this.isStreaming ? 'Reading' : 'Read';

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

		// Filename - same styling as duration text ("for 12s") - NO underline, NO opacity change
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
			`
		});

		// Set filename (single file only for now)
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
				this.filenameElement.style.transition = 'color 0.2s ease';
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
		}

		// Build header hierarchy
		textInner.appendChild(this.readTextElement);
		textInner.appendChild(this.filenameElement);
		textWrapper.appendChild(textInner);
		this.headerTextElement.appendChild(textWrapper);
		// Add loading spinner if streaming
		if (this.iconElement) {
			this.headerTextElement.appendChild(this.iconElement);
		}
		headerContent.appendChild(this.headerTextElement);
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
		const lineRange = file.lineRange
			? {
				start: file.lineRange.start < 1 ? 1 : file.lineRange.start,
				end: file.lineRange.end < file.lineRange.start ? file.lineRange.start : file.lineRange.end
			}
			: undefined;

		try {
			const editorInput: { resource: URI; options?: { selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } } } = {
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

	updateContent(data: IVybeChatReadingFilesContent): void {
		// Update ID if provided
		if (data.id !== undefined && data.id !== this.partId) {
			this.partId = data.id;
			if (this.container && this.partId) {
				this.container.setAttribute('data-part-id', this.partId);
			}
		}

		// Handle errors
		if (data.error !== undefined) {
			if (this.filenameElement) {
				this.filenameElement.textContent = `Error: ${data.error.message}`;
				this.filenameElement.style.opacity = '0.5';
				this.filenameElement.style.color = 'var(--vscode-errorForeground)';
			}
			return;
		}

		if (data.files) {
			this.files = data.files;
			// Update filename display
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
				}
			}
		}

		const wasStreaming = this.isStreaming;
		if (data.isStreaming !== undefined) {
			this.isStreaming = data.isStreaming;

			// Update "Read" / "Reading" text
			if (this.readTextElement) {
				this.readTextElement.textContent = this.isStreaming ? 'Reading' : 'Read';
			}

			// Handle streaming -> complete transition (remove spinner)
			if (wasStreaming && !this.isStreaming && this.iconElement) {
				this.iconElement.remove();
				this.iconElement = undefined;
			}

			// Handle complete -> streaming transition (add spinner)
			if (!wasStreaming && this.isStreaming && this.headerTextElement) {
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
				this.headerTextElement.appendChild(this.iconElement);
			}
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'readingFiles') {
			return false;
		}
		const otherContent = other as unknown as VybeChatReadingFilesPart;
		return JSON.stringify(this.files) === JSON.stringify(otherContent.files) &&
			this.isStreaming === otherContent.isStreaming;
	}
}
