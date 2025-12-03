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
	private codeBlockIndex: number = 0;
	private codeBlockParts: VybeChatCodeBlockPart[] = [];

	constructor(
		content: IVybeChatMarkdownContent,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly instantiationService: IInstantiationService
	) {
		super('markdown');
		this.currentContent = content.content;
	}

	protected createDomNode(): HTMLElement {
		// Main container with horizontal padding only (no vertical padding)
		const outerContainer = $('.vybe-chat-markdown-response', {
			'data-message-role': 'ai',
			'data-message-kind': 'assistant',
			'tabindex': '0',
			style: `
				display: block;
				outline: none;
				padding: 0 6px;
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

		// Inner padding wrapper (matches: padding: 0px 2px)
		const innerPadding = $('.vybe-chat-markdown-inner', {
			style: 'padding: 0px 2px;'
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
	 * Update content when streaming new data.
	 */
	updateContent(newContent: IVybeChatMarkdownContent): void {
		if (this.currentContent === newContent.content) {
			return; // No change
		}

		this.currentContent = newContent.content;
		this.renderMarkdown(this.currentContent);
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'markdown') {
			return false;
		}
		return (other as VybeChatMarkdownPart).currentContent === this.currentContent;
	}

	override dispose(): void {
		super.dispose();
		this.markdownContainer = undefined;
	}
}

