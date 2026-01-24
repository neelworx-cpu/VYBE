/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatReferenceContent, IVybeChatContentPart } from './vybeChatContentPart.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import * as path from '../../../../../base/common/path.js';
import { getIconClasses, getIconClassesForLanguageId } from '../../../../../editor/common/services/getIconClasses.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ShowLightbulbIconMode } from '../../../../../editor/common/config/editorOptions.js';

/**
 * Code Reference Content Part - Displays existing code from the codebase with header and Monaco editor.
 * Format: ```startLine:endLine:filepath\ncode content\n```
 *
 * Structure matches code blocks exactly:
 * - Header (exact copy of textEditContentPart header) with file icon, filename, line range
 * - Monaco editor for code display
 * - Copy button overlay
 * - Clickable to open file at exact line range
 */
export class VybeChatReferencePart extends VybeChatContentPart {
	private currentContent: IVybeChatReferenceContent;
	private editor: ICodeEditor | null = null;
	private editorContainer: HTMLElement | null = null;
	private copyButton: HTMLElement | null = null;
	private headerElement: HTMLElement | null = null;
	private targetCode: string = ''; // Full code for streaming towards
	private isStreaming: boolean = false;
	public onStreamingUpdate?: () => void; // Callback for parent to handle scrolling
	private readonly instantiationService: IInstantiationService;
	private readonly modelService: IModelService;
	private readonly languageService: ILanguageService;
	private readonly clipboardService: IClipboardService;
	private readonly editorService: IEditorService;
	private readonly workspaceContextService: IWorkspaceContextService;

