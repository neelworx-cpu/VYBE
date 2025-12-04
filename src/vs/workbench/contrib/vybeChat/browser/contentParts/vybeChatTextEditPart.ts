/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatTextEditContent } from './vybeChatContentPart.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../base/common/uri.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { FileKind } from '../../../../../platform/files/common/files.js';

/**
 * Text Edit Content Part - Exact match to VYBECode renderCodeBlock structure
 *
 * Streaming behavior:
 * 1. Initially streams code with syntax highlighting (like editor)
 * 2. During streaming: shows loading circle instead of file icon
 * 3. After streaming complete: becomes diff view, file icon appears
 * 4. Collapsed state (header only): shows file icon, on hover becomes chevron-right to expand
 * 5. Default expanded state: shows ~4 lines of diff (90px height)
 * 6. Bottom expand bar: only renders if more than 4 lines of diff exist
 * 7. Bottom expand bar: expands to show full code change
 */
export class VybeChatTextEditPart extends VybeChatContentPart {
	private diffEditor: DiffEditorWidget | null = null;
	private streamingEditor: ICodeEditor | null = null; // For streaming code display
	private streamingIntervalId: ReturnType<typeof setInterval> | null = null; // Interval for streaming animation
	private currentContent: IVybeChatTextEditContent;
	private readonly uniqueId: string; // Unique ID for model URIs
	private onStreamingUpdate?: () => void; // Callback for parent to handle scrolling
	private headerElement: HTMLElement | null = null;
	private headerSeparator: HTMLElement | null = null;
	private contentArea: HTMLElement | null = null;
	private diffBlock: HTMLElement | null = null;
	private diffEditorContainer: HTMLElement | null = null;
	private expandMoreButton: HTMLElement | null = null;
	private expandChevron: HTMLElement | null = null;
	private isFullyExpanded: boolean = false;
	private isCollapsed: boolean = false;
	private iconElement: HTMLElement | null = null;
	private loadingSpinner: HTMLElement | null = null;
	private hoverChevron: HTMLElement | null = null;

	private readonly LINE_HEIGHT = 18;
	private readonly INITIAL_HEIGHT = 90; // ~5 lines * 18px (~4 lines of diff visible)
	private readonly MIN_LINES_FOR_EXPAND_BAR = 4; // Only show expand bar if more than 4 lines

