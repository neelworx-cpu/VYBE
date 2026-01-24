/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatMarkdownContent, IVybeChatReferenceContent } from './vybeChatContentPart.js';
import { VybeChatCodeBlockPart } from './vybeChatCodeBlockPart.js';
import { VybeChatReferencePart } from './vybeChatReferencePart.js';
import { $, getWindow, addDisposableListener } from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { URI } from '../../../../../base/common/uri.js';
import * as path from '../../../../../base/common/path.js';

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
	private referenceParts: VybeChatReferencePart[] = [];
	private rafId: number | null = null; // RequestAnimationFrame ID for batching updates
	private codeBlockMap: Map<number, VybeChatCodeBlockPart> = new Map(); // Map index -> code block for reuse
	private referenceMap: Map<number, VybeChatReferencePart> = new Map(); // Map index -> reference part for reuse

	/**
	 * Production Architecture: When true, code block extraction is disabled.
	 * Code blocks come from show_code tool calls instead of markdown parsing.
	 * Set this to true when using the new streaming architecture.
	 */
	private disableCodeBlockExtraction: boolean = false;
	private editorService?: IEditorService;
	private workspaceContextService?: IWorkspaceContextService;

	constructor(
		content: IVybeChatMarkdownContent,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly instantiationService: IInstantiationService,
		options?: {
			disableCodeBlockExtraction?: boolean;
			editorService?: IEditorService;
			workspaceContextService?: IWorkspaceContextService;
		}
	) {
		super('markdown');
		this.targetContent = content.content;
		this.isStreaming = content.isStreaming ?? false;
		this.currentContent = this.isStreaming ? '' : content.content; // Start empty if streaming
		this.disableCodeBlockExtraction = options?.disableCodeBlockExtraction ?? false;
		this.editorService = options?.editorService;
		this.workspaceContextService = options?.workspaceContextService;
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
	 * Strip markdown checkboxes and convert to regular bullets.
	 * VYBE: Checkboxes are disabled - use write_todos tool instead.
	 */
	private stripCheckboxes(content: string): string {
		// Convert "- [ ] text" and "- [x] text" to "- text"
		return content.replace(/^(\s*)-\s+\[[ xX]\]\s+/gm, '$1- ');
	}

	/**
	 * Render markdown content using VS Code's markdown renderer.
	 */
	private renderMarkdown(content: string): void {
		// Removed verbose logging

		if (!this.markdownContainer) {
			console.error(`[MarkdownPart] renderMarkdown: No markdownContainer!`);
			return;
		}

		// VYBE: Strip any checkbox syntax before rendering
		content = this.stripCheckboxes(content);

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

			console.log(`[MarkdownPart] renderMarkdown (simple): renderedMarkdown=${!!renderedMarkdown}, element=${!!renderedMarkdown?.element}`);

			if (renderedMarkdown?.element) {
				this.markdownContainer.appendChild(renderedMarkdown.element);
				// Make inline code with file paths clickable
				this.makeInlineCodeClickable(renderedMarkdown.element);
			} else {
				console.error(`[MarkdownPart] renderMarkdown (simple): No element to append!`);
			}

			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}
			return;
		}

		// LEGACY: Code block extraction for backward compatibility
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
			codeBlockRendererSync: (languageId: string, code: string, raw?: string) => {
				// Check if this is a code reference format: startLine:endLine:filepath
				// The languageId is processed by postProcessCodeBlockLanguageId which splits on ':'
				// So we need to check the raw markdown token instead
				let referenceMatch: RegExpMatchArray | null = null;
				if (raw) {
					// Extract language from raw markdown: ```languageId\ncode\n```
					const rawMatch = raw.match(/^```(\S+)/);
					if (rawMatch && rawMatch[1]) {
						const rawLanguageId = rawMatch[1];
						referenceMatch = rawLanguageId.match(/^(\d+):(\d+):(.+)$/);
					}
				}
				// Fallback: try the processed languageId (might work if no colons before the first one)
				if (!referenceMatch) {
					referenceMatch = languageId.match(/^(\d+):(\d+):(.+)$/);
				}

				if (referenceMatch) {
					// This is a code reference, not a regular code block
					const startLine = parseInt(referenceMatch[1], 10);
					const endLine = parseInt(referenceMatch[2], 10);
					const filePath = referenceMatch[3];

					// Debug: Log what we received
					console.log('[CodeReference] Parsing reference:', {
						languageId,
						filePath,
						startLine,
						endLine,
						codeLength: code?.length || 0,
						codePreview: code?.substring(0, 100) || '(empty)',
						isStreaming: this.isStreaming
					});

					// Ensure code is not empty (use code parameter from markdown renderer)
					const codeContent = code || '';

					// Check if we can reuse an existing reference part
					const existingReference = this.referenceMap.get(this.codeBlockIndex);
					if (existingReference) {
						if (!existingReference.domNode) {
							console.warn('[CodeReference] Reusing reference but domNode is missing, creating new one', {
								index: this.codeBlockIndex,
								filePath: filePath
							});
							// Fall through to create new reference
						} else {
							// Update existing reference content (for streaming)
							if (existingReference.updateContent) {
								existingReference.updateContent({
									kind: 'reference',
									filePath: filePath,
									lineRange: { start: startLine, end: endLine },
									code: codeContent,
									language: undefined,
									isStreaming: this.isStreaming
								});
							}
							this.codeBlockIndex++;
							return existingReference.domNode;
						}
					}

					// Create a new code reference part
					const referenceContent: IVybeChatReferenceContent = {
						kind: 'reference',
						filePath: filePath,
						lineRange: { start: startLine, end: endLine },
						code: codeContent,
						language: undefined, // Will be detected from file extension
						isStreaming: this.isStreaming
					};

					// Get required services from instantiation service
					// Use invokeFunction to access the service accessor
					let modelService: IModelService | undefined;
					let languageService: ILanguageService | undefined;
					let clipboardService: IClipboardService | undefined;

					try {
						this.instantiationService.invokeFunction((accessor) => {
							modelService = accessor.get(IModelService);
							languageService = accessor.get(ILanguageService);
							clipboardService = accessor.get(IClipboardService);
						});
					} catch (error) {
						console.warn('[MarkdownPart] Failed to get services for code reference:', error);
					}

					// Ensure we have all required services
					if (!this.editorService || !this.workspaceContextService || !modelService || !languageService || !clipboardService) {
						console.error('[MarkdownPart] Missing required services for code reference. Services:', {
							editorService: !!this.editorService,
							workspaceContextService: !!this.workspaceContextService,
							modelService: !!modelService,
							languageService: !!languageService,
							clipboardService: !!clipboardService
						});
						// Return a placeholder div instead of falling through to regular code block
						// This prevents the reference format from being treated as a regular code block
						const placeholder = $('div');
						placeholder.style.cssText = 'padding: 8px; color: var(--vscode-errorForeground);';
						placeholder.textContent = `[Code Reference Error: Missing services for ${filePath}]`;
						return placeholder;
					}

					const referencePart = new VybeChatReferencePart(
						referenceContent,
						this.instantiationService,
						modelService,
						languageService,
						clipboardService,
						this.editorService,
						this.workspaceContextService
					);

					// Track for disposal and reuse
					this.referenceParts.push(referencePart);
					this.referenceMap.set(this.codeBlockIndex, referencePart);
					this._register(referencePart);
					this.codeBlockIndex++;

					// Return the DOM node
					return referencePart.domNode;
				}

				// Regular code block handling
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
		if (result?.element) {
			this.markdownContainer.appendChild(result.element);
			// Make inline code with file paths clickable
			this.makeInlineCodeClickable(result.element);
		} else {
			console.error(`[MarkdownPart] renderMarkdown (full): No element to append!`);
		}

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
	 * Renders immediately without animation.
	 */
	updateContent(newContent: IVybeChatMarkdownContent): void {
		const newText = newContent.content || ''; // Ensure content is never undefined
		const isNowStreaming = newContent.isStreaming ?? false;

		// DIAGNOSTIC: Log content when transitioning from streaming to non-streaming
		const justStoppingStream = this.isStreaming && !isNowStreaming;
		if (justStoppingStream) {
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

		// Update state (but NOT currentContent yet - renderMarkdown needs to compare against old value)
		this.targetContent = newText;
		this.isStreaming = isNowStreaming;

		// Cancel any pending animation frame
		if (this.rafId !== null) {
			const targetWindow = this.markdownContainer ? getWindow(this.markdownContainer) : getWindow(undefined);
			targetWindow.cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		// Render immediately (renderMarkdown will update this.currentContent after rendering)
		this.renderMarkdown(newText);

		// Notify parent for scroll handling
		if (this.onStreamingUpdate) {
			this.onStreamingUpdate();
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

	/**
	 * Make inline code elements that look like file paths clickable.
	 * This mimics Cursor's behavior where `filename.ext` in markdown opens the file.
	 */
	private makeInlineCodeClickable(container: HTMLElement): void {
		if (!this.editorService) {
			return; // No editor service, can't open files
		}

		// Find all inline code elements (not in pre - those are code blocks)
		const codeElements = container.querySelectorAll('code:not(pre code)');

		codeElements.forEach((codeEl) => {
			const text = codeEl.textContent?.trim();
			if (!text) {
				return;
			}

			// Check if it looks like a file path
			// Patterns: has extension OR has path separator
			const looksLikeFilePath =
				/\.[a-zA-Z0-9]{1,10}$/.test(text) || // Has file extension
				text.includes('/') || // Unix path separator
				text.includes('\\'); // Windows path separator

			if (!looksLikeFilePath) {
				return;
			}

			// Make it clickable
			const htmlCodeEl = codeEl as HTMLElement;
			htmlCodeEl.style.cursor = 'pointer';
			htmlCodeEl.style.transition = 'color 0.2s ease';
			htmlCodeEl.title = `Click to open ${text}`;

			// Add hover effect
			this._register(addDisposableListener(htmlCodeEl, 'mouseenter', () => {
				htmlCodeEl.style.color = '#3ecf8e'; // VYBE green
			}));

			this._register(addDisposableListener(htmlCodeEl, 'mouseleave', () => {
				htmlCodeEl.style.color = ''; // Reset to default
			}));

			// Add click handler
			this._register(addDisposableListener(htmlCodeEl, 'click', async (e) => {
				e.preventDefault();
				e.stopPropagation();

				try {
					let fileUri: URI;

					// Check if path is absolute
					if (path.isAbsolute(text)) {
						fileUri = URI.file(text);
					} else {
						// Resolve relative path against workspace root
						const workspaceFolder = this.workspaceContextService?.getWorkspace().folders[0];
						if (workspaceFolder) {
							fileUri = URI.joinPath(workspaceFolder.uri, text);
						} else {
							// Fallback: try as-is
							fileUri = URI.file(text);
						}
					}

					console.log(`[MarkdownPart] Opening file from inline code: ${fileUri.fsPath}`);
					await this.editorService!.openEditor({ resource: fileUri });
				} catch (error) {
					console.error(`[MarkdownPart] Failed to open file: ${text}`, error);
				}
			}));
		});
	}
}