	constructor(
		content: IVybeChatReferenceContent,
		instantiationService: IInstantiationService,
		modelService: IModelService,
		languageService: ILanguageService,
		clipboardService: IClipboardService,
		editorService: IEditorService,
		workspaceContextService: IWorkspaceContextService
	) {
		super('reference');
		this.currentContent = content;
		// Ensure code is never undefined - use empty string as fallback
		this.targetCode = content.code || '';
		this.currentContent.code = this.targetCode; // Ensure currentContent also has the code
		this.isStreaming = content.isStreaming ?? false;

		// Debug: Log what we received
		console.log('[VybeChatReferencePart] Constructor:', {
			filePath: content.filePath,
			lineRange: content.lineRange,
			codeLength: this.targetCode.length,
			codePreview: this.targetCode.substring(0, 100),
			isStreaming: this.isStreaming,
			hasCode: !!this.targetCode
		});
		this.instantiationService = instantiationService;
		this.modelService = modelService;
		this.languageService = languageService;
		this.clipboardService = clipboardService;
		this.editorService = editorService;
		this.workspaceContextService = workspaceContextService;
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	protected override createDomNode(): HTMLElement {
		// Outer container (matches markdown-code-outer-container exactly)
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

		// Code block container (matches structure analysis exactly)
		const codeBlockContainer = $('.composer-code-block-container.composer-message-codeblock');
		codeBlockContainer.style.cssText = 'margin: 4px 0px; transition: border-color 0.1s ease-in-out;';

		// Create header (exact copy of code block header structure)
		this.headerElement = this.createHeader();
		codeBlockContainer.appendChild(this.headerElement);

		// Position wrapper
		const positionWrapper = $('div');
		positionWrapper.style.cssText = 'position: relative; overflow: hidden;';

		// Content container
		const contentContainer = $('.composer-code-block-content');
		contentContainer.style.cssText = 'display: block; overflow: hidden;';

		// Scrollable container for Monaco editor
		// Calculate initial height from code content (will be refined after model is created)
		this.editorContainer = $('.scrollable-div-container.show-only-on-hover');
		const codeContent = this.currentContent.code || '';
		const initialLineCount = codeContent ? codeContent.split('\n').length : 1;
		const initialHeight = initialLineCount * 18 + 12; // lineHeight 18 + padding 12
		this.editorContainer.style.cssText = `
			height: ${initialHeight}px;
			min-height: ${initialHeight}px;
			max-height: ${initialHeight}px;
			overflow-y: hidden;
			overflow-x: visible;
			pointer-events: auto; /* Allow interactions but don't block page scroll */
		`;

		// Create Monaco editor
		this.createEditor(this.editorContainer);

		// Build hierarchy (matches code block part exactly)
		contentContainer.appendChild(this.editorContainer);
		positionWrapper.appendChild(contentContainer);
		codeBlockContainer.appendChild(positionWrapper);

		// Copy button overlay - create after DOM structure is in place
		// Append to contentContainer so it's positioned relative to content area
		const copyOverlay = this.createCopyOverlay(codeBlockContainer);
		contentContainer.appendChild(copyOverlay);
		wrapper.appendChild(codeBlockContainer);
		outerContainer.appendChild(wrapper);

		return outerContainer;
	}

	private createHeader(): HTMLElement {
		// Match textEditContentPart exactly - no inline styles, let CSS handle everything
		const header = $('.composer-code-block-header');

		// File info (styling in CSS - match textEditContentPart)
		const fileInfo = $('.composer-code-block-file-info');

		// File icon container - match textEditContentPart exactly
		const iconSpan = $('span.composer-primary-toolcall-icon');
		const iconWrapper = $('.show-file-icons');
		const iconContainer = $('div');
		iconContainer.style.cssText = 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;';

		// Use VS Code's getIconClasses for proper file icon
		const filePath = this.currentContent.filePath;
		const fileUri = path.isAbsolute(filePath) ? URI.file(filePath) :
			(this.workspaceContextService?.getWorkspace().folders[0]
				? URI.joinPath(this.workspaceContextService.getWorkspace().folders[0].uri, filePath)
				: URI.file(filePath));

		let iconClasses: string | string[];
		try {
			// Try to get icon classes using modelService and languageService
			if (this.modelService && this.languageService) {
				iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);
			} else {
				// Fallback: use language-based icon if services not available
				const ext = path.extname(filePath).slice(1);
				const languageId = this.languageService?.guessLanguageIdByFilepathOrFirstLine(fileUri, ext) || ext || 'plaintext';
				iconClasses = this.languageService ? getIconClassesForLanguageId(languageId) : ['file-icon'];
			}
		} catch (error) {
			// Fallback to language-based icon on error
			console.warn('[VybeChatReferencePart] Failed to get icon classes, using fallback:', error);
			const ext = path.extname(filePath).slice(1);
			const languageId = this.languageService?.guessLanguageIdByFilepathOrFirstLine(fileUri, ext) || ext || 'plaintext';
			iconClasses = this.languageService ? getIconClassesForLanguageId(languageId) : ['file-icon'];
		}

		const iconElement = $('div.monaco-icon-label.file-icon');
		const classString = Array.isArray(iconClasses) ? iconClasses.join(' ') : iconClasses;
		iconElement.className = `monaco-icon-label file-icon ${classString}`;
		// Match textEditContentPart exactly: height 100% only (no flex styles, no transition)
		iconElement.style.height = '100%';

		iconContainer.appendChild(iconElement);
		iconWrapper.appendChild(iconContainer);
		iconSpan.appendChild(iconWrapper);

		// Filename (extract from path) - match textEditContentPart exactly
		const filename = path.basename(filePath);
		const filenameSpan = $('span.composer-code-block-filename');
		const filenameBidi = $('span');
		filenameBidi.textContent = filename;
		filenameSpan.appendChild(filenameBidi);

		// Line range - match textEditContentPart (styling in CSS)
		const lineRange = this.currentContent.lineRange;
		const lineRangeSpan = $('span.composer-code-block-line-range');
		lineRangeSpan.textContent = `Lines ${lineRange.start}-${lineRange.end}`;

		// Build file info (matches textEditContentPart structure exactly)
		fileInfo.appendChild(iconSpan);
		fileInfo.appendChild(filenameSpan);
		fileInfo.appendChild(lineRangeSpan);

		// Build header (matches textEditContentPart - just fileInfo, no actions wrapper for code blocks)
		header.appendChild(fileInfo);

		// Make header clickable to open file at exact line range
		if (this.editorService) {
			this._register(addDisposableListener(header, 'click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await this.openFile();
			}));
		}

