/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatThinkingContent } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

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

	constructor(
		content: IVybeChatThinkingContent
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

		// Inner text container
		const textInner = $('div', {
			style: 'display: flex; align-items: center; overflow: hidden;'
		});

		// "Thinking..." or "Thought" text
		this.thoughtTextElement = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.6;
				white-space: nowrap;
				flex-shrink: 0;
			`
		});
		this.thoughtTextElement.textContent = this.isStreaming ? 'Thinking' : 'Thought';

		// Duration text
		this.durationTextElement = $('span', {
			style: `
				color: var(--vscode-foreground);
				opacity: 0.4;
				margin-left: 4px;
				white-space: nowrap;
			`
		});
		this.durationTextElement.textContent = this.duration > 0 ? `for ${Math.round(this.duration / 1000)}s` : '';

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
			// Chevron icon (collapsed state)
			this.iconElement = $('div.codicon.codicon-chevron-right.chevron-right', {
				style: `
					color: var(--vscode-foreground);
					line-height: 12px;
					width: 12px;
					height: 12px;
					display: flex;
					justify-content: center;
					align-items: center;
					transform-origin: 50% 50%;
					transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out, color 0.1s ease-in;
					flex-shrink: 0;
					cursor: pointer;
					opacity: 0.55;
					transform: rotate(0deg);
					font-size: 12px;
					margin-left: 4px;
				`
			});
		}

		// Build header hierarchy
		textInner.appendChild(this.thoughtTextElement);
		textInner.appendChild(this.durationTextElement);
		textWrapper.appendChild(textInner);
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
	 * Render thinking content as PLAIN TEXT with streaming animation.
	 */
	private renderThinkingContent(container: HTMLElement): void {
		// Clear existing
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		// Render as plain text (inherit color from parent)
		this.textContentElement = $('div', {
			style: `
				white-space: pre-wrap;
				word-break: break-word;
				line-height: 1.4;
			`
		});
		this.textContentElement.textContent = this.currentContent;
		container.appendChild(this.textContentElement);

		// Start streaming animation if streaming
		if (this.isStreaming && this.targetContent && this.targetContent !== this.currentContent) {
			this.startStreamingAnimation();
		}

		// AUTO-SCROLL to bottom during streaming (simple CSS scrolling)
		if (this.isStreaming && this.contentElement) {
			setTimeout(() => {
				if (this.contentElement && this.contentElement.scrollHeight > this.contentElement.clientHeight) {
					this.contentElement.scrollTop = this.contentElement.scrollHeight;
				}
			}, 50);
		}
	}

	/**
	 * Stream thinking content character by character (legible speed).
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

			// Update text display
			if (this.textContentElement) {
				this.textContentElement.textContent = this.currentContent;
			}

			// Auto-scroll to bottom (internal)
			if (this.contentElement && this.contentElement.scrollHeight > this.contentElement.clientHeight) {
				this.contentElement.scrollTop = this.contentElement.scrollHeight;
			}

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
		this.targetContent = newText; // Target for streaming
		this.duration = newContent.duration || this.duration;
		this.isStreaming = isNowStreaming;

		// If streaming, animate towards target; if complete, show all at once
		if (!isNowStreaming) {
			this.currentContent = newText; // Show complete text immediately
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}
		}

		// Re-render content ONLY if it changed
		if (contentChanged) {
			const markdownContainer = this.contentElement?.querySelector('.anysphere-markdown-container-root');
			if (markdownContainer) {
				this.renderThinkingContent(markdownContainer as HTMLElement);
			}
		}

		// Update text: "Thinking..." → "Thought"
		if (this.thoughtTextElement) {
			this.thoughtTextElement.textContent = this.isStreaming ? 'Thinking' : 'Thought';
		}

		// Update duration text
		if (this.durationTextElement && this.duration > 0) {
			this.durationTextElement.textContent = `for ${Math.round(this.duration / 1000)}s`;
		}

		// Handle streaming → complete transition (loading spinner → chevron)
		if (wasStreaming && !isNowStreaming && this.iconElement) {
			// Replace loading spinner with chevron
			const newChevron = $('div.codicon.codicon-chevron-right.chevron-right', {
				style: `
					color: var(--vscode-foreground);
					line-height: 12px;
					width: 12px;
					height: 12px;
					display: flex;
					justify-content: center;
					align-items: center;
					transform-origin: 50% 50%;
					transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out, color 0.1s ease-in;
					flex-shrink: 0;
					cursor: pointer;
					opacity: 0.55;
					transform: rotate(0deg);
					font-size: 12px;
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