	constructor(
		content: IVybeChatTextEditContent,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super('textEdit');
		this.currentContent = content;
		// Generate unique ID for this text edit instance to avoid model URI conflicts
		this.uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	protected createDomNode(): HTMLElement {
		// Outer container (matches code block structure)
		const outerContainer = $('.markdown-code-outer-container');
		outerContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			position: relative;
		`;

		// Width/height wrapper (MATCHES CODE BLOCK EXACTLY)
		const wrapper = $('div');
		wrapper.style.cssText = 'height: 100%; width: 100%;';

		// Main container
		const codeBlockContainer = $('.composer-code-block-container');
		codeBlockContainer.classList.add('composer-message-codeblock');
		codeBlockContainer.classList.add('text-edit-block'); // Unique class for text edits
		codeBlockContainer.style.position = 'relative';

		// Header
		this.headerElement = this.createHeader();

		// Header separator (1px line)
		this.headerSeparator = $('div');
		this.headerSeparator.style.height = '1px';
		this.headerSeparator.style.background = 'var(--cursor-stroke-secondary)';
		this.headerSeparator.style.width = '100%';
		this.headerSeparator.style.display = 'block'; // Shown by default (starts expanded)

		// Content area
		this.contentArea = $('.composer-code-block-content');
		this.contentArea.style.display = 'block'; // Shown by default
		this.contentArea.setAttribute('data-expanded', 'true');
		// Add padding-bottom only if expand bar will exist (NOT during streaming)
		const totalDiffLines = this.currentContent.addedLines + this.currentContent.deletedLines;
		if (!this.currentContent.isStreaming && totalDiffLines > this.MIN_LINES_FOR_EXPAND_BAR) {
			this.contentArea.style.paddingBottom = '16px'; // Space for expand bar
		} else {
			this.contentArea.style.paddingBottom = '0'; // No expand bar = no padding
		}
		this.contentArea.style.transition = 'height 0.2s ease-in-out';

		// Diff block
		this.diffBlock = $('div');
		this.diffBlock.style.boxSizing = 'border-box';
		this.diffBlock.style.position = 'relative';
		this.diffBlock.style.background = 'var(--vscode-editor-background)';
		this.diffBlock.style.overflow = 'hidden';
		this.diffBlock.style.height = `${this.INITIAL_HEIGHT}px`;
		this.diffBlock.style.transition = 'height 0.2s ease-in-out';

		// Diff editor container
		this.diffEditorContainer = $('div');
		this.diffEditorContainer.classList.add('composer-diff-block');
		this.diffEditorContainer.style.boxSizing = 'border-box';
		this.diffEditorContainer.style.position = 'relative';
		this.diffEditorContainer.style.background = 'var(--vscode-editor-background)';
		this.diffEditorContainer.style.overflow = 'hidden';
		this.diffEditorContainer.style.fontFamily = 'Menlo, Monaco, "Courier New", monospace';
		this.diffEditorContainer.style.fontSize = '12px';
		this.diffEditorContainer.style.lineHeight = '18px';
		this.diffEditorContainer.style.height = `${this.INITIAL_HEIGHT}px`;
		this.diffEditorContainer.style.transition = 'height 0.2s ease-in-out';
		this.diffEditorContainer.style.marginBottom = '0';

		// Create streaming editor or diff editor based on state
		if (this.currentContent.isStreaming) {
			this.createStreamingEditor(this.diffEditorContainer);
		} else {
			this.createDiffEditor(this.diffEditorContainer);
		}

		// Assemble diff structure
		this.diffBlock.appendChild(this.diffEditorContainer);
		this.contentArea.appendChild(this.diffBlock);

		// Expand bar (absolute positioned at bottom) - only if more than 4 lines of diff
		this.expandMoreButton = this.createExpandButton();

		// Assemble main container
		codeBlockContainer.appendChild(this.headerElement);
		codeBlockContainer.appendChild(this.headerSeparator);
		codeBlockContainer.appendChild(this.contentArea);
		if (this.expandMoreButton) {
			codeBlockContainer.appendChild(this.expandMoreButton);
		}

		// Wrap in wrapper, then outer container (MATCHES CODE BLOCK EXACTLY)
		wrapper.appendChild(codeBlockContainer);
		outerContainer.appendChild(wrapper);

		return outerContainer;
	}

	private createHeader(): HTMLElement {
		const header = $('.composer-code-block-header');

		// File info (styling in CSS)
		const fileInfo = $('.composer-code-block-file-info');

		// File icon container with loading/hover states
		const iconSpan = $('span.composer-primary-toolcall-icon');
		const iconWrapper = $('.show-file-icons');
		const iconContainer = $('div');
		iconContainer.style.cssText = 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;';

		// If loading, show spinner; otherwise show file icon
		if (this.currentContent.isLoading) {
			// Loading spinner during streaming
			this.loadingSpinner = $('span.codicon.codicon-loading.codicon-modifier-spin');
			this.loadingSpinner.style.cssText = 'font-size: 16px; color: var(--vscode-foreground); opacity: 0.7;';
			iconContainer.appendChild(this.loadingSpinner);
		} else {
			// Use VS Code's getIconClasses for proper file icon
			const filePath = this.currentContent.filePath || `/file/${this.currentContent.fileName}`;
			const fileUri = URI.file(filePath);
			const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);

			this.iconElement = $('div.monaco-icon-label.file-icon');
			const classString = Array.isArray(iconClasses) ? iconClasses.join(' ') : iconClasses;
			this.iconElement.className = `monaco-icon-label file-icon ${classString}`;
			this.iconElement.style.height = '100%';
			this.iconElement.style.transition = 'opacity 0.15s ease';

			// Hover chevron (hidden by default, shows on header hover)
			// Starts as chevron-down (for slightly expanded state)
			this.hoverChevron = $('span.codicon.codicon-chevron-down');
			this.hoverChevron.style.cssText = 'font-size: 12px; color: var(--vscode-foreground); opacity: 0; position: absolute; pointer-events: none; transition: opacity 0.15s ease;';

			iconContainer.appendChild(this.iconElement);
			iconContainer.appendChild(this.hoverChevron);
		}

		iconWrapper.appendChild(iconContainer);
		iconSpan.appendChild(iconWrapper);

		// Filename (direction and styling in CSS)
		const filenameSpan = $('span.composer-code-block-filename');
		const filenameBidi = $('span');
		filenameBidi.textContent = this.currentContent.fileName;
		filenameSpan.appendChild(filenameBidi);

		// Stats (styling in CSS)
		const statsSpan = $('span.composer-code-block-status');
		const statsInner = $('span');
		const statsContainer = $('div');

		if (this.currentContent.addedLines > 0) {
			const addedSpan = $('span.diff-stat-added');
			addedSpan.textContent = `+${this.currentContent.addedLines}`;
			statsContainer.appendChild(addedSpan);
		}

		if (this.currentContent.deletedLines > 0) {
			const deletedSpan = $('span.diff-stat-deleted');
			deletedSpan.textContent = `-${this.currentContent.deletedLines}`;
			statsContainer.appendChild(deletedSpan);
		}

		statsInner.appendChild(statsContainer);
		statsSpan.appendChild(statsInner);

		// Empty status span
		const statusSpan = $('span.composer-code-block-status');

		// Actions container wrapper (outer div) - for future buttons (apply, delete, etc.)
		const actionsOuterWrapper = $('div');
		const actionsContainer = $('div');
		actionsContainer.style.cssText = 'overflow: hidden; display: flex; justify-content: flex-end; align-items: center; position: relative;';
		const actionsInner = $('div');
		actionsInner.style.cssText = 'display: flex; justify-content: flex-end; justify-self: flex-end; flex-shrink: 0; position: relative; align-items: center;';

		// 6 hidden button slots (for future: Apply, Delete, etc.)
		for (let i = 0; i < 6; i++) {
			const button = $('div');
			button.style.cssText = 'flex-shrink: 0; height: 0; width: 0; transition: opacity 0.1s ease-in-out; opacity: 0; pointer-events: none;';
			actionsInner.appendChild(button);
		}
		actionsContainer.appendChild(actionsInner);
		actionsOuterWrapper.appendChild(actionsContainer);

		// Assemble header
		fileInfo.appendChild(iconSpan);
		fileInfo.appendChild(filenameSpan);
		fileInfo.appendChild(statsSpan);
		fileInfo.appendChild(statusSpan);

		header.appendChild(fileInfo);
		header.appendChild(actionsOuterWrapper);

		// Add hover effect (show chevron instead of icon in all states)
		if (!this.currentContent.isLoading) {
			this._register(addDisposableListener(header, 'mouseenter', () => {
				// Update chevron direction based on current state
				if (this.hoverChevron) {
					if (this.isCollapsed) {
						this.hoverChevron.className = 'codicon codicon-chevron-right';
					} else {
						this.hoverChevron.className = 'codicon codicon-chevron-down';
					}
				}

				// Show chevron on hover in all states
				if (this.iconElement && this.hoverChevron) {
					this.iconElement.style.opacity = '0';
					this.hoverChevron.style.opacity = '0.7';
				}
			}));

			this._register(addDisposableListener(header, 'mouseleave', () => {
				if (this.iconElement && this.hoverChevron) {
					this.iconElement.style.opacity = '1';
					this.hoverChevron.style.opacity = '0';
				}
			}));

			// Single click header to toggle collapsed/slightly expanded
			this._register(addDisposableListener(header, 'click', () => {
				if (this.isCollapsed) {
					// Expand to slightly expanded state
					this.setCollapsed(false);
				} else if (this.isFullyExpanded) {
					// Collapse from fully expanded to slightly expanded
					this.collapseToInitial();
				} else {
					// Collapse from slightly expanded to collapsed
					this.setCollapsed(true);
				}
			}));
		}

		return header;
	}

	private createStreamingEditor(parent: HTMLElement): void {
		// Create a simple code editor (not diff) for streaming
		this.streamingEditor = this.instantiationService.createInstance(
			CodeEditorWidget,
			parent,
			{
				readOnly: true,
				lineNumbers: 'on',
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				wordWrap: 'off', // No wrapping - horizontal scroll is necessary
				fontSize: 12,
				fontFamily: 'Menlo, Monaco, "Courier New", monospace',
				lineHeight: 18,
				padding: { top: 6, bottom: 6 },
				overviewRulerLanes: 0,
				scrollbar: {
					vertical: 'auto', // Enable vertical scroll (streaming content in fixed 90px viewport)
					horizontal: 'auto', // Keep horizontal scroll for long lines
					verticalScrollbarSize: 0,
					horizontalScrollbarSize: 6,
					alwaysConsumeMouseWheel: false // Let page scroll work
				},
				glyphMargin: false,
				folding: false,
				selectOnLineNumbers: false,
				selectionHighlight: false,
				automaticLayout: true,
				renderLineHighlight: 'none',
				contextmenu: false,
				renderWhitespace: 'none',
				domReadOnly: true
			},
			{
				isSimpleWidget: true,
				contributions: []
			}
		);

		// Create model with streaming content using unique URI
		const languageId = this.currentContent.language || this.detectLanguageFromFilename(this.currentContent.fileName);
		const streamingUri = URI.parse(`vybe-chat-streaming:///${this.uniqueId}/${this.currentContent.fileName}`);

		// Start with empty content
		const model = this.modelService.createModel(
			'',
			this.languageService.createById(languageId),
			streamingUri
		);

		this.streamingEditor.setModel(model);
		// DON'T register editor - we'll dispose it manually
		// this._register(this.streamingEditor);
		this._register(model);

		// Set initial fixed height for streaming (90px, 4 lines visible)
		parent.style.height = `${this.INITIAL_HEIGHT}px`;
		parent.style.minHeight = `${this.INITIAL_HEIGHT}px`;
		parent.style.maxHeight = `${this.INITIAL_HEIGHT}px`;
		parent.style.overflow = 'hidden'; // No expansion during streaming in slightly expanded state

		// Layout
		setTimeout(() => {
			if (this.streamingEditor && parent.parentElement) {
				const width = parent.parentElement.clientWidth || 507;
				this.streamingEditor.layout({ width, height: this.INITIAL_HEIGHT });

				// Start streaming animation AFTER layout is complete
				setTimeout(() => {
					this.startStreamingAnimation(model, parent);
				}, 300); // 300ms delay for editor to fully render
			}
		}, 0);
	}

	private startStreamingAnimation(model: ITextModel, parent: HTMLElement): void {
		const fullContent = this.currentContent.streamingContent || '';
		const lines = fullContent.split('\n');
		let currentLineIndex = 0;
		let currentContent = '';

		console.log('[TextEdit Streaming] Starting animation with', lines.length, 'lines');

		// Keep height FIXED at 90px (4 lines visible) - no expansion in slightly expanded state!
		// But allow expansion if user clicks to fully expand
		if (!this.isFullyExpanded) {
			parent.style.height = `${this.INITIAL_HEIGHT}px`;
			parent.style.minHeight = `${this.INITIAL_HEIGHT}px`;
			parent.style.maxHeight = `${this.INITIAL_HEIGHT}px`;
			parent.style.overflow = 'hidden'; // Ensure no expansion
		}

		if (this.diffBlock && !this.isFullyExpanded) {
			this.diffBlock.style.height = `${this.INITIAL_HEIGHT}px`;
			this.diffBlock.style.minHeight = `${this.INITIAL_HEIGHT}px`;
			this.diffBlock.style.maxHeight = `${this.INITIAL_HEIGHT}px`;
		}

		// Consistent, legible speed throughout
		// Fast enough to feel like streaming, slow enough to be visually readable
		const STREAM_DELAY_MS = 70; // 70ms per line

		// Stream one line at a time with variable speed
		const streamNextLine = () => {
			if (currentLineIndex >= lines.length) {
				// Streaming complete
				console.log('[TextEdit Streaming] Complete!');
				if (this.streamingIntervalId) {
					clearInterval(this.streamingIntervalId);
					this.streamingIntervalId = null;
				}
				return;
			}

			// Add 1 line at a time
			currentContent += (currentLineIndex > 0 ? '\n' : '') + lines[currentLineIndex];
			currentLineIndex++;

			console.log('[TextEdit Streaming] Line', currentLineIndex, 'of', lines.length);

			// Update model content
			model.setValue(currentContent);

			// Keep height FIXED - editor scrolls within the fixed viewport
			if (this.streamingEditor && parent.parentElement) {
				const width = parent.parentElement.clientWidth || 507;
				// Layout with FIXED height (90px)
				this.streamingEditor.layout({ width, height: this.INITIAL_HEIGHT });

				// Auto-scroll to show latest line (scrolls within fixed viewport)
				const lastLine = model.getLineCount();
				this.streamingEditor.revealLine(lastLine, 0); // Scroll to bottom
			}

			// Notify parent to check if scrolling is needed
			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}

			// Schedule next line with consistent delay
			this.streamingIntervalId = setTimeout(streamNextLine, STREAM_DELAY_MS) as any;
		};

		// Start streaming with initial delay
		this.streamingIntervalId = setTimeout(streamNextLine, 300) as any; // 300ms delay before starting
	}

