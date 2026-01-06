/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatMarkdownContent } from './vybeChatContentPart.js';
import { VybeChatCodeBlockPart } from './vybeChatCodeBlockPart.js';
import { $, getWindow } from '../../../../../base/browser/dom.js';
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

	/**
	 * Production Architecture: When true, code block extraction is disabled.
	 * Code blocks come from show_code tool calls instead of markdown parsing.
	 * Set this to true when using the new streaming architecture.
	 */
	private disableCodeBlockExtraction: boolean = false;

	constructor(
		content: IVybeChatMarkdownContent,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly instantiationService: IInstantiationService,
		options?: { disableCodeBlockExtraction?: boolean }
	) {
		super('markdown');
		this.targetContent = content.content;
		this.isStreaming = content.isStreaming ?? false;
		this.currentContent = this.isStreaming ? '' : content.content; // Start empty if streaming
		this.disableCodeBlockExtraction = options?.disableCodeBlockExtraction ?? false;
	}

	/**
	 * Enable/disable code block extraction
	 * Production Architecture: Set to true to disable extraction (code comes from tools)
	 */
	public setDisableCodeBlockExtraction(disable: boolean): void {
		this.disableCodeBlockExtraction = disable;
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	/**
	 * Get current content (single source of truth)
	 */
	public getCurrentContent(): string {
		return this.currentContent;
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
		// Guard against undefined/null markdown
		if (!markdown) {
			return blocks;
		}

		// DIAGNOSTIC: Check if content has code block markers
		const hasMarkers = markdown.includes('```');
		if (hasMarkers && this.codeBlockMap.size > 0) {
			console.log('[CodeBlock] extractCodeBlocks - content has markers but extracting', {
				contentLength: markdown.length,
				existingBlocks: this.codeBlockMap.size,
				markerCount: (markdown.match(/```/g) || []).length
			});
		}

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

		// DIAGNOSTIC: Log if we expected blocks but got none
		if (hasMarkers && blocks.length === 0 && this.codeBlockMap.size > 0) {
			console.warn('[CodeBlock] extractCodeBlocks - markers found but no blocks extracted!', {
				contentLength: markdown.length,
				markerCount: (markdown.match(/```/g) || []).length,
				firstMarkerIndex: markdown.indexOf('```'),
				lastMarkerIndex: markdown.lastIndexOf('```'),
				contentPreview: markdown.substring(markdown.indexOf('```') - 50, markdown.indexOf('```') + 200)
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

		// CRITICAL: Guard against empty content when we have existing code blocks
		// If content is empty but we have code blocks, preserve them by using currentContent
		if (!content && this.codeBlockMap.size > 0) {
			console.warn('[MarkdownPart] renderMarkdown - empty content but code blocks exist, preserving', {
				existingCodeBlocks: this.codeBlockMap.size,
				currentContentLength: this.currentContent.length
			});
			content = this.currentContent; // Use existing content to preserve code blocks
		}

		// Guard against undefined/null content
		if (!content) {
			content = '';
		}

		// Guard: Ensure currentContent is always a string (never undefined)
		if (this.currentContent === undefined) {
			this.currentContent = '';
		}

		// Only re-render if content has actually changed (prevents flicker)
		// But always render if currentContent is empty (first render)
		// CRITICAL: Compare against the stored currentContent BEFORE updating it
		const contentChanged = content !== this.currentContent;
		const isFirstRender = this.currentContent.length === 0;

		if (!contentChanged && !isFirstRender) {
			return; // Skip if content hasn't changed and it's not the first render
		}

		// PRODUCTION ARCHITECTURE: Skip code block extraction when disabled
		// Code blocks come from show_code tool calls instead
		if (this.disableCodeBlockExtraction) {
			// Simple render - just render markdown as-is
			this.currentContent = content;
			if (!this.markdownContainer) {
				return;
			}

			// Clear container
			while (this.markdownContainer.firstChild) {
				this.markdownContainer.removeChild(this.markdownContainer.firstChild);
			}

			// Render markdown without code block extraction
			const markdownString = new MarkdownString(content, {
				isTrusted: true,
				supportThemeIcons: true,
				supportHtml: false
			});

			const renderedMarkdown = this.markdownRendererService.render(markdownString, {});

			if (renderedMarkdown?.element) {
				this.markdownContainer.appendChild(renderedMarkdown.element);
			}

			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}
			return;
		}

		// LEGACY: Code block extraction for backward compatibility
		// DIAGNOSTIC: Log when rendering with code blocks
		const hasCodeBlockMarkers = content.includes('```');
		if (hasCodeBlockMarkers || this.codeBlockMap.size > 0) {
			console.log('[MarkdownPart] renderMarkdown - code block check', {
				contentLength: content.length,
				hasMarkers: hasCodeBlockMarkers,
				existingCodeBlocks: this.codeBlockMap.size,
				isStreaming: this.isStreaming,
				contentPreview: content.substring(0, 200)
			});
		}

		// Extract code blocks from new content
		const newCodeBlocks = this.extractCodeBlocks(content);

		// CODE BLOCK DIAGNOSTIC: Only log when count changes (not on every render)
		const codeBlockCountChanged = newCodeBlocks.length !== this.codeBlockMap.size;
		if (codeBlockCountChanged) {
			console.log('[CodeBlock] Count changed', {
				existing: this.codeBlockMap.size,
				new: newCodeBlocks.length,
				languages: newCodeBlocks.map(b => b.language),
				isStreaming: this.isStreaming,
				contentHasCodeBlockMarkers: content.includes('```')
			});
		}

		// Update code blocks directly if structure matches (prevents flicker)
		const codeBlocksUpdated = this.updateCodeBlocksDirectly(newCodeBlocks);

		// CRITICAL: Handle container clearing based on whether code blocks were updated
		// IMPORTANT: Be conservative about disposing code blocks
		// If we had code blocks and now have 0, but content still has ``` markers, keep them
		// (incomplete markdown or extraction failures can temporarily hide code blocks)
		const hadCodeBlocks = this.codeBlockMap.size > 0;
		const lostCodeBlocks = hadCodeBlocks && newCodeBlocks.length === 0;
		const contentHasCodeBlockMarkers = content.includes('```');
		// Preserve code blocks if we had them, lost them, but content has markers
		// This applies during streaming AND after final (extraction might fail on final content)
		const shouldPreserveCodeBlocks = lostCodeBlocks && contentHasCodeBlockMarkers;

		if (!codeBlocksUpdated && !shouldPreserveCodeBlocks) {
			// Structure changed - dispose code blocks and clear container
			console.log('[CodeBlock] Structure changed - disposing', {
				oldCount: this.codeBlockParts.length,
				newCount: newCodeBlocks.length,
				isStreaming: this.isStreaming,
				hasMarkers: contentHasCodeBlockMarkers
			});
			this.codeBlockParts.forEach(part => part.dispose());
			this.codeBlockParts = [];
			this.codeBlockMap.clear();

			// Clear container for full re-render
			while (this.markdownContainer.firstChild) {
				this.markdownContainer.removeChild(this.markdownContainer.firstChild);
			}
		} else if (codeBlocksUpdated) {
			// Code blocks updated in-place - they're already updated
			// But we still need to re-render markdown text around them
			// The code block DOM nodes are preserved and will be reattached by the renderer
			// Clear container to re-render markdown text, but code blocks will be reused
			while (this.markdownContainer.firstChild) {
				this.markdownContainer.removeChild(this.markdownContainer.firstChild);
			}
		} else if (shouldPreserveCodeBlocks) {
			// Code blocks temporarily not detected but markers exist - preserve them
			// Skip re-render to prevent code blocks from disappearing
			console.log('[CodeBlock] Preserving code blocks (markers present but extraction failed)', {
				existingCount: this.codeBlockMap.size,
				contentLength: content.length,
				isStreaming: this.isStreaming,
				hasMarkers: contentHasCodeBlockMarkers
			});
			// Don't clear container or re-render - just update currentContent
			// This prevents code blocks from being disposed when extraction fails
			this.currentContent = content;
			return; // Skip markdown re-render to preserve code blocks
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
					// Reuse existing block - already updated above via updateCodeBlocksDirectly
					// CRITICAL: The DOM node might be detached (we cleared the container),
					// but that's fine - the renderer will replace the placeholder with it
					// Verify the DOM node exists
					if (!existingBlock.domNode) {
						console.warn('[CodeBlock] Reusing block but domNode is missing, creating new one', {
							index: this.codeBlockIndex,
							language: languageId
						});
						// Fall through to create new block
					} else {
						this.codeBlockIndex++;
						// Return the DOM node - even if detached, the renderer will use it to replace the placeholder
						return existingBlock.domNode;
					}
				}

				// Create a new code block part with Monaco editor
				// Only log when creating new blocks (not on every update)
				console.log('[CodeBlock] CREATE NEW', {
					index: this.codeBlockIndex,
					language: languageId,
					codeLength: code.length,
					totalCodeBlocks: this.codeBlockMap.size + 1
				});
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

		// CRITICAL: Update currentContent AFTER rendering (so next render can detect changes)
		this.currentContent = content;

		// No log - render complete happens on every update, too verbose
		// Code block diagnostics are logged only when count changes or new blocks are created
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
		const newText = newContent.content || ''; // Ensure content is never undefined
		const isNowStreaming = newContent.isStreaming ?? false;

		// DIAGNOSTIC: Log content when transitioning from streaming to non-streaming
		const justStoppingStream = this.isStreaming && !isNowStreaming;
		if (justStoppingStream) {
			const hasCodeBlocks = newText.includes('```');
			const currentHasCodeBlocks = this.currentContent.includes('```');
			console.log('[MarkdownPart] updateContent - stopping stream', {
				newTextLength: newText.length,
				currentLength: this.currentContent.length,
				newTextHasCodeBlocks: hasCodeBlocks,
				currentHasCodeBlocks: currentHasCodeBlocks,
				contentMatches: newText === this.currentContent
			});
		}

		// CRITICAL: If content hasn't changed and we're just transitioning from streaming to non-streaming,
		// don't re-render - just update the streaming state. This prevents code blocks from being destroyed.
		const contentUnchanged = newText === this.currentContent;

		if (contentUnchanged && justStoppingStream) {
			// Content is the same, just stopping streaming - update state without re-rendering
			this.isStreaming = false;
			this.targetContent = newText;

			// Cancel any pending animations
			if (this.rafId !== null) {
				const targetWindow = this.markdownContainer ? getWindow(this.markdownContainer) : getWindow(undefined);
				targetWindow.cancelAnimationFrame(this.rafId);
				this.rafId = null;
			}
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}

			// Don't re-render - code blocks are already correct
			return;
		}

		// Log only when skipping re-render (important for debugging)
		// Removed verbose updateContent logs to reduce noise during streaming

		// Update state
		this.targetContent = newText;
		this.isStreaming = isNowStreaming;

		// If not streaming, show complete text immediately
		if (!isNowStreaming) {
			// Cancel any pending animation frame
			if (this.rafId !== null) {
				const targetWindow = this.markdownContainer ? getWindow(this.markdownContainer) : getWindow(undefined);
				targetWindow.cancelAnimationFrame(this.rafId);
				this.rafId = null;
			}

			// Don't update currentContent here - renderMarkdown will update it after rendering
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}
			this.renderMarkdown(newText);
		} else {
			// Streaming mode - render immediately (real-time streaming)
			// Don't update currentContent here - renderMarkdown will update it after rendering

			// Clear any existing animation
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}

			// For the first render, render immediately to ensure content appears
			// After that, use requestAnimationFrame to batch rapid updates
			const isFirstRender = !this.markdownContainer || this.markdownContainer.children.length === 0;

			if (isFirstRender) {
				this.renderMarkdown(newText);
				if (this.onStreamingUpdate) {
					this.onStreamingUpdate();
				}
			} else if (this.rafId === null) {
				const targetWindow = this.markdownContainer ? getWindow(this.markdownContainer) : getWindow(undefined);
				// Capture newText in closure to prevent stale content
				const textToRender = newText;
				this.rafId = targetWindow.requestAnimationFrame(() => {
					// CRITICAL: Only render if content is not empty or if we don't have code blocks
					// This prevents clearing content when a RAF callback fires with stale/empty content
					if (textToRender || this.codeBlockMap.size === 0) {
						this.renderMarkdown(textToRender);
					} else {
						console.warn('[MarkdownPart] Skipping RAF render - empty content but code blocks exist', {
							codeBlocks: this.codeBlockMap.size,
							currentContentLength: this.currentContent.length
						});
					}

					// Notify parent for scrolling (batched via RAF to prevent scroll jumping)
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
			const targetWindow = this.markdownContainer ? getWindow(this.markdownContainer) : getWindow(undefined);
			targetWindow.cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// Dispose all code block parts
		this.codeBlockParts.forEach(part => part.dispose());
		this.codeBlockParts = [];

		super.dispose();
		this.markdownContainer = undefined;
	}
}


