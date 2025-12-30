/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatPlanDocumentContent, IVybeChatContentPart } from './vybeChatContentPart.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ModelDropdown, ModelDropdownState } from '../components/composer/modelDropdown.js';
import { IVybeLLMModelService } from '../../../vybeLLM/common/vybeLLMModelService.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { VybeChatCodeBlockPart } from './vybeChatCodeBlockPart.js';
import * as dom from '../../../../../base/browser/dom.js';

/**
 * Plan Document Content Part
 * Displays AI-generated plan documents with expand/collapse, model selection, and build functionality.
 */
export class VybeChatPlanDocumentPart extends VybeChatContentPart {
	private partId?: string;
	private filename: string;
	private title: string;
	private summary: string;
	private content: string;
	private targetContent: string = ''; // Full content for streaming towards
	private currentContent: string = ''; // Current content being displayed
	private isStreaming: boolean;
	private modelState: ModelDropdownState;
	private codeBlockIndex: number = 0;
	private codeBlockParts: VybeChatCodeBlockPart[] = [];
	private streamingIntervalId: ReturnType<typeof setTimeout> | null = null;
	public onStreamingUpdate?: () => void; // Callback for parent to handle scrolling

	private container: HTMLElement;
	private headerElement: HTMLElement | null = null;
	private headerSeparator: HTMLElement | null = null;
	private contentArea: HTMLElement | null = null;
	private markdownResult: { dispose: () => void } | null = null; // Reference to markdown render result for disposal
	private controlRow: HTMLElement | null = null;
	private leftControls: HTMLElement | null = null;
	private rightControls: HTMLElement | null = null;
	private modelDropdown: ModelDropdown | null = null;
	private modelDropdownButton: HTMLElement | null = null;
	private buildButton: HTMLElement | null = null;
	private exportButton: HTMLElement | null = null;
	private iconElement: HTMLElement | null = null;
	private loadingSpinner: HTMLElement | null = null;

	constructor(
		content: IVybeChatPlanDocumentContent,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly markdownRendererService?: IMarkdownRendererService
	) {
		super('planDocument');
		this.partId = content.id;
		this.filename = content.filename;
		this.title = content.title;
		this.summary = content.summary;
		// Strip title from content BEFORE storing it, so streaming never includes the title
		const contentWithoutTitle = this.stripTitleFromMarkdown(content.content);
		this.targetContent = contentWithoutTitle;
		this.isStreaming = content.isStreaming ?? false;
		// During streaming, always start collapsed showing summary
		this.currentContent = this.isStreaming ? '' : contentWithoutTitle;
		this.content = this.currentContent;
		this.modelState = content.modelState || {
			isAutoEnabled: true,
			isMaxModeEnabled: false,
			selectedModelId: 'composer-1'
		};
		this.container = this.createDomNode();

		// Start streaming if needed (delay to ensure DOM is ready)
		if (this.isStreaming && this.targetContent) {
			// Header separator always visible
			if (this.headerSeparator) {
				this.headerSeparator.style.display = 'block';
			}

			// Ensure content area is created - this creates the structure (title + text container)
			this.updateContentArea();

			setTimeout(() => {
				if (this.isStreaming) {
					// Check if we have target content
					if (!this.targetContent || this.targetContent.length === 0) {
						console.warn('[VYBE Plan] Cannot start streaming: targetContent is empty');
						// If no target content, just show empty state
						return;
					}
					// Start streaming animation - it will update the content as it streams
					this.startStreamingAnimation();
				}
			}, 150);
		}
	}