	private createDiffEditor(parent: HTMLElement): void {
		this.diffEditor = this.instantiationService.createInstance(
			DiffEditorWidget,
			parent,
			{
				readOnly: true,
				automaticLayout: true,
				renderSideBySide: true,
				enableSplitViewResizing: false,
				renderOverviewRuler: false,
				scrollBeyondLastLine: false,
				minimap: { enabled: false },
				wordWrap: 'off', // No wrapping - horizontal scroll is necessary
				scrollbar: {
					vertical: 'hidden', // No vertical scroll in diff (content fits exactly)
					horizontal: 'auto', // Keep horizontal scroll for long lines
					verticalScrollbarSize: 0,
					horizontalScrollbarSize: 6,
					alwaysConsumeMouseWheel: false // Pass scroll to page when at edges
				},
				fontSize: 12,
				fontFamily: 'Menlo, Monaco, "Courier New", monospace',
				lineHeight: 18,
				padding: { top: 6, bottom: 6 },
				overviewRulerLanes: 0,
				hideCursorInOverviewRuler: true,
				renderLineHighlight: 'none',
				lineNumbers: 'off',
				glyphMargin: true,
				folding: false,
				selectOnLineNumbers: false,
				selectionHighlight: false,
				occurrencesHighlight: 'off',
				renderWhitespace: 'none',
				renderControlCharacters: false
			},
			{}
		);

		// Create models with unique URIs to avoid conflicts
		const languageId = this.currentContent.language || this.detectLanguageFromFilename(this.currentContent.fileName);

		const originalUri = URI.parse(`vybe-chat-original:///${this.uniqueId}/${this.currentContent.fileName}`);
		const modifiedUri = URI.parse(`vybe-chat-modified:///${this.uniqueId}/${this.currentContent.fileName}`);

		const originalModel = this.modelService.createModel(this.currentContent.originalContent, this.languageService.createById(languageId), originalUri);
		const modifiedModel = this.modelService.createModel(this.currentContent.modifiedContent, this.languageService.createById(languageId), modifiedUri);

		this.diffEditor.setModel({
			original: originalModel,
			modified: modifiedModel
		});

		// Register models for disposal
		this._register(originalModel);
		this._register(modifiedModel);

		// DON'T register diff editor - we'll dispose it manually in proper order
		// this._register(this.diffEditor);

		// Layout after creation
		setTimeout(() => {
			this.diffEditor?.layout();
		}, 50);
	}

