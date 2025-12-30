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
	private rafId: number | null = null; // RequestAnimationFrame ID for batching updates
	private codeBlockMap: Map<number, VybeChatCodeBlockPart> = new Map(); // Map index -> code block for reuse

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
	 * Extract code blocks from markdown to get their content.
	 */
	private extractCodeBlocks(markdown: string): Array<{ language: string; code: string; index: number }> {
		const blocks: Array<{ language: string; code: string; index: number }> = [];
		const lines = markdown.split('\n');
		let inBlock = false;
		let startLine = 0;
		let languageId = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!inBlock && line.match(/^```(\w*)/)) {
				inBlock = true;
				startLine = i + 1;
				languageId = line.substring(3).trim();
			} else if (inBlock && line.match(/^```\s*$/)) {
				inBlock = false;
				const code = lines.slice(startLine, i).join('\n');
				blocks.push({
					language: languageId || 'plaintext',
					code,
					index: blocks.length
				});
			}
		}

		// Handle unclosed code block (streaming)
		if (inBlock) {
			const code = lines.slice(startLine).join('\n');
			blocks.push({
				language: languageId || 'plaintext',
				code,
				index: blocks.length
			});
		}

		return blocks;
	}

	/**
	 * Update existing code blocks directly if structure matches.
	 */
	private updateCodeBlocksDirectly(newBlocks: Array<{ language: string; code: string; index: number }>): boolean {
		// Only update if we have the same number of code blocks and they match by index
		if (this.codeBlockMap.size !== newBlocks.length) {
			return false;
		}

		// Update each code block
		for (const block of newBlocks) {
			const existingBlock = this.codeBlockMap.get(block.index);
			if (!existingBlock) {
				return false; // Missing block, need full re-render
			}

			// Update the code block content directly
			try {
				existingBlock.updateContent({
					kind: 'codeBlock' as const,
					code: block.code,
					language: block.language,
					isStreaming: this.isStreaming
				});
			} catch (e) {
				return false; // Update failed, need full re-render
			}
		}

		return true; // All code blocks updated successfully
	}

	/**
	 * Render markdown content using VS Code's markdown renderer.
	 */
	private renderMarkdown(content: string): void {
		if (!this.markdownContainer) {
			return;
		}

		// Extract code blocks from new content
		const newCodeBlocks = this.extractCodeBlocks(content);

		// Update code blocks directly if structure matches (prevents flicker)
		const codeBlocksUpdated = this.updateCodeBlocksDirectly(newCodeBlocks);

		// Always do full re-render to update markdown text parts
		// But code blocks won't flicker because they're already updated above

		// Always do full re-render to update markdown text parts
		// But preserve code blocks if structure matches (they're already updated above)

		// Clear existing content (this removes code block DOM nodes, but we'll reuse them)
		while (this.markdownContainer.firstChild) {
			this.markdownContainer.removeChild(this.markdownContainer.firstChild);
		}

		// Only clear code blocks if structure changed
		if (!codeBlocksUpdated) {
			this.codeBlockParts.forEach(part => part.dispose());
			this.codeBlockParts = [];
			this.codeBlockMap.clear();
		}
		this.codeBlockIndex = 0;

		// Create markdown string with GFM support for tables
		const markdownString = new MarkdownString(content, {
			isTrusted: true,
			supportThemeIcons: true,
			supportHtml: false
		});

		// Render using VS Code's markdown renderer service with GFM options and code block renderer
		const result = this.markdownRendererService.render(markdownString, {
			fillInIncompleteTokens: this.isStreaming, // Handle incomplete markdown during streaming
			markedOptions: {
				gfm: true, // GitHub Flavored Markdown (enables tables)
				breaks: true // Line breaks create <br>
			},
			codeBlockRendererSync: (languageId: string, code: string) => {
				// Check if we can reuse an existing code block
				const existingBlock = this.codeBlockMap.get(this.codeBlockIndex);
				if (existingBlock) {
					// Reuse existing block - already updated above
					this.codeBlockIndex++;
					return existingBlock.domNode;
				}

				// Create a new code block part with Monaco editor
				const codeBlockPart = this.instantiationService.createInstance(
					VybeChatCodeBlockPart,
					{
						kind: 'codeBlock' as const,
						code: code,
						language: languageId || 'plaintext'
					},
					this.codeBlockIndex
				);

				// Track for disposal and reuse
				this.codeBlockParts.push(codeBlockPart);
				this.codeBlockMap.set(this.codeBlockIndex, codeBlockPart);
				this._register(codeBlockPart);
				this.codeBlockIndex++;

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
	 * Uses requestAnimationFrame to batch updates and reduce flicker.
	 */
	updateContent(newContent: IVybeChatMarkdownContent): void {
		const newText = newContent.content;
		const isNowStreaming = newContent.isStreaming ?? false;

		// Update state
		this.targetContent = newText;
		this.isStreaming = isNowStreaming;

		// If not streaming, show complete text immediately
		if (!isNowStreaming) {
			// Cancel any pending animation frame
			if (this.rafId !== null) {
				cancelAnimationFrame(this.rafId);
				this.rafId = null;
			}

			this.currentContent = newText;
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}
			this.renderMarkdown(this.currentContent);
		} else {
			// Streaming mode - render immediately (real-time streaming)
			this.currentContent = newText;

			// Clear any existing animation
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}

			// Render immediately for real-time streaming
			// Use requestAnimationFrame only to batch if multiple updates come in rapid succession
			if (this.rafId === null) {
				this.rafId = requestAnimationFrame(() => {
					this.renderMarkdown(this.currentContent);

					// Notify parent for scrolling
					if (this.onStreamingUpdate) {
						this.onStreamingUpdate();
					}

					this.rafId = null;
				});
			}
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

		// Clean up requestAnimationFrame
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// Dispose all code block parts
		this.codeBlockParts.forEach(part => part.dispose());
		this.codeBlockParts = [];

		super.dispose();
		this.markdownContainer = undefined;
	}
}