	protected createDomNode(): HTMLElement {
		// Outer container (matches text edit structure)
		const outerContainer = $('.markdown-code-outer-container');
		outerContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			position: relative;
		`;

		// Width/height wrapper
		const wrapper = $('div');
		wrapper.style.cssText = 'height: 100%; width: 100%;';

		// Main container (add text-edit-block class so CSS applies)
		const planContainer = $('.composer-code-block-container');
		planContainer.classList.add('text-edit-block');
		planContainer.style.position = 'relative';

		// Header (exact copy from text edit)
		this.headerElement = this.createHeader();
		planContainer.appendChild(this.headerElement);

		// Header separator (1px line)
		this.headerSeparator = $('div');
		this.headerSeparator.style.height = '1px';
		this.headerSeparator.style.background = 'var(--cursor-stroke-secondary)';
		this.headerSeparator.style.width = '100%';
		// Header separator always visible
		this.headerSeparator.style.display = 'block';
		planContainer.appendChild(this.headerSeparator);

		// Content area
		this.contentArea = this.createContentArea();
		planContainer.appendChild(this.contentArea);

		// Control row (exact copy from terminal)
		this.controlRow = this.createControlRow();
		planContainer.appendChild(this.controlRow);

		wrapper.appendChild(planContainer);
		outerContainer.appendChild(wrapper);

		// Store ID on container for tracking
		if (this.partId) {
			outerContainer.setAttribute('data-part-id', this.partId);
		}

		return outerContainer;
	}

	private createHeader(): HTMLElement {
		// Exact copy from text edit header
		const header = $('.composer-code-block-header');
		// Ensure flex layout (CSS should handle this, but adding for safety)
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';

		// File info (styling in CSS)
		const fileInfo = $('.composer-code-block-file-info');
		// Ensure flex layout
		fileInfo.style.display = 'flex';
		fileInfo.style.alignItems = 'center';
		fileInfo.style.flex = '1';
		fileInfo.style.minWidth = '0';

		// Icon container - show loading spinner during streaming, checklist icon otherwise
		const iconSpan = $('span.composer-primary-toolcall-icon');
		const iconWrapper = $('.show-file-icons');
		const iconContainer = $('div');
		iconContainer.style.cssText = 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;';

		if (this.isStreaming) {
			// Loading spinner during streaming
			this.loadingSpinner = $('span.codicon.codicon-loading.codicon-modifier-spin');
			this.loadingSpinner.style.cssText = 'font-size: 16px; color: var(--vscode-foreground); opacity: 0.7;';
			iconContainer.appendChild(this.loadingSpinner);
		} else {
			// Checklist icon when not streaming
			this.iconElement = $('span.codicon.codicon-checklist');
			this.iconElement.style.cssText = 'font-size: 16px; color: var(--vscode-foreground); opacity: 0.8;';
			iconContainer.appendChild(this.iconElement);
		}

		iconWrapper.appendChild(iconContainer);
		iconSpan.appendChild(iconWrapper);

		// Filename (direction and styling in CSS) - EXACT copy from text edit
		const filenameSpan = $('span.composer-code-block-filename');
		const filenameBidi = $('span');
		filenameBidi.textContent = this.filename;
		filenameSpan.appendChild(filenameBidi);

		// Empty stats span
		const statsSpan = $('span.composer-code-block-status');

		// Empty status span
		const statusSpan = $('span.composer-code-block-status');

		// Actions container wrapper (exact copy from text edit)
		const actionsOuterWrapper = $('div');
		const actionsContainer = $('div');
		actionsContainer.style.cssText = 'overflow: hidden; display: flex; justify-content: flex-end; align-items: center; position: relative;';
		const actionsInner = $('div');
		actionsInner.style.cssText = 'display: flex; justify-content: flex-end; justify-self: flex-end; flex-shrink: 0; position: relative; align-items: center;';

		// 4 hidden button slots (for future buttons)
		for (let i = 0; i < 4; i++) {
			const button = $('div');
			button.style.cssText = 'flex-shrink: 0; height: 0; width: 0; transition: opacity 0.1s ease-in-out; opacity: 0; pointer-events: none;';
			actionsInner.appendChild(button);
		}

		// Export button (download icon) - only visible after streaming completes
		this.exportButton = this.createIconButton('codicon-download', 'Export plan', true);
		this.exportButton.style.display = this.isStreaming ? 'none' : 'flex';
		this._register(dom.addDisposableListener(this.exportButton, 'click', (e) => {
			e.stopPropagation();
			this.handleExport();
		}));
		actionsInner.appendChild(this.exportButton);

		// No expand button - always show full content

		actionsContainer.appendChild(actionsInner);
		actionsOuterWrapper.appendChild(actionsContainer);

		// Assemble header
		fileInfo.appendChild(iconSpan);
		fileInfo.appendChild(filenameSpan);
		fileInfo.appendChild(statsSpan);
		fileInfo.appendChild(statusSpan);

		header.appendChild(fileInfo);
		header.appendChild(actionsOuterWrapper);

		// No hover effect - icon stays visible, only the expander button on the right toggles
		// Header itself is NOT clickable - only the expander button

		return header;
	}

	private createIconButton(iconClass: string, tooltip: string, alwaysVisible: boolean = false): HTMLElement {
		const button = $('div.anysphere-icon-button');
		// Use explicit style properties to ensure visibility
		button.style.background = 'transparent';
		button.style.border = 'none';
		button.style.color = 'var(--cursor-text-primary)';
		button.style.display = 'flex';
		button.style.width = '20px';
		button.style.height = '20px';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.cursor = 'pointer';
		button.style.opacity = alwaysVisible ? '1' : '0.6';
		button.style.transition = 'opacity 0.15s ease';
		button.style.visibility = 'visible';
		button.style.pointerEvents = 'auto';
		button.title = tooltip;

		// Use the same pattern as terminal part for codicon
		const icon = $(`span.codicon.${iconClass}`);
		icon.style.cssText = 'font-size: 13px; display: inline-block; visibility: visible; opacity: 1;';
		button.appendChild(icon);

		// Hover effect (only if not always visible)
		if (!alwaysVisible) {
			this._register(addDisposableListener(button, 'mouseenter', () => {
				button.style.opacity = '1';
			}));

			this._register(addDisposableListener(button, 'mouseleave', () => {
				button.style.opacity = '0.6';
			}));
		}

		return button;
	}

	private createContentArea(): HTMLElement {
		const contentArea = $('.composer-code-block-content');
		contentArea.style.display = 'block'; // Always show full content

		// Use consistent padding for both modes: 0 10px
		const planContent = $('div.composer-create-plan-content');
		planContent.style.cssText = 'padding: 0 10px; user-select: text;';

		// Title - 8px top and bottom padding only
		const titleElement = $('div.composer-create-plan-title');
		titleElement.style.cssText = 'color: var(--vscode-foreground); font-size: 18px; font-weight: 600; line-height: 24px; padding: 8px 0;';
		titleElement.textContent = this.title;
		planContent.appendChild(titleElement);

		// Text container (used for both summary and full content)
		const textContainer = $('div.composer-create-plan-text');
		textContainer.style.cssText = 'user-select: text; font-size: 13px; line-height: 20.8px; color: var(--vscode-foreground); margin: 0; padding: 0;';
		planContent.appendChild(textContainer);

		// Initial content will be set by updateContentArea

		contentArea.appendChild(planContent);

		return contentArea;
	}

	private createControlRow(): HTMLElement {
		// Use same background as header (composer-code-block-header class)
		const row = $('.composer-code-block-header');
		row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px 4px 8px;';

		// Hide control row during streaming
		if (this.isStreaming) {
			row.style.display = 'none';
		}

		// Left side - empty (model dropdown moved to right)
		this.leftControls = $('div');
		this.leftControls.style.cssText = 'flex: 1;';

		// Right side - model dropdown + build button
		this.rightControls = $('div');
		this.rightControls.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

		this.modelDropdownButton = this.createModelDropdownButton();
		this.rightControls.appendChild(this.modelDropdownButton);

		this.buildButton = this.createBuildButton();
		this.rightControls.appendChild(this.buildButton);

		row.appendChild(this.leftControls);
		row.appendChild(this.rightControls);

		return row;
	}

	private createModelDropdownButton(): HTMLElement {
		const button = $('div.composer-unified-dropdown-model', {
			style: `
				display: flex;
				gap: 2px;
				font-size: 12px;
				align-items: center;
				line-height: 12px;
				cursor: pointer;
				min-width: 0px;
				max-width: 100%;
				padding: 2px 6px;
				border-radius: 23px;
				border: none;
				background: transparent;
				flex-shrink: 1;
				overflow: hidden;
			`
		});

		const content = $('div', {
			style: `
				display: flex;
				align-items: center;
				color: var(--vscode-foreground);
				gap: 2px;
				min-width: 0px;
				max-width: 100%;
				overflow: hidden;
				flex-shrink: 1;
				flex-grow: 1;
			`
		});

		const label = $('div', {
			style: `
				min-width: 0px;
				text-overflow: ellipsis;
				vertical-align: middle;
				white-space: nowrap;
				line-height: 12px;
				color: var(--vscode-input-foreground);
				display: flex;
				align-items: center;
				gap: 4px;
				overflow: hidden;
				height: 16px;
				flex-shrink: 1;
				flex-grow: 1;
			`
		});

		const labelText = $('div', {
			style: `
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				max-width: 100%;
				min-width: 0px;
				display: flex;
				align-items: baseline;
				gap: 4px;
			`
		});

		const modelLabel = $('span');
		modelLabel.textContent = this.modelState.isAutoEnabled ? 'Auto' : this.getModelLabel(this.modelState.selectedModelId);
		modelLabel.style.cssText = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: normal; max-width: 100%; flex: 1 1 auto; min-width: 0px;';

		labelText.appendChild(modelLabel);
		label.appendChild(labelText);
		content.appendChild(label);

		const chevron = $('span.codicon.codicon-chevron-down', {
			style: 'font-size: 14px; flex-shrink: 0; color: var(--vscode-foreground);'
		});
		content.appendChild(chevron);

		button.appendChild(content);

		// Create model dropdown
		// Get model service from instantiation service if available
		let modelService: IVybeLLMModelService | undefined;
		try {
			// Use invokeFunction to access the service via accessor pattern
			modelService = this.instantiationService.invokeFunction((accessor) => {
				try {
					return accessor.get(IVybeLLMModelService);
				} catch {
					return undefined;
				}
			});
		} catch {
			// Service not available - continue without it
			modelService = undefined;
		}
		this.modelDropdown = this._register(new ModelDropdown(button, modelService));
		this._register(this.modelDropdown.onStateChange((newState: ModelDropdownState) => {
			this.modelState = newState;
			modelLabel.textContent = newState.isAutoEnabled ? 'Auto' : this.getModelLabel(newState.selectedModelId);
		}));

		this._register(dom.addDisposableListener(button, 'click', async (e) => {
			e.stopPropagation();
			// Open downward, right-aligned (right edge of dropdown aligns with right edge of button)
			await this.modelDropdown?.show(this.modelState, true, true);
		}));

		return button;
	}

	private createBuildButton(): HTMLElement {
		// Exact copy from terminal run button
		const button = $('.anysphere-button.composer-run-button');
		button.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			line-height: 16px;
			min-height: 20px;
			background: #3ecf8e;
			color: white;
			border: none;
		`;
		const buttonText = $('span');
		buttonText.textContent = 'Build';
		const keybinding = $('span.keybinding-font-settings');
		keybinding.textContent = ' ⌘⏎';
		keybinding.style.cssText = 'font-size: 10px; opacity: 0.5; margin-left: 2px;';

		button.appendChild(buttonText);
		button.appendChild(keybinding);

		this._register(dom.addDisposableListener(button, 'click', () => {
			this.handleBuild();
		}));

		// Hover effects
		this._register(dom.addDisposableListener(button, 'mouseenter', () => {
			button.style.background = 'color-mix(in srgb, #3ecf8e 80%, black)';
		}));
		this._register(dom.addDisposableListener(button, 'mouseleave', () => {
			button.style.background = '#3ecf8e';
		}));

		return button;
	}