	private createExpandButton(): HTMLElement | null {
		// Don't show expand bar during streaming
		if (this.currentContent.isStreaming) {
			return null;
		}

		// Only create if there are more than 4 diff lines
		const totalDiffLines = this.currentContent.addedLines + this.currentContent.deletedLines;
		if (totalDiffLines <= this.MIN_LINES_FOR_EXPAND_BAR) {
			return null;
		}

		const button = $('.composer-message-codeblock-expand');
		button.style.cssText = `
			position: absolute;
			bottom: 0;
			left: 0;
			width: 100%;
			height: 14px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			user-select: none;
			z-index: 1;
		`;

		this.expandChevron = $('span.codicon.codicon-chevron-down');
		this.expandChevron.style.fontSize = '16px';
		this.expandChevron.style.textAlign = 'center';
		button.appendChild(this.expandChevron);

		// Toggle between slightly and fully expanded
		this._register(addDisposableListener(button, 'click', () => {
			if (!this.isFullyExpanded) {
				this.expandFully();
			} else {
				this.collapseToInitial();
			}
		}));

		return button;
	}

	private expandFully(): void {
		this.isFullyExpanded = true;

		const fullHeight = this.calculateFullHeight();

		if (this.diffEditorContainer) {
			this.diffEditorContainer.style.height = `${fullHeight}px`;
			this.diffEditorContainer.style.minHeight = `${fullHeight}px`;
			this.diffEditorContainer.style.maxHeight = `${fullHeight}px`;
			this.diffEditorContainer.style.overflow = 'hidden'; // No scroll in full expanded
		}

		if (this.diffBlock) {
			this.diffBlock.style.height = `${fullHeight}px`;
			this.diffBlock.style.minHeight = `${fullHeight}px`;
			this.diffBlock.style.maxHeight = `${fullHeight}px`;
			this.diffBlock.style.overflow = 'hidden'; // No scroll in full expanded
		}

		if (this.expandChevron) {
			this.expandChevron.className = 'codicon codicon-chevron-up';
		}

		// If streaming editor is active, resize it to full height
		if (this.streamingEditor && this.diffEditorContainer?.parentElement) {
			const width = this.diffEditorContainer.parentElement.clientWidth || 507;
			this.streamingEditor.layout({ width, height: fullHeight });
		}

		setTimeout(() => {
			this.diffEditor?.layout();
			if (this.streamingEditor && this.diffEditorContainer?.parentElement) {
				const width = this.diffEditorContainer.parentElement.clientWidth || 507;
				this.streamingEditor.layout({ width, height: fullHeight });
			}
		}, 250);
	}

