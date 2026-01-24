/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatTerminalContent, IVybeChatContentPart } from './vybeChatContentPart.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../base/common/uri.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ITerminalService, ITerminalGroupService, ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { PromptInputState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IVybeAgentService } from '../../../vybeAgent/common/vybeAgentService.js';

/**
 * Terminal Tool Call Content Part
 *
 * Displays terminal command execution with streaming output.
 * Structure matches TextEdit component but adapted for terminal:
 * - Command display with syntax highlighting (Monaco editor)
 * - Terminal output in scrollable <pre> element
 * - Permission dropdown instead of expand button
 * - Status indicator (Success/Failed/Running) instead of diff stats
 */
export class VybeChatTerminalPart extends VybeChatContentPart {
	private commandEditor: ICodeEditor | null = null;
	private outputStreamIntervalId: ReturnType<typeof setInterval> | null = null;
	private currentContent: IVybeChatTerminalContent;
	private readonly uniqueId: string;
	public onStreamingUpdate?: () => void;

	// DOM elements
	private mainContainer: HTMLElement | null = null;
	private topHeader: HTMLElement | null = null;
	private commandSummary: HTMLElement | null = null;
	private actionButtonsContainer: HTMLElement | null = null;
	private commandContainer: HTMLElement | null = null;
	private outputBody: HTMLElement | null = null;
	private outputContainer: HTMLElement | null = null;
	private outputScrollableWrapper: HTMLElement | null = null;
	private outputPre: HTMLElement | null = null;
	private outputScrollable: DomScrollableElement | null = null;
	private controlRow: HTMLElement | null = null;
	private leftControls: HTMLElement | null = null;
	private statusRow: HTMLElement | null = null;
	private permissionButton: HTMLElement | null = null;
	private permissionDropdownMenu: HTMLElement | null = null;
	private statusIndicator: HTMLElement | null = null;
	private warningModal: HTMLElement | null = null;
	private selectedPermission: string = 'Ask Every Time';
	private static readonly STORAGE_KEY_TERMINAL_RUN_EVERYTHING = 'vybe.terminal.runEverything';
	private isOutputExpanded: boolean = false; // Default to collapsed (limited height)
	private outputExpandButton: HTMLElement | null = null;
	private openInTerminalButton: HTMLElement | null = null; // Reference to "Open in Terminal" button

	private readonly LINE_HEIGHT = 18;
	private readonly INITIAL_HEIGHT = 36; // ~2 lines - minimal start
	private readonly MAX_COLLAPSED_HEIGHT = 400; // ~22 lines max - when collapsed after output
	private readonly EXPANDED_MAX_HEIGHT = 1200; // ~66 lines max
	private readonly MIN_LINES_FOR_EXPAND = 5; // Show expand button if > 4 lines
	private outputResizeTimer: any = null; // Timer for delayed resize
	private hasResized: boolean = false; // Track if we've already resized

	private executionTerminal: any = null; // Terminal instance during execution
	private outputBuffer: string = ''; // Buffer for accumulating output
	private completionTimer: any = null; // Timer for detecting command completion

	// Task ID for LangGraph HITL integration
	private taskId: string | undefined;

	constructor(
		content: IVybeChatTerminalContent,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ITerminalGroupService private readonly terminalGroupService: ITerminalGroupService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IStorageService private readonly storageService: IStorageService,
		@IVybeAgentService private readonly agentService: IVybeAgentService
	) {
		super('terminal');
		this.currentContent = content;
		this.uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Extract task ID from content if available
		this.taskId = content.toolCallId?.split('-')[0];

		// Load permission preference from storage
		const runEverything = this.storageService.getBoolean(VybeChatTerminalPart.STORAGE_KEY_TERMINAL_RUN_EVERYTHING, StorageScope.PROFILE, false);
		if (runEverything) {
			this.selectedPermission = 'Run Everything';
		}
	}

	public setStreamingUpdateCallback(callback: () => void): void {
		this.onStreamingUpdate = callback;
	}

	protected createDomNode(): HTMLElement {
		// Main container (matches TextEdit structure)
		this.mainContainer = $('.composer-tool-call-container.composer-terminal-tool-call-block-container');

		// Add ping border animation in pending state
		if (this.currentContent.phase === 'pending') {
			this.mainContainer.classList.add('composer-terminal-ping-border');
		}

		this.mainContainer.style.cssText = `
			background: var(--vscode-editor-background);
			border-radius: 8px;
			border: 1px solid var(--vscode-commandCenter-inactiveBorder);
			contain: paint;
			width: 100%;
			box-sizing: border-box;
			font-size: 12px;
			margin: 6px 0px;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		`;

		// Top header with action buttons
		this.topHeader = this.createTopHeader();
		this.mainContainer.appendChild(this.topHeader);

		// Command header
		const commandHeader = this.createCommandHeader();
		this.mainContainer.appendChild(commandHeader);

		// Tool call body (output)
		this.outputBody = this.createOutputBody();
		this.mainContainer.appendChild(this.outputBody);

		// Control row (permission dropdown + status)
		this.controlRow = this.createControlRow();
		this.mainContainer.appendChild(this.controlRow);

		return this.mainContainer;
	}

	private createTopHeader(): HTMLElement {
		const topHeader = $('.composer-tool-call-top-header');
		topHeader.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0 8px;
			height: 28px;
			box-sizing: border-box;
		`;

		// Left side - command summary
		const leftSide = $('div');
		leftSide.style.cssText = 'flex: 1 1 0%; min-width: 0px;';

		this.commandSummary = $('div');
		this.commandSummary.style.cssText = `
			display: flex;
			gap: 6px;
			font-size: 12px;
			color: var(--cursor-text-secondary);
			padding-right: 4px;
		`;

		const summaryText = $('span');
		// Dynamic text based on phase
		const headerText = this.getPhaseHeaderText();
		summaryText.textContent = `${headerText} ${this.getCommandSummary()}`;
		this.commandSummary.appendChild(summaryText);

		leftSide.appendChild(this.commandSummary);

		// Right side - action buttons
		this.actionButtonsContainer = this.createActionButtons();

		topHeader.appendChild(leftSide);
		topHeader.appendChild(this.actionButtonsContainer);

		// Show buttons on hover
		this._register(addDisposableListener(topHeader, 'mouseenter', () => {
			if (this.actionButtonsContainer) {
				this.actionButtonsContainer.style.opacity = '1';
			}
		}));

		this._register(addDisposableListener(topHeader, 'mouseleave', () => {
			if (this.actionButtonsContainer) {
				this.actionButtonsContainer.style.opacity = '0';
			}
		}));

		return topHeader;
	}

	private getPhaseHeaderText(): string {
		switch (this.currentContent.phase) {
			case 'pending':
				return 'Run command:';
			case 'running':
				return 'Running command:';
			case 'completed':
				return 'Ran command:';
			default:
				return 'Ran command:';
		}
	}

	private createActionButtons(): HTMLElement {
		const container = $('div');
		container.style.cssText = 'display: flex; gap: 4px; align-items: center; opacity: 0; transition: opacity 0.15s ease;';
		container.classList.add('terminal-action-buttons');

		// Expand button (leftmost) - only show if output exceeds ~22 lines (like Cursor)
		if (this.currentContent.phase === 'completed' && this.canShowExpandButton()) {
			const expandButton = this.createIconButton(
				this.isOutputExpanded ? 'codicon-chevron-up' : 'codicon-chevron-down',
				this.isOutputExpanded ? 'Show less' : 'Show more'
			);
			this._register(addDisposableListener(expandButton, 'click', () => {
				this.toggleOutputExpansion();
			}));
			this.outputExpandButton = expandButton;
			container.appendChild(expandButton);
		}

		// External link button - only show AFTER execution (completed phase)
		if (this.currentContent.phase === 'completed' && this.executionTerminal) {
			const externalButton = this.createIconButton('codicon-terminal', 'Open in terminal');
			this.openInTerminalButton = externalButton; // Store reference
			this._register(addDisposableListener(externalButton, 'click', () => {
				this.handleOpenInTerminal();
			}));
			container.appendChild(externalButton);
		}

		// Copy button (right) - copy the command, not the output
		const copyButton = this.createIconButton('codicon-copy', 'Copy command');
		this._register(addDisposableListener(copyButton, 'click', () => {
			this.handleCopy();
		}));
		container.appendChild(copyButton);

		return container;
	}

	private createIconButton(iconClass: string, tooltip: string): HTMLElement {
		const button = $('.anysphere-icon-button');
		button.style.cssText = `
			background: transparent;
			border: none;
			color: var(--cursor-text-primary);
			display: flex;
			width: 16px;
			height: 16px;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			opacity: 0.6;
			transition: opacity 0.15s ease;
		`;
		button.title = tooltip;

		const icon = $(`span.codicon.${iconClass}`);
		icon.style.cssText = 'font-size: 14px;';
		button.appendChild(icon);

		// Hover effect
		this._register(addDisposableListener(button, 'mouseenter', () => {
			button.style.opacity = '1';
		}));

		this._register(addDisposableListener(button, 'mouseleave', () => {
			button.style.opacity = '0.6';
		}));

		return button;
	}

	private createCommandHeader(): HTMLElement {
		const header = $('.composer-tool-call-header');
		header.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 4px 8px;
			background: var(--vscode-editor-background);
		`;

		// Command prefix "$"
		const prefix = $('span.terminal-command-prefix');
		prefix.textContent = '$';
		prefix.style.cssText = `
			font-family: Menlo, Monaco, "Courier New", monospace;
			font-size: 12px;
			line-height: 18px;
			color: var(--vscode-terminal-ansiGreen);
			font-weight: 600;
			flex-shrink: 0;
		`;

		// Command editor (Monaco with shell syntax highlighting)
		this.commandContainer = this.createCommandEditor();
		this.commandContainer.style.cssText = 'flex: 1; min-width: 0;';

		header.appendChild(prefix);
		header.appendChild(this.commandContainer);

		return header;
	}

