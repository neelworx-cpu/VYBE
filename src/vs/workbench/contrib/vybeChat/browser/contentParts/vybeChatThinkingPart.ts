/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatThinkingContent } from './vybeChatContentPart.js';
import { VybeChatCodeBlockPart } from './vybeChatCodeBlockPart.js';
import * as dom from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

const $ = dom.$;

// Inject keyframes once per page
let thinkingKeyframesInjected = false;
function injectThinkingShineKeyframes(): void {
	if (thinkingKeyframesInjected) {
		return;
	}
	thinkingKeyframesInjected = true;

	const activeWindow = dom.getActiveWindow();
	const style = activeWindow.document.createElement('style');
	style.textContent = `
		@keyframes tool-shine {
			0% { background-position: 200% center; }
			100% { background-position: -200% center; }
		}
	`;
	activeWindow.document.head.appendChild(style);
}

/**
 * Renders collapsible thinking content in AI responses.
 * Shows AI's reasoning process before the final response.
 */
export class VybeChatThinkingPart extends VybeChatContentPart {
	private container: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined; // Loading spinner or chevron
	private contentElement: HTMLElement | undefined; // Now the scrollable container itself
	private thoughtTextElement: HTMLElement | undefined;
	private durationTextElement: HTMLElement | undefined;
	private textContentElement: HTMLElement | undefined; // The actual text div for streaming

	private isExpanded = false;
	private isStreaming = false;
	private currentContent: string = '';
	private targetContent: string = ''; // Full content for streaming towards
	private duration: number = 0;
	private streamingIntervalId: ReturnType<typeof setTimeout> | null = null;
	public onStreamingUpdate?: () => void; // Callback for parent to handle scrolling
	private codeBlockIndex: number = 0;
	private codeBlockParts: VybeChatCodeBlockPart[] = [];
	private codeBlockMap: Map<number, VybeChatCodeBlockPart> = new Map();
	private rafId: number | null = null; // RequestAnimationFrame ID for batching updates