	private collapseToInitial(): void {
		this.isFullyExpanded = false;

		if (this.diffEditorContainer) {
			this.diffEditorContainer.style.height = `${this.INITIAL_HEIGHT}px`;
			this.diffEditorContainer.style.minHeight = `${this.INITIAL_HEIGHT}px`;
			this.diffEditorContainer.style.maxHeight = `${this.INITIAL_HEIGHT}px`;
			this.diffEditorContainer.style.overflow = 'hidden';
		}

		if (this.diffBlock) {
			this.diffBlock.style.height = `${this.INITIAL_HEIGHT}px`;
			this.diffBlock.style.minHeight = `${this.INITIAL_HEIGHT}px`;
			this.diffBlock.style.maxHeight = `${this.INITIAL_HEIGHT}px`;
			this.diffBlock.style.overflow = 'hidden';
		}

		if (this.expandChevron) {
			this.expandChevron.className = 'codicon codicon-chevron-down';
		}

		// If streaming editor is active, resize it back to initial height
		if (this.streamingEditor && this.diffEditorContainer?.parentElement) {
			const width = this.diffEditorContainer.parentElement.clientWidth || 507;
			this.streamingEditor.layout({ width, height: this.INITIAL_HEIGHT });
		}

		setTimeout(() => {
			this.diffEditor?.layout();
			if (this.streamingEditor && this.diffEditorContainer?.parentElement) {
				const width = this.diffEditorContainer.parentElement.clientWidth || 507;
				this.streamingEditor.layout({ width, height: this.INITIAL_HEIGHT });
			}
		}, 250);
	}

