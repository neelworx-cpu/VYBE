/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatMarkdownContent } from './vybeChatContentPart.js';
import { VybeChatCodeBlockPart } from './vybeChatCodeBlockPart.js';
import { $ } from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Renders markdown content in AI responses.
 * Uses VS Code's built-in markdown renderer for consistency.
 */
export class VybeChatMarkdownPart extends VybeChatContentPart {
	private markdownContainer: HTMLElement | undefined;
	private currentContent: string = '';
	private targetContent: string = ''; // Full content for streaming towards
	private isStreaming: boolean = false;
	private streamingIntervalId: ReturnType<typeof setTimeout> | null = null;
	public onStreamingUpdate?: () => void; // Callback for parent to handle scrolling
	private codeBlockIndex: number = 0;
	private codeBlockParts: VybeChatCodeBlockPart[] = [];

	constructor(
		content: IVybeChatMarkdownContent,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly instantiationService: IInstantiationService
	) {
		super('markdown');
		this.targetContent = content.content;
		this.isStreaming = content.isStreaming ?? false;
		this.currentContent = this.isStreaming ? '' : content.content; // Start empty if streaming
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	protected createDomNode(): HTMLElement {
		// Main container - NO horizontal padding (AI response area already has 18px)
		const outerContainer = $('.vybe-chat-markdown-response', {
			'data-message-role': 'ai',
			'data-message-kind': 'assistant',
			'tabindex': '0',
			style: `
				display: block;
				outline: none;
				padding: 0;
				margin: 0;
				background-color: var(--vscode-sideBar-background);
				opacity: 1;
				z-index: 99;
			`
		});

		// Transparent background wrapper
		const transparentWrapper = $('.vybe-chat-markdown-wrapper', {
			style: 'background-color: transparent;'
		});

		// Sticky top positioning wrapper
		const stickyWrapper = $('.vybe-chat-markdown-sticky', {
			style: 'position: sticky; top: 0px;'
		});

		// Inner padding wrapper - NO horizontal padding
		const innerPadding = $('.vybe-chat-markdown-inner', {
			style: 'padding: 0;'
		});

		// Root markdown container
		const markdownRoot = $('.vybe-markdown-container-root', {
			style: `
				user-select: text;
				font-size: 1em;
				line-height: 1.5;
				min-height: 22.2px;
			`
		});

		// Build the hierarchy
		innerPadding.appendChild(markdownRoot);
		stickyWrapper.appendChild(innerPadding);
		transparentWrapper.appendChild(stickyWrapper);
		outerContainer.appendChild(transparentWrapper);

		this.markdownContainer = markdownRoot;
		this.renderMarkdown(this.currentContent);

		// Start streaming if needed
		if (this.isStreaming && this.targetContent) {
			this.startStreamingAnimation();
		}

		return outerContainer;
	}

	/**
	 * Render markdown content using VS Code's markdown renderer.
	 */
	private renderMarkdown(content: string): void {
		if (!this.markdownContainer) {
			return;
		}

		// Clear existing content
		while (this.markdownContainer.firstChild) {
			this.markdownContainer.removeChild(this.markdownContainer.firstChild);
		}

		// Create markdown string with GFM support for tables
		const markdownString = new MarkdownString(content, {
			isTrusted: true,
			supportThemeIcons: true,
			supportHtml: false
		});

		// Render using VS Code's markdown renderer service with GFM options and code block renderer
		const result = this.markdownRendererService.render(markdownString, {
			markedOptions: {
				gfm: true, // GitHub Flavored Markdown (enables tables)
				breaks: true // Line breaks create <br>
			},
			codeBlockRendererSync: (languageId: string, code: string) => {
				// Create a code block part with Monaco editor
				const codeBlockPart = this.instantiationService.createInstance(
					VybeChatCodeBlockPart,
					{
						kind: 'codeBlock' as const,
						code: code,
						language: languageId || 'plaintext'
					},
					this.codeBlockIndex++
				);

				// Track for disposal
				this.codeBlockParts.push(codeBlockPart);
				this._register(codeBlockPart);

				// Return the DOM node
				return codeBlockPart.domNode;
			}
		});

		// Append the rendered content
		this.markdownContainer.appendChild(result.element);

		// Register disposables
		this._register(result);
	}

	/**
	 * Stream markdown content character-by-character (like thinking block).
	 */
	private startStreamingAnimation(): void {
		// Clear any existing animation
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		const fullText = this.targetContent;
		let charIndex = this.currentContent.length; // Start from where we left off
		const CHAR_DELAY_MS = 15; // 15ms per character (fast but legible)

		const streamNextChar = () => {
			if (charIndex >= fullText.length || !this.isStreaming) {
				// Streaming complete
				this.streamingIntervalId = null;
				return;
			}

			// Add next character
			this.currentContent = fullText.substring(0, charIndex + 1);
			charIndex++;

			// Re-render markdown with updated content
			this.renderMarkdown(this.currentContent);

			// Notify parent for page-level scroll
			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}

			// Schedule next character
			this.streamingIntervalId = setTimeout(streamNextChar, CHAR_DELAY_MS);
		};

		// Start streaming
		this.streamingIntervalId = setTimeout(streamNextChar, CHAR_DELAY_MS);
	}

	/**
	 * Update content when streaming new data.
	 */
	updateContent(newContent: IVybeChatMarkdownContent): void {
		const newText = newContent.content;
		const wasStreaming = this.isStreaming;
		const isNowStreaming = newContent.isStreaming ?? false;

		// Update state
		this.targetContent = newText;
		this.isStreaming = isNowStreaming;

		// If not streaming, show complete text immediately
		if (!isNowStreaming) {
			this.currentContent = newText;
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}
			this.renderMarkdown(this.currentContent);
		} else if (!wasStreaming && isNowStreaming) {
			// Start streaming
			this.startStreamingAnimation();
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'markdown') {
			return false;
		}
		return (other as VybeChatMarkdownPart).targetContent === this.targetContent;
	}

	override dispose(): void {
		// Clean up streaming interval
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		// Dispose all code block parts
		this.codeBlockParts.forEach(part => part.dispose());
		this.codeBlockParts = [];

		super.dispose();
		this.markdownContainer = undefined;
	}
}