	private createCommandEditor(): HTMLElement {
		const container = $('.simple-code-render.composer-terminal-command-editor');
		container.style.cssText = 'position: relative; text-align: left; width: 100%; height: 18px;';

		const editorWrapper = $('div');
		editorWrapper.style.cssText = 'width: 100%; height: 100%; box-sizing: border-box;';
		editorWrapper.setAttribute('data-mode-id', 'shellscript');

		// Create Monaco editor for command
		this.commandEditor = this.instantiationService.createInstance(
			CodeEditorWidget,
			editorWrapper,
			{
				readOnly: true,
				lineNumbers: 'off',
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				wordWrap: 'off',
				fontSize: 12,
				fontFamily: 'Menlo, Monaco, "Courier New", monospace',
				lineHeight: 18,
				padding: { top: 0, bottom: 0 },
				overviewRulerLanes: 0,
				scrollbar: {
					vertical: 'hidden',
					horizontal: 'hidden',
					verticalScrollbarSize: 0,
					horizontalScrollbarSize: 0
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

		const commandUri = URI.parse(`vybe-chat-terminal-command:///${this.uniqueId}`);
		const model = this.modelService.createModel(
			this.currentContent.command,
			this.languageService.createById('shellscript'),
			commandUri
		);

		this.commandEditor.setModel(model);
		this._register(model);

		// Layout
		setTimeout(() => {
			if (this.commandEditor && editorWrapper.parentElement) {
				const width = editorWrapper.parentElement.clientWidth || 497;
				this.commandEditor.layout({ width, height: 18 });
			}
		}, 0);

		container.appendChild(editorWrapper);
		return container;
	}

	private createOutputBody(): HTMLElement {
		const body = $('.composer-tool-call-body.non-compact');

		// Start collapsed in pending state, visible in running/completed
		if (this.currentContent.phase === 'pending') {
			body.style.cssText = 'height: 0px; overflow: hidden; display: none;';
		} else {
			body.style.cssText = 'display: flex; flex-direction: column;';
		}

		const bodyInner = $('.composer-tool-call-body-inner');
		const bodyContent = $('.composer-tool-call-body-content');

		// Output container
		const outputWrapper = $('div');
		outputWrapper.style.cssText = 'position: relative; overflow: hidden; background: var(--vscode-editor-background);';

		this.outputContainer = $('div');
		// Start minimal, grow when output appears
		const initialHeight = this.currentContent.output ? this.MAX_COLLAPSED_HEIGHT : this.INITIAL_HEIGHT;
		this.outputContainer.style.cssText = `height: ${initialHeight}px; overflow: hidden;`;

		// Scrollable container
		const scrollableContainer = $('.scrollable-div-container');
		scrollableContainer.style.cssText = 'height: 100%;';

		// Create scrollable element wrapper
		this.outputScrollableWrapper = $('div');
		this.outputScrollableWrapper.style.cssText = `width: 100%; overflow: hidden; height: ${initialHeight}px;`;

		const innerContent = $('.masked-scrollable-inner');
		innerContent.style.cssText = 'display: inline-block; width: 100%; min-height: 100%;';

		// Terminal output (pre with ANSI-to-HTML conversion)
		const outputDiv = $('.composer-terminal-output');
		this.outputPre = $('pre');
		this.outputPre.style.cssText = `
			margin: 0px;
			padding: 4px 8px;
			font-family: Menlo, Monaco, "Courier New", monospace;
			white-space: pre-wrap;
			word-wrap: break-word;
			overflow-wrap: break-word;
			font-size: 12px;
			line-height: 18px;
			color: var(--vscode-terminal-foreground);
			background: var(--vscode-terminal-background);
			box-sizing: border-box;
			user-select: text;
			cursor: text;
		`;

		// Start with empty or rendered output (preserves colors via ANSI rendering)
		if (!this.currentContent.isStreaming && this.currentContent.output) {
			this.renderAnsiOutput(this.outputPre, this.currentContent.output);
		}

		outputDiv.appendChild(this.outputPre);
		innerContent.appendChild(outputDiv);
		this.outputScrollableWrapper.appendChild(innerContent);

		// Create DomScrollableElement for proper scrolling
		this.outputScrollable = this._register(new DomScrollableElement(this.outputScrollableWrapper, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto,
			verticalScrollbarSize: 10,
			horizontalScrollbarSize: 0,
			useShadows: false
		}));

		scrollableContainer.appendChild(this.outputScrollable.getDomNode());
		this.outputContainer.appendChild(scrollableContainer);
		outputWrapper.appendChild(this.outputContainer);

		bodyContent.appendChild(outputWrapper);
		bodyInner.appendChild(bodyContent);
		body.appendChild(bodyInner);

		// Start streaming if needed
		if (this.currentContent.isStreaming) {
			setTimeout(() => {
				this.startOutputStreaming();
			}, 300);
		}

		return body;
	}

	private toggleOutputExpansion(): void {
		if (!this.outputContainer || !this.outputScrollableWrapper || !this.outputExpandButton) {
			return;
		}

		const chevron = this.outputExpandButton.querySelector('.codicon');
		if (!chevron) {
			return;
		}

		if (this.isOutputExpanded) {
			// Collapse to calculated height or max collapsed height
			if (this.outputPre) {
				const lineCount = (this.outputPre.textContent || '').split('\n').length;
				const calculatedHeight = Math.min(
					lineCount * this.LINE_HEIGHT + 8,
					this.MAX_COLLAPSED_HEIGHT
				);
				const collapsedHeight = `${calculatedHeight}px`;
				this.outputContainer.style.height = collapsedHeight;
				this.outputScrollableWrapper.style.height = collapsedHeight;
			} else {
				const collapsedHeight = `${this.MAX_COLLAPSED_HEIGHT}px`;
				this.outputContainer.style.height = collapsedHeight;
				this.outputScrollableWrapper.style.height = collapsedHeight;
			}
			chevron.className = 'codicon codicon-chevron-down';
			this.isOutputExpanded = false;
		} else {
			// Expand to calculated height or max expanded height
			if (this.outputPre) {
				const lineCount = (this.outputPre.textContent || '').split('\n').length;
				const calculatedHeight = Math.min(
					lineCount * this.LINE_HEIGHT + 8,
					this.EXPANDED_MAX_HEIGHT
				);
				const expandedHeight = `${calculatedHeight}px`;
				this.outputContainer.style.height = expandedHeight;
				this.outputScrollableWrapper.style.height = expandedHeight;
			} else {
				const expandedHeight = `${this.EXPANDED_MAX_HEIGHT}px`;
				this.outputContainer.style.height = expandedHeight;
				this.outputScrollableWrapper.style.height = expandedHeight;
			}
			chevron.className = 'codicon codicon-chevron-up';
			this.isOutputExpanded = true;
		}

		// Update scrollable element
		if (this.outputScrollable) {
			this.outputScrollable.scanDomNode();
		}

		console.log('[Terminal] Toggled expansion:', this.isOutputExpanded ? 'expanded' : 'collapsed');
	}

	private calculateLineCount(): number {
		if (!this.outputPre) {
			return 0;
		}

		const outputText = this.outputPre.textContent || '';
		return outputText.split('\n').length;
	}

	private canShowExpandButton(): boolean {
		const lineCount = this.calculateLineCount();
		return lineCount > this.MIN_LINES_FOR_EXPAND;
	}

	private startOutputStreaming(): void {
		const fullOutput = this.currentContent.output || '';
		const lines = fullOutput.split('\n');
		let currentLineIndex = 0;
		let currentOutput = '';

		console.log('[Terminal Streaming] Starting with', lines.length, 'lines');

		const STREAM_DELAY_MS = 100; // 100ms per line

		const streamNextLine = () => {
			if (currentLineIndex >= lines.length) {
				console.log('[Terminal Streaming] Complete!');
				if (this.outputStreamIntervalId) {
					clearInterval(this.outputStreamIntervalId);
					this.outputStreamIntervalId = null;
				}
				// Update to completed phase with success status
				this.currentContent.phase = 'completed';
				this.currentContent.status = 'success';
				this.currentContent.isStreaming = false;

				// Update top header text
				if (this.commandSummary) {
					const headerText = this.getPhaseHeaderText();
					const summaryText = this.commandSummary.querySelector('span');
					if (summaryText) {
						summaryText.textContent = `${headerText} ${this.getCommandSummary()}`;
					}
				}

				// Rebuild control row to show "Success" status
				this.rebuildControlRow();

				// Rebuild action buttons to show expand button
				if (this.actionButtonsContainer && this.topHeader) {
					// Remove old buttons
					while (this.actionButtonsContainer.firstChild) {
						this.actionButtonsContainer.removeChild(this.actionButtonsContainer.firstChild);
					}
					// Replace with new buttons (now includes expand button)
					const newButtons = this.createActionButtons();
					this.actionButtonsContainer.replaceWith(newButtons);
					this.actionButtonsContainer = newButtons;

					// Re-attach hover listeners
					this._register(addDisposableListener(this.topHeader, 'mouseenter', () => {
						if (this.actionButtonsContainer) {
							this.actionButtonsContainer.style.opacity = '1';
						}
					}));

					this._register(addDisposableListener(this.topHeader, 'mouseleave', () => {
						if (this.actionButtonsContainer) {
							this.actionButtonsContainer.style.opacity = '0';
						}
					}));
				}

				return;
			}

			// Add next line
			currentOutput += (currentLineIndex > 0 ? '\n' : '') + lines[currentLineIndex];
			currentLineIndex++;

			if (this.outputPre) {
				this.renderAnsiOutput(this.outputPre, currentOutput);
			}

			// Scroll to bottom
			if (this.outputScrollable) {
				this.outputScrollable.scanDomNode();
				const scrollHeight = this.outputScrollable.getScrollDimensions().scrollHeight;
				this.outputScrollable.setScrollPosition({ scrollTop: scrollHeight });
			}

			// Notify parent for page-level scrolling
			if (this.onStreamingUpdate) {
				this.onStreamingUpdate();
			}

			this.outputStreamIntervalId = setTimeout(streamNextLine, STREAM_DELAY_MS) as any;
		};

		// Start streaming
		this.outputStreamIntervalId = setTimeout(streamNextLine, 200) as any;
	}

	private createControlRow(): HTMLElement {
		const row = $('.composer-tool-call-control-row');
		row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px 4px 8px;';

		// Left side - permission dropdown (or empty if skipped)
		this.leftControls = $('.composer-tool-call-left-controls');
		if (this.currentContent.status !== 'cancelled') {
			const permissionDropdown = this.createPermissionDropdown();
			this.leftControls.appendChild(permissionDropdown);
		}

		// Right side - different content based on phase
		this.statusRow = $('.composer-tool-call-status-row');
		if (this.currentContent.phase === 'pending') {
			// Show Skip + Run buttons
			this.statusRow.appendChild(this.createSkipRunButtons());
		} else {
			// Show status indicator
			this.statusIndicator = this.createStatusIndicator();
			this.statusRow.appendChild(this.statusIndicator);
		}

		row.appendChild(this.leftControls);
		row.appendChild(this.statusRow);

		return row;
	}

	private rebuildControlRow(): void {
		if (!this.controlRow || !this.leftControls || !this.statusRow) {
			return;
		}

		// Clear left controls
		while (this.leftControls.firstChild) {
			this.leftControls.removeChild(this.leftControls.firstChild);
		}

		// Clear status row
		while (this.statusRow.firstChild) {
			this.statusRow.removeChild(this.statusRow.firstChild);
		}

		// Rebuild based on current state
		if (this.currentContent.status === 'cancelled') {
			// Skipped: empty left, just status on right
			this.statusIndicator = this.createStatusIndicator();
			this.statusRow.appendChild(this.statusIndicator);
		} else if (this.currentContent.phase === 'pending') {
			// Pending: permission dropdown + Skip/Run buttons
			const permissionDropdown = this.createPermissionDropdown();
			this.leftControls.appendChild(permissionDropdown);
			this.statusRow.appendChild(this.createSkipRunButtons());
		} else if (this.currentContent.phase === 'running') {
			// Running: permission dropdown + loading spinner
			const permissionDropdown = this.createPermissionDropdown();
			this.leftControls.appendChild(permissionDropdown);
			this.statusRow.appendChild(this.createLoadingSpinner());
		} else {
			// Completed: permission dropdown + status
			const permissionDropdown = this.createPermissionDropdown();
			this.leftControls.appendChild(permissionDropdown);
			this.statusIndicator = this.createStatusIndicator();
			this.statusRow.appendChild(this.statusIndicator);
		}
	}

	private createLoadingSpinner(): HTMLElement {
		const container = $('div');
		container.style.cssText = 'display: flex; gap: 8px; align-items: center;';

		// Spinner icon (using codicon-loading with spin animation)
		const spinner = $('span.codicon.codicon-loading.codicon-modifier-spin');
		spinner.style.cssText = `
			font-size: 14px;
			color: var(--vscode-foreground);
			opacity: 0.8;
		`;

		// "Running" text
		const text = $('span');
		text.textContent = 'Running';
		text.style.cssText = `
			font-size: 12px;
			color: var(--cursor-text-secondary);
		`;

		container.appendChild(spinner);
		container.appendChild(text);

		return container;
	}

	private createSkipRunButtons(): HTMLElement {
		const container = $('div');
		container.style.cssText = 'display: flex; gap: 4px; align-items: center;';

		// Skip button
		const skipButton = $('.anysphere-text-button.composer-skip-button');
		skipButton.style.cssText = `
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
		const skipText = $('span');
		skipText.textContent = 'Skip';
		skipButton.appendChild(skipText);

		this._register(addDisposableListener(skipButton, 'click', () => {
			this.handleSkip();
		}));

		// Run button
		const runButton = $('.anysphere-button.composer-run-button');
		runButton.style.cssText = `
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
		const runText = $('span');
		runText.textContent = 'Run';
		const keybinding = $('span.keybinding-font-settings');
		keybinding.textContent = '⏎';
		keybinding.style.cssText = 'font-size: 10px; opacity: 0.5; margin-left: 2px;';

		runButton.appendChild(runText);
		runButton.appendChild(keybinding);

		this._register(addDisposableListener(runButton, 'click', () => {
			this.handleRun();
		}));

		container.appendChild(skipButton);
		container.appendChild(runButton);

		return container;
	}

	private createPermissionDropdown(): HTMLElement {
		const controls = $('.composer-tool-call-allowlist-controls-wide');

		this.permissionButton = $('.anysphere-text-button.composer-tool-call-allowlist-button');
		this.permissionButton.setAttribute('data-click-ready', 'true');
		this.permissionButton.style.cssText = `
			display: flex;
			flex-nowrap: nowrap;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			cursor: pointer;
			white-space: nowrap;
			flex-shrink: 0;
			font-size: 12px;
			line-height: 16px;
			box-sizing: border-box;
			min-height: 20px;
			background: transparent;
			border: none;
			color: var(--cursor-text-primary);
			transition: background-color 0.15s ease;
		`;

		const span = $('span');
		span.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';

		const textSpan = $('span');
		textSpan.style.cssText = 'truncate';

		const content = $('span.composer-tool-call-button-content');
		content.textContent = this.selectedPermission;

		const chevron = $('div.codicon.codicon-chevron-down');
		content.appendChild(chevron);

		textSpan.appendChild(content);
		span.appendChild(textSpan);
		this.permissionButton.appendChild(span);

		this._register(addDisposableListener(this.permissionButton, 'click', (e) => {
			e.stopPropagation();
			this.togglePermissionMenu();
		}));

		controls.appendChild(this.permissionButton);
		return controls;
	}

	private togglePermissionMenu(): void {
		if (this.permissionDropdownMenu) {
			// Close existing menu
			this.closePermissionMenu();
		} else {
			// Open menu
			this.openPermissionMenu();
		}
	}

	private isDarkTheme(): boolean {
		const workbench = document.querySelector('.monaco-workbench');
		if (workbench) {
			return workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black');
		}
		return document.body.classList.contains('vs-dark') || document.body.classList.contains('hc-black');
	}

	private openPermissionMenu(): void {
		if (!this.permissionButton) {
			return;
		}

		const isDarkTheme = this.isDarkTheme();

		// Create dropdown menu - use text edit header background
		this.permissionDropdownMenu = $('.terminal-permission-dropdown');
		this.permissionDropdownMenu.style.cssText = `
			box-sizing: border-box;
			padding: 0px;
			border-radius: 6px;
			background: transparent;
			border: none;
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 10px;
			display: flex;
			flex-direction: column;
			gap: 0px;
			position: fixed;
			visibility: visible;
			width: 180px;
			min-width: 180px;
			transform-origin: left top;
			box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.12);
			z-index: 2548;
		`;

		// Inner container - VYBE text edit header colors
		const inner = $('div');
		inner.setAttribute('tabindex', '0');
		inner.style.cssText = `
			box-sizing: border-box;
			border-radius: 6px;
			background-color: ${isDarkTheme ? '#212427' : '#eceff2'} !important;
			border: 1px solid ${isDarkTheme ? '#383838' : '#d9d9d9'} !important;
			align-items: stretch;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 2px;
			contain: paint;
			outline: none;
			pointer-events: auto;
		`;

		// Options container
		const options = $('div');
		options.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

		// Option 1: Ask Every Time
		const option1 = this.createDropdownOption('Ask Every Time', this.selectedPermission === 'Ask Every Time');
		this._register(addDisposableListener(option1, 'click', () => {
			this.selectPermission('Ask Every Time');
		}));
		options.appendChild(option1);

		// Option 2: Run in Sandbox
		const option2 = this.createDropdownOption('Run in Sandbox', this.selectedPermission === 'Run in Sandbox');
		this._register(addDisposableListener(option2, 'click', () => {
			this.selectPermission('Run in Sandbox');
		}));
		options.appendChild(option2);

		// Option 3: Run Everything
		const option3 = this.createDropdownOption('Run Everything', this.selectedPermission === 'Run Everything');
		this._register(addDisposableListener(option3, 'click', () => {
			this.showRunEverythingModal();
		}));
		options.appendChild(option3);

		inner.appendChild(options);
		this.permissionDropdownMenu.appendChild(inner);
		document.body.appendChild(this.permissionDropdownMenu);

		// Position menu - OPEN DOWNWARD with more spacing
		const rect = this.permissionButton.getBoundingClientRect();
		this.permissionDropdownMenu.style.top = `${rect.bottom + 8}px`;
		this.permissionDropdownMenu.style.left = `${rect.left}px`;

		// Close on click outside
		const closeHandler = (e: MouseEvent) => {
			if (this.permissionDropdownMenu && !this.permissionDropdownMenu.contains(e.target as Node) && !this.permissionButton?.contains(e.target as Node)) {
				this.closePermissionMenu();
				document.removeEventListener('click', closeHandler, true);
				document.removeEventListener('keydown', escapeHandler);
			}
		};

		// Close on Escape key
		const escapeHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.closePermissionMenu();
				document.removeEventListener('click', closeHandler, true);
				document.removeEventListener('keydown', escapeHandler);
			}
		};

		setTimeout(() => {
			document.addEventListener('click', closeHandler, true);
			document.addEventListener('keydown', escapeHandler);
		}, 0);
	}

