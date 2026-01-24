/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatTextEditContent, IVybeChatContentPart } from './vybeChatContentPart.js';
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
	public onStreamingUpdate?: () => void; // Callback for parent to handle scrolling
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
	private confirmationRow: HTMLElement | null = null;  // Second header row for Accept/Reject buttons
	private acceptButton: HTMLElement | null = null;
	private rejectButton: HTMLElement | null = null;
	private deleteStatusIcon: HTMLElement | null = null;  // Red close icon shown after delete is accepted

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

		// Check if this requires confirmation (write_file new files or delete_file)
		const requiresConfirmation = this.currentContent.requiresConfirmation === true;
		const isPendingApproval = requiresConfirmation && this.currentContent.approvalState === 'pending';

		// Header separator (1px line)
		this.headerSeparator = $('div');
		this.headerSeparator.style.height = '1px';
		this.headerSeparator.style.background = 'var(--cursor-stroke-secondary)';
		this.headerSeparator.style.width = '100%';
		// Hide separator if pending approval (no content area to separate)
		this.headerSeparator.style.display = isPendingApproval ? 'none' : 'block';

		// Content area
		this.contentArea = $('.composer-code-block-content');
		// Hide content area if pending approval (only show after acceptance)
		this.contentArea.style.display = isPendingApproval ? 'none' : 'block';
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
		// If pending approval, don't create any editor yet (will be created when accept is clicked)
		if (isPendingApproval) {
			// Don't create editor yet - will be created when accept is clicked
		} else if (this.currentContent.isStreaming) {
			this.createStreamingEditor(this.diffEditorContainer);
		} else {
			this.createDiffEditor(this.diffEditorContainer);
		}

		// Assemble diff structure
		this.diffBlock.appendChild(this.diffEditorContainer);
		this.contentArea.appendChild(this.diffBlock);

		// Expand bar (absolute positioned at bottom) - only if more than 4 lines of diff
		// Don't create expand bar if pending approval (no content to expand)
		this.expandMoreButton = isPendingApproval ? null : this.createExpandButton();

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

		// Register hover effects AFTER all elements are created (contentArea now exists)
		// Only register if NOT pending approval (for new files, will be registered in handleAccept)
		if (!isPendingApproval) {
			this.registerHeaderHoverEffects();
		}

		return outerContainer;
	}

	private createHeader(): HTMLElement {
		const header = $('.composer-code-block-header');

		// Check if this requires confirmation (write_file new files or delete_file)
		const requiresConfirmation = this.currentContent.requiresConfirmation === true;
		const isPendingApproval = requiresConfirmation && this.currentContent.approvalState === 'pending';

		// File info (styling in CSS)
		const fileInfo = $('.composer-code-block-file-info');

		// File icon container with loading/hover states
		const iconSpan = $('span.composer-primary-toolcall-icon');
		const iconWrapper = $('.show-file-icons');
		const iconContainer = $('div');
		iconContainer.style.cssText = 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;';

		// Create hover chevron first (always present, works during streaming too)
		// Always chevron-down, rotates 90 degrees when collapsed
		this.hoverChevron = $('span.codicon.codicon-chevron-down');
		this.hoverChevron.style.cssText = 'font-size: 12px; color: var(--vscode-foreground); opacity: 0; position: absolute; pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease; transform-origin: center;';
		// Set initial rotation based on collapsed state
		this.hoverChevron.style.transform = this.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
		iconContainer.appendChild(this.hoverChevron);

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

			iconContainer.appendChild(this.iconElement);
		}

		iconWrapper.appendChild(iconContainer);
		iconSpan.appendChild(iconWrapper);

		// Filename (direction and styling in CSS)
		const filenameSpan = $('span.composer-code-block-filename');
		const filenameBidi = $('span');
		filenameBidi.textContent = this.currentContent.fileName;
		filenameSpan.appendChild(filenameBidi);

		// Stats (styling in CSS) - only show after streaming is complete (not in pending approval)
		const statsSpan = $('span.composer-code-block-status');
		const statsInner = $('span');
		const statsContainer = $('div');
		statsContainer.setAttribute('data-stats-inner', 'true'); // Mark for later updates

		// Only show stats if NOT pending approval AND NOT streaming (stats appear after AI streams and completes)
		if (!isPendingApproval && !this.currentContent.isStreaming) {
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

		// Operation type text moved to bottom row (confirmation row)

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

		if (isPendingApproval) {
			// Make header double height (56px = 2 * 28px) and stack rows vertically
			header.style.height = '56px';
			header.style.flexDirection = 'column';
			header.style.justifyContent = 'flex-start';
			header.style.padding = '0'; // Remove padding from header, add to rows
			header.style.gap = '0'; // No gap between rows
			header.style.margin = '0'; // No margin
			header.style.lineHeight = '1'; // Prevent line-height from affecting height
			header.style.borderRadius = '8px'; // Fully rounded when no content area
			header.style.borderBottom = 'none'; // No border when no content area below

			// Wrap first row (fileInfo + actions) in a container to maintain original layout
			const firstRow = $('div');
			firstRow.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 0 8px;
				height: 28px;
				min-height: 28px;
				max-height: 28px;
				width: 100%;
				box-sizing: border-box;
				margin: 0;
				line-height: 1;
			`;
			firstRow.appendChild(fileInfo);
			firstRow.appendChild(actionsOuterWrapper);

			header.appendChild(firstRow);

			// Create and append confirmation row (second row with Accept/Reject buttons)
			this.confirmationRow = this.createConfirmationRow();
			header.appendChild(this.confirmationRow);
		} else {
			// Normal layout: fileInfo and actionsOuterWrapper directly in header
			header.appendChild(fileInfo);
			header.appendChild(actionsOuterWrapper);
		}

		// Don't register hover effects here - contentArea doesn't exist yet
		// Will be registered in createDomNode() after all elements are created

		return header;
	}

	private registerHeaderHoverEffects(): void {
		if (!this.headerElement) return;

		// Show chevron/hover effects when content area exists (including during streaming)
		this._register(addDisposableListener(this.headerElement, 'mouseenter', () => {
			// Only show hover chevron if content area exists (works during streaming too)
			if (!this.contentArea) {
				return;
			}

			// Update chevron rotation based on current collapsed state
			if (this.hoverChevron) {
				this.hoverChevron.style.transform = this.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
			}

			// Show chevron on hover - hide icon (file icon or loading spinner) and show chevron
			if (this.hoverChevron) {
				// Hide file icon if visible
				if (this.iconElement && this.iconElement.style.display !== 'none' && this.iconElement.parentNode) {
					this.iconElement.style.opacity = '0';
				}
				// Hide loading spinner if visible
				if (this.loadingSpinner && this.loadingSpinner.parentNode) {
					this.loadingSpinner.style.opacity = '0';
				}
				// Show hover chevron
				this.hoverChevron.style.opacity = '0.7';
			}
		}));

		this._register(addDisposableListener(this.headerElement, 'mouseleave', () => {
			if (this.hoverChevron) {
				this.hoverChevron.style.opacity = '0';
			}
			// Restore file icon if visible
			if (this.iconElement && this.iconElement.style.display !== 'none' && this.iconElement.parentNode) {
				this.iconElement.style.opacity = '1';
			}
			// Restore loading spinner if visible
			if (this.loadingSpinner && this.loadingSpinner.parentNode) {
				this.loadingSpinner.style.opacity = '0.7';
			}
		}));

		// Single click header to toggle collapsed/slightly expanded (works during streaming too)
		this._register(addDisposableListener(this.headerElement, 'click', (e: MouseEvent) => {
			// Don't toggle if clicking on Accept/Reject buttons (they handle their own clicks)
			const target = e.target as HTMLElement;
			if (target.closest('.anysphere-button') || target.closest('.anysphere-text-button')) {
				return;
			}

			// Allow collapsing/expanding even during loading (streaming)
			if (!this.contentArea) {
				return;
			}

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

			// Update chevron rotation after state change
			if (this.hoverChevron) {
				this.hoverChevron.style.transform = this.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
			}
		}));
	}

	private createConfirmationRow(): HTMLElement {
		// Second row of header with Accept/Reject buttons - match terminal control row structure
		const confirmationRow = $('div');
		confirmationRow.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0 8px;
			height: 28px;
			min-height: 28px;
			max-height: 28px;
			width: 100%;
			box-sizing: border-box;
			margin: 0;
			line-height: 1;
		`;

		// Left side - operation type text (Delete / Create file)
		const leftControls = $('div');
		leftControls.style.cssText = 'display: flex; align-items: center; flex: 0 0 auto;';

		// Determine if it's create or delete based on content
		// Delete: originalContent has content, modifiedContent is empty
		// Create: originalContent is empty, modifiedContent has content
		// Use explicit flags if available, otherwise infer from content
		const isDelete = this.currentContent.isDelete ?? (this.currentContent.originalContent.trim().length > 0 && this.currentContent.modifiedContent.trim().length === 0);
		const isCreate = this.currentContent.isCreate ?? (this.currentContent.originalContent.trim().length === 0 && this.currentContent.modifiedContent.trim().length > 0);

		const operationText = $('span');
		if (isDelete) {
			operationText.textContent = 'Delete';
		} else if (isCreate) {
			operationText.textContent = 'Create file';
		} else {
			operationText.textContent = 'Modify file'; // Fallback
		}
		operationText.style.cssText = `
			font-size: 12px;
			line-height: 16px;
			color: var(--cursor-text-secondary);
			opacity: 0.4;
			white-space: nowrap;
		`;
		leftControls.appendChild(operationText);

		// Right side - buttons container (match terminal statusRow)
		const buttonContainer = $('div');
		buttonContainer.style.cssText = `
			display: flex;
			gap: 4px;
			align-items: center;
			flex: 0 0 auto;
		`;

		// Reject button - match terminal Skip button styling
		this.rejectButton = $('.anysphere-text-button');
		this.rejectButton.textContent = 'Reject';
		this.rejectButton.style.cssText = `
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
			background: transparent;
			color: var(--cursor-text-secondary);
			border: none;
		`;
		this._register(addDisposableListener(this.rejectButton, 'mouseenter', () => {
			if (this.rejectButton) {
				this.rejectButton.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
			}
		}));
		this._register(addDisposableListener(this.rejectButton, 'mouseleave', () => {
			if (this.rejectButton) {
				this.rejectButton.style.backgroundColor = 'transparent';
			}
		}));

		// Reject button click handler
		this._register(addDisposableListener(this.rejectButton, 'click', (e: MouseEvent) => {
			e.stopPropagation(); // Prevent bubbling to header click handler
			this.handleReject();
		}));

		// Accept button - match terminal Run button styling exactly
		this.acceptButton = $('.anysphere-button');
		this.acceptButton.style.cssText = `
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
		const acceptText = $('span');
		acceptText.textContent = 'Accept';
		this.acceptButton.appendChild(acceptText);

		this._register(addDisposableListener(this.acceptButton, 'mouseenter', () => {
			if (this.acceptButton) {
				this.acceptButton.style.backgroundColor = '#35b87d';
			}
		}));
		this._register(addDisposableListener(this.acceptButton, 'mouseleave', () => {
			if (this.acceptButton) {
				this.acceptButton.style.backgroundColor = '#3ecf8e';
			}
		}));

		// Accept button click handler
		this._register(addDisposableListener(this.acceptButton, 'click', (e: MouseEvent) => {
			e.stopPropagation(); // Prevent bubbling to header click handler
			this.handleAccept();
		}));
		// TODO: Add click handler for HITL resume

		buttonContainer.appendChild(this.rejectButton);
		buttonContainer.appendChild(this.acceptButton);

		// Assemble row - left side (empty) + right side (buttons)
		confirmationRow.appendChild(leftControls);
		confirmationRow.appendChild(buttonContainer);

		return confirmationRow;
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
		const streamNextLine = async () => {
			if (currentLineIndex >= lines.length) {
				// Streaming complete - transition to diff view
				console.log('[TextEdit Streaming] Complete!');
				if (this.streamingIntervalId) {
					clearInterval(this.streamingIntervalId);
					this.streamingIntervalId = null;
				}

				// Update state: streaming complete, now show diff
				this.currentContent.isStreaming = false;
				this.currentContent.isLoading = false;

				// Respect user's choice: if they collapsed it during streaming, keep it collapsed
				// Only update chevron rotation to match current state (don't force expansion)
				if (this.hoverChevron) {
					this.hoverChevron.style.transform = this.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
				}

				// Replace streaming editor with diff editor
				if (this.streamingEditor && this.diffEditorContainer) {
					// Clear container first
					while (this.diffEditorContainer.firstChild) {
						this.diffEditorContainer.removeChild(this.diffEditorContainer.firstChild);
					}

					// Dispose existing diff editor if it exists
					if (this.diffEditor) {
						const oldModel = this.diffEditor.getModel();
						if (oldModel) {
							oldModel.original?.dispose();
							oldModel.modified?.dispose();
						}
						this.diffEditor.dispose();
						this.diffEditor = null;
					}

					// Create diff editor first (will check for existing models)
					this.createDiffEditor(this.diffEditorContainer);

					// Now dispose streaming editor and its model AFTER diff editor is set up
					const streamingModel = this.streamingEditor.getModel();
					this.streamingEditor.dispose();
					this.streamingEditor = null;

					// Dispose streaming model AFTER diff editor has its models set
					if (streamingModel) {
						// Small delay to ensure diff editor is fully initialized
						setTimeout(() => {
							streamingModel.dispose();
						}, 100);
					}

					// Show stats now that streaming is complete
					this.updateStatsDisplay();

					// Show expand bar if content is longer than initial height
					const totalDiffLines = this.currentContent.addedLines + this.currentContent.deletedLines;
					if (totalDiffLines > this.MIN_LINES_FOR_EXPAND_BAR && !this.expandMoreButton) {
						this.expandMoreButton = this.createExpandButton();
						if (this.expandMoreButton) {
							const codeBlockContainer = this.domNode.querySelector('.composer-code-block-container');
							if (codeBlockContainer) {
								codeBlockContainer.appendChild(this.expandMoreButton);
							}
						}
						// Add padding for expand bar
						if (this.contentArea) {
							this.contentArea.style.paddingBottom = '16px';
						}
					}

					// Restore file icon (remove loading spinner, create file icon if needed)
					const iconSpan = this.headerElement?.querySelector('.composer-primary-toolcall-icon');
					const iconWrapper = iconSpan?.querySelector('.show-file-icons');
					const iconContainer = iconWrapper?.querySelector('div') as HTMLElement;

					if (iconContainer) {
						// Remove loading spinner
						if (this.loadingSpinner && this.loadingSpinner.parentNode) {
							this.loadingSpinner.parentNode.removeChild(this.loadingSpinner);
							this.loadingSpinner = null;
						}

						// Create file icon if it doesn't exist
						if (!this.iconElement) {
							const filePath = this.currentContent.filePath || `/file/${this.currentContent.fileName}`;
							const fileUri = URI.file(filePath);
							const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);

							this.iconElement = $('div.monaco-icon-label.file-icon');
							const classString = Array.isArray(iconClasses) ? iconClasses.join(' ') : iconClasses;
							this.iconElement.className = `monaco-icon-label file-icon ${classString}`;
							this.iconElement.style.height = '100%';
							this.iconElement.style.transition = 'opacity 0.15s ease';

							// Insert before hover chevron (hover chevron should be last)
							if (this.hoverChevron && this.hoverChevron.parentNode === iconContainer) {
								iconContainer.insertBefore(this.iconElement, this.hoverChevron);
							} else {
								iconContainer.appendChild(this.iconElement);
							}
						} else {
							// File icon exists, just make sure it's visible
							this.iconElement.style.display = '';
							this.iconElement.style.opacity = '1';
						}
					}

					// Call onFinalized callback after streaming completes (for file write)
					if (this.currentContent.onFinalized) {
						try {
							await this.currentContent.onFinalized();
						} catch (error) {
							console.error('[TextEdit] Error in onFinalized callback:', error);
						}
					}
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
			// Wrap in async IIFE to handle async callback
			this.streamingIntervalId = setTimeout(async () => {
				await streamNextLine();
			}, STREAM_DELAY_MS) as any;
		};

		// Start streaming with initial delay
		this.streamingIntervalId = setTimeout(async () => {
			await streamNextLine();
		}, 300) as any; // 300ms delay before starting
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

		// Check if models already exist, if so update them, otherwise create new ones
		let originalModel = this.modelService.getModel(originalUri);
		let modifiedModel = this.modelService.getModel(modifiedUri);

		if (originalModel) {
			// Model exists, update it
			originalModel.setValue(this.currentContent.originalContent);
		} else {
			// Model doesn't exist, create it
			originalModel = this.modelService.createModel(this.currentContent.originalContent, this.languageService.createById(languageId), originalUri);
			this._register(originalModel);
		}

		if (modifiedModel) {
			// Model exists, update it
			modifiedModel.setValue(this.currentContent.modifiedContent);
		} else {
			// Model doesn't exist, create it
			modifiedModel = this.modelService.createModel(this.currentContent.modifiedContent, this.languageService.createById(languageId), modifiedUri);
			this._register(modifiedModel);
		}

		this.diffEditor.setModel({
			original: originalModel,
			modified: modifiedModel
		});

		// Models are already registered if they were newly created

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
		console.log('[setCollapsed] Called with:', { collapsed, currentIsCollapsed: this.isCollapsed, isFullyExpanded: this.isFullyExpanded });

		this.isCollapsed = collapsed;

		// Update chevron rotation when state changes
		if (this.hoverChevron) {
			this.hoverChevron.style.transform = this.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
		}

		// Find content area in DOM to ensure we have the right reference
		const codeBlockContainer = this.domNode?.querySelector('.composer-code-block-container');
		const contentAreaInDom = codeBlockContainer?.querySelector('.composer-code-block-content') as HTMLElement;
		const contentAreaToUse = contentAreaInDom || this.contentArea;

		if (this.headerSeparator) {
			if (collapsed) {
				this.headerSeparator.style.display = 'none';
			} else {
				this.headerSeparator.style.setProperty('display', 'block', 'important');
			}
		}

		if (contentAreaToUse) {
			if (collapsed) {
				contentAreaToUse.style.display = 'none';
				console.log('[setCollapsed] Hiding content area');
			} else {
				// Use !important when showing to ensure it's visible
				contentAreaToUse.style.removeProperty('display');
				contentAreaToUse.style.setProperty('display', 'block', 'important');
				contentAreaToUse.style.setProperty('visibility', 'visible', 'important');
				// Ensure it has a minimum height so it's actually visible
				contentAreaToUse.style.setProperty('min-height', '1px', 'important');
				console.log('[setCollapsed] Showing content area:', {
					inlineDisplay: contentAreaToUse.style.display,
					computedDisplay: window.getComputedStyle(contentAreaToUse).display,
					computedHeight: window.getComputedStyle(contentAreaToUse).height,
					computedVisibility: window.getComputedStyle(contentAreaToUse).visibility
				});
			}
			// Update stored reference
			this.contentArea = contentAreaToUse;
		} else {
			console.warn('[setCollapsed] Content area not found!');
		}

		if (this.expandMoreButton) {
			this.expandMoreButton.style.display = collapsed ? 'none' : 'flex';
		}

		// When expanding from collapsed, always go to slightly expanded state
		// BUT: Don't collapse if we're in streaming state - user wants to see the stream!
		if (!collapsed && this.isFullyExpanded && !this.currentContent.isStreaming) {
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

	override hasSameContent(other: IVybeChatContentPart): boolean {
		if (!(other instanceof VybeChatTextEditPart)) {
			return false;
		}
		return this.currentContent.fileName === other.currentContent.fileName &&
			this.currentContent.originalContent === other.currentContent.originalContent &&
			this.currentContent.modifiedContent === other.currentContent.modifiedContent;
	}

	updateContent(newContent: IVybeChatTextEditContent): void {
		const wasStreaming = this.currentContent.isStreaming === true;
		const isNowStreaming = newContent.isStreaming === true;
		const isFinalizing = wasStreaming && !isNowStreaming;

		// Update current content
		this.currentContent = newContent;

		// If we're transitioning from streaming to finalized, finalize streaming first
		// Also handle case where updateContent is called with isStreaming: false before streaming animation starts
		if (isFinalizing && this.streamingEditor && !this.diffEditor) {
			// Stop streaming animation if it's running
			if (this.streamingIntervalId) {
				clearInterval(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}

			// Update state
			this.currentContent.isStreaming = false;
			this.currentContent.isLoading = false;

			// Replace streaming editor with diff editor
			if (this.diffEditorContainer) {
				// Clear container first
				while (this.diffEditorContainer.firstChild) {
					this.diffEditorContainer.removeChild(this.diffEditorContainer.firstChild);
				}

				// Dispose streaming editor and its model
				const streamingModel = this.streamingEditor.getModel();
				this.streamingEditor.dispose();
				this.streamingEditor = null;

				// Create diff editor
				this.createDiffEditor(this.diffEditorContainer);

				// Dispose streaming model AFTER diff editor is set up
				if (streamingModel) {
					setTimeout(() => {
						streamingModel.dispose();
					}, 100);
				}

				// Show stats now that streaming is complete
				this.updateStatsDisplay();

				// Show expand bar if content is longer than initial height
				const totalDiffLines = this.currentContent.addedLines + this.currentContent.deletedLines;
				if (totalDiffLines > this.MIN_LINES_FOR_EXPAND_BAR && !this.expandMoreButton) {
					this.expandMoreButton = this.createExpandButton();
					if (this.expandMoreButton) {
						const codeBlockContainer = this.domNode.querySelector('.composer-code-block-container');
						if (codeBlockContainer) {
							codeBlockContainer.appendChild(this.expandMoreButton);
						}
					}
					// Add padding for expand bar
					if (this.contentArea) {
						this.contentArea.style.paddingBottom = '16px';
					}
				}

				// Restore file icon (remove loading spinner, create file icon if needed)
				const iconSpan = this.headerElement?.querySelector('.composer-primary-toolcall-icon');
				const iconWrapper = iconSpan?.querySelector('.show-file-icons');
				const iconContainer = iconWrapper?.querySelector('div') as HTMLElement;

				if (iconContainer) {
					// Remove loading spinner
					if (this.loadingSpinner && this.loadingSpinner.parentNode) {
						this.loadingSpinner.parentNode.removeChild(this.loadingSpinner);
						this.loadingSpinner = null;
					}

					// Create file icon if it doesn't exist
					if (!this.iconElement) {
						const filePath = this.currentContent.filePath || `/file/${this.currentContent.fileName}`;
						const fileUri = URI.file(filePath);
						const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);

						this.iconElement = $('div.monaco-icon-label.file-icon');
						const classString = Array.isArray(iconClasses) ? iconClasses.join(' ') : iconClasses;
						this.iconElement.className = `monaco-icon-label file-icon ${classString}`;
						this.iconElement.style.height = '100%';
						this.iconElement.style.transition = 'opacity 0.15s ease';

						// Insert before hover chevron (hover chevron should be last)
						if (this.hoverChevron && this.hoverChevron.parentNode === iconContainer) {
							iconContainer.insertBefore(this.iconElement, this.hoverChevron);
						} else {
							iconContainer.appendChild(this.iconElement);
						}
					} else {
						// File icon exists, just make sure it's visible
						this.iconElement.style.display = '';
						this.iconElement.style.opacity = '1';
					}
				}

				// Call onFinalized callback after streaming completes (for file write)
				if (this.currentContent.onFinalized) {
					this.currentContent.onFinalized().catch((error) => {
						console.error('[TextEdit] Error in onFinalized callback:', error);
					});
				}
			}
		}

		// Update diff editor if it exists
		if (this.diffEditor) {
			// Get old models to dispose them
			const oldModel = this.diffEditor.getModel();

			const languageId = newContent.language || this.detectLanguageFromFilename(newContent.fileName);

			// Use same URIs as initial creation to reuse models if they exist
			const originalUri = URI.parse(`vybe-chat-original:///${this.uniqueId}/${newContent.fileName}`);
			const modifiedUri = URI.parse(`vybe-chat-modified:///${this.uniqueId}/${newContent.fileName}`);

			// Check if models already exist, if so update them, otherwise create new ones
			let originalModel = this.modelService.getModel(originalUri);
			let modifiedModel = this.modelService.getModel(modifiedUri);

			if (originalModel) {
				// Model exists, update it
				originalModel.setValue(newContent.originalContent);
			} else {
				// Model doesn't exist, create it
				originalModel = this.modelService.createModel(newContent.originalContent, this.languageService.createById(languageId), originalUri);
				this._register(originalModel);
			}

			if (modifiedModel) {
				// Model exists, update it
				modifiedModel.setValue(newContent.modifiedContent);
			} else {
				// Model doesn't exist, create it
				modifiedModel = this.modelService.createModel(newContent.modifiedContent, this.languageService.createById(languageId), modifiedUri);
				this._register(modifiedModel);
			}

			this.diffEditor.setModel({
				original: originalModel,
				modified: modifiedModel
			});

			// Dispose old models AFTER setting new ones (only if they're different)
			if (oldModel) {
				if (oldModel.original && oldModel.original !== originalModel) {
					oldModel.original.dispose();
				}
				if (oldModel.modified && oldModel.modified !== modifiedModel) {
					oldModel.modified.dispose();
				}
			}
		} else if (isNowStreaming && this.streamingEditor) {
			// Update streaming content if we're still streaming
			const model = this.streamingEditor.getModel();
			if (model && newContent.streamingContent) {
				model.setValue(newContent.streamingContent);
			}
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
		this.deleteStatusIcon = null;

		// Now dispose registered disposables (models, event listeners)
		super.dispose();
	}

	private handleAccept(): void {
		// Update approval state to accepted
		this.currentContent.approvalState = 'accepted';

		// Determine if it's delete operation
		const isDelete = this.currentContent.originalContent.trim().length > 0 && this.currentContent.modifiedContent.trim().length === 0;

		if (isDelete) {
			// For delete: remove confirmation row, show red close icon next to filename
			if (!this.headerElement) return;

			// Remove confirmation row from DOM completely
			if (this.confirmationRow && this.confirmationRow.parentNode) {
				this.confirmationRow.parentNode.removeChild(this.confirmationRow);
			}

			// Reset header to normal height and layout
			this.headerElement.style.height = '';
			this.headerElement.style.flexDirection = '';
			this.headerElement.style.justifyContent = '';
			this.headerElement.style.padding = '';
			this.headerElement.style.gap = '';
			this.headerElement.style.margin = '';
			this.headerElement.style.lineHeight = '';
			this.headerElement.style.borderRadius = '';
			this.headerElement.style.borderBottom = '';

			// Rebuild header structure to normal layout (fileInfo + actions directly in header)
			// Find and extract fileInfo and actionsOuterWrapper from firstRow
			const firstRow = this.headerElement.querySelector('div');
			if (firstRow && firstRow.parentNode === this.headerElement) {
				// Get fileInfo and actionsOuterWrapper from firstRow
				const fileInfo = firstRow.querySelector('.composer-code-block-file-info') as HTMLElement;
				// actionsOuterWrapper is the last direct child div of firstRow
				const actionsOuterWrapper = Array.from(firstRow.children).find(
					child => child !== fileInfo && child.tagName === 'DIV'
				) as HTMLElement;

				if (fileInfo && actionsOuterWrapper) {
					// Remove firstRow completely
					firstRow.remove();

					// Clear header by removing all children manually (avoid innerHTML for TrustedHTML)
					while (this.headerElement.firstChild) {
						this.headerElement.removeChild(this.headerElement.firstChild);
					}

					// Rebuild in correct order
					// fileInfo first (left side), then actionsOuterWrapper (right side)
					this.headerElement.appendChild(fileInfo);
					this.headerElement.appendChild(actionsOuterWrapper);

					// Ensure header has proper flex layout (should be set by CSS, but ensure it)
					this.headerElement.style.display = 'flex';
					this.headerElement.style.justifyContent = 'space-between';
					this.headerElement.style.alignItems = 'center';
				}
			}

			// Add red close icon next to filename
			this.addDeleteStatusIcon();
		} else {
			// For create: hide confirmation row, show content area, start streaming
			if (!this.headerElement) return;

			// Remove confirmation row from DOM completely
			if (this.confirmationRow && this.confirmationRow.parentNode) {
				this.confirmationRow.parentNode.removeChild(this.confirmationRow);
			}

			// Reset header to normal height and layout
			this.headerElement.style.height = '';
			this.headerElement.style.flexDirection = '';
			this.headerElement.style.justifyContent = '';
			this.headerElement.style.padding = '';
			this.headerElement.style.gap = '';
			this.headerElement.style.margin = '';
			this.headerElement.style.lineHeight = '';
			this.headerElement.style.borderRadius = '';
			this.headerElement.style.borderBottom = '';

			// Rebuild header structure to normal layout (fileInfo + actions directly in header)
			// Find and extract fileInfo and actionsOuterWrapper from firstRow
			const firstRow = this.headerElement.querySelector('div');
			if (firstRow && firstRow.parentNode === this.headerElement) {
				// Get fileInfo and actionsOuterWrapper from firstRow
				const fileInfo = firstRow.querySelector('.composer-code-block-file-info') as HTMLElement;
				// actionsOuterWrapper is the last direct child div of firstRow
				const actionsOuterWrapper = Array.from(firstRow.children).find(
					child => child !== fileInfo && child.tagName === 'DIV'
				) as HTMLElement;

				if (fileInfo && actionsOuterWrapper) {
					// Remove firstRow completely
					firstRow.remove();

					// Clear header by removing all children manually (avoid innerHTML for TrustedHTML)
					while (this.headerElement.firstChild) {
						this.headerElement.removeChild(this.headerElement.firstChild);
					}

					// Rebuild in correct order
					// fileInfo first (left side), then actionsOuterWrapper (right side)
					this.headerElement.appendChild(fileInfo);
					this.headerElement.appendChild(actionsOuterWrapper);

					// Ensure header has proper flex layout (should be set by CSS, but ensure it)
					this.headerElement.style.display = 'flex';
					this.headerElement.style.justifyContent = 'space-between';
					this.headerElement.style.alignItems = 'center';
				}
			}

			// FIRST: Set state to expanded BEFORE doing anything else
			this.isCollapsed = false;
			this.isFullyExpanded = false;

			// Find content area in DOM (it might be in the codeBlockContainer)
			const codeBlockContainer = this.domNode?.querySelector('.composer-code-block-container');
			const contentAreaInDom = codeBlockContainer?.querySelector('.composer-code-block-content') as HTMLElement;

			// Use DOM element if found, otherwise use stored reference
			const contentAreaToShow = contentAreaInDom || this.contentArea;

			// Debug: Log what we found
			console.log('[TextEdit Accept] Content area found:', {
				hasContentArea: !!this.contentArea,
				hasContentAreaInDom: !!contentAreaInDom,
				contentAreaToShow: !!contentAreaToShow,
				isCollapsed: this.isCollapsed,
				contentAreaDisplay: contentAreaToShow?.style.display,
				contentAreaComputedDisplay: contentAreaToShow ? window.getComputedStyle(contentAreaToShow).display : 'N/A'
			});

			// Show content area and all containers BEFORE creating streaming editor
			// Remove ALL display-related styles first, then set to block with !important
			if (contentAreaToShow) {
				// Remove all display-related inline styles
				contentAreaToShow.style.removeProperty('display');
				contentAreaToShow.style.removeProperty('visibility');
				contentAreaToShow.style.removeProperty('opacity');
				contentAreaToShow.style.removeProperty('height');
				// Set to block with !important
				contentAreaToShow.style.setProperty('display', 'block', 'important');
				contentAreaToShow.style.setProperty('visibility', 'visible', 'important');
				contentAreaToShow.style.setProperty('opacity', '1', 'important');
				// Update stored reference
				this.contentArea = contentAreaToShow;

				console.log('[TextEdit Accept] After setting display:', {
					inlineDisplay: contentAreaToShow.style.display,
					computedDisplay: window.getComputedStyle(contentAreaToShow).display,
					isVisible: window.getComputedStyle(contentAreaToShow).display !== 'none'
				});
			} else {
				console.error('[TextEdit Accept] Content area not found!', {
					hasDomNode: !!this.domNode,
					hasCodeBlockContainer: !!codeBlockContainer,
					hasStoredContentArea: !!this.contentArea
				});
			}
			if (this.headerSeparator) {
				this.headerSeparator.style.removeProperty('display');
				this.headerSeparator.style.setProperty('display', 'block', 'important');
			}
			if (this.diffBlock) {
				this.diffBlock.style.removeProperty('display');
				this.diffBlock.style.removeProperty('visibility');
				this.diffBlock.style.setProperty('display', 'block', 'important');
				this.diffBlock.style.setProperty('visibility', 'visible', 'important');
			}
			if (this.diffEditorContainer) {
				this.diffEditorContainer.style.removeProperty('display');
				this.diffEditorContainer.style.removeProperty('visibility');
				this.diffEditorContainer.style.setProperty('display', 'block', 'important');
				this.diffEditorContainer.style.setProperty('visibility', 'visible', 'important');
			}

			// Also ensure parent containers are visible
			if (codeBlockContainer && codeBlockContainer instanceof HTMLElement) {
				codeBlockContainer.style.setProperty('display', 'block', 'important');
			}

			// Start streaming the content
			// Set streamingContent to modifiedContent for create file
			this.currentContent.streamingContent = this.currentContent.modifiedContent;
			this.currentContent.isStreaming = true;
			this.currentContent.isLoading = true;

			// Update icon to loading spinner and ensure hover chevron exists
			// Find the icon container in the rebuilt header
			const iconSpan = this.headerElement?.querySelector('.composer-primary-toolcall-icon');
			const iconWrapper = iconSpan?.querySelector('.show-file-icons');
			const iconContainer = iconWrapper?.querySelector('div') as HTMLElement;

			if (iconContainer) {
				// Clear existing content
				while (iconContainer.firstChild) {
					iconContainer.removeChild(iconContainer.firstChild);
				}

				// Create hover chevron first (always present, works during streaming)
				// Since isCollapsed is now false, chevron should be at 0deg (expanded state)
				this.hoverChevron = $('span.codicon.codicon-chevron-down');
				this.hoverChevron.style.cssText = 'font-size: 12px; color: var(--vscode-foreground); opacity: 0; position: absolute; pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease; transform-origin: center;';
				this.hoverChevron.style.transform = 'rotate(0deg)'; // Expanded state
				iconContainer.appendChild(this.hoverChevron);

				// Create loading spinner
				this.loadingSpinner = $('span.codicon.codicon-loading.codicon-modifier-spin');
				this.loadingSpinner.style.cssText = 'font-size: 16px; color: var(--vscode-foreground); opacity: 0.7;';
				iconContainer.appendChild(this.loadingSpinner);

				// Clear iconElement reference since we're showing spinner
				this.iconElement = null;
			}

			// Dispose existing diff editor if it exists (from initial creation)
			if (this.diffEditor && this.diffEditorContainer) {
				const oldModel = this.diffEditor.getModel();
				if (oldModel) {
					oldModel.original?.dispose();
					oldModel.modified?.dispose();
				}
				this.diffEditor.dispose();
				this.diffEditor = null;

				// Clear container
				while (this.diffEditorContainer.firstChild) {
					this.diffEditorContainer.removeChild(this.diffEditorContainer.firstChild);
				}
			}

			// Create streaming editor (will be created fresh)
			if (this.diffEditorContainer) {
				// Ensure diffEditorContainer and diffBlock are visible BEFORE creating editor
				this.diffEditorContainer.style.setProperty('display', 'block', 'important');
				this.diffEditorContainer.style.setProperty('visibility', 'visible', 'important');
				this.diffEditorContainer.style.setProperty('min-height', '90px', 'important'); // Ensure it has height

				if (this.diffBlock) {
					this.diffBlock.style.setProperty('display', 'block', 'important');
					this.diffBlock.style.setProperty('visibility', 'visible', 'important');
					this.diffBlock.style.setProperty('min-height', '90px', 'important'); // Ensure it has height
				}

				this.createStreamingEditor(this.diffEditorContainer);
			}

			// Call setCollapsed to ensure everything is in sync (state already set above)
			// But first, ensure content area is still visible (double-check)
			if (this.contentArea) {
				this.contentArea.style.setProperty('display', 'block', 'important');
				this.contentArea.style.setProperty('visibility', 'visible', 'important');
				this.contentArea.style.setProperty('min-height', '90px', 'important'); // Ensure it has height
			}
			if (this.headerSeparator) {
				this.headerSeparator.style.setProperty('display', 'block', 'important');
			}

			// Ensure parent container is also visible (reuse the one we found earlier)
			const codeBlockContainerForVisibility = this.domNode?.querySelector('.composer-code-block-container');
			if (codeBlockContainerForVisibility && codeBlockContainerForVisibility instanceof HTMLElement) {
				codeBlockContainerForVisibility.style.setProperty('display', 'block', 'important');
				codeBlockContainerForVisibility.style.setProperty('visibility', 'visible', 'important');
			}

			this.setCollapsed(false);

			// After setCollapsed, force visibility again to ensure it sticks
			if (this.contentArea) {
				this.contentArea.style.setProperty('display', 'block', 'important');
				this.contentArea.style.setProperty('visibility', 'visible', 'important');
				this.contentArea.style.setProperty('min-height', '90px', 'important');
			}
			if (this.headerSeparator) {
				this.headerSeparator.style.setProperty('display', 'block', 'important');
			}
			if (this.diffBlock) {
				this.diffBlock.style.setProperty('display', 'block', 'important');
				this.diffBlock.style.setProperty('visibility', 'visible', 'important');
				this.diffBlock.style.setProperty('min-height', '90px', 'important');
			}
			if (this.diffEditorContainer) {
				this.diffEditorContainer.style.setProperty('display', 'block', 'important');
				this.diffEditorContainer.style.setProperty('visibility', 'visible', 'important');
				this.diffEditorContainer.style.setProperty('min-height', '90px', 'important');
			}

			// Re-register hover effects on the rebuilt header (so chevron shows on hover during streaming)
			this.registerHeaderHoverEffects();
		}

		// TODO: Resume LangGraph HITL with toolCallId
	}

	private handleReject(): void {
		// Update approval state to rejected
		this.currentContent.approvalState = 'rejected';

		// Determine if it's delete operation
		const isDelete = this.currentContent.originalContent.trim().length > 0 && this.currentContent.modifiedContent.trim().length === 0;

		if (isDelete) {
			// For delete: hide confirmation row, show circle-slash icon next to filename
			if (!this.headerElement) return;

			// Remove confirmation row from DOM completely
			if (this.confirmationRow && this.confirmationRow.parentNode) {
				this.confirmationRow.parentNode.removeChild(this.confirmationRow);
			}

			// Reset header to normal height and layout
			this.headerElement.style.height = '';
			this.headerElement.style.flexDirection = '';
			this.headerElement.style.justifyContent = '';
			this.headerElement.style.padding = '';
			this.headerElement.style.gap = '';
			this.headerElement.style.margin = '';
			this.headerElement.style.lineHeight = '';
			this.headerElement.style.borderRadius = '';
			this.headerElement.style.borderBottom = '';

			// Rebuild header structure to normal layout (fileInfo + actions directly in header)
			// Find and extract fileInfo and actionsOuterWrapper from firstRow
			const firstRow = this.headerElement.querySelector('div');
			if (firstRow && firstRow.parentNode === this.headerElement) {
				// Get fileInfo and actionsOuterWrapper from firstRow
				const fileInfo = firstRow.querySelector('.composer-code-block-file-info') as HTMLElement;
				// actionsOuterWrapper is the last direct child div of firstRow
				const actionsOuterWrapper = Array.from(firstRow.children).find(
					child => child !== fileInfo && child.tagName === 'DIV'
				) as HTMLElement;

				if (fileInfo && actionsOuterWrapper) {
					// Remove firstRow completely
					firstRow.remove();

					// Clear header by removing all children manually (avoid innerHTML for TrustedHTML)
					while (this.headerElement.firstChild) {
						this.headerElement.removeChild(this.headerElement.firstChild);
					}

					// Rebuild in correct order
					// fileInfo first (left side), then actionsOuterWrapper (right side)
					this.headerElement.appendChild(fileInfo);
					this.headerElement.appendChild(actionsOuterWrapper);

					// Ensure header has proper flex layout (should be set by CSS, but ensure it)
					this.headerElement.style.display = 'flex';
					this.headerElement.style.justifyContent = 'space-between';
					this.headerElement.style.alignItems = 'center';
				}
			}

			// Add circle-slash icon next to filename (for rejected delete)
			this.addRejectStatusIcon();
		} else {
			// For create: hide confirmation row (no icon needed for rejected create)
			if (!this.headerElement) return;

			// Remove confirmation row from DOM completely
			if (this.confirmationRow && this.confirmationRow.parentNode) {
				this.confirmationRow.parentNode.removeChild(this.confirmationRow);
			}

			// Reset header to normal height and layout
			this.headerElement.style.height = '';
			this.headerElement.style.flexDirection = '';
			this.headerElement.style.justifyContent = '';
			this.headerElement.style.padding = '';
			this.headerElement.style.gap = '';
			this.headerElement.style.margin = '';
			this.headerElement.style.lineHeight = '';
			this.headerElement.style.borderRadius = '';
			this.headerElement.style.borderBottom = '';

			// Rebuild header structure to normal layout (fileInfo + actions directly in header)
			// Find and extract fileInfo and actionsOuterWrapper from firstRow
			const firstRow = this.headerElement.querySelector('div');
			if (firstRow && firstRow.parentNode === this.headerElement) {
				// Get fileInfo and actionsOuterWrapper from firstRow
				const fileInfo = firstRow.querySelector('.composer-code-block-file-info') as HTMLElement;
				// actionsOuterWrapper is the last direct child div of firstRow
				const actionsOuterWrapper = Array.from(firstRow.children).find(
					child => child !== fileInfo && child.tagName === 'DIV'
				) as HTMLElement;

				if (fileInfo && actionsOuterWrapper) {
					// Remove firstRow completely
					firstRow.remove();

					// Clear header by removing all children manually (avoid innerHTML for TrustedHTML)
					while (this.headerElement.firstChild) {
						this.headerElement.removeChild(this.headerElement.firstChild);
					}

					// Rebuild in correct order
					// fileInfo first (left side), then actionsOuterWrapper (right side)
					this.headerElement.appendChild(fileInfo);
					this.headerElement.appendChild(actionsOuterWrapper);

					// Ensure header has proper flex layout (should be set by CSS, but ensure it)
					this.headerElement.style.display = 'flex';
					this.headerElement.style.justifyContent = 'space-between';
					this.headerElement.style.alignItems = 'center';
				}
			}
			// Add circle-slash icon next to filename (for rejected create, same as delete)
			this.addRejectStatusIcon();
		}

		// TODO: Resume LangGraph HITL with toolCallId (rejected state)
	}

	private addDeleteStatusIcon(): void {
		// Find the filename span to add icon after it
		const fileInfo = this.headerElement?.querySelector('.composer-code-block-file-info');
		if (!fileInfo) return;

		// Create red close icon
		this.deleteStatusIcon = $('span.codicon.codicon-close');
		this.deleteStatusIcon.style.cssText = `
			font-size: 14px;
			color: #f48771;
			flex-shrink: 0;
		`;

		// Insert after filename span
		const filenameSpan = fileInfo.querySelector('.composer-code-block-filename');
		if (filenameSpan && filenameSpan.parentNode) {
			filenameSpan.parentNode.insertBefore(this.deleteStatusIcon, filenameSpan.nextSibling);
		}
	}

	private addRejectStatusIcon(): void {
		// Find the filename span to add icon after it
		const fileInfo = this.headerElement?.querySelector('.composer-code-block-file-info');
		if (!fileInfo) return;

		// Create circle-slash icon (for rejected)
		this.deleteStatusIcon = $('span.codicon.codicon-circle-slash');
		this.deleteStatusIcon.style.cssText = `
			font-size: 14px;
			color: #f48771;
			flex-shrink: 0;
		`;

		// Insert after filename span
		const filenameSpan = fileInfo.querySelector('.composer-code-block-filename');
		if (filenameSpan && filenameSpan.parentNode) {
			filenameSpan.parentNode.insertBefore(this.deleteStatusIcon, filenameSpan.nextSibling);
		}
	}

	private updateStatsDisplay(): void {
		// Update stats display after streaming completes
		const statsContainer = this.headerElement?.querySelector('[data-stats-inner]');
		if (!statsContainer) return;

		// Clear existing stats
		while (statsContainer.firstChild) {
			statsContainer.removeChild(statsContainer.firstChild);
		}

		// Add new stats based on current content
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
	}
}