		return header;
	}

	private createEditor(container: HTMLElement): void {
		// Detect language from file extension if not provided
		let languageId = this.currentContent.language;
		if (!languageId && this.languageService) {
			const ext = path.extname(this.currentContent.filePath).slice(1);
			const fileUri = path.isAbsolute(this.currentContent.filePath) ? URI.file(this.currentContent.filePath) :
				(this.workspaceContextService?.getWorkspace().folders[0]
					? URI.joinPath(this.workspaceContextService.getWorkspace().folders[0].uri, this.currentContent.filePath)
					: URI.file(this.currentContent.filePath));
			languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(fileUri, ext) || 'plaintext';
		}

		// Start with empty content if streaming, otherwise use actual code
		// Ensure we always have a string, never undefined
		const initialCode = this.isStreaming ? '' : (this.currentContent.code || '');

		// Debug: Log if code is empty (but not streaming)
		if (!this.isStreaming && !initialCode) {
			console.warn('[VybeChatReferencePart] Code is empty for reference:', {
				filePath: this.currentContent.filePath,
				lineRange: this.currentContent.lineRange,
				isStreaming: this.isStreaming
			});
		}
		const model = this.modelService.createModel(
			initialCode,
			this.languageService.createById(languageId),
			undefined
		);

		// Create Monaco editor (matches code block structure)
		this.editor = this.instantiationService.createInstance(
			CodeEditorWidget,
			container,
			{
				readOnly: true,
				lineNumbers: 'off',
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				wordWrap: 'off',
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
				renderLineHighlight: 'none',
				hideCursorInOverviewRuler: true,
				links: false,
				colorDecorators: false,
				codeLens: false,
				folding: false,
				glyphMargin: false,
				lineDecorationsWidth: 0,
				lineNumbersMinChars: 0,
				contextmenu: false,
				quickSuggestions: false, // boolean is valid
				acceptSuggestionOnEnter: 'off',
				suggestOnTriggerCharacters: false,
				tabCompletion: 'off',
				formatOnPaste: false,
				formatOnType: false,
				snippetSuggestions: 'none',
				parameterHints: { enabled: false },
				hover: { enabled: 'off' },
				lightbulb: { enabled: ShowLightbulbIconMode.Off },
				find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never' }
			},
			{
				isSimpleWidget: true,
				contributions: []
			}
		);

		this.editor.setModel(model);
		this._register(this.editor);
		this._register(model);

		// Debug: Verify model has content
		const modelValue = model.getValue();
		console.log('[VybeChatReferencePart] Editor created:', {
			modelValueLength: modelValue.length,
			modelValuePreview: modelValue.substring(0, 100),
			initialCodeLength: initialCode.length,
			editorHasModel: !!this.editor.getModel()
		});

		// Calculate and set EXACT height to prevent any vertical scroll
		// Use model.getLineCount() for accurate line count (handles trailing newlines correctly)
		const lineCount = model.getLineCount();
		const lineHeight = 18;
		const padding = 12; // Top + bottom padding
		const height = lineCount * lineHeight + padding;

		// Set container height (matches code block part exactly)
		container.style.height = `${height}px`;
		container.style.minHeight = `${height}px`;
		container.style.maxHeight = `${height}px`;
		container.style.overflow = 'hidden'; // Prevent any overflow

		// Also ensure editorContainer has the same height
		if (this.editorContainer && this.editorContainer !== container) {
			this.editorContainer.style.height = `${height}px`;
			this.editorContainer.style.minHeight = `${height}px`;
			this.editorContainer.style.maxHeight = `${height}px`;
		}

		console.log('[VybeChatReferencePart] Height calculated:', {
			lineCount,
			height,
			codeLength: initialCode.length,
			modelLineCount: model.getLineCount()
		});

		// Initial layout with proper width (matches code block part exactly)
		setTimeout(() => {
			if (this.editor && container.parentElement) {
				const width = container.parentElement.clientWidth || 507;
				// Recalculate to ensure accuracy
				const finalLineCount = model.getLineCount();
				const finalHeight = finalLineCount * lineHeight + padding;

				// Update container height with final calculation
				container.style.height = `${finalHeight}px`;
				container.style.minHeight = `${finalHeight}px`;
				container.style.maxHeight = `${finalHeight}px`;

				this.editor.layout({ width, height: finalHeight });

				console.log('[VybeChatReferencePart] Layout applied:', {
					width,
					finalHeight,
					containerOffsetHeight: container.offsetHeight,
					editorLayoutHeight: this.editor.getLayoutInfo().height
				});

				// Start streaming if needed
				if (this.isStreaming && this.targetCode) {
					setTimeout(() => {
						this.startStreaming();
					}, 300); // Small delay before starting
				}
			}
		}, 0);
	}

	private startStreaming(): void {
		if (!this.editor || !this.targetCode) {
			return;
		}

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		const lines = this.targetCode.split('\n');
		let currentLine = 0;
		const STREAM_DELAY_MS = 20; // Delay between lines

		const streamNextLine = () => {
			if (currentLine >= lines.length) {
				this.isStreaming = false;

				// CRITICAL: Recalculate final height when streaming completes
				const finalLineCount = model.getLineCount();
				const lineHeight = 18;
				const padding = 12;
				const finalHeight = finalLineCount * lineHeight + padding;

				// Update container height
				if (this.editorContainer) {
					this.editorContainer.style.height = `${finalHeight}px`;
					this.editorContainer.style.minHeight = `${finalHeight}px`;
					this.editorContainer.style.maxHeight = `${finalHeight}px`;
				}

				// Re-layout editor with final height
				if (this.editor && this.editorContainer && this.editorContainer.parentElement) {
					const width = this.editorContainer.parentElement.clientWidth || 507;
					this.editor.layout({ width, height: finalHeight });
				}

				console.log('[VybeChatReferencePart] Streaming complete, final height:', {
					finalLineCount,
					finalHeight
				});

				if (this.onStreamingUpdate) {
					this.onStreamingUpdate();
				}
				return;
			}

			// Append next line
			const lineToAdd = lines[currentLine];
			const currentText = model.getValue();
			model.setValue(currentText + (currentLine > 0 ? '\n' : '') + lineToAdd);

			currentLine++;

			// Update height dynamically as content streams in
			const currentLineCount = model.getLineCount();
			const lineHeight = 18;
			const padding = 12;
			const currentHeight = currentLineCount * lineHeight + padding;

			// Update container height
			if (this.editorContainer) {
				this.editorContainer.style.height = `${currentHeight}px`;
				this.editorContainer.style.minHeight = `${currentHeight}px`;
				this.editorContainer.style.maxHeight = `${currentHeight}px`;
			}

			// Re-layout editor with updated height
			if (this.editor && this.editorContainer && this.editorContainer.parentElement) {
				const width = this.editorContainer.parentElement.clientWidth || 507;
				this.editor.layout({ width, height: currentHeight });
			}

			// Trigger parent scroll update
			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}

			// Schedule next line
			setTimeout(streamNextLine, STREAM_DELAY_MS);
		};

		// Start streaming
		setTimeout(streamNextLine, 300);
	}

	private createCopyOverlay(codeBlockContainer: HTMLElement): HTMLElement {
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

		// Copy button
		this.copyButton = $('.vybe-icon-button');
		this.copyButton.className = 'vybe-icon-button';
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

		actionsContainer.appendChild(this.copyButton);
		overflowWrapper.appendChild(actionsContainer);
		overlay.appendChild(overflowWrapper);

		// Hover effect - show copy button on entire codeblock container
		this._register(addDisposableListener(codeBlockContainer, 'mouseenter', () => {
			overlay.style.display = 'flex';
			overlay.style.pointerEvents = 'auto';
		}));

		this._register(addDisposableListener(codeBlockContainer, 'mouseleave', () => {
			overlay.style.display = 'none';
			overlay.style.pointerEvents = 'none';
		}));

		return overlay;
	}

	private async openFile(): Promise<void> {
		if (!this.editorService || !this.currentContent.filePath) {
			return;
		}

		try {
			let fileUri: URI;

			// Check if path is absolute
			if (path.isAbsolute(this.currentContent.filePath)) {
				fileUri = URI.file(this.currentContent.filePath);
			} else {
				// Resolve relative path against workspace root
				const workspaceFolder = this.workspaceContextService?.getWorkspace().folders[0];
				if (workspaceFolder) {
					fileUri = URI.joinPath(workspaceFolder.uri, this.currentContent.filePath);
				} else {
					// Fallback: try as-is
					fileUri = URI.file(this.currentContent.filePath);
				}
			}

			// Open file with line range selection
			const editorInput: any = {
				resource: fileUri
			};

			const lineRange = this.currentContent.lineRange;
			if (lineRange) {
				const startLine = lineRange.start < 1 ? 1 : lineRange.start;
				const endLine = lineRange.end < startLine ? startLine : lineRange.end;
				editorInput.options = {
					selection: {
						startLineNumber: startLine,
						startColumn: 1,
						endLineNumber: endLine,
						endColumn: 1
					}
				};
			}

			await this.editorService.openEditor(editorInput);
		} catch (error) {
			console.error(`[VybeChatReferencePart] Failed to open file: ${this.currentContent.filePath}`, error);
		}
	}

	private copyCode(): void {
		if (this.clipboardService) {
			this.clipboardService.writeText(this.currentContent.code);
		}
	}

	override hasSameContent(other: IVybeChatContentPart): boolean {
		if (other.kind !== 'reference') {
			return false;
		}
		const otherRef = other as unknown as IVybeChatReferenceContent;
		return (
			otherRef.filePath === this.currentContent.filePath &&
			otherRef.lineRange.start === this.currentContent.lineRange.start &&
			otherRef.lineRange.end === this.currentContent.lineRange.end &&
			otherRef.code === this.currentContent.code
		);
	}

	updateContent?(data: unknown): void {
		if (data && typeof data === 'object' && 'kind' in data && data.kind === 'reference') {
			const newContent = data as IVybeChatReferenceContent;
			const wasStreaming = this.isStreaming;
			this.currentContent = newContent;
			this.targetCode = newContent.code;
			this.isStreaming = newContent.isStreaming ?? false;


			// Update editor if it exists
			if (this.editor) {
				const model = this.editor.getModel();
				if (model) {
					if (this.isStreaming && this.targetCode) {
						// Start streaming if not already streaming
						if (!wasStreaming) {
							this.startStreaming();
						}
					} else {
						// Update code immediately
						model.setValue(this.targetCode);

						// CRITICAL: Recalculate height after code is updated
						const lineCount = model.getLineCount();
						const lineHeight = 18;
						const padding = 12;
						const newHeight = lineCount * lineHeight + padding;

						// Update container height
						if (this.editorContainer) {
							this.editorContainer.style.height = `${newHeight}px`;
							this.editorContainer.style.minHeight = `${newHeight}px`;
							this.editorContainer.style.maxHeight = `${newHeight}px`;
						}

						// Re-layout editor with new height
						if (this.editorContainer && this.editorContainer.parentElement) {
							const width = this.editorContainer.parentElement.clientWidth || 507;
							this.editor.layout({ width, height: newHeight });
						}

						console.log('[VybeChatReferencePart] Content updated, height recalculated:', {
							lineCount,
							newHeight,
							wasStreaming,
							isStreaming: this.isStreaming
						});
					}
				}
			}
		}
	}
}