	private createDropdownOption(text: string, isSelected: boolean): HTMLElement {
		const isDarkTheme = this.isDarkTheme();

		const option = $('.permission-dropdown-option');
		option.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 2px 8px;
			border-radius: 4px;
			cursor: pointer;
			min-height: 18px;
			height: 20px;
			gap: 8px;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			background-color: ${isSelected ? (isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)') : 'transparent'};
			transition: background-color 0.15s ease;
		`;

		const label = $('span');
		label.textContent = text;
		label.style.cssText = `
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			font-size: 12px;
			line-height: 16px;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			flex: 1;
		`;

		const checkmark = $('span.codicon.codicon-check');
		checkmark.style.cssText = `
			font-size: 12px;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			opacity: ${isSelected ? '1' : '0'};
		`;

		option.appendChild(label);
		option.appendChild(checkmark);

		// Hover effect
		const hoverColor = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
		this._register(addDisposableListener(option, 'mouseenter', () => {
			option.style.backgroundColor = hoverColor;
		}));

		this._register(addDisposableListener(option, 'mouseleave', () => {
			option.style.backgroundColor = isSelected ? hoverColor : 'transparent';
		}));

		return option;
	}

	private closePermissionMenu(): void {
		if (this.permissionDropdownMenu) {
			this.permissionDropdownMenu.remove();
			this.permissionDropdownMenu = null;
		}
	}

	private selectPermission(permission: string): void {
		console.log('[Terminal] Selected permission:', permission);
		this.selectedPermission = permission;

		// Update button text
		if (this.permissionButton) {
			const content = this.permissionButton.querySelector('.composer-tool-call-button-content');
			if (content) {
				// Clear and rebuild
				while (content.firstChild) {
					content.removeChild(content.firstChild);
				}
				content.appendChild(document.createTextNode(permission));
				const chevron = $('div.codicon.codicon-chevron-down');
				content.appendChild(chevron);
			}
		}

		// Close menu
		this.closePermissionMenu();

		// Store preference if "Run Everything" is selected
		if (permission === 'Run Everything') {
			this.storageService.store(VybeChatTerminalPart.STORAGE_KEY_TERMINAL_RUN_EVERYTHING, true, StorageScope.PROFILE, StorageTarget.USER);
		} else if (permission === 'Ask Every Time') {
			// When user selects "Ask Every Time", clear the global preference to reinstate it
			this.storageService.remove(VybeChatTerminalPart.STORAGE_KEY_TERMINAL_RUN_EVERYTHING, StorageScope.PROFILE);
		} else {
			// For "Run in Sandbox" or other options, clear preference
			this.storageService.remove(VybeChatTerminalPart.STORAGE_KEY_TERMINAL_RUN_EVERYTHING, StorageScope.PROFILE);
		}
	}

	private showRunEverythingModal(): void {
		// Close dropdown first
		this.closePermissionMenu();

		const isDarkTheme = this.isDarkTheme();

		// Create modal overlay
		this.warningModal = $('.fade-in-fast');
		this.warningModal.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.5);
			display: flex;
			flex-direction: column;
			justify-content: flex-start;
			align-items: center;
			z-index: 2551;
			backdrop-filter: blur(1px);
		`;

		// Modal container - use VYBE text edit header background
		const modal = $('.pretty-dialog-modal.fade-in-fast');
		modal.style.cssText = `
			background-color: ${isDarkTheme ? '#212427' : '#eceff2'} !important;
			padding: 0px;
			border-radius: 8px;
			box-shadow: rgba(0, 0, 0, 0.15) 0px 4px 20px;
			display: flex;
			flex-direction: column;
			gap: 0px;
			z-index: 2552;
			border: 1px solid ${isDarkTheme ? '#383838' : '#d9d9d9'};
			min-width: 300px;
			margin-top: 200px;
			font-family: -apple-system, "system-ui", sans-serif;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
		`;

		// Content area
		const content = $('div');
		content.style.cssText = `
			padding: 12px 8px 12px 8px;
			display: flex;
			gap: 6px;
			contain: inline-size;
		`;

		// Warning icon
		const icon = $('div.codicon.codicon-warning.pretty-dialog-icon');
		icon.style.cssText = 'color: var(--vscode-editorWarning-foreground); font-size: 16px; flex-shrink: 0;';

		// Text container
		const textContainer = $('div');
		textContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1; width: 100%;';

		const title = $('h1.pretty-dialog-title.select-text');
		title.textContent = 'Disclaimer';
		title.style.cssText = `
			font-size: 13px;
			font-weight: 600;
			margin: 0;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			font-family: -apple-system, "system-ui", sans-serif;
			user-select: text;
		`;

		const messageWrapper = $('.pretty-dialog-message');
		messageWrapper.style.cssText = 'width: 100%;';

		const messageText = $('div');
		messageText.textContent = 'Run Everything runs all commands automatically. Be cautious of potential prompt injection risks from external sources and use at your own risk.';
		messageText.style.cssText = `
			font-size: 12px;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(51, 51, 51, 0.7)'};
			line-height: 18px;
			font-family: -apple-system, "system-ui", sans-serif;
		`;

		messageWrapper.appendChild(messageText);
		textContainer.appendChild(title);
		textContainer.appendChild(messageWrapper);

		content.appendChild(icon);
		content.appendChild(textContainer);

		// Buttons area
		const buttons = $('div');
		buttons.style.cssText = 'padding: 2px 12px 12px 12px; display: flex; justify-content: flex-end; gap: 4px; height: 25px; align-items: center;';

		// Cancel button
		const cancelBtn = $('.anysphere-text-button.pretty-dialog-button.tab-focusable');
		cancelBtn.setAttribute('tabindex', '0');
		cancelBtn.style.cssText = `
			display: flex;
			flex-wrap: nowrap;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			font-size: 12px;
			line-height: 16px;
			min-height: 20px;
			box-sizing: border-box;
			cursor: pointer;
			background: transparent;
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.7)' : 'rgba(51, 51, 51, 0.7)'};
			border: none;
			font-family: -apple-system, "system-ui", sans-serif;
			transition: background-color 0.15s ease;
		`;
		const cancelWrapper = $('span');
		cancelWrapper.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';
		const cancelText = $('span');
		cancelText.style.cssText = 'text-overflow: ellipsis; overflow: hidden;';
		cancelText.textContent = 'Cancel (esc)';
		cancelWrapper.appendChild(cancelText);
		cancelBtn.appendChild(cancelWrapper);

		this._register(addDisposableListener(cancelBtn, 'click', () => {
			this.closeWarningModal();
		}));

		// Do not show again button (stores permanent preference)
		const doNotShowBtn = $('.anysphere-secondary-button.pretty-dialog-button.tab-focusable');
		doNotShowBtn.setAttribute('tabindex', '0');
		doNotShowBtn.style.cssText = `
			display: flex;
			flex-wrap: nowrap;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			font-size: 12px;
			line-height: 16px;
			min-height: 20px;
			box-sizing: border-box;
			cursor: pointer;
			background: ${isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
			color: ${isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)'};
			border: none;
			font-family: -apple-system, "system-ui", sans-serif;
			transition: opacity 0.15s ease;
		`;
		const doNotShowWrapper = $('span');
		doNotShowWrapper.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';
		const doNotShowText = $('span');
		doNotShowText.style.cssText = 'text-overflow: ellipsis; overflow: hidden;';
		doNotShowText.textContent = 'Do not show again';
		doNotShowWrapper.appendChild(doNotShowText);
		doNotShowBtn.appendChild(doNotShowWrapper);

		this._register(addDisposableListener(doNotShowBtn, 'click', () => {
			// "Do not show again" = always allow all terminal commands across all messages
			// Save global preference
			this.selectedPermission = 'Run Everything';
			this.storageService.store(VybeChatTerminalPart.STORAGE_KEY_TERMINAL_RUN_EVERYTHING, true, StorageScope.PROFILE, StorageTarget.USER);

			// Update button text
			if (this.permissionButton) {
				const content = this.permissionButton.querySelector('.composer-tool-call-button-content');
				if (content) {
					while (content.firstChild) {
						content.removeChild(content.firstChild);
					}
					content.appendChild(document.createTextNode('Run Everything'));
					const chevron = $('div.codicon.codicon-chevron-down');
					content.appendChild(chevron);
				}
			}

			console.log('[Terminal] Run Everything enabled globally (all messages)');
			this.closeWarningModal();
		}));

		// Continue button (only for this message)
		const continueBtn = $('.anysphere-button.pretty-dialog-button.pretty-dialog-button-primary.tab-focusable');
		continueBtn.setAttribute('tabindex', '0');
		continueBtn.style.cssText = `
			display: flex;
			flex-wrap: nowrap;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 0 6px;
			border-radius: 4px;
			font-size: 12px;
			line-height: 16px;
			min-height: 20px;
			box-sizing: border-box;
			cursor: pointer;
			background: #3ecf8e;
			color: white;
			border: none;
			font-family: -apple-system, "system-ui", sans-serif;
			transition: background-color 0.15s ease;
		`;

		const continueTextWrapper = $('span');
		continueTextWrapper.style.cssText = 'display: inline-flex; align-items: baseline; gap: 2px; min-width: 0; overflow: hidden;';

		const continueText = $('span');
		continueText.style.cssText = 'text-overflow: ellipsis; overflow: hidden;';
		continueText.textContent = 'Continue';

		const continueKey = $('span.keybinding-font-settings');
		continueKey.textContent = '⏎';
		continueKey.style.cssText = 'font-size: 10px; opacity: 0.5; flex-shrink: 0;';

		continueTextWrapper.appendChild(continueText);
		continueTextWrapper.appendChild(continueKey);
		continueBtn.appendChild(continueTextWrapper);

		this._register(addDisposableListener(continueBtn, 'click', () => {
			// "Continue" = allow Run Everything only for this message's terminal commands
			// Do NOT save global preference - only apply to this message
			this.selectedPermission = 'Run Everything';

			// Update button text
			if (this.permissionButton) {
				const content = this.permissionButton.querySelector('.composer-tool-call-button-content');
				if (content) {
					while (content.firstChild) {
						content.removeChild(content.firstChild);
					}
					content.appendChild(document.createTextNode('Run Everything'));
					const chevron = $('div.codicon.codicon-chevron-down');
					content.appendChild(chevron);
				}
			}

			console.log('[Terminal] Run Everything enabled for this message only (not saved globally)');
			this.closeWarningModal();
		}));

		buttons.appendChild(cancelBtn);
		buttons.appendChild(doNotShowBtn);
		buttons.appendChild(continueBtn);

		modal.appendChild(content);
		modal.appendChild(buttons);
		this.warningModal.appendChild(modal);

		document.body.appendChild(this.warningModal);

		// Close on Escape key
		const escapeHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.closeWarningModal();
				document.removeEventListener('keydown', escapeHandler);
			} else if (e.key === 'Enter') {
				this.selectPermission('Run Everything');
				console.log('[Terminal] Run Everything enabled for this message only (Enter key)');
				this.closeWarningModal();
				document.removeEventListener('keydown', escapeHandler);
			}
		};
		document.addEventListener('keydown', escapeHandler);