	// No toggle expansion - always show full content

	private updateContentArea(): void {
		if (!this.contentArea) {
			console.warn('[VYBE Plan] updateContentArea: contentArea is null');
			return;
		}

		// Check if structure already exists
		// eslint-disable-next-line no-restricted-syntax
		let planContent = this.contentArea.querySelector('.composer-create-plan-content') as HTMLElement;
		// eslint-disable-next-line no-restricted-syntax
		let titleElement = planContent?.querySelector('.composer-create-plan-title') as HTMLElement;
		// eslint-disable-next-line no-restricted-syntax
		let summaryContainer = planContent?.querySelector('.composer-create-plan-text') as HTMLElement;

		if (!planContent) {
			// First time: create structure
			// Clear existing content using DOM manipulation
			while (this.contentArea.firstChild) {
				this.contentArea.removeChild(this.contentArea.firstChild);
			}

			// Use consistent padding for both modes: 0 10px
			planContent = $('div.composer-create-plan-content');
			planContent.style.cssText = 'padding: 0 10px; user-select: text;';

			// Title - match computed CSS: padding-top: 8px, margin-bottom: 8px
			titleElement = $('div.composer-create-plan-title');
			titleElement.style.cssText = 'color: var(--vscode-foreground); font-size: 16px; font-weight: 600; line-height: 18.2px; padding-top: 8px; padding-bottom: 0; margin: 0 0 8px 0;';
			titleElement.textContent = this.title;
			planContent.appendChild(titleElement);

			// Text container (used for full content)
			// Match computed CSS: font-size: 13px, line-height: 20.8px, no padding/margin
			// Add word-wrap to prevent content from going beyond borders
			summaryContainer = $('div.composer-create-plan-text');
			summaryContainer.style.cssText = 'user-select: text; font-size: 13px; line-height: 20.8px; color: var(--vscode-foreground); margin: 0; padding: 0; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%;';
			planContent.appendChild(summaryContainer);

			this.contentArea.appendChild(planContent);
		} else {
			// Structure exists: just update title if needed
			if (titleElement && titleElement.textContent !== this.title) {
				titleElement.textContent = this.title;
			}
			// Get reference to existing text container
			// eslint-disable-next-line no-restricted-syntax
			summaryContainer = planContent.querySelector('.composer-create-plan-text') as HTMLElement;
		}

		// Update text container content - always show full content
		if (summaryContainer) {
			// Always show the container - explicitly set visibility
			summaryContainer.style.display = 'block';
			summaryContainer.style.visibility = 'visible';
			summaryContainer.style.margin = '0';
			summaryContainer.style.padding = '0';
			summaryContainer.style.height = 'auto';
			summaryContainer.style.overflow = 'visible';
			summaryContainer.style.minHeight = '20px'; // Ensure it has minimum height

			// Always render content - during streaming, show what we have so far
			// When not streaming, show final content
			// Clear existing content first (but only if we have new content to show)
			// During streaming, we update frequently so clearing is necessary
			while (summaryContainer.firstChild) {
				summaryContainer.removeChild(summaryContainer.firstChild);
			}

			// Render content (streaming or not)
			// CRITICAL: Always render something - never leave container empty
			// Always render as markdown during streaming - the markdown renderer handles partial content gracefully
			if (this.currentContent && this.currentContent.trim()) {
				if (!this.markdownRendererService) {
					// No markdown renderer available - use plain text
					while (summaryContainer.firstChild) {
						summaryContainer.removeChild(summaryContainer.firstChild);
					}
					const textSpan = $('span', {
						style: 'user-select: text; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 20.8px; color: var(--vscode-foreground); display: block;'
					});
					textSpan.textContent = this.currentContent;
					summaryContainer.appendChild(textSpan);
				} else {
					try {
						// Always render as markdown - re-render on each update like chat does
						// The markdown renderer handles partial/incomplete markdown gracefully
						// Check if markdown container already exists - if so, update it; otherwise create new
						// eslint-disable-next-line no-restricted-syntax
						const existingMarkdown = summaryContainer.querySelector('.anysphere-markdown-container-root');
						if (existingMarkdown) {
							// Update existing markdown during streaming (re-render with new content)
							this.updateMarkdownContent(summaryContainer, this.currentContent, true);
						} else {
							// Check if markdown already exists - if so, update it; otherwise create new
							// eslint-disable-next-line no-restricted-syntax
							const existingMarkdown2 = summaryContainer.querySelector('.anysphere-markdown-container-root');
							if (existingMarkdown2) {
								// Update existing markdown during streaming
								this.updateMarkdownContent(summaryContainer, this.currentContent, true);
							} else {
								// Create new markdown render (clear container first)
								while (summaryContainer.firstChild) {
									summaryContainer.removeChild(summaryContainer.firstChild);
								}
								this.renderMarkdownContent(summaryContainer, this.currentContent, true);

								// CRITICAL: Verify content was added immediately after rendering
								// The renderer modifies the target directly and appends it synchronously
								// eslint-disable-next-line no-restricted-syntax
								const markdownRoot = summaryContainer.querySelector('.anysphere-markdown-container-root');
								if (!markdownRoot || (markdownRoot.children.length === 0 && (!markdownRoot.textContent || !markdownRoot.textContent.trim()))) {
									// Markdown render failed or returned empty - fall back to plain text
									console.warn('[VYBE Plan] Markdown renderer returned empty container, using plain text fallback', {
										hasMarkdownRoot: !!markdownRoot,
										markdownRootChildren: markdownRoot?.children.length ?? 0,
										markdownRootText: markdownRoot?.textContent?.substring(0, 50),
										currentContentLength: this.currentContent.length,
										currentContentPreview: this.currentContent.substring(0, 100)
									});
									// Clear and use plain text
									while (summaryContainer.firstChild) {
										summaryContainer.removeChild(summaryContainer.firstChild);
									}
									const textSpan = $('span', {
										style: 'user-select: text; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 20.8px; color: var(--vscode-foreground); display: block;'
									});
									textSpan.textContent = this.currentContent;
									summaryContainer.appendChild(textSpan);
								}
							}
						}
						// Ensure container is still visible after markdown rendering
						summaryContainer.style.display = 'block';
						summaryContainer.style.visibility = 'visible';
					} catch (error) {
						// Markdown rendering failed - fall back to plain text
						console.error('[VYBE Plan] Error rendering markdown during streaming:', error);
						// Clear container and use plain text
						while (summaryContainer.firstChild) {
							summaryContainer.removeChild(summaryContainer.firstChild);
						}
						const textSpan = $('span', {
							style: 'user-select: text; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 20.8px; color: var(--vscode-foreground); display: block;'
						});
						textSpan.textContent = this.currentContent;
						summaryContainer.appendChild(textSpan);
					}
				}
			} else {
				// No content available - show placeholder or keep existing content
				// NEVER leave container empty - this causes it to collapse
				if (this.isStreaming) {
					// Show placeholder while waiting for content during streaming
					const placeholder = $('span', { style: 'color: var(--vscode-descriptionForeground); font-style: italic; display: block;' });
					placeholder.textContent = 'Generating plan...';
					summaryContainer.appendChild(placeholder);
				} else {
					// Not streaming but no content - this shouldn't happen, but show something
					console.warn('[VYBE Plan] No content to render, but not streaming. currentContent:', this.currentContent?.substring(0, 50));
					const placeholder = $('span', { style: 'color: var(--vscode-descriptionForeground); font-style: italic; display: block;' });
					placeholder.textContent = 'No content available';
					summaryContainer.appendChild(placeholder);
				}
			}
		} else {
			// Container doesn't exist - this is a problem
			console.error('[VYBE Plan] summaryContainer is null in updateContentArea');
		}
	}


