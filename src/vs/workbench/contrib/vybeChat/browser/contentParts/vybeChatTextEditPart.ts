/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatTextEditContent } from './vybeChatContentPart.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../base/common/uri.js';

/**
 * Renders file edit suggestions with a collapsible Monaco diff editor.
 * Shows before/after side-by-side comparison with expand/collapse.
 */
export class VybeChatTextEditPart extends VybeChatContentPart {
	private diffEditor: DiffEditorWidget | null = null;
	private currentContent: IVybeChatTextEditContent;
	private headerElement: HTMLElement | null = null;
	private diffContainer: HTMLElement | null = null;
	private isExpanded: boolean = false;
	private expandButton: HTMLElement | null = null;

	constructor(
		content: IVybeChatTextEditContent,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super('textEdit');
		this.currentContent = content;
	}

	protected createDomNode(): HTMLElement {
		// Main container
		const container = $('.composer-code-block-container', { class: 'composer-message-codeblock' });
		container.style.cssText = 'transition: border-color 0.1s ease-in-out;';

		// Header (always visible)
		this.headerElement = this.createHeader();
		container.appendChild(this.headerElement);

		// Diff container (collapsible)
		this.diffContainer = this.createDiffContainer();
		container.appendChild(this.diffContainer);

		// Expand/collapse button
		this.expandButton = this.createExpandButton();
		container.appendChild(this.expandButton);

		// Click header to toggle
		this._register(addDisposableListener(this.headerElement, 'click', () => {
			this.toggleExpanded();
		}));

		return container;
	}

	private createHeader(): HTMLElement {
		const header = $('.composer-code-block-header');
		header.style.cssText = `
			cursor: pointer;
			border-bottom: none;
			background: var(--vscode-editor-background);
		`;

		// File info section
		const fileInfo = $('.composer-code-block-file-info');
		fileInfo.style.cssText = 'overflow: auto hidden; flex-shrink: 1; min-width: 0px;';

		// File icon
		const iconSpan = $('.composer-primary-toolcall-icon');
		const iconWrapper = $('.show-file-icons');
		iconWrapper.style.height = '18px';
		const iconContainer = $('div');
		iconContainer.style.cssText = 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;';

		// Get file icon classes from VS Code
		const iconClasses = this.getFileIconClasses(this.currentContent.fileName);
		const icon = $('div.monaco-icon-label.file-icon');
		icon.className += ' ' + iconClasses;
		icon.style.height = '100%';

		iconContainer.appendChild(icon);
		iconWrapper.appendChild(iconContainer);
		iconSpan.appendChild(iconWrapper);

		// Filename
		const filenameSpan = $('.composer-code-block-filename');
		filenameSpan.style.whiteSpace = 'nowrap';
		const filenameBidi = $('span');
		filenameBidi.style.cssText = 'direction: ltr; unicode-bidi: embed;';
		filenameBidi.textContent = this.currentContent.fileName;
		filenameSpan.appendChild(filenameBidi);

		// Stats (+2/-2)
		const statsSpan = $('.composer-code-block-status');
		const statsInner = $('span');
		statsInner.style.cssText = 'color: var(--vscode-descriptionForeground); line-height: 120%; font-size: 12px; font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: 4px;';
		const statsContainer = $('div');
		statsContainer.style.cssText = 'display: flex; align-items: center; gap: 3px;';

		const addedSpan = $('span');
		addedSpan.style.color = 'var(--vscode-gitDecoration-addedResourceForeground, var(--cursor-text-green-primary))';
		addedSpan.textContent = `+${this.currentContent.addedLines}`;

		const deletedSpan = $('span');
		deletedSpan.style.color = 'var(--vscode-gitDecoration-deletedResourceForeground, var(--cursor-text-red-primary))';
		deletedSpan.textContent = `-${this.currentContent.deletedLines}`;

		statsContainer.appendChild(addedSpan);
		statsContainer.appendChild(deletedSpan);
		statsInner.appendChild(statsContainer);
		statsSpan.appendChild(statsInner);

		// Checkmark or pending icon
		const statusSpan = $('.composer-code-block-status');
		const statusIcon = $('span.codicon');
		if (this.currentContent.isApplied) {
			statusIcon.className += ' codicon-check';
			statusIcon.style.cssText = 'font-size: 12px; color: var(--vscode-testing-iconPassed);';
		} else {
			statusIcon.className += ' codicon-circle-outline';
			statusIcon.style.cssText = 'font-size: 12px; color: var(--vscode-descriptionForeground);';
		}
		statusSpan.appendChild(statusIcon);

		// Action buttons (hidden for now)
		const actionsContainer = $('div');
		actionsContainer.style.cssText = 'overflow: hidden; display: flex; justify-content: flex-end; align-items: center; position: relative;';
		const actionsInner = $('div');
		actionsInner.style.cssText = 'display: flex; justify-content: flex-end; justify-self: flex-end; flex-shrink: 0; position: relative; align-items: center;';
		actionsContainer.appendChild(actionsInner);

		// Assemble header
		fileInfo.appendChild(iconSpan);
		fileInfo.appendChild(filenameSpan);
		fileInfo.appendChild(statsSpan);
		fileInfo.appendChild(statusSpan);

		header.appendChild(fileInfo);
		header.appendChild(actionsContainer);

		return header;
	}

