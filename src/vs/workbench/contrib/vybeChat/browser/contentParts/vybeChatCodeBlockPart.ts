/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatCodeBlockContent } from './vybeChatContentPart.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';

/**
 * Renders simple code blocks in AI responses with Monaco editor.
 * Clean design with just code + hover copy button.
 */
export class VybeChatCodeBlockPart extends VybeChatContentPart {
	private editor: ICodeEditor | null = null;
	private currentContent: IVybeChatCodeBlockContent;
	private targetCode: string = ''; // Full code for streaming towards
	private isStreaming: boolean = false;
	private streamingIntervalId: ReturnType<typeof setTimeout> | null = null;
	public onStreamingUpdate?: () => void; // Callback for parent to handle scrolling
	private editorContainer: HTMLElement | null = null;
	private copyButton: HTMLElement | null = null;

	constructor(
		content: IVybeChatCodeBlockContent,
		_codeBlockIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super('codeBlock');
		this.currentContent = content;
		this.targetCode = content.code;
		this.isStreaming = content.isStreaming ?? false;
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	protected createDomNode(): HTMLElement {
		// Outer container (matches markdown-code-outer-container)
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

		// Code block container
		const codeBlockContainer = $('.composer-code-block-container.composer-message-codeblock');
		codeBlockContainer.style.cssText = 'transition: border-color 0.1s ease-in-out;';

		// Position wrapper
		const positionWrapper = $('div');
		positionWrapper.style.cssText = 'position: relative; overflow: hidden;';

		// Content container
		const contentContainer = $('.composer-code-block-content');
		contentContainer.style.cssText = 'display: block; overflow: hidden;';

		// Scrollable container for Monaco editor
		this.editorContainer = $('.scrollable-div-container.show-only-on-hover');
		const lineCount = this.currentContent.code.split('\n').length;
		const lineHeight = 18;
		const padding = 12; // Top + bottom
		const height = lineCount * lineHeight + padding;
		this.editorContainer.style.cssText = `
			height: ${height}px;
			min-height: ${height}px;
			max-height: ${height}px;
			overflow-y: hidden;
			overflow-x: visible;
		`;

		// Create Monaco editor
		this.createEditor(this.editorContainer);

		// Copy button overlay
		const copyOverlay = this.createCopyOverlay();

		// Build hierarchy
		contentContainer.appendChild(this.editorContainer);
		positionWrapper.appendChild(contentContainer);
		positionWrapper.appendChild(copyOverlay);
		codeBlockContainer.appendChild(positionWrapper);
		wrapper.appendChild(codeBlockContainer);
		outerContainer.appendChild(wrapper);

		return outerContainer;
	}

	private createEditor(container: HTMLElement): void {
		// Create text model with proper language
		const languageId = this.currentContent.language || 'plaintext';
		// Start with empty content if streaming
		const initialCode = this.isStreaming ? '' : this.currentContent.code;
		const model = this.modelService.createModel(
			initialCode,
			this.languageService.createById(languageId),
			undefined
		);

		// Create Monaco editor (matches reference design)
		this.editor = this.instantiationService.createInstance(
			CodeEditorWidget,
			container,
			{
				readOnly: true,
				lineNumbers: 'off', // No line numbers in simple code blocks
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				wordWrap: 'off', // No wrapping - horizontal scroll is necessary
				fontSize: 12,
				fontFamily: 'Menlo, Monaco, "Courier New", monospace',
				lineHeight: 18,
				padding: { top: 6, bottom: 6 },
				overviewRulerLanes: 0,
				scrollbar: {
					vertical: 'hidden', // Disable vertical scroll completely (fixed height)
					horizontal: 'auto', // Keep horizontal scroll for long lines
					verticalScrollbarSize: 0,
					horizontalScrollbarSize: 6,
					alwaysConsumeMouseWheel: false // Let page scroll work over code blocks
				},
				glyphMargin: false,
				folding: false,
				selectOnLineNumbers: false,
				selectionHighlight: false,
				automaticLayout: true, // Enable automatic layout
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

		this.editor.setModel(model);
		this._register(this.editor);
		this._register(model);

		// Calculate and set EXACT height to prevent any vertical scroll
		const lineCount = model.getLineCount();
		const height = lineCount * 18 + 12;
		container.style.height = `${height}px`;
		container.style.minHeight = `${height}px`;
		container.style.maxHeight = `${height}px`;
		container.style.overflow = 'hidden'; // Prevent any overflow

		// Initial layout with proper width
		setTimeout(() => {
			if (this.editor && container.parentElement) {
				const width = container.parentElement.clientWidth || 507;
				this.editor.layout({ width, height });

				// Start streaming if needed
				if (this.isStreaming && this.targetCode) {
					setTimeout(() => {
						this.startStreamingAnimation(model, container);
					}, 300); // Small delay before starting
				}
			}
		}, 0);
	}

	/**
	 * Stream code content line-by-line (like text edit streaming).
	 */
	private startStreamingAnimation(model: ITextModel, container: HTMLElement): void {
		const lines = this.targetCode.split('\n');
		let currentLineIndex = 0;
		let currentCode = '';
		const STREAM_DELAY_MS = 70; // 70ms per line (consistent with text edit)

		const streamNextLine = () => {
			if (currentLineIndex >= lines.length || !this.isStreaming) {
				// Streaming complete
				this.streamingIntervalId = null;
				return;
			}

			// Add 1 line at a time
			currentCode += (currentLineIndex > 0 ? '\n' : '') + lines[currentLineIndex];
			currentLineIndex++;

			// Update model
			model.setValue(currentCode);

			// Update height to accommodate new lines
			const newLineCount = model.getLineCount();
			const newHeight = newLineCount * 18 + 12;
			container.style.height = `${newHeight}px`;
			container.style.minHeight = `${newHeight}px`;
			container.style.maxHeight = `${newHeight}px`;

			// Re-layout editor
			if (this.editor && container.parentElement) {
				const width = container.parentElement.clientWidth || 507;
				this.editor.layout({ width, height: newHeight });
			}

			// Notify parent for page-level scroll
			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}

			// Schedule next line
			this.streamingIntervalId = setTimeout(streamNextLine, STREAM_DELAY_MS);
		};

		// Start streaming
		this.streamingIntervalId = setTimeout(streamNextLine, 300);
	}

	private createCopyOverlay(): HTMLElement {
		const overlay = $('.composer-codeblock-copy-overlay');

		// Wrapper for alignment
		const overflowWrapper = $('div');
		overflowWrapper.style.cssText = `
			overflow: hidden;
			display: flex;
			justify-content: flex-end;
			align-items: center;
			position: relative;
		`;

		// Actions container
		const actionsContainer = $('div');
		actionsContainer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			justify-self: flex-end;
			flex-shrink: 0;
			position: relative;
			align-items: center;
		`;

		// Copy button wrapper (shows on hover)
		const copyButtonWrapper = $('div');
		copyButtonWrapper.style.cssText = `
			flex-shrink: 0;
			height: 100%;
			transition: opacity 0.1s ease-in-out;
			opacity: 0;
			pointer-events: none;
			margin-left: 4px;
		`;

		// Copy button
		this.copyButton = $('.anysphere-icon-button');
		this.copyButton.className = 'anysphere-icon-button';
		this.copyButton.style.cssText = `
			height: 20px;
			width: 20px;
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		`;

		// Copy icon
		const copyIcon = $('span.codicon.codicon-copy');
		copyIcon.style.cssText = 'font-size: 12px;';
		this.copyButton.appendChild(copyIcon);

		// Click handler
		this._register(addDisposableListener(this.copyButton, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.copyCode();
		}));

		copyButtonWrapper.appendChild(this.copyButton);
		actionsContainer.appendChild(copyButtonWrapper);
		overflowWrapper.appendChild(actionsContainer);
		overlay.appendChild(overflowWrapper);

		// Hover effect - show copy button
		this._register(addDisposableListener(overlay.parentElement || overlay, 'mouseenter', () => {
			copyButtonWrapper.style.opacity = '1';
			copyButtonWrapper.style.pointerEvents = 'auto';
		}));

		this._register(addDisposableListener(overlay.parentElement || overlay, 'mouseleave', () => {
			copyButtonWrapper.style.opacity = '0';
			copyButtonWrapper.style.pointerEvents = 'none';
		}));

		return overlay;
	}

	private copyCode(): void {
		this.clipboardService.writeText(this.currentContent.code);

		// Visual feedback - briefly change icon
		if (this.copyButton) {
			const icon = this.copyButton.querySelector('.codicon');
			if (icon) {
				icon.classList.remove('codicon-copy');
				icon.classList.add('codicon-check');
				setTimeout(() => {
					icon.classList.remove('codicon-check');
					icon.classList.add('codicon-copy');
				}, 1000);
			}
		}
	}

	public override hasSameContent(other: any): boolean {
		return other.kind === 'codeBlock' &&
			other.code === this.targetCode &&
			other.language === this.currentContent.language;
	}

	public updateContent(newContent: any): void {
		if (newContent.kind !== 'codeBlock') {
			return;
		}
		if (this.hasSameContent(newContent)) {
			return;
		}

		const wasStreaming = this.isStreaming;
		this.currentContent = newContent as IVybeChatCodeBlockContent;
		this.targetCode = newContent.code;
		this.isStreaming = newContent.isStreaming ?? false;

		// If not streaming, show complete code immediately
		if (!this.isStreaming) {
			if (this.streamingIntervalId) {
				clearTimeout(this.streamingIntervalId);
				this.streamingIntervalId = null;
			}

			// Update editor model
			if (this.editor) {
				const model = this.editor.getModel();
				if (model) {
					model.setValue(this.currentContent.code);

					// Update exact height to prevent vertical scroll
					const lineCount = model.getLineCount();
					const height = lineCount * 18 + 12;
					if (this.editorContainer) {
						this.editorContainer.style.height = `${height}px`;
						this.editorContainer.style.minHeight = `${height}px`;
						this.editorContainer.style.maxHeight = `${height}px`;
						this.editor.layout({ width: this.editorContainer.clientWidth, height });
					}
				}
			}
		} else if (!wasStreaming && this.isStreaming) {
			// Start streaming
			const model = this.editor?.getModel();
			if (model && this.editorContainer) {
				this.startStreamingAnimation(model, this.editorContainer);
			}
		}
	}

	override dispose(): void {
		// Clean up streaming interval
		if (this.streamingIntervalId) {
			clearTimeout(this.streamingIntervalId);
			this.streamingIntervalId = null;
		}

		this.editor = null;
		this.editorContainer = null;
		this.copyButton = null;
		super.dispose();
	}
}