	public setCollapsed(collapsed: boolean): void {
		this.isCollapsed = collapsed;

		if (this.headerSeparator) {
			this.headerSeparator.style.display = collapsed ? 'none' : 'block';
		}

		if (this.contentArea) {
			this.contentArea.style.display = collapsed ? 'none' : 'block';
		}

		if (this.expandMoreButton) {
			this.expandMoreButton.style.display = collapsed ? 'none' : 'flex';
		}

		// When expanding from collapsed, always go to slightly expanded state
		if (!collapsed && this.isFullyExpanded) {
			this.collapseToInitial();
		}
	}

	private calculateFullHeight(): number {
		// For streaming, use streaming content length
		if (this.currentContent.isStreaming && this.currentContent.streamingContent) {
			const streamingLines = this.currentContent.streamingContent.split('\n').length;
			const calculatedHeight = (streamingLines * this.LINE_HEIGHT) + 12;
			return Math.max(this.INITIAL_HEIGHT, calculatedHeight);
		}

		// For diff view, use the LONGER of the two sides (side-by-side display)
		const originalLines = this.currentContent.originalContent.split('\n').length;
		const modifiedLines = this.currentContent.modifiedContent.split('\n').length;
		const maxLines = Math.max(originalLines, modifiedLines);

		// Add generous padding to account for diff decorations, gutters, and spacing
		// This ensures NO scroll appears even with diff highlighting
		const extraPadding = 48; // Extra space for diff decorations

		// Full expanded = exact height to fit ALL content (no max cap, no scroll)
		const calculatedHeight = (maxLines * this.LINE_HEIGHT) + extraPadding;
		return Math.max(this.INITIAL_HEIGHT, calculatedHeight);
	}