	private createDiffContainer(): HTMLElement {
		const container = $('.composer-diff-block');
		container.style.cssText = `
			box-sizing: border-box;
			position: relative;
			background: var(--vscode-editor-background);
			overflow: auto hidden;
			display: none;
			height: 0px;
			margin-bottom: 16px;
		`;

		// Create diff editor wrapper
		const diffWrapper = $('div');
		diffWrapper.style.cssText = 'transition: opacity 0.15s ease-in-out; height: 0px; opacity: 0;';

		// Create Monaco diff editor
		this.createDiffEditor(diffWrapper);

		container.appendChild(diffWrapper);
		return container;
	}

	private createDiffEditor(parent: HTMLElement): void {
		// Create diff editor instance
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
				scrollbar: {
					vertical: 'auto',
					horizontal: 'auto',
					verticalScrollbarSize: 0,
					horizontalScrollbarSize: 6
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

		// Create models
		const languageId = this.languageService.getLanguageIdByFilepathOrFirstLine(URI.file(this.currentContent.fileName)) || this.currentContent.language || 'plaintext';

		const originalUri = URI.parse(`vybe-chat-original:///${this.currentContent.fileName}`);
		const modifiedUri = URI.parse(`vybe-chat-modified:///${this.currentContent.fileName}`);

		const originalModel = this.modelService.createModel(this.currentContent.originalContent, this.languageService.createById(languageId), originalUri);
		const modifiedModel = this.modelService.createModel(this.currentContent.modifiedContent, this.languageService.createById(languageId), modifiedUri);

		this.diffEditor.setModel({
			original: originalModel,
			modified: modifiedModel
		});

		// Dispose models when this part is disposed
		this._register(originalModel);
		this._register(modifiedModel);
		this._register(this.diffEditor);
	}

	private createExpandButton(): HTMLElement {
		const button = $('.composer-message-codeblock-expand');
		button.style.cssText = 'z-index: 1;';

		const icon = $('span.codicon.codicon-chevron-down');
		button.appendChild(icon);

		return button;
	}

	private getFileIconClasses(fileName: string): string {
		// Generate classes for file icon based on file name
		const ext = fileName.split('.').pop() || '';
		const nameLower = fileName.toLowerCase();

		return [
			'height-override-important',
			'file-icon-override',
			`${ext}-ext-file-icon`,
			`ext-file-icon`,
			`${ext}-lang-file-icon`,
			`${nameLower.replace(/\./g, '')}-name-file-icon`,
			`name-file-icon`
		].join(' ');
	}

	private toggleExpanded(): void {
		this.isExpanded = !this.isExpanded;

		if (this.isExpanded) {
			this.expand();
		} else {
			this.collapse();
		}
	}

	private expand(): void {
		if (!this.diffContainer || !this.headerElement || !this.expandButton) {
			return;
		}

		// Update header border
		this.headerElement.style.borderBottom = '1px solid var(--cursor-stroke-secondary)';

		// Show diff container with animation
		const height = this.calculateDiffHeight();
		this.diffContainer.style.display = 'block';
		this.diffContainer.style.height = `${height}px`;

		const diffWrapper = this.diffContainer.firstChild as HTMLElement;
		if (diffWrapper) {
			diffWrapper.style.height = `${height}px`;
			diffWrapper.style.opacity = '1';
		}

		// Update expand button icon
		const icon = this.expandButton.querySelector('.codicon');
		if (icon) {
			icon.className = 'codicon codicon-chevron-up';
		}

		// Layout diff editor
		if (this.diffEditor) {
			setTimeout(() => {
				this.diffEditor?.layout();
			}, 50);
		}
	}

	private collapse(): void {
		if (!this.diffContainer || !this.headerElement || !this.expandButton) {
			return;
		}

		// Update header border
		this.headerElement.style.borderBottom = 'none';

		// Hide diff container
		this.diffContainer.style.display = 'none';
		this.diffContainer.style.height = '0px';

		const diffWrapper = this.diffContainer.firstChild as HTMLElement;
		if (diffWrapper) {
			diffWrapper.style.height = '0px';
			diffWrapper.style.opacity = '0';
		}

		// Update expand button icon
		const icon = this.expandButton.querySelector('.codicon');
		if (icon) {
			icon.className = 'codicon codicon-chevron-down';
		}
	}

	private calculateDiffHeight(): number {
		// Calculate height based on number of lines
		const originalLines = this.currentContent.originalContent.split('\n').length;
		const modifiedLines = this.currentContent.modifiedContent.split('\n').length;
		const maxLines = Math.max(originalLines, modifiedLines);

		// 18px per line + 12px padding top/bottom
		const lineHeight = 18;
		const padding = 12;
		const minHeight = 90;
		const maxHeight = 300;

		const calculatedHeight = (maxLines * lineHeight) + padding;
		return Math.max(minHeight, Math.min(maxHeight, calculatedHeight));
	}

	override hasSameContent(other: VybeChatTextEditPart): boolean {
		if (!(other instanceof VybeChatTextEditPart)) {
			return false;
		}
		return this.currentContent.fileName === other.currentContent.fileName &&
			this.currentContent.originalContent === other.currentContent.originalContent &&
			this.currentContent.modifiedContent === other.currentContent.modifiedContent;
	}

	override updateContent(newContent: IVybeChatTextEditContent): void {
		this.currentContent = newContent;
		// Re-create models if content changed
		if (this.diffEditor) {
			const languageId = this.languageService.getLanguageIdByFilepathOrFirstLine(URI.file(newContent.fileName)) || newContent.language || 'plaintext';

			const originalUri = URI.parse(`vybe-chat-original:///${newContent.fileName}`);
			const modifiedUri = URI.parse(`vybe-chat-modified:///${newContent.fileName}`);

			const originalModel = this.modelService.createModel(newContent.originalContent, this.languageService.createById(languageId), originalUri);
			const modifiedModel = this.modelService.createModel(newContent.modifiedContent, this.languageService.createById(languageId), modifiedUri);

			this.diffEditor.setModel({
				original: originalModel,
				modified: modifiedModel
			});

			this._register(originalModel);
			this._register(modifiedModel);
		}
	}

	override dispose(): void {
		this.diffEditor?.dispose();
		this.diffEditor = null;
		super.dispose();
	}
}