	/**
	 * Render summary as markdown to match reference structure.
	 * Creates: .anysphere-markdown-container-root (span) > .markdown-section
	 * @deprecated Not currently used - kept for potential future use
	 */
	// @ts-expect-error - Deprecated method kept for potential future use
	private _renderSummaryMarkdown(_container: HTMLElement, _summaryText: string): void {
		// Deprecated - not currently used
		return;
	}

	private renderMarkdownContent(container: HTMLElement, markdown: string, isContent: boolean = false): void {
		if (!this.markdownRendererService) {
			// Fallback: plain text
			const textSpan = $('span', {
				style: 'user-select: text;'
			});
			textSpan.textContent = markdown;
			container.appendChild(textSpan);
			return;
		}

		// Strip the first heading if it matches the title (to avoid duplicate titles)
		// Also remove "Overview" section if it duplicates the summary
		// ALWAYS strip title from markdown, whether it's content or summary
		// Do this FIRST before any other processing to prevent title from appearing
		// Use the centralized stripTitleFromMarkdown method for consistency
		let processedMarkdown = this.stripTitleFromMarkdown(markdown);

		if (isContent && this.title) {

			// Remove "## Overview" section if it exists and content matches summary
			const overviewRegex = /^##\s+Overview\s*$\n?\n?/im;
			if (overviewRegex.test(processedMarkdown) && this.summary) {
				// Check if the next paragraph matches the summary
				const afterOverview = processedMarkdown.replace(overviewRegex, '');
				const firstParagraph = afterOverview.split('\n\n')[0]?.trim();
				if (firstParagraph && firstParagraph === this.summary) {
					// Remove the Overview section and its content (up to next heading or end)
					const overviewSectionRegex = /^##\s+Overview\s*$\n?\n?[^\n#]*(?=\n##|\n###|$)/ims;
					processedMarkdown = processedMarkdown.replace(overviewSectionRegex, '');
					processedMarkdown = processedMarkdown.trimStart();
				}
			}
		}

		// Convert checkboxes to regular bullets (remove checklist styling)
		// Replace "- [ ]" and "- [x]" with "- " (regular bullet points)
		processedMarkdown = processedMarkdown.replace(/^(\s*)-\s+\[[ x]\]\s+/gm, '$1- ');

		// Create .anysphere-markdown-container-root as span to match reference outerHTML
		const markdownRoot = $('span.anysphere-markdown-container-root', {
			style: 'user-select: text;'
		});

		// Use VYBE markdown renderer with code block support
		const markdownString = new MarkdownString(processedMarkdown, {
			isTrusted: true,
			supportThemeIcons: true,
			supportHtml: false
		});

		// Render using VYBE markdown renderer with code block renderer
		// Like markdown part: don't pass target, just get result.element and append it
		// fillInIncompleteTokens: true allows the renderer to handle partial/incomplete markdown during streaming
		const result = this.markdownRendererService.render(markdownString, {
			fillInIncompleteTokens: true, // Handle incomplete markdown during streaming (like chat does)
			markedOptions: {
				gfm: true, // GitHub Flavored Markdown (enables tables, etc.)
				breaks: true // Line breaks create <br>
			},
			codeBlockRendererSync: (languageId: string, code: string) => {
				// Create a code block part with Monaco editor (VYBE style)
				const codeBlockPart = this.instantiationService.createInstance(
					VybeChatCodeBlockPart,
					{
						kind: 'codeBlock' as const,
						code: code,
						language: languageId || 'plaintext',
						isStreaming: false
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

		// Like markdown part: append result.element directly to markdownRoot
		markdownRoot.appendChild(result.element);

		// CRITICAL: Append markdownRoot to container (must happen before any checks)
		container.appendChild(markdownRoot);

		// Post-process: Convert file path links to have VYBE green styling
		// Find all links that look like file paths and style them
		// Also find inline code blocks that look like file paths and convert them to links
		this.processFilePaths(markdownRoot);

		// Remove top margin from first markdown section and first heading to prevent shifting
		// Based on computed CSS: first section should have margin-top: 0, first h2/h3 should have margin-top: 0
		const removeFirstElementMargins = () => {
			// Remove margin from rendered-markdown element itself if it exists
			// eslint-disable-next-line no-restricted-syntax
			const renderedMarkdown = markdownRoot.querySelector('.rendered-markdown') as HTMLElement;
			if (renderedMarkdown) {
				renderedMarkdown.style.margin = '0';
				renderedMarkdown.style.padding = '0';
			}
			// Remove top margin from first markdown section
			// eslint-disable-next-line no-restricted-syntax
			const firstSection = markdownRoot.querySelector('.markdown-section') as HTMLElement;
			if (firstSection) {
				firstSection.style.marginTop = '0';
				// Also remove top margin from first h2 or h3 inside first section
				// eslint-disable-next-line no-restricted-syntax
				const firstH2 = firstSection.querySelector('h2') as HTMLElement;
				// eslint-disable-next-line no-restricted-syntax
				const firstH3 = firstSection.querySelector('h3') as HTMLElement;
				if (firstH2) {
					firstH2.style.marginTop = '0';
				}
				if (firstH3) {
					firstH3.style.marginTop = '0';
				}
			}
			// Also check first h2/h3 directly in markdown root
			// eslint-disable-next-line no-restricted-syntax
			const firstH2Direct = markdownRoot.querySelector('h2') as HTMLElement;
			// eslint-disable-next-line no-restricted-syntax
			const firstH3Direct = markdownRoot.querySelector('h3') as HTMLElement;
			if (firstH2Direct) {
				firstH2Direct.style.marginTop = '0';
			}
			if (firstH3Direct) {
				firstH3Direct.style.marginTop = '0';
			}
		};
		// Try immediately, then again after a microtask to catch async rendering
		removeFirstElementMargins();
		setTimeout(removeFirstElementMargins, 0);
		setTimeout(removeFirstElementMargins, 10); // Extra check after render

		// Register disposables
		this._register(result);
		this.markdownResult = result;
	}

	/**
	 * Update markdown content during streaming (reuses existing container).
	 */
	private updateMarkdownContent(container: HTMLElement, markdown: string, isContent: boolean = false): void {
		if (!this.markdownRendererService) {
			// Fallback: plain text
			container.textContent = markdown;
			return;
		}

		// Strip the first heading if it matches the title (to avoid duplicate titles)
		// Also remove "Overview" section if it duplicates the summary
		// Do this FIRST before any other processing to prevent title from appearing
		let processedMarkdown = markdown;
		if (this.title) {
			const escapedTitle = this.escapeRegex(this.title);
			// Try multiple patterns to catch all variations
			const titlePatterns = [
				// Exact match: # Title
				new RegExp(`^#{1,6}\\s+${escapedTitle}\\s*$\\n?`, 'im'),
				// Partial match: # Some Title Text
				new RegExp(`^#{1,6}\\s+.*?${escapedTitle}.*?$\\n?`, 'im'),
				// Case-insensitive partial
				new RegExp(`^#{1,6}\\s+.*?${escapedTitle.replace(/\s+/g, '\\s+')}.*?$\\n?`, 'im'),
				// Match even if title is split across lines
				new RegExp(`^#{1,6}\\s+[^\\n]*${escapedTitle}[^\\n]*$\\n?`, 'im')
			];

			for (const pattern of titlePatterns) {
				processedMarkdown = processedMarkdown.replace(pattern, '');
			}

			// Also remove any leading whitespace/newlines after removing the title
			processedMarkdown = processedMarkdown.trimStart();

			// Final check: if first line still looks like a title heading, remove it
			const firstLine = processedMarkdown.split('\n')[0];
			if (firstLine.match(/^#{1,6}\s+/) && firstLine.toLowerCase().includes(this.title.toLowerCase())) {
				processedMarkdown = processedMarkdown.replace(/^#{1,6}\s+[^\n]+\n?/, '');
				processedMarkdown = processedMarkdown.trimStart();
			}
		}

		if (isContent && this.title) {
			// Remove "## Overview" section if it exists and content matches summary
			const overviewRegex = /^##\s+Overview\s*$\n?\n?/im;
			if (overviewRegex.test(processedMarkdown) && this.summary) {
				// Check if the next paragraph matches the summary
				const afterOverview = processedMarkdown.replace(overviewRegex, '');
				const firstParagraph = afterOverview.split('\n\n')[0]?.trim();
				if (firstParagraph && firstParagraph === this.summary) {
					// Remove the Overview section and its content (up to next heading or end)
					const overviewSectionRegex = /^##\s+Overview\s*$\n?\n?[^\n#]*(?=\n##|\n###|$)/ims;
					processedMarkdown = processedMarkdown.replace(overviewSectionRegex, '');
					processedMarkdown = processedMarkdown.trimStart();
				}
			}
		}

		// Convert checkboxes to regular bullets (remove checklist styling)
		// Replace "- [ ]" and "- [x]" with "- " (regular bullet points)
		processedMarkdown = processedMarkdown.replace(/^(\s*)-\s+\[[ x]\]\s+/gm, '$1- ');

		// Dispose previous result
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = null;
		}

		// Clear container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		// Create .anysphere-markdown-container-root as span to match reference outerHTML
		const markdownRoot = $('span.anysphere-markdown-container-root', {
			style: 'user-select: text; margin: 0; padding: 0;'
		});

		// Use VYBE markdown renderer with code block support
		const markdownString = new MarkdownString(processedMarkdown, {
			isTrusted: true,
			supportThemeIcons: true,
			supportHtml: false
		});

		// Render using VYBE markdown renderer with code block renderer
		// Like markdown part: don't pass target, just get result.element and append it
		// fillInIncompleteTokens: true allows the renderer to handle partial/incomplete markdown during streaming
		const result = this.markdownRendererService.render(markdownString, {
			fillInIncompleteTokens: true, // Handle incomplete markdown during streaming (like chat does)
			markedOptions: {
				gfm: true, // GitHub Flavored Markdown (enables tables, etc.)
				breaks: true // Line breaks create <br>
			},
			codeBlockRendererSync: (languageId: string, code: string) => {
				// Create a code block part with Monaco editor (VYBE style)
				const codeBlockPart = this.instantiationService.createInstance(
					VybeChatCodeBlockPart,
					{
						kind: 'codeBlock' as const,
						code: code,
						language: languageId || 'plaintext',
						isStreaming: false
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

		// Like markdown part: append result.element directly to markdownRoot
		markdownRoot.appendChild(result.element);

		// Remove top margin from first markdown section and first heading to prevent shifting
		// Based on computed CSS: first section should have margin-top: 0, first h2/h3 should have margin-top: 0
		const removeFirstElementMargins = () => {
			// Remove margin from rendered-markdown element itself
			// eslint-disable-next-line no-restricted-syntax
			const renderedMarkdown = markdownRoot.querySelector('.rendered-markdown') as HTMLElement;
			if (renderedMarkdown) {
				renderedMarkdown.style.margin = '0';
				renderedMarkdown.style.padding = '0';
			}
			// Remove top margin from first markdown section
			// eslint-disable-next-line no-restricted-syntax
			const firstSection = markdownRoot.querySelector('.markdown-section') as HTMLElement;
			if (firstSection) {
				firstSection.style.marginTop = '0';
				// Also remove top margin from first h2 or h3 inside first section
				// eslint-disable-next-line no-restricted-syntax
				const firstH2 = firstSection.querySelector('h2') as HTMLElement;
				// eslint-disable-next-line no-restricted-syntax
				const firstH3 = firstSection.querySelector('h3') as HTMLElement;
				if (firstH2) {
					firstH2.style.marginTop = '0';
				}
				if (firstH3) {
					firstH3.style.marginTop = '0';
				}
			}
			// Also check first h2/h3 directly in markdown root
			// eslint-disable-next-line no-restricted-syntax
			const firstH2Direct = markdownRoot.querySelector('h2') as HTMLElement;
			// eslint-disable-next-line no-restricted-syntax
			const firstH3Direct = markdownRoot.querySelector('h3') as HTMLElement;
			if (firstH2Direct) {
				firstH2Direct.style.marginTop = '0';
			}
			if (firstH3Direct) {
				firstH3Direct.style.marginTop = '0';
			}
		};
		setTimeout(removeFirstElementMargins, 0);
		setTimeout(removeFirstElementMargins, 10); // Extra check after render

		// CRITICAL: Always append markdownRoot to container - never leave container empty
		if (markdownRoot && !container.contains(markdownRoot)) {
			container.appendChild(markdownRoot);
		}

		// Post-process: Convert file path links to have VYBE green styling
		// Find all links that look like file paths and style them
		// Also find inline code blocks that look like file paths and convert them to links
		this.processFilePaths(markdownRoot);

		// Verify something was added - if not, fallback to plain text
		// This should never happen, but safety check in case renderer fails silently
		const hasContent = markdownRoot.children.length > 0 || markdownRoot.textContent?.trim().length > 0;
		if (container.children.length === 0 || !hasContent) {
			console.error('[VYBE Plan] renderMarkdownContent: No content added to container, using fallback', {
				containerChildren: container.children.length,
				markdownRootChildren: markdownRoot.children.length,
				markdownRootText: markdownRoot.textContent?.substring(0, 50)
			});
			// Fallback: add plain text
			const textSpan = $('span', {
				style: 'user-select: text; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 20.8px; color: var(--vscode-foreground); display: block;'
			});
			textSpan.textContent = markdown;
			container.appendChild(textSpan);
		}

		// Register disposables
		this._register(result);
		this.markdownResult = result;
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Process file paths in markdown: convert inline code blocks that look like file paths to clickable links
	 * and style existing file:// links with VYBE green.
	 */
	private processFilePaths(markdownRoot: HTMLElement): void {
		setTimeout(() => {
			// First, find existing file:// links and style them
			// eslint-disable-next-line no-restricted-syntax
			const links = markdownRoot.querySelectorAll('a[href^="file://"]');
			links.forEach((link) => {
				const anchor = link as HTMLAnchorElement;
				// Add data-link attribute for CSS targeting
				anchor.setAttribute('data-link', anchor.href);
				// Ensure it has the markdown-link class for styling
				anchor.classList.add('markdown-link');
			});

			// Second, find inline code blocks that look like file paths and convert them to links
			// Pattern: looks like a file path (contains / or \ and ends with file extension or is a directory path)
			// eslint-disable-next-line no-restricted-syntax
			const inlineCodes = markdownRoot.querySelectorAll('code.markdown-inline-code, .markdown-inline-code, span.markdown-inline-code');
			inlineCodes.forEach((code) => {
				const codeElement = code as HTMLElement;
				const text = codeElement.textContent || '';

				// Check if it looks like a file path:
				// - Contains path separators (/ or \)
				// - OR looks like a relative path (starts with ./ or ../)
				// - OR contains common file extensions
				// - OR matches common path patterns (src/, lib/, etc.)
				const isFilePath = (
					(text.includes('/') || text.includes('\\')) &&
					(text.length > 3 && text.length < 200) &&
					(
						text.startsWith('./') ||
						text.startsWith('../') ||
						/\.(ts|js|tsx|jsx|py|java|cpp|c|h|hpp|css|scss|less|html|json|yaml|yml|md|txt|xml|sh|bat|ps1|rs|go|rb|php|swift|kt|dart)$/i.test(text) ||
						/^(src|lib|test|tests|dist|build|out|bin|node_modules|\.vscode|\.git|packages|components|utils|helpers|services|models|views|controllers)/.test(text) ||
						/^[a-zA-Z]:\\/.test(text) || // Windows absolute path
						/^\/[^\/]/.test(text) // Unix absolute path
					)
				);

				if (isFilePath && !codeElement.closest('a')) {
					// Convert inline code to a link
					const link = document.createElement('a');
					link.href = `file://${text}`;
					link.setAttribute('data-link', `file://${text}`);
					link.classList.add('markdown-link');

					// Copy all classes from code element
					codeElement.classList.forEach(cls => link.classList.add(cls));

					// Copy text content
					link.textContent = text;

					// Copy styles
					link.style.cssText = codeElement.style.cssText;

					// Replace code element with link
					codeElement.parentNode?.replaceChild(link, codeElement);
				}
			});
		}, 0);
	}

	/**
	 * Strip title from markdown content to prevent duplication.
	 * This is called BEFORE content is stored or rendered, so the title never appears in markdown.
	 */
	private stripTitleFromMarkdown(markdown: string): string {
		if (!this.title || !markdown) {
			return markdown;
		}

		let processed = markdown;
		const escapedTitle = this.escapeRegex(this.title);

		// Try multiple patterns to catch all variations
		const titlePatterns = [
			// Exact match: # Title
			new RegExp(`^#{1,6}\\s+${escapedTitle}\\s*$\\n?`, 'im'),
			// Partial match: # Some Title Text
			new RegExp(`^#{1,6}\\s+.*?${escapedTitle}.*?$\\n?`, 'im'),
			// Case-insensitive partial
			new RegExp(`^#{1,6}\\s+.*?${escapedTitle.replace(/\s+/g, '\\s+')}.*?$\\n?`, 'im'),
			// Match even if title is split across lines
			new RegExp(`^#{1,6}\\s+[^\\n]*${escapedTitle}[^\\n]*$\\n?`, 'im')
		];

		for (const pattern of titlePatterns) {
			processed = processed.replace(pattern, '');
		}

		// Also remove any leading whitespace/newlines after removing the title
		processed = processed.trimStart();

		// Final check: if first line still looks like a title heading, remove it
		const firstLine = processed.split('\n')[0];
		if (firstLine.match(/^#{1,6}\s+/) && firstLine.toLowerCase().includes(this.title.toLowerCase())) {
			processed = processed.replace(/^#{1,6}\s+[^\n]+\n?/, '');
			processed = processed.trimStart();
		}

		return processed;
	}

	/**
	 * Extract summary text from content, stripping title and getting first meaningful paragraph.
	 * @deprecated Not currently used - kept for potential future use
	 */
	// @ts-expect-error - Deprecated method kept for potential future use
	private _extractSummaryText(_content: string): string {
		// Deprecated - not currently used
		return '';
	}

	/**
	 * Stream content character-by-character (like vybeChatMarkdownPart).
	 */
	private startStreamingAnimation(): void {
		// Clear any existing animation
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		// Check if we have target content to stream
		if (!this.targetContent || this.targetContent.length === 0) {
			console.warn('[VYBE Plan] No target content to stream');
			return;
		}

		// Use targetContent as the target, but allow it to be updated during streaming
		// Start from currentContent length to continue from where we left off
		let charIndex = Math.min(this.currentContent.length, this.targetContent.length);
		const CHAR_DELAY_MS = 15; // 15ms per character (fast but legible)

		// Streaming animation started

		const streamNextChar = () => {
			// Get current target (may have been updated during streaming)
			const targetText = this.targetContent;
			const targetLength = targetText.length;
			const hasReachedTarget = charIndex >= targetLength;

			// Check streaming state and target content dynamically (they may change during streaming)
			// If streaming was stopped externally AND we've reached the target, stop gracefully
			// BUT: Don't stop if we haven't reached the target yet - let it finish naturally
			if (!this.isStreaming && hasReachedTarget) {
				// Streaming was stopped externally AND we've reached the target - stop gracefully
				if (this.streamingIntervalId) {
					clearTimeout(this.streamingIntervalId);
					this.streamingIntervalId = null;
				}
				// Ensure content is rendered before stopping (prevents content from disappearing)
				if (this.currentContent && this.currentContent.trim()) {
					this.updateContentArea();
				}
				return;
			}

			// If streaming was stopped externally but we haven't reached target yet,
			// continue streaming to completion (don't stop mid-stream)
			if (!this.isStreaming && !hasReachedTarget) {
				// Re-enable streaming flag to continue until completion
				this.isStreaming = true;
			}

			// If we've reached the end of the target content, complete streaming
			if (charIndex >= targetLength) {
				// Streaming complete - show full content as markdown
				this.currentContent = targetText;
				// CRITICAL: Clear streaming interval FIRST, then set isStreaming to false
				// This ensures updateContentArea knows streaming is done
				if (this.streamingIntervalId) {
					clearTimeout(this.streamingIntervalId);
					this.streamingIntervalId = null;
				}
				this.isStreaming = false;
				// Update header separator (always visible)
				if (this.headerSeparator) {
					this.headerSeparator.style.display = 'block';
				}
				// Update to show full content as markdown (always visible, never collapsed)
				// Now that streaming is done, this will render markdown
				this.updateContentArea();
				// Update streaming state (which will show control row)
				this.updateStreamingState();
				return;
			}

			// Add next character - reuse targetText from above (may have been updated during streaming)
			this.currentContent = targetText.substring(0, charIndex + 1);
			charIndex++;

			// If targetContent grew during streaming, adjust charIndex to not exceed it
			if (charIndex > targetText.length) {
				charIndex = targetText.length;
			}

			// Update content during streaming - always show full content as it streams
			// Simply call updateContentArea which will render the current content
			// This ensures the content is always visible as it streams
			// Only update if we actually have content to show
			if (this.currentContent && this.currentContent.length > 0) {
				this.updateContentArea();
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

	private getModelLabel(modelId: string): string {
		const modelMap: Record<string, string> = {
			'composer-1': 'Composer 1',
			'opus-4.5': 'Opus 4.5',
			'sonnet-4.5': 'Sonnet 4.5',
			'gpt-5.1-codex-high': 'GPT-5.1 Codex High',
			'gpt-5.1': 'GPT-5.1',
			'gemini-3-pro': 'Gemini 3 Pro'
		};
		return modelMap[modelId] || modelId;
	}

	private handleExport(): void {
		// Export plan functionality - to be implemented
	}

	private handleBuild(): void {
		// Build plan functionality - to be implemented
	}

	updateContent(data: IVybeChatPlanDocumentContent): void {
		if (data.id && data.id !== this.partId) {
			this.partId = data.id;
			if (this.container) {
				this.container.setAttribute('data-part-id', this.partId);
			}
		}

		if (data.filename !== undefined) {
			this.filename = data.filename;
			// eslint-disable-next-line no-restricted-syntax
			const filenameLabel = this.headerElement?.querySelector('.composer-code-block-filename span');
			if (filenameLabel) {
				filenameLabel.textContent = this.filename;
			}
		}

		if (data.title !== undefined) {
			this.title = data.title;
			// eslint-disable-next-line no-restricted-syntax
			const titleElement = this.contentArea?.querySelector('div[style*="font-size: 13px"]');
			if (titleElement) {
				titleElement.textContent = this.title;
			}
		}

		if (data.summary !== undefined) {
			this.summary = data.summary;
		}

		if (data.content !== undefined) {
			this.content = data.content;
			// Strip title from content BEFORE storing it, so streaming never includes the title
			const contentWithoutTitle = this.stripTitleFromMarkdown(data.content);
			this.targetContent = contentWithoutTitle;
			// During streaming, ONLY update targetContent - let streaming animation handle currentContent
			// The streaming animation will stream from currentContent to targetContent
			// Only update currentContent if not streaming (streaming animation handles it)
			if (!this.isStreaming) {
				this.currentContent = contentWithoutTitle;
			}
			// If streaming is active, targetContent is updated above, and animation will continue streaming to it
			// Do NOT update currentContent during streaming - it's managed by the animation
		}

		// No expand/collapse - always show full content

		if (data.isStreaming !== undefined) {
			const wasStreaming = this.isStreaming;
			this.isStreaming = data.isStreaming;

			// Update icon: show loading spinner during streaming, checklist icon otherwise
			if (this.isStreaming !== wasStreaming) {
				this.updateStreamingState();

				// Start or stop streaming animation
				if (this.isStreaming && !wasStreaming) {
					// Start streaming - show full content as it streams
					this.currentContent = '';

					// Header separator always visible
					if (this.headerSeparator) {
						this.headerSeparator.style.display = 'block';
					}

					this.updateContentArea();
					// Delay slightly to ensure DOM is ready
					setTimeout(() => {
						if (this.isStreaming && this.targetContent) {
							this.startStreamingAnimation();
						}
					}, 100);
				} else if (!this.isStreaming && wasStreaming) {
					// Streaming was stopped externally (e.g., from updateContent call)
					// BUT: Don't stop the animation if it's still running - let it complete naturally
					// The animation will check isStreaming and stop gracefully when it reaches the target
					// Only set final content if animation has already completed
					if (!this.streamingIntervalId) {
						// Animation already completed - set final content
						if (this.targetContent && this.targetContent.length > 0) {
							this.currentContent = this.targetContent;
						} else if (!this.currentContent || this.currentContent.length === 0) {
							// If no targetContent, keep currentContent (don't clear it)
							console.warn('[VYBE Plan] Streaming stopped but no targetContent, keeping currentContent');
						}
						// Update header separator (always visible)
						if (this.headerSeparator) {
							this.headerSeparator.style.display = 'block';
						}
						// Update content area - this will render full markdown since isStreaming is now false
						// ALWAYS update if we have ANY content (even if partial) - don't let it disappear
						if (this.currentContent && this.currentContent.trim().length > 0) {
							this.updateContentArea();
						} else {
							// Even if no content, ensure container is visible (shouldn't happen, but safety)
							// eslint-disable-next-line no-restricted-syntax
							const summaryContainer = this.contentArea?.querySelector('.composer-create-plan-text') as HTMLElement;
							if (summaryContainer) {
								summaryContainer.style.display = 'block';
								summaryContainer.style.visibility = 'visible';
							}
						}
						// Then update streaming state (which will show buttons) - only when animation is done
						this.updateStreamingState();
					}
					// If animation is still running, DON'T call updateStreamingState() yet
					// The animation will call it when it actually completes
					// This prevents the control bar from appearing too early
				}
			}
		}

		if (data.modelState !== undefined) {
			this.modelState = data.modelState;
			// Update model dropdown button label
			if (this.modelDropdownButton) {
				// eslint-disable-next-line no-restricted-syntax
				const modelLabel = this.modelDropdownButton.querySelector('span');
				if (modelLabel) {
					modelLabel.textContent = this.modelState.isAutoEnabled ? 'Auto' : this.getModelLabel(this.modelState.selectedModelId);
				}
			}
		}

		this.updateContentArea();
	}

	private updateStreamingState(): void {
		// Update icon in header
		// eslint-disable-next-line no-restricted-syntax
		const iconContainer = this.headerElement?.querySelector('.composer-primary-toolcall-icon .show-file-icons > div');
		if (!iconContainer) {
			return;
		}

		// Clear existing icon/spinner
		while (iconContainer.firstChild) {
			iconContainer.removeChild(iconContainer.firstChild);
		}

		// Check if streaming is actually happening (either flag is true OR animation is running)
		const isActuallyStreaming = this.isStreaming || this.streamingIntervalId !== null;

		if (isActuallyStreaming) {
			// Show loading spinner during streaming
			this.loadingSpinner = $('span.codicon.codicon-loading.codicon-modifier-spin');
			this.loadingSpinner.style.cssText = 'font-size: 16px; color: var(--vscode-foreground); opacity: 0.7;';
			iconContainer.appendChild(this.loadingSpinner);
			this.iconElement = null;
		} else {
			// Show checklist icon when not streaming
			this.iconElement = $('span.codicon.codicon-checklist');
			this.iconElement.style.cssText = 'font-size: 16px; color: var(--vscode-foreground); opacity: 0.8;';
			iconContainer.appendChild(this.iconElement);
			this.loadingSpinner = null;
		}

		// Show/hide control row based on ACTUAL streaming state - only show after streaming animation completes
		// Don't show control row if animation is still running, even if isStreaming flag is false
		if (this.controlRow) {
			this.controlRow.style.display = isActuallyStreaming ? 'none' : 'flex';
		}

		// Show/hide export button - same logic as control row (only visible after streaming completes)
		if (this.exportButton) {
			this.exportButton.style.display = isActuallyStreaming ? 'none' : 'flex';
		}

		// No expand button - always show full content
	}

	override hasSameContent(other: IVybeChatContentPart): boolean {
		if (!(other instanceof VybeChatPlanDocumentPart)) {
			return false;
		}
		const otherPlan = other as VybeChatPlanDocumentPart;
		return this.filename === otherPlan.filename &&
			this.content === otherPlan.content;
	}

	override dispose(): void {
		// Clean up streaming interval
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		this.headerElement = null;
		this.headerSeparator = null;
		this.contentArea = null;
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = null;
		}
		this.controlRow = null;
		this.leftControls = null;
		this.rightControls = null;
		this.modelDropdown = null;
		this.modelDropdownButton = null;
		this.buildButton = null;
		this.exportButton = null;
		this.iconElement = null;
		this.loadingSpinner = null;

		// Dispose all code block parts
		this.codeBlockParts.forEach(part => part.dispose());
		this.codeBlockParts = [];

		super.dispose();
	}
}