	private detectLanguageFromFilename(fileName: string): string {
		const ext = fileName.split('.').pop()?.toLowerCase() || '';
		const languageMap: Record<string, string> = {
			'ts': 'typescript',
			'tsx': 'typescriptreact',
			'js': 'javascript',
			'jsx': 'javascriptreact',
			'py': 'python',
			'java': 'java',
			'c': 'c',
			'cpp': 'cpp',
			'cs': 'csharp',
			'go': 'go',
			'rs': 'rust',
			'rb': 'ruby',
			'php': 'php',
			'swift': 'swift',
			'kt': 'kotlin',
			'css': 'css',
			'scss': 'scss',
			'html': 'html',
			'xml': 'xml',
			'json': 'json',
			'yaml': 'yaml',
			'yml': 'yaml',
			'md': 'markdown',
			'sql': 'sql',
			'sh': 'shell',
			'bash': 'shell',
			'zsh': 'shell'
		};
		return languageMap[ext] || 'plaintext';
	}

	override hasSameContent(other: VybeChatTextEditPart): boolean {
		if (!(other instanceof VybeChatTextEditPart)) {
			return false;
		}
		return this.currentContent.fileName === other.currentContent.fileName &&
			this.currentContent.originalContent === other.currentContent.originalContent &&
			this.currentContent.modifiedContent === other.currentContent.modifiedContent;
	}

	updateContent(newContent: IVybeChatTextEditContent): void {
		this.currentContent = newContent;
		if (this.diffEditor) {
			// Get old models to dispose them
			const oldModel = this.diffEditor.getModel();

			const languageId = newContent.language || this.detectLanguageFromFilename(newContent.fileName);

			const originalUri = URI.parse(`vybe-chat-original:///${this.uniqueId}-update/${newContent.fileName}`);
			const modifiedUri = URI.parse(`vybe-chat-modified:///${this.uniqueId}-update/${newContent.fileName}`);

			const originalModel = this.modelService.createModel(newContent.originalContent, this.languageService.createById(languageId), originalUri);
			const modifiedModel = this.modelService.createModel(newContent.modifiedContent, this.languageService.createById(languageId), modifiedUri);

			this.diffEditor.setModel({
				original: originalModel,
				modified: modifiedModel
			});

			// Dispose old models AFTER setting new ones
			if (oldModel) {
				oldModel.original?.dispose();
				oldModel.modified?.dispose();
			}

			this._register(originalModel);
			this._register(modifiedModel);
		}
	}

	override dispose(): void {
		// Clean up streaming interval
		if (this.streamingIntervalId) {
			clearInterval(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		// Dispose editors first (before calling super.dispose())
		// This ensures proper cleanup order
		if (this.diffEditor) {
			try {
				// Clear model first, then dispose editor
				this.diffEditor.setModel(null);
				this.diffEditor.dispose();
			} catch (e) {
				// Ignore errors if editor already disposed
			}
			this.diffEditor = null;
		}

		if (this.streamingEditor) {
			try {
				// Clear model first, then dispose editor
				this.streamingEditor.setModel(null);
				this.streamingEditor.dispose();
			} catch (e) {
				// Ignore errors if editor already disposed
			}
			this.streamingEditor = null;
		}

		// Clear references
		this.headerElement = null;
		this.headerSeparator = null;
		this.contentArea = null;
		this.diffBlock = null;
		this.diffEditorContainer = null;
		this.expandMoreButton = null;
		this.expandChevron = null;
		this.iconElement = null;
		this.loadingSpinner = null;
		this.hoverChevron = null;

		// Now dispose registered disposables (models, event listeners)
		super.dispose();
	}
}