	constructor(
		content: IVybeChatThinkingContent,
		private readonly markdownRendererService?: IMarkdownRendererService,
		private readonly instantiationService?: IInstantiationService
	) {
		super('thinking');
		this.targetContent = Array.isArray(content.value) ? content.value.join('\n\n') : content.value;
		this.currentContent = content.isStreaming ? '' : this.targetContent; // Start empty if streaming
		this.duration = content.duration || 0;
		this.isStreaming = content.isStreaming ?? false;
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	protected createDomNode(): HTMLElement {
		// Inject keyframes animation once per page
		injectThinkingShineKeyframes();

		// Main container - NO horizontal padding (AI response area already has 18px)
		const outerContainer = $('.vybe-chat-thinking-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'thinking',
			style: `
				display: block;
				outline: none;
				padding: 0;
				background-color: var(--vscode-sideBar-background);
				opacity: 1;
				z-index: 99;
			`
		});

		// Transparent wrapper
		const transparentWrapper = $('.vybe-thinking-wrapper', {
			style: 'background-color: transparent;'
		});

		// Markdown think container
		const markdownThink = $('.markdown-jsx markdown-think', {
			style: 'padding: 2px 0px; margin: 0px;'
		});

		// Collapsible container
		const collapsibleContainer = $('.collapsible-clean collapsible-thought', {
			style: `
				display: flex;
				flex-direction: column;
				gap: 2px;
				overflow-anchor: none;
			`
		});

		// Header (clickable)
		this.headerElement = $('.collapsible-header', {
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
		const headerContent = $('.collapsible-header-content', {
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

		// Inner flex container for "Thought" + "for Xs" - apply animation when streaming
		const innerFlexBaseStyle = 'display: flex; align-items: center; overflow: hidden;';
		const innerFlexAnimationStyle = this.isStreaming ? `
			animation: tool-shine 2s linear infinite;
			background-image: linear-gradient(
				90deg,
				rgba(200, 200, 200, 0.6) 0%,
				rgba(200, 200, 200, 0.6) 25%,
				rgba(255, 255, 255, 1) 50%,
				rgba(200, 200, 200, 0.6) 75%,
				rgba(200, 200, 200, 0.6) 100%
			);
			background-size: 200% 100%;
			-webkit-background-clip: text;
			background-clip: text;
		` : '';

		const innerFlex = $('div', {
			style: innerFlexBaseStyle + innerFlexAnimationStyle
		});

		// "Thinking..." or "Thought" text
		this.thoughtTextElement = $('span', {
			style: `
				white-space: nowrap;
				flex-shrink: 0;
				${this.isStreaming ? '-webkit-text-fill-color: transparent;' : 'color: var(--vscode-foreground); opacity: 0.6;'}
			`
		});
		this.thoughtTextElement.textContent = this.isStreaming ? 'Thinking' : 'Thought';

		// Duration text
		this.durationTextElement = $('span', {
			style: `
				margin-left: 4px;
				white-space: nowrap;
				${this.isStreaming ? '-webkit-text-fill-color: transparent;' : 'color: var(--vscode-foreground); opacity: 0.4;'}
			`
		});
		// Minimum display of 1 second - "for 0s" looks wrong
		const displaySeconds = Math.max(1, Math.round(this.duration / 1000));
		this.durationTextElement.textContent = this.duration > 0 ? `for ${displaySeconds}s` : '';

		// Icon: Loading spinner (when streaming) or Chevron (when complete)
		if (this.isStreaming) {
			// Loading spinner with spin animation
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
		} else {
			// Chevron icon (collapsed state) - match Cursor exactly
			this.iconElement = $('div.codicon.codicon-chevron-right.chevron-right', {
				style: `
					color: var(--vscode-foreground);
					line-height: 14px;
					width: 21px;
					height: 14px;
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
					margin-left: 4px;
				`
			});
		}

		// Build header hierarchy with inner flex container
		innerFlex.appendChild(this.thoughtTextElement);
		innerFlex.appendChild(this.durationTextElement);
		textWrapper.appendChild(innerFlex);
		headerText.appendChild(textWrapper);
		headerText.appendChild(this.iconElement);
		headerContent.appendChild(headerText);
		this.headerElement.appendChild(headerContent);

		// Collapsible children (expanded if streaming, collapsed otherwise) - MATCH COPILOT
		const collapsibleChildren = $('.collapsible-clean-children', {
			style: `
				padding-left: 0px;
				overflow-anchor: none;
			`
		});

		// Set display based on streaming state
		if (this.isStreaming) {
			collapsibleChildren.style.display = 'block';
			this.isExpanded = true;
		} else {
			collapsibleChildren.style.display = 'none';
			this.isExpanded = false;
		}

		// SIMPLE SCROLLING APPROACH - Just use CSS overflow (no DomScrollableElement for now)
		const scrollWrapper = $('div', {
			style: 'position: relative;'
		});

		// Scrollable content container with HIDDEN scrollbar (but scrolling still works)
		this.contentElement = $('.think-content-scrollable', {
			style: `
				height: auto;
				max-height: 144px;
				overflow-y: auto;
				overflow-x: hidden;
				white-space: pre-wrap;
				word-break: break-word;
				opacity: 0.6;
				font-size: 12px;
				color: var(--vscode-foreground);
				line-height: 1.4;
				padding: 4px;
				scrollbar-width: none;
			`
		});

		// Markdown container
		const markdownContainer = $('div.anysphere-markdown-container-root', {
			style: 'user-select: text;'
		});

		this.contentElement.appendChild(markdownContainer);
		scrollWrapper.appendChild(this.contentElement);

		collapsibleChildren.appendChild(scrollWrapper);

		// Assemble everything
		collapsibleContainer.appendChild(this.headerElement);
		collapsibleContainer.appendChild(collapsibleChildren);
		markdownThink.appendChild(collapsibleContainer);
		transparentWrapper.appendChild(markdownThink);
		outerContainer.appendChild(transparentWrapper);

		this.container = outerContainer;

		// Render markdown content
		this.renderThinkingContent(markdownContainer);

		// Add click handler for expand/collapse
		this._register(dom.addDisposableListener(this.headerElement, 'click', () => {
			this.toggleExpanded();
		}));

		// Add scroll listener for auto-scroll during streaming
		this._register(dom.addDisposableListener(this.contentElement, 'scroll', () => {
			// User scrolled manually - don't interfere
		}));

		return outerContainer;
	}

	/**
	 * Pre-process thinking content to restrict markdown to minimal elements.
	 * Only allows: paragraphs, inline code, and code blocks (matches Cursor's approach).
	 * Removes everything else: headings, lists, tables, bold/italic, links, etc.
	 */
	private preprocessThinkingContent(content: string): string {
		// First, protect code blocks from being modified (they're allowed)
		// IMPORTANT: Only match COMPLETE code blocks (```...```), not incomplete ones during streaming
		const codeBlockPlaceholders: string[] = [];
		let placeholderIndex = 0;

		// Also track incomplete code blocks (during streaming)
		const incompleteCodeBlockPlaceholders: string[] = [];
		let incompleteIndex = 0;

		// Check for incomplete code block at the end (streaming scenario)
		// Look for ``` that doesn't have a closing ```
		let processed = content;
		const incompleteBlockMatch = processed.match(/```[\w]*\n?[\s\S]*$/);
		if (incompleteBlockMatch) {
			const incompleteBlock = incompleteBlockMatch[0];
			// Check if it's actually incomplete (doesn't contain closing ``` after the opening)
			const closingIndex = incompleteBlock.indexOf('```', 3);
			if (closingIndex === -1) {
				// This is an incomplete code block - protect it
				const placeholder = `__INCOMPLETE_CODE_BLOCK_${incompleteIndex}__`;
				incompleteCodeBlockPlaceholders[incompleteIndex] = incompleteBlock;
				incompleteIndex++;
				// Replace the incomplete block at the end
				processed = processed.replace(/```[\w]*\n?[\s\S]*$/, placeholder);
			}
		}

		// Replace COMPLETE code blocks with placeholders to protect them
		// Use non-greedy match to handle multiple code blocks
		const contentWithPlaceholders = processed.replace(/```[\w]*\n?[\s\S]*?```/g, (match) => {
			const placeholder = `__CODE_BLOCK_PLACEHOLDER_${placeholderIndex}__`;
			codeBlockPlaceholders[placeholderIndex] = match;
			placeholderIndex++;
			return placeholder;
		});

		processed = contentWithPlaceholders;

		// Remove headings (# ## ###) - convert to paragraphs
		processed = processed.replace(/^#{1,6}\s+(.+)$/gm, (match, content) => {
			return content.trim(); // Convert heading to paragraph
		});

		// Remove lists (both unordered - and ordered 1.)
		// Convert list items to paragraphs
		processed = processed.replace(/^[\s]*[-*+]\s+(.+)$/gm, (match, content) => {
			return content.trim(); // Convert list item to paragraph
		});
		processed = processed.replace(/^[\s]*\d+\.\s+(.+)$/gm, (match, content) => {
			return content.trim(); // Convert numbered list item to paragraph
		});

		// Remove task lists (GFM - [ ] and [x])
		processed = processed.replace(/^[\s]*[-*+]\s+\[[ x]\]\s+(.+)$/gm, (match, content) => {
			return content.trim();
		});

		// Remove tables (|...|)
		processed = processed.replace(/^\|.+\|$/gm, '');

		// Remove horizontal rules (---)
		processed = processed.replace(/^---+$/gm, '');

		// Remove blockquotes (>)
		processed = processed.replace(/^>\s*(.+)$/gm, (match, content) => {
			return content.trim(); // Convert blockquote to paragraph
		});

		// Remove bold/italic formatting (**text**, *text*) - keep the text
		// But preserve inline code (`...`) - it's allowed
		// IMPORTANT: Don't match placeholders (they contain underscores)
		// Process bold first (to avoid conflicts)
		// Split by placeholders, process each segment separately
		const segments = processed.split(/(__CODE_BLOCK_PLACEHOLDER_\d+__|__INCOMPLETE_CODE_BLOCK_\d+__)/g);
		const processedSegments = segments.map((segment) => {
			// Skip placeholders - they're already protected
			if (segment.match(/^__(CODE_BLOCK_PLACEHOLDER|INCOMPLETE_CODE_BLOCK)_\d+__$/)) {
				return segment;
			}
			// Process this segment (no placeholders here, so safe to use simple regex)
			let seg = segment;
			seg = seg.replace(/\*\*([^*]+)\*\*/g, '$1'); // Bold
			seg = seg.replace(/\*([^*]+)\*/g, '$1'); // Italic (but not if it's part of bold)
			seg = seg.replace(/__([^_]+)__/g, '$1'); // Bold (underscore)
			seg = seg.replace(/_([^_]+)_/g, '$1'); // Italic (underscore)
			return seg;
		});
		processed = processedSegments.join('');

		// Remove links [text](url) - keep the text
		processed = processed.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

		// Remove images ![alt](url)
		processed = processed.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

		// Remove strikethrough (~~text~~)
		processed = processed.replace(/~~([^~]+)~~/g, '$1');

		// Restore incomplete code blocks first (they're at the end)
		for (let i = incompleteCodeBlockPlaceholders.length - 1; i >= 0; i--) {
			const placeholder = `__INCOMPLETE_CODE_BLOCK_${i}__`;
			processed = processed.replace(placeholder, incompleteCodeBlockPlaceholders[i]);
		}

		// Restore complete code blocks (they're allowed)
		for (let i = codeBlockPlaceholders.length - 1; i >= 0; i--) {
			const placeholder = `__CODE_BLOCK_PLACEHOLDER_${i}__`;
			processed = processed.replace(placeholder, codeBlockPlaceholders[i]);
		}

		// Clean up multiple consecutive blank lines (max 2)
		processed = processed.replace(/\n{3,}/g, '\n\n');

		return processed.trim();
	}

	/**
	 * Render thinking content as MARKDOWN with restrictions (paragraphs, inline code, code blocks only).
	 */
	private renderThinkingContent(container: HTMLElement): void {
		if (!this.markdownRendererService || !this.instantiationService) {
			// Fallback to plain text if markdown renderer not available
			this.renderPlainText(container);
			return;
		}

		// Pre-process content to restrict markdown elements
		const processedContent = this.preprocessThinkingContent(this.currentContent || '');

		// Render markdown
		this.renderMarkdown(container, processedContent);

		// AUTO-SCROLL to bottom during streaming
		if (this.isStreaming && this.contentElement) {
			setTimeout(() => {
				if (this.contentElement && this.contentElement.scrollHeight > this.contentElement.clientHeight) {
					this.contentElement.scrollTop = this.contentElement.scrollHeight;
				}
			}, 50);
		}
	}

	/**
	 * Fallback: Render as plain text if markdown renderer not available.
	 */
	private renderPlainText(container: HTMLElement): void {
		// Clear existing
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		// Render as plain text
		this.textContentElement = $('div', {
			style: `
				white-space: pre-wrap;
				word-break: break-word;
				line-height: 1.4;
			`
		});
		this.textContentElement.textContent = this.currentContent;
		container.appendChild(this.textContentElement);
	}

	/**
	 * Render markdown content using VS Code's markdown renderer.
	 * Only allows: paragraphs, inline code, and code blocks.
	 */
	private renderMarkdown(container: HTMLElement, content: string): void {
		if (!this.markdownRendererService || !this.instantiationService) {
			return;
		}

		// Extract code blocks from processed content for reuse
		const newCodeBlocks = this.extractCodeBlocks(content);

		// Update code blocks directly if structure matches (prevents flicker)
		const codeBlocksUpdated = this.updateCodeBlocksDirectly(newCodeBlocks);

		// Clear existing content (this removes code block DOM nodes, but we'll reuse them)
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		// Only clear code blocks if structure changed
		if (!codeBlocksUpdated) {
			this.codeBlockParts.forEach(part => part.dispose());
			this.codeBlockParts = [];
			this.codeBlockMap.clear();
		}
		this.codeBlockIndex = 0;

		const markdownString = new MarkdownString(content, {
			isTrusted: true,
			supportThemeIcons: true,
			supportHtml: false
		});

		// Capture services in local variables for the callback
		const instantiationService = this.instantiationService;
		if (!instantiationService) {
			return;
		}

		// Render using VS Code's markdown renderer service
		// Supports: paragraphs, inline code, code blocks, bold, italic, lists (ul/ol), tables
		const result = this.markdownRendererService.render(markdownString, {
			fillInIncompleteTokens: this.isStreaming, // Handle incomplete markdown during streaming
			markedOptions: {
				gfm: true, // Enable GitHub Flavored Markdown for lists, tables, etc.
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

				// Create a new code block part with Monaco editor (smaller/faded for thinking)
				const codeBlockPart = instantiationService.createInstance(
					VybeChatCodeBlockPart,
					{
						kind: 'codeBlock' as const,
						code: code,
						language: languageId || 'plaintext'
					},
					this.codeBlockIndex
				);

				// Apply thinking-specific styling (faded/miniaturized)
				if (codeBlockPart.domNode) {
					codeBlockPart.domNode.style.opacity = '0.7'; // Faded appearance
					codeBlockPart.domNode.style.transform = 'scale(0.95)'; // Slightly smaller
					codeBlockPart.domNode.style.transformOrigin = 'top left';
				}

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
		container.appendChild(result.element);

		// Post-process: Remove empty paragraphs created by LLM blank lines
		this.removeEmptyParagraphs(container);

		// Register disposables
		this._register(result);
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
	 * This prevents flickering by updating code blocks in-place before re-rendering.
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
	 * Remove empty or whitespace-only paragraphs that create unwanted gaps.
	 * LLMs often output extra blank lines which get rendered as empty <p> elements.
	 */
	private removeEmptyParagraphs(container: HTMLElement): void {
		// Find all paragraphs in the rendered markdown
		const paragraphs = container.querySelectorAll('p');
		for (const p of paragraphs) {
			const text = p.textContent?.trim() || '';

			// Remove if empty or only contains whitespace/line breaks
			if (text === '' || text === '\n' || text === '\r\n' || text.length === 0) {
				p.remove();
				continue;
			}

			// Also remove paragraphs that only contain <br> tags (common from markdown blank lines)
			const children = p.childNodes;
			let onlyBrTags = true;
			for (let i = 0; i < children.length; i++) {
				const node = children[i];
				if (node.nodeType === Node.TEXT_NODE) {
					// Check if text node is empty or only whitespace
					if (node.textContent?.trim() !== '') {
						onlyBrTags = false;
						break;
					}
				} else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'BR') {
					// Not a <br> tag, so this paragraph has real content
					onlyBrTags = false;
					break;
				}
			}

			if (onlyBrTags && children.length > 0) {
				p.remove();
			}
		}
	}

	/**
	 * Toggle expanded/collapsed state.
	 * Only works when not streaming (loading spinner doesn't toggle).
	 */
	private toggleExpanded(): void {
		// Don't allow toggle while streaming
		if (this.isStreaming) {
			return;
		}

		this.isExpanded = !this.isExpanded;

		// Find collapsible children
		const children = this.container?.querySelector('.collapsible-clean-children') as HTMLElement;
		if (!children) {
			return;
		}

		if (this.isExpanded) {
			// Expand
			children.style.display = 'block';
			if (this.iconElement && this.iconElement.classList.contains('codicon-chevron-right')) {
				this.iconElement.style.transform = 'rotate(90deg)';
			}
		} else {
			// Collapse
			children.style.display = 'none';
			if (this.iconElement && this.iconElement.classList.contains('codicon-chevron-right')) {
				this.iconElement.style.transform = 'rotate(0deg)';
			}
		}
	}

	/**
	 * Update thinking content when streaming.
	 * Handles transition from streaming → complete state.
	 */
	updateContent(newContent: IVybeChatThinkingContent): void {
		const newText = Array.isArray(newContent.value) ? newContent.value.join('\n\n') : newContent.value;
		const wasStreaming = this.isStreaming;
		const isNowStreaming = newContent.isStreaming ?? false;

		// CRITICAL: Only update if content actually changed
		const contentChanged = this.targetContent !== newText;

		// Update state
		this.targetContent = newText;
		this.currentContent = newText;
		this.duration = newContent.duration || this.duration;
		this.isStreaming = isNowStreaming;

		// Stop any existing animation
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		// Render immediately if content changed
		if (contentChanged || isNowStreaming) {
			const markdownContainer = this.contentElement?.querySelector('.anysphere-markdown-container-root');
			if (markdownContainer) {
				this.renderThinkingContent(markdownContainer as HTMLElement);
			}
		}

		// Update text: "Thinking..." → "Thought"
		if (this.thoughtTextElement) {
			this.thoughtTextElement.textContent = this.isStreaming ? 'Thinking' : 'Thought';
		}

		// Update duration text (minimum 1 second display)
		if (this.durationTextElement && this.duration > 0) {
			const displaySeconds = Math.max(1, Math.round(this.duration / 1000));
			this.durationTextElement.textContent = `for ${displaySeconds}s`;
		}

		// Update animation on inner flex container (flows across "Thought" + "for Xs")
		const innerFlex = this.thoughtTextElement?.parentElement as HTMLElement;
		if (innerFlex) {
			const baseContainerStyle = 'display: flex; align-items: center; overflow: hidden;';
			if (this.isStreaming) {
				// Streaming - apply shine animation to container
				innerFlex.setAttribute('style', baseContainerStyle + `
					animation: tool-shine 2s linear infinite;
					background-image: linear-gradient(
						90deg,
						rgba(200, 200, 200, 0.6) 0%,
						rgba(200, 200, 200, 0.6) 25%,
						rgba(255, 255, 255, 1) 50%,
						rgba(200, 200, 200, 0.6) 75%,
						rgba(200, 200, 200, 0.6) 100%
					);
					background-size: 200% 100%;
					-webkit-background-clip: text;
					background-clip: text;
				`);
				// Update text colors to transparent (shows gradient from parent)
				if (this.thoughtTextElement) {
					this.thoughtTextElement.style.webkitTextFillColor = 'transparent';
					this.thoughtTextElement.style.color = '';
					this.thoughtTextElement.style.opacity = '';
				}
				if (this.durationTextElement) {
					this.durationTextElement.style.webkitTextFillColor = 'transparent';
					this.durationTextElement.style.color = '';
					this.durationTextElement.style.opacity = '';
				}
			} else {
				// Complete - remove animation from container
				innerFlex.setAttribute('style', baseContainerStyle);
				// Update text colors to static
				if (this.thoughtTextElement) {
					this.thoughtTextElement.style.webkitTextFillColor = '';
					this.thoughtTextElement.style.color = 'var(--vscode-foreground)';
					this.thoughtTextElement.style.opacity = '0.6';
				}
				if (this.durationTextElement) {
					this.durationTextElement.style.webkitTextFillColor = '';
					this.durationTextElement.style.color = 'var(--vscode-foreground)';
					this.durationTextElement.style.opacity = '0.4';
				}
			}
		}

		// Handle streaming → complete transition (loading spinner → chevron)
		if (wasStreaming && !isNowStreaming && this.iconElement) {
			// Replace loading spinner with chevron - match Cursor exactly
			const newChevron = $('div.codicon.codicon-chevron-right.chevron-right', {
				style: `
					color: var(--vscode-foreground);
					line-height: 14px;
					width: 21px;
					height: 14px;
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
					margin-left: 4px;
				`
			});

			// Replace in DOM
			this.iconElement.replaceWith(newChevron);
			this.iconElement = newChevron;

			// Collapse the thinking block automatically when streaming completes
			const children = this.container?.querySelector('.collapsible-clean-children') as HTMLElement;
			if (children) {
				children.style.display = 'none';
				this.isExpanded = false;
			}
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'thinking') {
			return false;
		}
		return (other as VybeChatThinkingPart).targetContent === this.targetContent;
	}

	override dispose(): void {
		// Clean up streaming interval
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		// Clean up requestAnimationFrame
		if (this.rafId !== null) {
			const activeWindow = dom.getActiveWindow();
			activeWindow.cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// Clean up code blocks
		this.codeBlockParts.forEach(part => part.dispose());
		this.codeBlockParts = [];
		this.codeBlockMap.clear();

		super.dispose();
		this.container = undefined;
		this.headerElement = undefined;
		this.iconElement = undefined;
		this.contentElement = undefined;
		this.thoughtTextElement = undefined;
		this.durationTextElement = undefined;
		this.textContentElement = undefined;
	}
}