		// Close on click outside modal
		const clickHandler = (e: MouseEvent) => {
			if (this.warningModal && e.target === this.warningModal) {
				this.closeWarningModal();
				document.removeEventListener('click', clickHandler);
			}
		};
		document.addEventListener('click', clickHandler);
	}

	private closeWarningModal(): void {
		if (this.warningModal) {
			this.warningModal.remove();
			this.warningModal = null;
		}
	}

	private createStatusIndicator(): HTMLElement {
		const indicator = $('span.composer-tool-call-status-indicator');
		indicator.style.cssText = 'color: var(--cursor-text-secondary); display: flex; align-items: center; gap: 4px;';

		// Determine status based on phase
		const displayStatus = this.getDisplayStatus();
		this.updateStatusContent(indicator, displayStatus);

		return indicator;
	}

	private getDisplayStatus(): string {
		// Map phase + status to display status
		switch (this.currentContent.phase) {
			case 'pending':
				return 'pending';
			case 'running':
				return 'running';
			case 'completed':
				return this.currentContent.status || 'success';
			default:
				return 'running';
		}
	}


	private updateStatusContent(element: HTMLElement, status: string): void {
		// Clear existing content using DOM methods (not innerHTML due to Trusted Types)
		while (element.firstChild) {
			element.removeChild(element.firstChild);
		}

		let iconClass = 'codicon-check';
		let statusText = 'Success';
		let color = 'var(--cursor-text-secondary)';

		switch (status) {
			case 'pending':
				iconClass = 'codicon-clock';
				statusText = 'Waiting for approval';
				color = 'var(--cursor-text-secondary)';
				break;
			case 'success':
				iconClass = 'codicon-check';
				statusText = 'Success';
				color = 'var(--cursor-text-secondary)';
				break;
			case 'failed':
				iconClass = 'codicon-circle-slash';
				statusText = 'Failed';
				color = 'var(--vscode-testing-iconFailed)';
				break;
			case 'running':
				iconClass = 'codicon-loading codicon-modifier-spin';
				statusText = 'Running';
				color = 'var(--cursor-text-secondary)';
				break;
			case 'cancelled':
				iconClass = 'codicon-debug-step-over';
				statusText = 'Skipped';
				color = 'var(--cursor-text-secondary)';
				break;
		}

		const icon = $(`span.codicon.${iconClass}`);
		element.appendChild(icon);

		const text = document.createTextNode(statusText);
		element.appendChild(text);

		element.style.color = color;
	}

	private getCommandSummary(): string {
		// Extract command names from full command string
		const command = this.currentContent.command;
		const parts = command.split('&&').map(c => c.trim());
		const commands = parts.map(p => p.split(' ')[0]).filter(c => c.length > 0);
		return commands.join(', ');
	}

	private handleCopy(): void {
		// Copy the command, not the output
		this.clipboardService.writeText(this.currentContent.command);
		console.log('[Terminal] Copied command to clipboard:', this.currentContent.command);
	}

	private async handleOpenInTerminal(): Promise<void> {
		// Show and focus the execution terminal where the command was run
		// This allows user to see live output (e.g., npm run watch)
		try {
			if (this.executionTerminal) {
				// Set as active instance
				this.terminalService.setActiveInstance(this.executionTerminal);

				// Show terminal panel (this opens the panel if closed)
				await this.terminalGroupService.showPanel(true);

				// Focus the terminal where the command was executed
				await this.executionTerminal.focusWhenReady(true);
				console.log('[Terminal] Opened and focused execution terminal');
			} else {
				console.warn('[Terminal] No execution terminal available');
				this.hideOpenInTerminalButton();
			}
		} catch (error) {
			console.error('[Terminal] Failed to open/focus terminal:', error);
			// Terminal was deleted/disposed - hide the button
			this.executionTerminal = null;
			this.hideOpenInTerminalButton();
		}
	}

	private hideOpenInTerminalButton(): void {
		// Hide the button if it exists
		if (this.openInTerminalButton) {
			this.openInTerminalButton.style.display = 'none';
		}

		// Rebuild action buttons to remove the button from DOM
		if (this.actionButtonsContainer && this.topHeader) {
			const newButtons = this.createActionButtons();
			this.actionButtonsContainer.replaceWith(newButtons);
			this.actionButtonsContainer = newButtons;

			// Re-attach hover listeners
			this._register(addDisposableListener(this.topHeader, 'mouseenter', () => {
				if (this.actionButtonsContainer) {
					this.actionButtonsContainer.style.opacity = '1';
				}
			}));

			this._register(addDisposableListener(this.topHeader, 'mouseleave', () => {
				if (this.actionButtonsContainer) {
					this.actionButtonsContainer.style.opacity = '0';
				}
			}));
		}
	}

	/**
	 * Renders ANSI terminal output safely using DOM methods (not innerHTML)
	 * Preserves terminal colors by converting ANSI codes to styled spans
	 */
	private renderAnsiOutput(container: HTMLElement, text: string): void {
		// Clear existing content safely
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		if (!text) {
			return;
		}

		// Remove shell integration codes first
		text = text.replace(/\x1b\]633;[^\x07]*\x07/g, '');
		text = text.replace(/\]633;[^\x07]*\x07/g, '');
		text = text.replace(/\x1b\][^\x07]*\x07/g, '');

		// Remove terminal control sequences (not color codes)
		// [K = clear to end of line, [J = clear screen, [H = cursor home
		// [?2004h/l = bracketed paste, [?1h= = cursor keys mode
		text = text.replace(/\x1b\[[0-9]*[KJH]/g, '');
		text = text.replace(/\x1b\[\?[0-9]*[a-z=]/g, ''); // Include = for cursor keys mode
		text = text.replace(/\[[0-9]*[KJH]/g, '');
		text = text.replace(/\[\?[0-9]*[a-z=]/g, ''); // Include = for cursor keys mode

		// Remove incomplete escape sequences that might leave = behind
		text = text.replace(/\x1b\[[^m]*=/g, ''); // ESC[...= (incomplete sequences)
		text = text.replace(/^=/gm, ''); // Standalone = at start of lines
		text = text.replace(/\n=/g, '\n'); // = after newlines

		// Remove control characters except newline/tab
		text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F]/g, '');

		// ANSI color codes mapping (foreground colors)
		const ansiColors: { [key: string]: string } = {
			'30': 'var(--vscode-terminal-ansiBlack)',
			'31': 'var(--vscode-terminal-ansiRed)',
			'32': 'var(--vscode-terminal-ansiGreen)',
			'33': 'var(--vscode-terminal-ansiYellow)',
			'34': 'var(--vscode-terminal-ansiBlue)',
			'35': 'var(--vscode-terminal-ansiMagenta)',
			'36': 'var(--vscode-terminal-ansiCyan)',
			'37': 'var(--vscode-terminal-ansiWhite)',
			'90': 'var(--vscode-terminal-ansiBrightBlack)',
			'91': 'var(--vscode-terminal-ansiBrightRed)',
			'92': 'var(--vscode-terminal-ansiBrightGreen)',
			'93': 'var(--vscode-terminal-ansiBrightYellow)',
			'94': 'var(--vscode-terminal-ansiBrightBlue)',
			'95': 'var(--vscode-terminal-ansiBrightMagenta)',
			'96': 'var(--vscode-terminal-ansiBrightCyan)',
			'97': 'var(--vscode-terminal-ansiBrightWhite)'
		};

		// Ultra-conservative ANSI parsing - only apply colors when 100% certain
		// Match ONLY proper ANSI escape sequences: \x1b[...m
		const ansiCodeRegex = /\x1b\[([0-9;]*)m/g;
		const parts: Array<{ text: string; color?: string; bold?: boolean }> = [];
		let lastIndex = 0;
		let currentColor: string | null = null;
		let currentBold = false;
		let match: RegExpExecArray | null;

		while ((match = ansiCodeRegex.exec(text)) !== null) {
			// Add text before this ANSI code
			if (match.index > lastIndex) {
				const textBefore = text.substring(lastIndex, match.index);
				if (textBefore) {
					parts.push({
						text: textBefore,
						color: currentColor || undefined,
						bold: currentBold || undefined
					});
				}
			}

			// Process ANSI code - be very strict
			const codes = match[1].split(';').filter(c => c.length > 0);

			// Check for reset first (code 0 or empty)
			if (codes.length === 0 || codes.includes('0')) {
				// Reset all attributes - this is important!
				currentColor = null;
				currentBold = false;
			} else {
				// Process each code in sequence
				for (const code of codes) {
					if (code === '1') {
						// Bold/bright - only apply if explicitly in sequence
						currentBold = true;
					} else if (code === '22') {
						// Normal intensity (not bold)
						currentBold = false;
					} else if (code === '27') {
						// Not reversed (ignore)
					} else if (code === '7') {
						// Reverse video (ignore)
					} else if (ansiColors[code]) {
						// Only apply color if it's in our color map (30-37, 90-97)
						currentColor = ansiColors[code];
					}
					// Ignore all other codes (don't apply styles for unknown codes)
				}
			}

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			const remainingText = text.substring(lastIndex);
			if (remainingText) {
				parts.push({
					text: remainingText,
					color: currentColor || undefined,
					bold: currentBold || undefined
				});
			}
		}

		// Render parts - only apply styles if explicitly set
		for (const part of parts) {
			if (part.color || part.bold) {
				const span = document.createElement('span');
				// Only set color if explicitly provided
				if (part.color) {
					span.style.color = part.color;
				}
				// Only set bold if explicitly provided
				if (part.bold) {
					span.style.fontWeight = 'bold';
				}
				span.appendChild(document.createTextNode(part.text));
				container.appendChild(span);
			} else {
				// Plain text - no styles
				container.appendChild(document.createTextNode(part.text));
			}
		}
	}


	private handleSkip(): void {
		console.log('[Terminal] Skip clicked');

		// Update state to skipped
		this.currentContent.phase = 'completed';
		this.currentContent.status = 'cancelled';

		// Remove ping border
		if (this.mainContainer) {
			this.mainContainer.classList.remove('composer-terminal-ping-border');
		}

		// Update top header text
		if (this.commandSummary) {
			const headerText = this.getPhaseHeaderText();
			const summaryText = this.commandSummary.querySelector('span');
			if (summaryText) {
				summaryText.textContent = `${headerText} ${this.getCommandSummary()}`;
			}
		}

		// If we have a task ID, notify LangGraph that user rejected the command
		if (this.taskId && this.agentService.resumeWithApproval) {
			console.log('[Terminal] Rejecting LangGraph command for task:', this.taskId);
			this.agentService.resumeWithApproval(this.taskId, 'reject').catch(error => {
				console.error('[Terminal] LangGraph reject failed:', error);
			});
		}

		// Rebuild control row to show "Skipped" status
		this.rebuildControlRow();
	}

	private async handleRun(): Promise<void> {
		console.log('[Terminal] Run clicked - executing:', this.currentContent.command);

		// Log block height before showing body
		if (this.mainContainer) {
			const blockHeightBefore = this.mainContainer.offsetHeight;
			console.log('[Terminal] Block height BEFORE showing body:', blockHeightBefore, 'px');
		}
		if (this.outputBody) {
			const bodyHeightBefore = this.outputBody.offsetHeight;
			const bodyDisplayBefore = window.getComputedStyle(this.outputBody).display;
			console.log('[Terminal] Body height BEFORE:', bodyHeightBefore, 'px, display:', bodyDisplayBefore);
		}

		// Transition to running phase
		this.currentContent.phase = 'running';
		this.currentContent.status = null;
		this.currentContent.isStreaming = true;

		// Remove ping border
		if (this.mainContainer) {
			this.mainContainer.classList.remove('composer-terminal-ping-border');
		}

		// Update top header text
		if (this.commandSummary) {
			const headerText = this.getPhaseHeaderText();
			const summaryText = this.commandSummary.querySelector('span');
			if (summaryText) {
				summaryText.textContent = `${headerText} ${this.getCommandSummary()}`;
			}
		}

		// Reset resize state
		this.hasResized = false;
		if (this.outputResizeTimer) {
			clearTimeout(this.outputResizeTimer);
			this.outputResizeTimer = null;
		}

		// DON'T show output body when Run is clicked
		// Keep it hidden (display: none) until we actually receive output
		// This prevents any expansion (including 36px) when Run is clicked
		// The body will be shown in the onData handler when real output is detected

		// Rebuild control row to show "Running" status
		this.rebuildControlRow();

		// If we have a task ID, use LangGraph resume for HITL
		// This signals to the agent that the user approved the command
		if (this.taskId && this.agentService.resumeWithApproval) {
			console.log('[Terminal] Resuming LangGraph agent with approval for task:', this.taskId);
			try {
				await this.agentService.resumeWithApproval(this.taskId, 'approve');
			} catch (error) {
				console.error('[Terminal] LangGraph resume failed, falling back to direct execution:', error);
				// Fallback to direct execution
				await this.executeCommand();
			}
		} else {
			// Fallback: Execute command directly using terminal service
			await this.executeCommand();
		}
	}

	/**
	 * Waits for terminal to be idle (no data for specified duration)
	 * This ensures the prompt is ready before sending commands
	 */
	private async waitForIdle(onData: any, idleDurationMs: number): Promise<void> {
		return new Promise<void>((resolve) => {
			let scheduler: any = null;
			let completed = false;

			const complete = () => {
				if (!completed) {
					completed = true;
					if (scheduler) {
						clearTimeout(scheduler);
					}
					if (listener) {
						listener.dispose();
					}
					resolve();
				}
			};

			const listener = onData(() => {
				// Reset timer on any data
				if (scheduler) {
					clearTimeout(scheduler);
				}
				if (!completed) {
					scheduler = setTimeout(complete, idleDurationMs);
				}
			});

			// Start initial timer
			scheduler = setTimeout(complete, idleDurationMs);
		});
	}

	/**
	 * Detects if a command is long-running (will block prompt)
	 * Examples: npm run watch, npm run dev, npm start, python -m http.server, etc.
	 */
	private isLongRunningCommand(command: string): boolean {
		const longRunningPatterns = [
			// npm/yarn/pnpm run commands that typically don't return
			/\b(npm|yarn|pnpm)\s+run\s+(watch|dev|serve|start|build:watch)/i,
			// Server commands
			/\b(python|python3)\s+-m\s+http\.server/i,
			/\b(node|nodemon)\s+.*\.(js|ts)/i,
			// Process managers
			/\b(pm2|forever|supervisor)\s+/i,
			// Docker compose
			/\bdocker-compose\s+up/i,
			// Watch commands
			/\b(watch|nodemon|chokidar)\s+/i,
		];

		return longRunningPatterns.some(pattern => pattern.test(command));
	}

	/**
	 * Finds an existing reusable VYBE terminal that's ready (prompt available)
	 */
	private async findReusableTerminal(cwd: URI | undefined): Promise<ITerminalInstance | null> {
		// Get all terminal instances
		const instances = this.terminalService.instances;

		// Find VYBE terminal that matches workspace
		for (const instance of instances) {
			// Check if it's a VYBE terminal
			if (instance.shellLaunchConfig.name !== 'VYBE') {
				continue;
			}

			// Check if it matches the workspace
			if (cwd && instance.workspaceFolder?.uri.toString() !== cwd.toString()) {
				continue;
			}

			// Check if terminal is ready and has prompt available
			try {
				const xterm = await instance.xtermReadyPromise;
				if (!xterm) {
					continue;
				}

				// Check if terminal has command detection capability (prompt available)
				const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (commandDetection && commandDetection.promptInputModel.state === PromptInputState.Input) {
					// Terminal is ready with prompt available
					return instance;
				}
			} catch (error) {
				// Terminal not ready, skip
				continue;
			}
		}

		return null;
	}

	private async executeCommand(): Promise<void> {
		try {
			// Get workspace root
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			const cwd = workspaceFolder?.uri;

			// Check if command is long-running
			const isLongRunning = this.isLongRunningCommand(this.currentContent.command);

			let terminal: ITerminalInstance;

			if (isLongRunning) {
				// Long-running commands need their own terminal (prompt won't return)
				// Create new terminal (VS Code will handle uniqueness if needed)
				terminal = await this.terminalService.createTerminal({
					config: {
						name: 'VYBE',
						cwd: cwd
					}
				});
			} else {
				// Short commands can reuse existing VYBE terminal
				const reusableTerminal = await this.findReusableTerminal(cwd);

				if (reusableTerminal) {
					// Reuse existing terminal
					terminal = reusableTerminal;
					console.log('[Terminal] Reusing existing VYBE terminal');
				} else {
					// Create new VYBE terminal
					terminal = await this.terminalService.createTerminal({
						config: {
							name: 'VYBE',
							cwd: cwd
						}
					});
					console.log('[Terminal] Created new VYBE terminal');
				}
			}

			if (!terminal) {
				throw new Error('Failed to create terminal');
			}

			this.executionTerminal = terminal;
			await terminal.focusWhenReady();

			// Wait for xterm to be ready (like Cursor does)
			await terminal.xtermReadyPromise;

			// Reset resize state for new command
			this.hasResized = false;
			if (this.outputResizeTimer) {
				clearTimeout(this.outputResizeTimer);
				this.outputResizeTimer = null;
			}

			// Initialize output buffer (empty - we'll add prompt manually)
			this.outputBuffer = '';
			let hasSeenOutput = false;
			let lastDataTime = Date.now();
			let commandEchoSeen = false;

			// Listen for terminal data
			this._register(terminal.onData((data) => {
				// Track that we received data
				lastDataTime = Date.now();
				hasSeenOutput = true;

				// Accumulate raw output
				this.outputBuffer += data;

				// Clean up the output for display
				const displayOutput = this.cleanTerminalOutput(this.outputBuffer, this.currentContent.command, commandEchoSeen);

				// Track if we've seen the command echo
				if (!commandEchoSeen && this.outputBuffer.includes(this.currentContent.command)) {
					commandEchoSeen = true;
				}

				// DON'T show body yet - keep it hidden until execution completes
				// This prevents the intermediate 36px resize
				// Body will be shown in handleExecutionComplete with final height

				// Don't resize here - wait for execution to complete
				// Resize will happen in handleExecutionComplete with final output

				// Update display in real-time
				this.currentContent.output = displayOutput;
				if (this.outputPre) {
					this.renderAnsiOutput(this.outputPre, displayOutput);
				}

				// Auto-scroll
				if (this.outputScrollable) {
					this.outputScrollable.scanDomNode();
					const scrollHeight = this.outputScrollable.getScrollDimensions().scrollHeight;
					this.outputScrollable.setScrollPosition({ scrollTop: scrollHeight });
				}

				// Notify parent for page-level scroll
				if (this.onStreamingUpdate) {
					this.onStreamingUpdate();
				}

				// Reset completion timer - command is still producing output
				if (this.completionTimer) {
					clearTimeout(this.completionTimer);
				}

				// Set timer to detect completion (no output for 500ms = done)
				this.completionTimer = setTimeout(() => {
					if (hasSeenOutput && Date.now() - lastDataTime >= 500) {
						console.log('[Terminal] Command completed (timeout)');
						this.handleExecutionComplete(0);
					}
				}, 500);
			}));

			// Listen for explicit exit (if terminal closes)
			this._register(terminal.onExit((exitCode) => {
				if (this.completionTimer) {
					clearTimeout(this.completionTimer);
				}
				console.log('[Terminal] Terminal exited with code:', exitCode);
				this.handleExecutionComplete(typeof exitCode === 'number' ? exitCode : 0);
			}));

			// Listen for terminal disposal (user deleted the terminal)
			this._register(terminal.onDisposed(() => {
				console.log('[Terminal] Terminal was disposed/deleted by user');
				this.executionTerminal = null;
				this.hideOpenInTerminalButton();
			}));

			// Wait for terminal to be idle (prompt ready) before sending command
			// This ensures the prompt appears before the command, like Cursor does
			// Use longer timeout to ensure prompt is fully rendered
			await this.waitForIdle(terminal.onData, 1000);

			// Send command to terminal
			console.log('[Terminal] Sending command:', this.currentContent.command);
			terminal.sendText(this.currentContent.command, true);

		} catch (error) {
			console.error('[Terminal] Execution error:', error);
			this.handleExecutionComplete(1);
		}
	}

	/**
	 * Cleans terminal output by removing duplicate command echoes and shell prompts
	 * Preserves exact formatting and spacing
	 */
	private cleanTerminalOutput(rawOutput: string, command: string, commandEchoSeen: boolean): string {
		if (!rawOutput || rawOutput.trim().length === 0) {
			return '';
		}

		let cleaned = rawOutput;

		// Remove shell integration codes (preserve ANSI color codes)
		cleaned = cleaned.replace(/\x1b\]633;[^\x07]*\x07/g, '');
		cleaned = cleaned.replace(/\]633;[^\x07]*\x07/g, '');

		// Remove terminal control sequences (not color codes)
		cleaned = cleaned.replace(/\x1b\[[0-9]*[KJH]/g, '');
		cleaned = cleaned.replace(/\x1b\[\?[0-9]*[a-z=]/g, ''); // Include = for cursor keys mode
		cleaned = cleaned.replace(/\[[0-9]*[KJH]/g, '');
		cleaned = cleaned.replace(/\[\?[0-9]*[a-z=]/g, ''); // Include = for cursor keys mode

		// Remove incomplete escape sequences that might leave = behind
		cleaned = cleaned.replace(/\x1b\[[^m]*=/g, ''); // ESC[...= (incomplete sequences)
		cleaned = cleaned.replace(/^=/gm, ''); // Standalone = at start of lines
		cleaned = cleaned.replace(/\n=/g, '\n'); // = after newlines

		cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F]/g, '');

		// Remove prompt + command echo lines (e.g., "VYBE-MCP % ls -la")
		// Match entire lines that contain: [anything] % [anything] or [anything] $ [anything]
		// This catches prompt + command combinations, even if command has typos/aliases
		const promptCommandPattern = /^[^\n]*[%$#]\s*[^\n]+$/gm;
		cleaned = cleaned.replace(promptCommandPattern, '');

		// Remove standalone command echo (if command appears on its own line early in output)
		// Split into lines and check first few lines
		const lines = cleaned.split('\n');
		let charCount = 0;
		for (let i = 0; i < lines.length && charCount < 500; i++) {
			const line = lines[i].trim();
			// If line contains the command and is early, remove it
			if (line.includes(command) && charCount < 500) {
				lines[i] = '';
				break; // Only remove first occurrence
			}
			charCount += lines[i].length + 1;
		}
		cleaned = lines.filter(l => l.trim().length > 0).join('\n');

		// Remove shell prompts (user@host % or $) - be aggressive
		// Remove prompts at start of lines
		cleaned = cleaned.replace(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\s+[^\s]+\s*[%$#]\s*/gm, '');
		// Remove directory-only prompts (e.g., "VYBE-MCP %")
		cleaned = cleaned.replace(/^[a-zA-Z0-9_-]+\s*[%$#]\s*/gm, '');
		// Remove prompts after newlines
		cleaned = cleaned.replace(/\n[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\s+[^\s]+\s*[%$#]\s*/g, '');
		cleaned = cleaned.replace(/\n[a-zA-Z0-9_-]+\s*[%$#]\s*/g, '');
		// Remove standalone % at start/end of lines
		cleaned = cleaned.replace(/^%\s*/gm, '');
		cleaned = cleaned.replace(/\n%\s*$/gm, '');
		cleaned = cleaned.replace(/\n%\s*\n/g, '\n');

		// Remove trailing prompts at the END of output (most important!)
		// Match: % followed by newline and user@host or directory
		cleaned = cleaned.replace(/%\s*\n\s*[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\s+[^\s]+$/gm, '');
		cleaned = cleaned.replace(/%\s*\n\s*[a-zA-Z0-9_-]+$/gm, '');
		// Remove trailing user@host lines
		cleaned = cleaned.replace(/\n[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\s+[^\s]+$/gm, '');
		cleaned = cleaned.replace(/\n[a-zA-Z0-9_-]+$/gm, '');
		// Remove trailing % or $ or #
		cleaned = cleaned.replace(/[%$#]\s*$/gm, '');
		// Remove any trailing whitespace/newlines
		cleaned = cleaned.replace(/\s+$/gm, '');

		// Remove excessive blank lines (max 2 consecutive)
		cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

		// Trim but preserve newlines
		cleaned = cleaned.trim();

		// Return cleaned output WITHOUT prepending command
		// The command is shown in the header, not in the output
		return cleaned;
	}

	private handleExecutionComplete(exitCode: number): void {
		this.currentContent.phase = 'completed';
		this.currentContent.status = exitCode === 0 ? 'success' : 'failed';
		this.currentContent.exitCode = exitCode;
		this.currentContent.isStreaming = false;

		// Cancel any pending resize timer (we'll do it here instead)
		if (this.outputResizeTimer) {
			clearTimeout(this.outputResizeTimer);
			this.outputResizeTimer = null;
		}

		// Final clean pass on output
		if (this.outputBuffer) {
			const finalOutput = this.cleanTerminalOutput(this.outputBuffer, this.currentContent.command, true);
			this.currentContent.output = finalOutput;
			if (this.outputPre) {
				this.renderAnsiOutput(this.outputPre, finalOutput);
			}

			// Show body and resize ONCE with final height (wait for prompt to appear)
			if (this.outputContainer && this.outputScrollableWrapper && !this.hasResized) {
				// Clear any pending resize first
				if (this.outputResizeTimer) {
					clearTimeout(this.outputResizeTimer);
				}

				this.outputResizeTimer = setTimeout(() => {
					if (this.outputPre && this.outputContainer && this.outputScrollableWrapper && !this.hasResized) {
						// Calculate exact height needed based on line count
						const lineCount = finalOutput.split('\n').length;
						const calculatedHeight = Math.min(
							lineCount * this.LINE_HEIGHT + 8, // Line height + padding
							this.MAX_COLLAPSED_HEIGHT // Cap at max collapsed height
						);

						// Only proceed if we have output
						if (calculatedHeight > 0 && finalOutput.trim().length > 0) {
							// Show body with final height in one go (no intermediate 36px step)
							if (this.outputBody) {
								this.outputBody.style.cssText = 'display: flex; flex-direction: column;';
							}

							// Set container to final calculated height
							this.outputContainer.style.height = `${calculatedHeight}px`;
							this.outputScrollableWrapper.style.height = `${calculatedHeight}px`;

							// Update scrollable element
							if (this.outputScrollable) {
								this.outputScrollable.scanDomNode();
							}

							this.hasResized = true;
							console.log('[Terminal] Showing body and resizing to:', calculatedHeight, 'px (lines:', lineCount, ')');
						}
					}
					this.outputResizeTimer = null;
				}, 500); // Wait for prompt to appear after output
			}
		}

		// Update header
		if (this.commandSummary) {
			const headerText = this.getPhaseHeaderText();
			const summaryText = this.commandSummary.querySelector('span');
			if (summaryText) {
				summaryText.textContent = `${headerText} ${this.getCommandSummary()}`;
			}
		}

		// Rebuild control row and buttons
		this.rebuildControlRow();

		if (this.actionButtonsContainer && this.topHeader) {
			const newButtons = this.createActionButtons();
			this.actionButtonsContainer.replaceWith(newButtons);
			this.actionButtonsContainer = newButtons;

			// Re-attach hover listeners
			this._register(addDisposableListener(this.topHeader, 'mouseenter', () => {
				if (this.actionButtonsContainer) {
					this.actionButtonsContainer.style.opacity = '1';
				}
			}));

			this._register(addDisposableListener(this.topHeader, 'mouseleave', () => {
				if (this.actionButtonsContainer) {
					this.actionButtonsContainer.style.opacity = '0';
				}
			}));
		}

		console.log('[Terminal] Execution complete, exit code:', exitCode);
	}

	override hasSameContent(other: IVybeChatContentPart): boolean {
		if (!(other instanceof VybeChatTerminalPart)) {
			return false;
		}
		const otherTerminal = other as VybeChatTerminalPart;
		return this.currentContent.command === otherTerminal.currentContent.command &&
			this.currentContent.output === otherTerminal.currentContent.output;
	}

	updateContent(newContent: IVybeChatTerminalContent): void {
		this.currentContent = newContent;

		// Update command if changed
		if (this.commandEditor) {
			const model = this.commandEditor.getModel();
			if (model) {
				model.setValue(newContent.command);
			}
		}

		// Update output if changed (render ANSI with colors)
		if (this.outputPre && !newContent.isStreaming && newContent.output) {
			this.renderAnsiOutput(this.outputPre, newContent.output);
		}

		// Update status
		if (this.statusIndicator) {
			this.updateStatusContent(this.statusIndicator, newContent.status || 'success');
		}
	}

	override dispose(): void {
		// Clean up streaming interval
		if (this.outputStreamIntervalId) {
			clearInterval(this.outputStreamIntervalId);
			this.outputStreamIntervalId = null;
		}

		// Clear completion timer
		if (this.completionTimer) {
			clearTimeout(this.completionTimer);
			this.completionTimer = null;
		}

		// Clear resize timer
		if (this.outputResizeTimer) {
			clearTimeout(this.outputResizeTimer);
			this.outputResizeTimer = null;
		}

		// Dispose command editor
		if (this.commandEditor) {
			try {
				this.commandEditor.setModel(null);
				this.commandEditor.dispose();
			} catch (e) {
				// Ignore
			}
			this.commandEditor = null;
		}

		// Clear references
		this.topHeader = null;
		this.commandSummary = null;
		this.actionButtonsContainer = null;
		this.commandContainer = null;
		this.outputContainer = null;
		this.outputScrollableWrapper = null;
		this.outputPre = null;
		this.outputScrollable = null;
		this.controlRow = null;
		this.permissionDropdownMenu = null;
		this.statusIndicator = null;

		super.dispose();
	}
}

