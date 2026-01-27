/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatToolContent } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService, FileKind } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import * as path from '../../../../../base/common/path.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import './media/vybeChatPhaseIndicator.css'; // Import to use make-shine class

const $ = dom.$;

/**
 * Verb mapping for tool types.
 */
const TOOL_VERBS = {
	read: { inProgress: 'Reading', complete: 'Read', command: 'Read' },
	list: { inProgress: 'Listing', complete: 'Listed', command: 'List' },
	grep: { inProgress: 'Grepping', complete: 'Grepped', command: 'Grep' },
	search: { inProgress: 'Searching', complete: 'Searched', command: 'Search' },
	search_web: { inProgress: 'Searching web', complete: 'Searched web', command: 'Search web' },
	todos: { inProgress: 'Checking todos', complete: 'Checked todos', command: 'Check todos' }
} as const;

// Inject keyframes once per page
let keyframesInjected = false;
function injectShineKeyframes(): void {
	if (keyframesInjected) {
		return;
	}
	keyframesInjected = true;

	const activeWindow = dom.getActiveWindow();
	const style = activeWindow.document.createElement('style');
	style.textContent = `
		@keyframes tool-shine {
			0% { background-position: 200% center; }
			100% { background-position: -200% center; }
		}
		/* Fix icon ::before to match Cursor exactly */
		.vybe-chat-tool-part .context-list-item .show-file-icons .monaco-icon-label.height-override-important::before {
			display: flex !important;
			align-items: center !important;
			justify-content: center !important;
			width: 16px !important;
			height: 14px !important;
			background-size: 16px !important;
			font-size: 18px !important;
			line-height: 18.2px !important;
		}
		/* Match Cursor styles for context-list-item */
		.vybe-chat-tool-part .context-list-item {
			display: flex;
			align-items: center;
			border-radius: 6px;
			padding: 3px 0px 3px 16px;
			cursor: pointer;
			overflow: hidden;
		}
		/* Disabled list item: same padding/height as normal, only cursor + opacity differ */
		.vybe-chat-tool-part .context-list-item--disabled {
			cursor: default;
			padding: 3px 0px 3px 16px;
		}
		/* Match Cursor styles for context-list-item-content */
		.vybe-chat-tool-part .context-list-item-content {
			display: flex;
			align-items: baseline;
			flex-grow: 1;
			gap: 4px;
			overflow: hidden;
		}
		/* Match Cursor styles for context-list-item-title */
		.vybe-chat-tool-part .context-list-item-title {
			font-size: 12px;
			max-width: 85%;
			overflow-x: hidden;
			overflow-y: hidden;
			text-overflow: ellipsis;
			text-wrap-mode: nowrap;
			color: var(--vscode-foreground);
		}
		/* Match Cursor styles for context-list-item-subtitle */
		.vybe-chat-tool-part .context-list-item-subtitle {
			font-size: 10px;
			display: block;
			direction: rtl;
			text-align: right;
			opacity: 0.8;
			overflow-x: hidden;
			overflow-y: hidden;
			text-overflow: ellipsis;
			text-wrap-mode: nowrap;
			visibility: visible;
			color: var(--vscode-foreground);
		}
		/* Match Cursor styles for line range in search results */
		.vybe-chat-tool-part .context-list-item-lines {
			margin-left: 4px;
			color: var(--vscode-foreground);
			opacity: 0.8;
		}
		/* Badge: square with rounded corners, 4px left/right padding for centered number */
		.vybe-chat-tool-part .cursor-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 2px 4px;
			margin-right: 4px;
			border-radius: 4px;
			font-size: 11px;
			font-weight: 500;
			line-height: 1.2;
			background-color: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.vybe-chat-tool-part .cursor-badge-subtle {
			background-color: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			opacity: 0.8;
		}
		.vybe-chat-tool-part .cursor-badge-small {
			font-size: 10px;
			padding: 1px 4px;
		}
		/* Chevron (Cursor-style): hidden when collapsed; only visible on hover over entire tool row, or when expanded */
		.vybe-chat-tool-part .collapsible-clean .chevron-right {
			opacity: 0 !important;
			width: 0 !important;
			overflow: hidden !important;
			margin: 0 !important;
			transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out, width 0.2s ease-in-out;
		}
		.vybe-chat-tool-part .collapsible-clean:not(.is-expanded):hover .chevron-right {
			opacity: 0.36 !important;
			width: 14px !important;
		}
		.vybe-chat-tool-part .collapsible-clean.is-expanded .chevron-right {
			opacity: 0.36 !important;
			width: 14px !important;
		}
	`;
	activeWindow.document.head.appendChild(style);
}

/**
 * Unified tool UI component.
 * Handles all tool types: read, list, grep, search.
 * Perfect Cursor alignment with shine animation.
 */
export class VybeChatToolPart extends VybeChatContentPart {
	private container: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private verbTextElement: HTMLElement | undefined;
	private targetElement: HTMLElement | undefined;
	private lineRangeElement: HTMLElement | undefined;
	private toolType: 'read' | 'list' | 'grep' | 'search' | 'search_web' | 'todos';
	private target: string;
	private filePath?: string; // Full file path for opening files
	private lineRange?: { start: number; end: number };
	private isStreaming = false;
	private toolId: string;
	private editorService?: IEditorService;
	private notificationService?: INotificationService;
	private workspaceContextService?: IWorkspaceContextService;
	private modelService?: IModelService;
	private languageService?: ILanguageService;
	private fileList?: Array<{ name: string; type: 'file' | 'directory'; path: string }>;
	private searchResults?: Array<{ file: string; path: string; lineRange?: { start: number; end: number } }>;
	private grepResults?: Array<{ file: string; path: string; matchCount: number }>;
	private totalMatches?: number;  // Total number of matches across all files
	private truncated?: boolean;    // Whether results were truncated
	private webSearchContent?: string;
	private todoItems?: Array<{ id: string; text: string; status: 'pending' | 'in-progress' | 'completed' }>;
	private isExpanded = false;
	private chevronElement?: HTMLElement;
	private childrenContainer?: HTMLElement;
	private clickHandlerAttached = false;
	private error?: { code: string; message: string };

	constructor(
		content: IVybeChatToolContent,
		editorService?: IEditorService,
		_fileService?: IFileService, // Unused but kept for API consistency
		notificationService?: INotificationService,
		workspaceContextService?: IWorkspaceContextService,
		modelService?: IModelService,
		languageService?: ILanguageService
	) {
		super('tool');
		this.toolId = content.id;
		this.toolType = content.toolType;
		this.target = content.target;
		this.filePath = content.filePath;
		this.lineRange = content.lineRange;
		this.isStreaming = content.isStreaming ?? false;
		this.fileList = content.fileList;
		this.searchResults = content.searchResults;
		this.grepResults = content.grepResults;
		this.webSearchContent = content.webSearchContent;
		this.todoItems = content.todoItems;
		this.totalMatches = content.totalMatches;
		this.truncated = content.truncated;
		this.error = content.error;
		this.editorService = editorService;
		this.notificationService = notificationService;
		this.workspaceContextService = workspaceContextService;
		this.modelService = modelService;
		this.languageService = languageService;
	}

	protected createDomNode(): HTMLElement {
		// Inject keyframes animation once per page
		injectShineKeyframes();

		// Main container - will be wrapped by composer-rendered-message in messagePage
		const outerContainer = $('.vybe-chat-tool-part', {
			'data-message-role': 'ai',
			'data-message-kind': 'tool',
			'data-tool-call-id': this.toolId,
			'data-tool-status': this.isStreaming ? 'loading' : 'completed',
			style: `
				display: block;
				outline: none;
				padding: 0px;
				background-color: var(--composer-pane-background);
				opacity: 1;
			`
		});

		// Transparent wrapper
		const transparentWrapper = $('div', {
			style: 'background-color: transparent;'
		});

		// Tool former message container (Cursor structure)
		const toolFormerMessage = $('.composer-tool-former-message', {
			style: 'padding: 0px;'
		});

		// Collapsible container
		const collapsibleContainer = $('.collapsible-clean', {
			style: `
				display: flex;
				flex-direction: column;
				gap: 2px;
				overflow-anchor: none;
			`
		});

		// Header - not clickable if error exists
		const hasError = !!this.error;
		this.headerElement = $('div', {
			style: `
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 4px;
				cursor: ${hasError ? 'default' : 'pointer'};
				width: 100%;
				max-width: 100%;
				box-sizing: border-box;
				overflow: hidden;
				padding: 2px 0;
			`
		});

		// Extra wrapper div (Cursor structure)
		const headerWrapper = $('div', {
			style: 'display: flex; gap: 4px; overflow: hidden;'
		});

		// Header text container (no gap before chevron - chevron sits flush after text)
		const headerText = $('.collapsible-header-text', {
			style: `
				flex: 0 1 auto;
				min-width: 0px;
				display: flex;
				align-items: center;
				overflow: hidden;
				gap: 4px;
				/* Theme-aware: in light mode Cursor-like tertiary can become too low-contrast */
				color: var(--vscode-foreground);
				transition: opacity 0.1s ease-in;
				font-size: 12px;
			`
		});

		// Extra span wrapper for text (Cursor structure)
		// flex: 1 1 auto allows it to grow when chevron is hidden, shrink when chevron appears
		const textWrapper = $('span', {
			style: 'flex: 1 1 auto; min-width: 0px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;'
		});

		// Inner flex container for verb and target
		// No animation on container (animation on individual elements via make-shine class)
		// min-width: 0 allows truncation to work properly in flex containers
		const innerFlex = $('div', {
			style: 'display: flex; align-items: center; overflow: hidden; min-width: 0px;'
		});

		// Verb text (Reading/Read, Listing/Listed, etc.)
		// When error exists, use command form (Read, List, etc.) instead of past tense
		const verbs = TOOL_VERBS[this.toolType];
		const verbText = hasError ? verbs.command : (this.isStreaming ? verbs.inProgress : verbs.complete);

		// Base styles for verb - doesn't shrink, stays at natural width
		const verbBaseStyle = `
			white-space: nowrap;
			flex: 0 0 auto;
		`;

		// Verb color: var(--vscode-foreground) with 0.7 opacity to differentiate from secondary items
		// When streaming, apply make-shine class for animation (same as planning next steps)
		// When error exists, use static color (no animation)
		const verbColorStyle = hasError ? `
			color: var(--vscode-foreground);
			opacity: 0.7;
		` : `
			color: var(--vscode-foreground);
			opacity: 0.7;
		`;

		this.verbTextElement = $('span', {
			style: verbBaseStyle + verbColorStyle
		});
		this.verbTextElement.textContent = verbText;
		// Apply make-shine class during streaming (same animation as planning next steps)
		if (this.isStreaming && !hasError) {
			this.verbTextElement.classList.add('make-shine');
		}

		// Target color: var(--vscode-foreground) with 0.4 opacity (40%)
		// Target (filename, directory, pattern) OR error message
		// When error exists, show error message as target, not clickable
		// When streaming, text will be transparent (inherited from parent animation)
		// flex: 1 1 auto allows target to grow/shrink and truncate when chevron appears
		const targetBaseStyle = `
			flex: 1 1 auto;
			margin-left: 4px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			min-width: 0px;
			cursor: ${(!hasError && this.toolType === 'read' && this.filePath) ? 'pointer' : 'default'};
		`;

		const targetColorStyle = `
			color: var(--vscode-descriptionForeground);
			opacity: 0.36;
		`;

		this.targetElement = $('span', {
			style: targetBaseStyle + targetColorStyle
		});
		// Apply make-shine class during streaming (same animation as planning next steps)
		if (this.isStreaming && !hasError) {
			this.targetElement.classList.add('make-shine');
		}

		// Ensure opacity is applied correctly (override any parent inheritance)
		// Always set base colors (make-shine uses currentColor, so base color matters)
		this.targetElement.style.setProperty('color', 'var(--vscode-descriptionForeground)', 'important');
		this.targetElement.style.setProperty('opacity', '0.36', 'important');

		// CRITICAL: When error exists, show error message as target
		let displayTarget = this.target;
		if (hasError) {
			// Use error message as target - strip "Error: " prefix if present
			displayTarget = this.error!.message.replace(/^Error:\s*/i, '');
		} else if (!displayTarget || displayTarget === 'file') {
			if (this.filePath) {
				// Extract filename from full path
				const pathParts = this.filePath.replace(/^[/\\]+|[/\\]+$/g, '').split(/[/\\]/);
				displayTarget = pathParts[pathParts.length - 1] || this.filePath;
			} else {
				displayTarget = 'file'; // Final fallback
			}
		}

		// For list operations without error, show only the folder name (last part of path)
		if (this.toolType === 'list' && !hasError) {
			const pathParts = displayTarget.replace(/^[/\\]+|[/\\]+$/g, '').split(/[/\\]/);
			displayTarget = pathParts[pathParts.length - 1] || displayTarget || '.';
		}

		this.targetElement.textContent = displayTarget;

		// Log if target was empty (for debugging)
		if (!this.target || this.target === 'file') {
			console.warn(`[VybeChatToolPart] ⚠️ Target was empty or generic: "${this.target}", using: "${displayTarget}", filePath: "${this.filePath}"`);
		}

		// Make filename clickable for read operations (similar to VybeChatReadingFilesPart)
		// Skip if error exists
		if (!hasError && this.toolType === 'read' && this.filePath && this.editorService) {
			this.targetElement.style.transition = 'color 0.2s ease';
			// Target color: var(--vscode-foreground) with 0.4 opacity (40%)
			this._register(dom.addDisposableListener(this.targetElement, 'mouseenter', () => {
				this.targetElement!.style.color = '#3ecf8e'; // VYBE green
			}));
			this._register(dom.addDisposableListener(this.targetElement, 'mouseleave', () => {
				this.targetElement!.style.setProperty('color', 'var(--vscode-descriptionForeground)', 'important');
				this.targetElement!.style.setProperty('opacity', '0.36', 'important');
			}));
			this._register(dom.addDisposableListener(this.targetElement, 'click', (e) => {
				e.stopPropagation();
				this.openFile();
			}));
		}

		// Line range (for read operations)
		if (this.lineRange && this.toolType === 'read') {
			this.lineRangeElement = $('span.edit-header-line-range', {
				style: `
					color: var(--vscode-foreground);
					opacity: 0.4;
					margin-left: 4px;
					white-space: nowrap;
				`
			});
			this.lineRangeElement.textContent = `L${this.lineRange.start}-${this.lineRange.end}`;
		}

		// Build header structure (matching Cursor exactly)
		innerFlex.appendChild(this.verbTextElement);
		innerFlex.appendChild(this.targetElement);
		if (this.lineRangeElement) {
			innerFlex.appendChild(this.lineRangeElement);
		}
		textWrapper.appendChild(innerFlex);
		headerText.appendChild(textWrapper);

		// Add chevron for expandable operations (list, search, grep, todos, search_web) - only if no error
		// When error exists, don't show chevron and don't make it expandable
		const expandableTypes: Array<'list' | 'search' | 'grep' | 'todos' | 'search_web'> = ['list', 'search', 'grep', 'todos', 'search_web'];
		if (expandableTypes.includes(this.toolType as any) && !hasError) {
			this.ensureChevronExists(headerText);
			// Always attach click handler for expandable operations (results may be populated later)
			this.ensureClickHandlerAttached();
		}

		headerWrapper.appendChild(headerText);
		this.headerElement.appendChild(headerWrapper);

		// Add extra wrapper div between collapsible-clean and header (Cursor structure)
		const extraWrapper = $('div');
		extraWrapper.appendChild(this.headerElement);
		collapsibleContainer.appendChild(extraWrapper);

		// Add collapsible children container for results - only if no error
		if (!hasError) {
			if (this.toolType === 'list' && this.fileList && this.fileList.length > 0) {
				this.childrenContainer = this.createFileListContainer();
				collapsibleContainer.appendChild(this.childrenContainer);
			} else if (this.toolType === 'search' && this.searchResults && this.searchResults.length > 0) {
				this.childrenContainer = this.createResultsContainer();
				collapsibleContainer.appendChild(this.childrenContainer);
			} else if (this.toolType === 'grep' && this.grepResults && this.grepResults.length > 0) {
				this.childrenContainer = this.createResultsContainer();
				collapsibleContainer.appendChild(this.childrenContainer);
			} else if (this.toolType === 'todos' && this.todoItems && this.todoItems.length > 0) {
				this.childrenContainer = this.createResultsContainer();
				collapsibleContainer.appendChild(this.childrenContainer);
			} else if (this.toolType === 'search_web' && this.webSearchContent) {
				this.childrenContainer = this.createWebSearchContainer();
				collapsibleContainer.appendChild(this.childrenContainer);
			}
		}
		toolFormerMessage.appendChild(collapsibleContainer);
		transparentWrapper.appendChild(toolFormerMessage);
		outerContainer.appendChild(transparentWrapper);

		this.container = outerContainer;
		return outerContainer;
	}

	/**
	 * Validate grepResults array structure
	 */
	private validateGrepResults(results: any): Array<{ file: string; path: string; matchCount: number }> {
		if (!Array.isArray(results)) {
			console.warn(`[VybeChatToolPart] 🔍 ⚠️ grepResults is not an array:`, typeof results);
			return [];
		}

		const validated: Array<{ file: string; path: string; matchCount: number }> = [];
		for (let i = 0; i < results.length; i++) {
			const item = results[i];
			if (item && typeof item === 'object') {
				const file = typeof item.file === 'string' ? item.file : '';
				const path = typeof item.path === 'string' ? item.path : file;
				const matchCount = typeof item.matchCount === 'number' && item.matchCount >= 0 ? item.matchCount : 0;

				if (file || path) {
					validated.push({ file, path, matchCount });
				} else {
					console.warn(`[VybeChatToolPart] 🔍 ⚠️ Invalid grep result item at index ${i}: missing file/path`);
				}
			} else {
				console.warn(`[VybeChatToolPart] 🔍 ⚠️ Invalid grep result item at index ${i}: not an object`);
			}
		}

		if (validated.length !== results.length) {
			console.warn(`[VybeChatToolPart] 🔍 ⚠️ Validated ${validated.length}/${results.length} grep results`);
		}

		return validated;
	}

	updateContent(data: IVybeChatToolContent): void {
		this.isStreaming = data.isStreaming ?? false;

		// Update error if provided
		if (data.error) {
			this.error = data.error;

			// Grep error (Cursor-style): "Grep attempted" + expandable body with error message, chevron on hover only
			if (this.toolType === 'grep') {
				if (this.verbTextElement) {
					this.verbTextElement.textContent = TOOL_VERBS.grep.command;
					this.verbTextElement.setAttribute('style', `white-space: nowrap; flex-shrink: 0; color: var(--vscode-foreground); opacity: 1.0;`);
				}
				if (this.targetElement) {
					this.targetElement.textContent = 'attempted';
					this.targetElement.style.cursor = 'default';
				}
				if (this.chevronElement) {
					this.chevronElement.style.display = '';
				}
				this.ensureClickHandlerAttached();
				const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
				if (collapsibleContainer) {
					if (this.childrenContainer) {
						this.childrenContainer.remove();
						this.childrenContainer = undefined;
					}
					const childrenWrapper = $('div', {
						class: 'collapsible-clean-children',
						style: `padding-left: 0px; overflow-anchor: none; margin-top: 4px; margin-bottom: 4px; display: ${this.isExpanded ? 'block' : 'none'};`
					});
					const messageDiv = $('div', {
						style: 'font-size: 12px; color: var(--vscode-descriptionForeground); white-space: pre-wrap; word-break: break-word;'
					});
					messageDiv.textContent = this.error.message.replace(/^Error:\s*/i, '');
					childrenWrapper.appendChild(messageDiv);
					this.childrenContainer = childrenWrapper;
					collapsibleContainer.appendChild(childrenWrapper);
				}
				if (this.container) {
					this.container.setAttribute('data-tool-status', 'error');
				}
				return;
			}

			// Non-grep error: command form + error as target, hide chevron
			if (this.verbTextElement) {
				const verbs = TOOL_VERBS[this.toolType];
				this.verbTextElement.textContent = verbs.command;
				this.verbTextElement.setAttribute('style', `white-space: nowrap; flex-shrink: 0; color: var(--vscode-foreground); opacity: 0.7;`);
			}
			if (this.targetElement) {
				const errorMessage = this.error.message.replace(/^Error:\s*/i, '');
				this.targetElement.textContent = errorMessage;
				this.targetElement.style.cursor = 'default';
			}
			if (this.headerElement) {
				this.headerElement.style.cursor = 'default';
			}
			if (this.chevronElement) {
				this.chevronElement.style.display = 'none';
			}
			if (this.childrenContainer) {
				this.childrenContainer.remove();
				this.childrenContainer = undefined;
			}
			if (this.container) {
				this.container.setAttribute('data-tool-status', 'error');
			}
			return;
		}

		// Update results if provided (only if no error)
		if (!this.error) {
			// Update file list for list operations
			if (data.fileList && this.toolType === 'list') {
				this.fileList = data.fileList;

				// Ensure chevron exists
				if (!this.chevronElement && this.headerElement) {
					const headerText = this.headerElement.querySelector('.collapsible-header-text') as HTMLElement;
					if (headerText) {
						this.ensureChevronExists(headerText);
					}
				}

				// Ensure click handler is attached
				if (this.fileList.length > 0) {
					this.ensureClickHandlerAttached();
				}

				// Recreate file list container if needed
				if (this.fileList.length > 0) {
					const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
					if (collapsibleContainer) {
						if (this.childrenContainer) {
							this.childrenContainer.remove();
							this.childrenContainer = undefined;
						}
						this.childrenContainer = this.createFileListContainer();
						collapsibleContainer.appendChild(this.childrenContainer);
					}
				}
			}

			// Update search results
			if (data.searchResults && this.toolType === 'search') {
				this.searchResults = data.searchResults;

				if (!this.chevronElement && this.headerElement) {
					const headerText = this.headerElement.querySelector('.collapsible-header-text') as HTMLElement;
					if (headerText) {
						this.ensureChevronExists(headerText);
					}
				}

				if (this.searchResults.length > 0) {
					this.ensureClickHandlerAttached();
					const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
					if (collapsibleContainer) {
						if (this.childrenContainer) {
							this.childrenContainer.remove();
							this.childrenContainer = undefined;
						}
						this.childrenContainer = this.createResultsContainer();
						collapsibleContainer.appendChild(this.childrenContainer);
					}
				}
			}

			// Update grep results
			if (data.grepResults && this.toolType === 'grep') {
				// Validate grepResults structure
				const validatedResults = this.validateGrepResults(data.grepResults);
				this.grepResults = validatedResults;

				// Validate totalMatches
				if (typeof data.totalMatches === 'number' && data.totalMatches >= 0) {
					this.totalMatches = data.totalMatches;
				} else if (validatedResults.length > 0) {
					// Calculate from validated results if not provided
					this.totalMatches = validatedResults.reduce((sum, r) => sum + (r.matchCount || 0), 0);
				} else {
					this.totalMatches = 0;
				}

				// Validate truncated
				this.truncated = typeof data.truncated === 'boolean' ? data.truncated : false;

				console.log(`[VybeChatToolPart] 🔍 ✅ GREP DISPLAY: ${this.grepResults?.length || 0} files ready to display, ${this.totalMatches || 0} total matches, truncated: ${this.truncated || false}`);

				if (this.grepResults && this.grepResults.length > 0) {
					console.log(`[VybeChatToolPart] 🔍 Files:`, this.grepResults.map((r: any) => `${r.file} (${r.matchCount})`).join(', '));
				}

				if (!this.chevronElement && this.headerElement) {
					const headerText = this.headerElement.querySelector('.collapsible-header-text') as HTMLElement;
					if (headerText) {
						this.ensureChevronExists(headerText);
					}
				}

				// Cursor-style: all greps expandable; chevron only on hover
				const hasResults = this.grepResults && this.grepResults.length > 0;
				if (hasResults) {
					this.ensureClickHandlerAttached();
				} else {
					// "Grep attempted" (no results): header + expandable body with "No matches found", chevron on hover
					if (this.verbTextElement) {
						this.verbTextElement.textContent = TOOL_VERBS.grep.command;
						this.verbTextElement.setAttribute('style', `white-space: nowrap; flex-shrink: 0; color: var(--vscode-foreground); opacity: 1.0;`);
					}
					if (this.targetElement) {
						this.targetElement.textContent = 'attempted';
						this.targetElement.style.cursor = 'default';
					}
					this.ensureClickHandlerAttached();
				}
				if (this.chevronElement && !this.isExpanded) {
					this.chevronElement.style.display = '';
				}

				// Always create container (with results or "No matches found") so block is expandable
				const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
				if (collapsibleContainer) {
					if (this.childrenContainer) {
						this.childrenContainer.remove();
						this.childrenContainer = undefined;
					}
					this.childrenContainer = this.createResultsContainer();
					collapsibleContainer.appendChild(this.childrenContainer);
				}
			} else if (this.toolType === 'grep') {
				console.log(`[VybeChatToolPart] 🔍 ⚠️ No grepResults in data! data keys:`, Object.keys(data || {}), `data.grepResults=`, data.grepResults);
			}

			// Update web search content
			if (data.webSearchContent && this.toolType === 'search_web') {
				this.webSearchContent = data.webSearchContent;

				if (!this.chevronElement && this.headerElement) {
					const headerText = this.headerElement.querySelector('.collapsible-header-text') as HTMLElement;
					if (headerText) {
						this.ensureChevronExists(headerText);
					}
				}

				if (this.webSearchContent) {
					this.ensureClickHandlerAttached();
					const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
					if (collapsibleContainer) {
						if (this.childrenContainer) {
							this.childrenContainer.remove();
							this.childrenContainer = undefined;
						}
						this.childrenContainer = this.createWebSearchContainer();
						collapsibleContainer.appendChild(this.childrenContainer);
					}
				}
			}

			// Update todo items
			if (data.todoItems && this.toolType === 'todos') {
				this.todoItems = data.todoItems;

				if (!this.chevronElement && this.headerElement) {
					const headerText = this.headerElement.querySelector('.collapsible-header-text') as HTMLElement;
					if (headerText) {
						this.ensureChevronExists(headerText);
					}
				}

				if (this.todoItems.length > 0) {
					this.ensureClickHandlerAttached();
					const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
					if (collapsibleContainer) {
						if (this.childrenContainer) {
							this.childrenContainer.remove();
							this.childrenContainer = undefined;
						}
						this.childrenContainer = this.createResultsContainer();
						collapsibleContainer.appendChild(this.childrenContainer);
					}
				}
			}
		}

		// Update tool status attribute
		if (this.container) {
			this.container.setAttribute('data-tool-status', this.isStreaming ? 'loading' : 'completed');
		}

		// Update verb text and shine animation (only if no error)
		// Animation now flows across verb + target (applied to container)
		if (this.verbTextElement && !this.error) {
			const verbs = TOOL_VERBS[this.toolType];
			const grepZeroResults = this.toolType === 'grep' && this.grepResults && this.grepResults.length === 0;
			const verbText = grepZeroResults && !this.isStreaming
				? verbs.command
				: (this.isStreaming ? verbs.inProgress : verbs.complete);
			this.verbTextElement.textContent = verbText;
			if (grepZeroResults && !this.isStreaming && this.targetElement) {
				this.targetElement.textContent = 'attempted';
				this.targetElement.style.cursor = 'default';
			}

			// Update make-shine class on verb and target elements (same animation as planning next steps)
			const verbBaseStyle = `white-space: nowrap; flex: 0 0 auto;`;
			if (this.isStreaming) {
				// Streaming - add make-shine class for animation
				this.verbTextElement.classList.add('make-shine');
				// Ensure base colors are correct (verb: 0.7)
				this.verbTextElement.setAttribute('style', verbBaseStyle + `
					color: var(--vscode-foreground);
					opacity: 0.7;
				`);
			} else {
				// Complete - remove make-shine class
				this.verbTextElement.classList.remove('make-shine');
				// Update text colors to static (verb 0.7)
				this.verbTextElement.setAttribute('style', verbBaseStyle + `
					color: var(--vscode-foreground);
					opacity: 0.7;
				`);
			}

			// Update target text color
			if (this.targetElement) {
				const targetBaseStyle = `
					flex: 1 1 auto;
					margin-left: 4px;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					min-width: 0px;
					cursor: ${(this.toolType === 'read' && this.filePath) ? 'pointer' : 'default'};
				`;
				if (this.isStreaming) {
					// Streaming - add make-shine class for animation
					this.targetElement.classList.add('make-shine');
					// Ensure base colors are correct (target: 0.36)
					this.targetElement.setAttribute('style', targetBaseStyle + `
						color: var(--vscode-descriptionForeground);
						opacity: 0.36;
					`);
					this.targetElement.style.setProperty('color', 'var(--vscode-descriptionForeground)', 'important');
					this.targetElement.style.setProperty('opacity', '0.36', 'important');
				} else {
					// Complete - remove make-shine class
					this.targetElement.classList.remove('make-shine');
					// Update text colors to static (target: 0.36)
					this.targetElement.setAttribute('style', targetBaseStyle + `
						color: var(--vscode-descriptionForeground);
						opacity: 0.36;
					`);
					// Ensure opacity is applied with important flag
					this.targetElement.style.setProperty('opacity', '0.36', 'important');
					this.targetElement.style.setProperty('color', 'var(--vscode-descriptionForeground)', 'important');
				}
			}

		}

		// Update line range if provided
		if (data.lineRange && this.toolType === 'read') {
			this.lineRange = data.lineRange;
			if (!this.lineRangeElement && this.targetElement && this.targetElement.parentElement) {
				// Create line range element if it doesn't exist
				this.lineRangeElement = $('span.edit-header-line-range', {
					style: `
						color: var(--vscode-foreground);
						opacity: 0.4;
						margin-left: 4px;
						white-space: nowrap;
					`
				});
				// Insert after target element
				this.targetElement.parentElement.insertBefore(this.lineRangeElement, this.targetElement.nextSibling);
			}
			if (this.lineRangeElement) {
				this.lineRangeElement.textContent = `L${data.lineRange.start}-${data.lineRange.end}`;
			}
		}
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'tool') {
			return false;
		}
		const otherContent = other as VybeChatToolPart;
		// Same content if same tool ID
		return this.toolId === otherContent.toolId;
	}

	/**
	 * Ensure chevron element exists and is properly set up.
	 */
	private ensureChevronExists(headerText: HTMLElement): void {
		if (this.chevronElement) {
			return; // Already exists
		}

		// Opacity is controlled by CSS: hidden when collapsed, visible on .collapsible-clean hover or when .is-expanded
		// Chevron uses same color as secondary items (descriptionForeground, opacity controlled by CSS)
		this.chevronElement = $('div', {
			class: 'codicon codicon-chevron-right chevron-right',
			style: `
				color: var(--vscode-descriptionForeground);
				line-height: 14px;
				height: 14px;
				display: flex;
				justify-content: center;
				align-items: center;
				transform-origin: center center;
				transition: transform 0.15s ease-in-out, opacity 0.2s ease-in-out, width 0.2s ease-in-out, color 0.1s ease-in;
				flex-shrink: 0;
				cursor: pointer;
				font-size: 14px;
			`
		});

		headerText.appendChild(this.chevronElement);
	}

	/**
	 * Ensure click handler is attached to header for expand/collapse.
	 */
	private ensureClickHandlerAttached(): void {
		if (!this.headerElement) {
			return;
		}

		// Check if click handler is already attached
		if (this.clickHandlerAttached) {
			return;
		}

		this._register(dom.addDisposableListener(this.headerElement, 'click', () => {
			this.toggleExpand();
		}));

		// Mark as attached
		this.clickHandlerAttached = true;
	}

	/**
	 * Toggle expand/collapse state for expandable operations.
	 */
	private toggleExpand(): void {
		const expandableTypes: Array<'list' | 'search' | 'grep' | 'todos' | 'search_web'> = ['list', 'search', 'grep', 'todos', 'search_web'];
		if (!expandableTypes.includes(this.toolType as any)) {
			console.log(`[VybeChatToolPart] toggleExpand: toolType ${this.toolType} not expandable`);
			return;
		}

		// Check if there's content to expand (grep: results, zero results, or error message)
		let hasContent = false;
		if (this.toolType === 'list' && this.fileList && this.fileList.length > 0) {
			hasContent = true;
		} else if (this.toolType === 'search' && this.searchResults && this.searchResults.length > 0) {
			hasContent = true;
		} else if (this.toolType === 'grep' && (this.error || (this.grepResults && Array.isArray(this.grepResults)))) {
			hasContent = true;
		} else if (this.toolType === 'todos' && this.todoItems && this.todoItems.length > 0) {
			hasContent = true;
		} else if (this.toolType === 'search_web' && this.webSearchContent) {
			hasContent = true;
		}

		console.log(`[VybeChatToolPart] toggleExpand: toolType=${this.toolType}, hasContent=${hasContent}, isExpanded=${this.isExpanded}, hasChildrenContainer=${!!this.childrenContainer}`);

		if (!hasContent) {
			console.log(`[VybeChatToolPart] toggleExpand: No content to expand for ${this.toolType}`);
			return;
		}

		this.isExpanded = !this.isExpanded;

		// Toggle is-expanded on container (chevron visibility is driven by CSS)
		const collapsibleContainerForClass = this.container?.querySelector('.collapsible-clean') as HTMLElement | null;
		if (collapsibleContainerForClass) {
			collapsibleContainerForClass.classList.toggle('is-expanded', this.isExpanded);
		}

		// Update chevron rotation only (opacity is CSS: hover when collapsed, always on when expanded)
		if (this.chevronElement) {
			this.chevronElement.style.transform = this.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
		}

		// Create children container if it doesn't exist
		if (!this.childrenContainer && this.isExpanded) {
			const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
			if (collapsibleContainer) {
				if (this.toolType === 'list') {
					this.childrenContainer = this.createFileListContainer();
				} else if (this.toolType === 'search_web') {
					this.childrenContainer = this.createWebSearchContainer();
				} else {
					this.childrenContainer = this.createResultsContainer();
				}
				collapsibleContainer.appendChild(this.childrenContainer);
			}
		}

		// Show/hide children container
		// If container doesn't exist in our reference, try to find it in the DOM
		if (!this.childrenContainer) {
			const collapsibleContainer = this.container?.querySelector('.collapsible-clean');
			if (collapsibleContainer) {
				this.childrenContainer = collapsibleContainer.querySelector('.collapsible-clean-children') as HTMLElement;
			}
		}

		if (this.childrenContainer) {
			this.childrenContainer.style.display = this.isExpanded ? 'block' : 'none';

			// Recalculate height when expanded to ensure proper sizing
			if (this.isExpanded) {
				setTimeout(() => {
					const heightContainer = this.childrenContainer?.querySelector('div') as HTMLElement;
					const contextList = this.childrenContainer?.querySelector('.context-list--new-conversation') as HTMLElement;
					if (heightContainer && contextList) {
						const MAX_LIST_HEIGHT = 126; // Max height for file list - ensures 5 items fit comfortably
						const contentHeight = contextList.offsetHeight;
						const actualHeight = Math.min(contentHeight, MAX_LIST_HEIGHT);

						if (contentHeight > 0) {
							if (contentHeight <= MAX_LIST_HEIGHT) {
								heightContainer.style.height = `${actualHeight}px`;
								heightContainer.style.maxHeight = `${actualHeight}px`;
								const overflowContainer = heightContainer.querySelector('div') as HTMLElement;
								const contentWrapper = this.childrenContainer?.querySelector('div[style*="overflow: hidden"]') as HTMLElement;
								if (overflowContainer) {
									overflowContainer.style.height = `${actualHeight}px`;
									overflowContainer.style.maxHeight = `${actualHeight}px`;
								}
								if (contentWrapper) {
									contentWrapper.style.height = `${actualHeight}px`;
									contentWrapper.style.maxHeight = `${actualHeight}px`;
								}
							} else {
								heightContainer.style.height = `${MAX_LIST_HEIGHT}px`;
								heightContainer.style.maxHeight = `${MAX_LIST_HEIGHT}px`;
								const overflowContainer = heightContainer.querySelector('div') as HTMLElement;
								const contentWrapper = this.childrenContainer?.querySelector('div[style*="overflow: hidden"]') as HTMLElement;
								if (overflowContainer) {
									overflowContainer.style.height = `${MAX_LIST_HEIGHT}px`;
									overflowContainer.style.maxHeight = `${MAX_LIST_HEIGHT}px`;
								}
								if (contentWrapper) {
									contentWrapper.style.height = `${MAX_LIST_HEIGHT}px`;
									contentWrapper.style.maxHeight = `${MAX_LIST_HEIGHT}px`;
								}
							}
						}
					}
				}, 10);
			}
		}
	}

	/**
	 * Create file list container with scrollable file items.
	 */
	private createFileListContainer(): HTMLElement {
		// Max height for file list - set to 126px to ensure 5 items fit comfortably
		const MAX_LIST_HEIGHT = 126;
		const container = $('div', {
			class: 'collapsible-clean-children',
			style: `
				padding-left: 0px;
				overflow-anchor: none;
				margin-top: 4px;
				margin-bottom: 4px;
				display: ${this.isExpanded ? 'block' : 'none'};
			`
		});

		// Height container - start with max height, will be adjusted dynamically if content is smaller
		const heightContainer = $('div', {
			style: `height: ${MAX_LIST_HEIGHT}px;`
		});

		// Overflow container - start with max height, will be adjusted dynamically if content is smaller
		const overflowContainer = $('div', {
			style: `height: ${MAX_LIST_HEIGHT}px; overflow: hidden;`
		});

		// Scrollable container
		const scrollableContainer = $('div', {
			class: 'scrollable-div-container',
			style: 'height: 100%;'
		});

		// Monaco scrollable element - use VS Code native scrollbar (remove 'mac' class)
		const monacoScrollable = $('div', {
			class: 'monaco-scrollable-element',
			role: 'presentation',
			style: 'position: relative; overflow-y: hidden; width: 100%; height: unset;'
		});

		// Scrollable content wrapper - enable scrolling when content exceeds height
		const contentWrapper = $('div', {
			style: `width: 100%; overflow-y: auto; overflow-x: hidden; height: ${MAX_LIST_HEIGHT}px;`
		});

		// Inline block container
		const inlineContainer = $('div', {
			style: 'display: inline-block; width: 100%; min-height: 100%;'
		});

		// Extra wrapper div (Cursor structure)
		const extraWrapper = $('div');

		// Context list container
		const contextList = $('div', {
			class: 'context-list--new-conversation',
			style: 'flex-shrink: 0; border-radius: 0px;'
		});

		// Add file items
		if (this.fileList) {
			const workspaceFolder = this.workspaceContextService?.getWorkspace().folders[0];

			// Construct subtitle path: workspace folder name + target path
			// If target is ".", show just workspace folder name
			// Otherwise, show workspace folder name + "/" + target path
			let subtitlePath = '';
			if (workspaceFolder) {
				const workspaceName = workspaceFolder.name;
				const targetPath = this.target || '';
				if (targetPath === '.' || targetPath === '') {
					subtitlePath = workspaceName;
				} else {
					// Remove leading/trailing slashes and combine
					const cleanTarget = targetPath.replace(/^[/\\]+|[/\\]+$/g, '');
					subtitlePath = `${workspaceName}/${cleanTarget}`;
				}
			} else {
				// Fallback: use target path directly if no workspace folder
				const targetPath = this.target || '';
				subtitlePath = targetPath === '.' ? '' : targetPath.replace(/^[/\\]+|[/\\]+$/g, '');
			}

			for (const file of this.fileList) {
				const fileItem = this.createFileListItem(file, subtitlePath, workspaceFolder);
				contextList.appendChild(fileItem);
			}
		}

		// Build hierarchy (matching Cursor structure)
		extraWrapper.appendChild(contextList);
		inlineContainer.appendChild(extraWrapper);
		contentWrapper.appendChild(inlineContainer);
		monacoScrollable.appendChild(contentWrapper);
		scrollableContainer.appendChild(monacoScrollable);
		overflowContainer.appendChild(scrollableContainer);
		heightContainer.appendChild(overflowContainer);
		container.appendChild(heightContainer);

		// Calculate actual content height and adjust container dynamically
		// This allows the container to grow to fit content up to max height, then scroll
		// Store references for later height recalculation
		const updateHeight = () => {
			// Only calculate if container is visible
			if (container.style.display !== 'none' && contextList.offsetHeight > 0) {
				const contentHeight = contextList.offsetHeight;
				const actualHeight = Math.min(contentHeight, MAX_LIST_HEIGHT);

				if (contentHeight <= MAX_LIST_HEIGHT) {
					// Content fits, use actual height (grows to fit)
					heightContainer.style.height = `${actualHeight}px`;
					overflowContainer.style.height = `${actualHeight}px`;
					contentWrapper.style.height = `${actualHeight}px`;
				} else {
					// Content exceeds max, use fixed max height for scrolling
					heightContainer.style.height = `${MAX_LIST_HEIGHT}px`;
					overflowContainer.style.height = `${MAX_LIST_HEIGHT}px`;
					contentWrapper.style.height = `${MAX_LIST_HEIGHT}px`;
				}
			}
		};

		// Calculate height after DOM is ready and visible
		// Use multiple attempts to ensure it works even if initially hidden
		const attemptHeightUpdate = () => {
			if (container.style.display !== 'none') {
				updateHeight();
			} else {
				// If still hidden, try again after a delay
				setTimeout(attemptHeightUpdate, 50);
			}
		};

		// Initial attempt
		const targetWindow = dom.getWindow(container);
		setTimeout(() => {
			targetWindow.requestAnimationFrame(attemptHeightUpdate);
		}, 0);

		return container;
	}

	/**
	 * Create a single file list item with icon, title, and subtitle.
	 */
	private createFileListItem(
		file: { name: string; type: 'file' | 'directory'; path: string },
		basePath: string,
		workspaceFolder?: { uri: URI; name: string; index: number; toResource: (relativePath: string) => URI }
	): HTMLElement {
		// Match Cursor structure - minimal inline styles, rest via CSS
		const item = $('div', {
			class: 'context-list-item ',
			role: 'button',
			tabindex: '0'
		});

		// Add hover background effect
		this._register(dom.addDisposableListener(item, 'mouseenter', () => {
			item.style.backgroundColor = 'var(--vscode-titleBar-activeBackground)';
		}));
		this._register(dom.addDisposableListener(item, 'mouseleave', () => {
			item.style.backgroundColor = '';
		}));

		// Icon container - match Cursor: only height: 14px
		const iconContainer = $('div', {
			class: 'show-file-icons',
			style: 'height: 14px;'
		});

		// Icon wrapper - match Cursor: align-items: center (not flex-end)
		const iconWrapper = $('div', {
			style: 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;'
		});

		const iconDiv = $('div');
		// Match Cursor: only height: 100% (no other inline styles)
		iconDiv.style.height = '100%';

		if (file.type === 'file' && this.modelService && this.languageService) {
			// Get file URI
			let fileUri: URI;
			if (workspaceFolder) {
				fileUri = URI.joinPath(workspaceFolder.uri, file.path);
			} else {
				fileUri = URI.file(file.path);
			}

			// Get icon classes
			const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);
			iconDiv.className = `monaco-icon-label file-icon ${iconClasses.join(' ')} height-override-important !pr-0`;
		} else {
			// Directory icon
			iconDiv.className = 'monaco-icon-label file-icon folder-icon height-override-important !pr-0';
		}

		iconWrapper.appendChild(iconDiv);
		iconContainer.appendChild(iconWrapper);
		item.appendChild(iconContainer);

		// Content container - match Cursor: no inline styles
		const contentContainer = $('div', {
			class: 'context-list-item-content'
		});

		// Title (filename only - matching Cursor)
		// Extract just the filename from file.name (in case it contains path)
		let fileName = file.name.includes('/') || file.name.includes('\\')
			? file.name.split(/[/\\]/).pop() || file.name
			: file.name;

		// Remove leading dot from filename (e.g., ".config" -> "config", ".devcontainer" -> "devcontainer")
		// But only if the entire filename starts with a dot and has more characters
		if (fileName.startsWith('.') && fileName.length > 1) {
			fileName = fileName.substring(1);
		}

		const title = $('span', {
			class: 'context-list-item-title',
			style: 'flex-shrink: 1;'
		});
		const titleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		titleLabel.textContent = fileName;
		title.appendChild(titleLabel);
		contentContainer.appendChild(title);

		// Subtitle (full path - matching Cursor)
		// Use the basePath parameter which is the path that was listed (e.g., "VYBE/src" or "VYBE/CURSOR_REFERENCE")
		// Match Cursor: no inline styles (all via CSS)
		const subtitle = $('span', {
			class: 'context-list-item-subtitle'
		});
		const subtitleInner = $('span', {
			style: 'direction: ltr; unicode-bidi: embed;'
		});
		const subtitleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		// Use basePath parameter (the full path that was listed, e.g., "VYBE/src" or "VYBE/CURSOR_REFERENCE")
		// Set text if basePath is not empty
		if (basePath && basePath.trim() !== '') {
			subtitleLabel.textContent = basePath;
		}
		subtitleInner.appendChild(subtitleLabel);
		subtitle.appendChild(subtitleInner);
		contentContainer.appendChild(subtitle);

		item.appendChild(contentContainer);

		// Make clickable to open file
		if (file.type === 'file' && this.editorService) {
			const editorService = this.editorService; // Capture for async callback
			this._register(dom.addDisposableListener(item, 'click', async () => {
				let fileUri: URI;
				if (workspaceFolder) {
					fileUri = URI.joinPath(workspaceFolder.uri, file.path);
				} else {
					fileUri = URI.file(file.path);
				}
				try {
					await editorService.openEditor({ resource: fileUri });
				} catch (error) {
					console.error(`[VybeChatToolPart] Failed to open file: ${file.path}`, error);
				}
			}));
		}

		return item;
	}

	/**
	 * Create results container for search, grep, and todos operations.
	 */
	private createResultsContainer(): HTMLElement {
		const MAX_LIST_HEIGHT = 126;
		const container = $('div', {
			class: 'collapsible-clean-children',
			style: `
				padding-left: 0px;
				overflow-anchor: none;
				margin-top: 4px;
				margin-bottom: 4px;
				display: ${this.isExpanded ? 'block' : 'none'};
			`
		});

		const heightContainer = $('div', {
			style: `height: ${MAX_LIST_HEIGHT}px;`
		});

		const overflowContainer = $('div', {
			style: `height: ${MAX_LIST_HEIGHT}px; overflow: hidden;`
		});

		const scrollableContainer = $('div', {
			class: 'scrollable-div-container',
			style: 'height: 100%;'
		});

		const monacoScrollable = $('div', {
			class: 'monaco-scrollable-element',
			role: 'presentation',
			style: 'position: relative; overflow-y: hidden; width: 100%; height: unset;'
		});

		const contentWrapper = $('div', {
			style: `width: 100%; overflow-y: auto; overflow-x: hidden; height: ${MAX_LIST_HEIGHT}px;`
		});

		const inlineContainer = $('div', {
			style: 'display: inline-block; width: 100%; min-height: 100%;'
		});

		const extraWrapper = $('div');

		const contextList = $('div', {
			class: 'context-list--new-conversation',
			style: 'flex-shrink: 0; border-radius: 0px;'
		});

		// Add items based on tool type
		if (this.toolType === 'search' && this.searchResults) {
			for (const result of this.searchResults) {
				const item = this.createSearchResultItem(result);
				contextList.appendChild(item);
			}
		} else if (this.toolType === 'grep' && this.grepResults) {
			const MAX_DISPLAY_RESULTS = 15;
			const totalFiles = this.grepResults.length;
			const resultsToShow = this.grepResults.slice(0, MAX_DISPLAY_RESULTS);
			const hiddenFilesCount = totalFiles > MAX_DISPLAY_RESULTS ? totalFiles - MAX_DISPLAY_RESULTS : 0;

			console.log(`[VybeChatToolPart] 🔍 createResultsContainer: totalFiles=${totalFiles}, showing=${resultsToShow.length}, hiddenFilesCount=${hiddenFilesCount}, truncated=${this.truncated}`);

			if (totalFiles === 0) {
				// Show "No matches found" message (same padding/height as normal context-list-item)
				const noMatchesItem = $('div', {
					class: 'context-list-item context-list-item--disabled',
					role: 'listitem',
					tabindex: '-1',
					style: 'cursor: default; display: flex; align-items: center; opacity: 0.6; font-style: italic;'
				});
				const noMatchesText = $('span', {
					class: 'context-list-item-title',
					style: 'color: var(--vscode-foreground);'
				});
				noMatchesText.textContent = 'No matches found';
				noMatchesItem.appendChild(noMatchesText);
				contextList.appendChild(noMatchesItem);
			} else {
				for (const result of resultsToShow) {
					const item = this.createGrepResultItem(result);
					contextList.appendChild(item);
				}
			}

			// Show "x more results hidden" if:
			// 1. There are more than 15 files, OR
			// 2. Results were truncated (backend hit limit)
			console.log(`[VybeChatToolPart] 🔍 Checking hidden indicator: hiddenFilesCount=${hiddenFilesCount}, truncated=${this.truncated}, shouldShow=${hiddenFilesCount > 0 || this.truncated}`);
			if (hiddenFilesCount > 0 || this.truncated) {
				let hiddenText = '';
				if (hiddenFilesCount > 0 && this.truncated) {
					// Both conditions: show file count and mention truncation
					hiddenText = `${hiddenFilesCount} more file${hiddenFilesCount === 1 ? '' : 's'} hidden (results truncated)`;
				} else if (hiddenFilesCount > 0) {
					// Only file limit hit - show count of hidden files
					hiddenText = `${hiddenFilesCount} more result${hiddenFilesCount === 1 ? '' : 's'} hidden`;
				} else if (this.truncated) {
					// Only truncation (all files shown but matches were truncated)
					const totalMatches = this.totalMatches || 0;
					const displayedMatches = resultsToShow.reduce((sum, r) => sum + r.matchCount, 0);
					const hiddenMatches = totalMatches - displayedMatches;
					hiddenText = `${hiddenMatches} more result${hiddenMatches === 1 ? '' : 's'} hidden`;
				}

				if (hiddenText) {
					console.log(`[VybeChatToolPart] 🔍 ✅ Creating hidden indicator: "${hiddenText}"`);
					// Disabled item: same padding/height as normal context-list-item
					const hiddenItem = $('div', {
						class: 'context-list-item context-list-item--disabled',
						role: 'listitem',
						tabindex: '-1',
						style: 'cursor: default; display: flex; align-items: center; opacity: 0.6; font-style: italic;'
					});
					const hiddenTextSpan = $('span', {
						class: 'context-list-item-title',
						style: 'color: var(--vscode-foreground);'
					});
					hiddenTextSpan.textContent = hiddenText;
					hiddenItem.appendChild(hiddenTextSpan);
					contextList.appendChild(hiddenItem);
					console.log(`[VybeChatToolPart] 🔍 ✅ Hidden indicator added to DOM, text: "${hiddenText}"`);
				} else {
					console.warn(`[VybeChatToolPart] 🔍 ⚠️ hiddenText is empty!`);
				}
			} else {
				console.log(`[VybeChatToolPart] 🔍 No hidden indicator needed (hiddenFilesCount=${hiddenFilesCount}, truncated=${this.truncated})`);
			}
		} else if (this.toolType === 'todos' && this.todoItems) {
			for (const todo of this.todoItems) {
				const item = this.createTodoItem(todo);
				contextList.appendChild(item);
			}
		}

		extraWrapper.appendChild(contextList);
		inlineContainer.appendChild(extraWrapper);
		contentWrapper.appendChild(inlineContainer);
		monacoScrollable.appendChild(contentWrapper);
		scrollableContainer.appendChild(monacoScrollable);
		overflowContainer.appendChild(scrollableContainer);
		heightContainer.appendChild(overflowContainer);
		container.appendChild(heightContainer);

		// Calculate actual content height and adjust container dynamically
		// This allows the container to grow to fit content up to max height, then scroll
		// Store references for later height recalculation
		const updateHeight = () => {
			// Only calculate if container is visible
			if (container.style.display !== 'none' && contextList.offsetHeight > 0) {
				const contentHeight = contextList.offsetHeight;
				const actualHeight = Math.min(contentHeight, MAX_LIST_HEIGHT);

				if (contentHeight <= MAX_LIST_HEIGHT) {
					// Content fits, use actual height (grows to fit)
					heightContainer.style.height = `${actualHeight}px`;
					overflowContainer.style.height = `${actualHeight}px`;
					contentWrapper.style.height = `${actualHeight}px`;
				} else {
					// Content exceeds max, use fixed max height for scrolling
					heightContainer.style.height = `${MAX_LIST_HEIGHT}px`;
					overflowContainer.style.height = `${MAX_LIST_HEIGHT}px`;
					contentWrapper.style.height = `${MAX_LIST_HEIGHT}px`;
				}
			}
		};

		// Calculate height after DOM is ready and visible
		// Use requestAnimationFrame to ensure DOM is fully rendered
		const targetWindow = dom.getWindow(container);
		targetWindow.requestAnimationFrame(() => {
			updateHeight();
			// Also update when container becomes visible
			if (this.isExpanded) {
				setTimeout(updateHeight, 0);
			}
		});

		return container;
	}

	/**
	 * Create web search container with markdown content.
	 */
	private createWebSearchContainer(): HTMLElement {
		const container = $('div', {
			class: 'collapsible-clean-children',
			style: `
				padding-left: 0px;
				overflow-anchor: none;
				margin-top: 4px;
				margin-bottom: 4px;
				display: ${this.isExpanded ? 'block' : 'none'};
			`
		});

		const contentWrapper = $('div', {
			style: 'padding: 8px 16px;'
		});

		// For now, render as plain text. Can be enhanced with markdown renderer later
		if (this.webSearchContent) {
			const textDiv = $('div', {
				style: `
					white-space: pre-wrap;
					word-break: break-word;
					color: var(--vscode-foreground);
					opacity: 0.8;
					font-size: 12px;
					line-height: 1.4;
				`
			});
			textDiv.textContent = this.webSearchContent;
			contentWrapper.appendChild(textDiv);
		}

		container.appendChild(contentWrapper);
		return container;
	}

	/**
	 * Create a search result item with file icon, filename, path, and line range.
	 */
	private createSearchResultItem(result: { file: string; path: string; lineRange?: { start: number; end: number } }): HTMLElement {
		const item = $('div', {
			class: 'context-list-item ',
			role: 'button',
			tabindex: '0'
		});

		this._register(dom.addDisposableListener(item, 'mouseenter', () => {
			item.style.backgroundColor = 'var(--vscode-titleBar-activeBackground)';
		}));
		this._register(dom.addDisposableListener(item, 'mouseleave', () => {
			item.style.backgroundColor = '';
		}));

		// Icon container
		const iconContainer = $('div', {
			class: 'show-file-icons',
			style: 'height: 14px;'
		});

		const iconWrapper = $('div', {
			style: 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;'
		});

		const iconDiv = $('div');
		iconDiv.style.height = '100%';

		if (this.modelService && this.languageService) {
			// Resolve path to URI for icon lookup
			let iconFileUri: URI;
			if (path.isAbsolute(result.path)) {
				iconFileUri = URI.file(result.path);
			} else if (this.workspaceContextService) {
				const wsRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri;
				if (wsRoot) {
					iconFileUri = URI.joinPath(wsRoot, result.path);
				} else {
					iconFileUri = URI.file(result.path);
				}
			} else {
				iconFileUri = URI.file(result.path);
			}
			const iconClasses = getIconClasses(this.modelService, this.languageService, iconFileUri, FileKind.FILE);
			iconDiv.className = `monaco-icon-label file-icon ${iconClasses.join(' ')} height-override-important !pr-0`;
		} else {
			iconDiv.className = 'monaco-icon-label file-icon height-override-important !pr-0';
		}

		iconWrapper.appendChild(iconDiv);
		iconContainer.appendChild(iconWrapper);
		item.appendChild(iconContainer);

		// Content container
		const contentContainer = $('div', {
			class: 'context-list-item-content'
		});

		// Title (filename)
		const title = $('span', {
			class: 'context-list-item-title',
			style: 'flex-shrink: 1;'
		});
		const titleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		titleLabel.textContent = result.file;
		title.appendChild(titleLabel);
		contentContainer.appendChild(title);

		// Subtitle (path + line range)
		const subtitle = $('span', {
			class: 'context-list-item-subtitle'
		});
		const subtitleInner = $('span', {
			style: 'direction: ltr; unicode-bidi: embed;'
		});
		const subtitleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		subtitleLabel.textContent = result.path;
		subtitleInner.appendChild(subtitleLabel);

		// Line range
		if (result.lineRange) {
			const lineRangeSpan = $('span', {
				class: 'context-list-item-lines'
			});
			lineRangeSpan.textContent = `L${result.lineRange.start}-${result.lineRange.end}`;
			subtitleInner.appendChild(lineRangeSpan);
		}

		subtitle.appendChild(subtitleInner);
		contentContainer.appendChild(subtitle);

		item.appendChild(contentContainer);

		// Make clickable to open file
		if (this.editorService) {
			const editorService = this.editorService;
			const workspaceCtx = this.workspaceContextService;
			this._register(dom.addDisposableListener(item, 'click', async () => {
				let fileUri: URI;

				// Check if path is absolute
				if (path.isAbsolute(result.path)) {
					fileUri = URI.file(result.path);
				} else if (workspaceCtx) {
					// Resolve relative path using workspace root
					const workspaceRoot = workspaceCtx.getWorkspace().folders[0]?.uri;
					if (workspaceRoot) {
						fileUri = URI.joinPath(workspaceRoot, result.path);
					} else {
						// Fallback - try as absolute anyway
						fileUri = URI.file(result.path);
					}
				} else {
					// Fallback - try as absolute anyway
					fileUri = URI.file(result.path);
				}

				try {
					// Open at specific line if lineRange is available
					const options: { selection?: { startLineNumber: number; startColumn: number } } = {};
					if (result.lineRange && result.lineRange.start > 0) {
						options.selection = {
							startLineNumber: result.lineRange.start,
							startColumn: 1
						};
					}
					await editorService.openEditor({ resource: fileUri, options });
				} catch (error) {
					console.error(`[VybeChatToolPart] Failed to open file: ${result.path}`, error);
				}
			}));
		}

		return item;
	}

	/**
	 * Create a grep result item with file icon, filename, path, and match count badge.
	 */
	private createGrepResultItem(result: { file: string; path: string; matchCount: number }): HTMLElement {
		const item = $('div', {
			class: 'context-list-item ',
			role: 'button',
			tabindex: '0'
		});

		this._register(dom.addDisposableListener(item, 'mouseenter', () => {
			item.style.backgroundColor = 'var(--vscode-titleBar-activeBackground)';
		}));
		this._register(dom.addDisposableListener(item, 'mouseleave', () => {
			item.style.backgroundColor = '';
		}));

		// Icon container
		const iconContainer = $('div', {
			class: 'show-file-icons',
			style: 'height: 14px;'
		});

		const iconWrapper = $('div', {
			style: 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;'
		});

		const iconDiv = $('div');
		iconDiv.style.height = '100%';

		if (this.modelService && this.languageService) {
			const fileUri = URI.file(result.path);
			const iconClasses = getIconClasses(this.modelService, this.languageService, fileUri, FileKind.FILE);
			iconDiv.className = `monaco-icon-label file-icon ${iconClasses.join(' ')} height-override-important !pr-0`;
		} else {
			iconDiv.className = 'monaco-icon-label file-icon height-override-important !pr-0';
		}

		iconWrapper.appendChild(iconDiv);
		iconContainer.appendChild(iconWrapper);
		item.appendChild(iconContainer);

		// Content container
		const contentContainer = $('div', {
			class: 'context-list-item-content'
		});

		// Title (filename)
		const title = $('span', {
			class: 'context-list-item-title',
			style: 'flex-shrink: 1;'
		});
		const titleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		titleLabel.textContent = result.file;
		title.appendChild(titleLabel);
		contentContainer.appendChild(title);

		// Subtitle (path)
		const subtitle = $('span', {
			class: 'context-list-item-subtitle'
		});
		const subtitleInner = $('span', {
			style: 'direction: ltr; unicode-bidi: embed;'
		});
		const subtitleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		subtitleLabel.textContent = result.path;
		subtitleInner.appendChild(subtitleLabel);
		subtitle.appendChild(subtitleInner);
		contentContainer.appendChild(subtitle);

		// Match count badge
		const badge = $('span', {
			class: 'cursor-badge cursor-badge-subtle cursor-badge-small',
			text: result.matchCount.toString(),
			style: 'flex-shrink: 0; margin-left: auto;'
		});
		badge.textContent = result.matchCount.toString();
		contentContainer.appendChild(badge);

		item.appendChild(contentContainer);

		// Make clickable to open file
		if (this.editorService) {
			const editorService = this.editorService;
			this._register(dom.addDisposableListener(item, 'click', async () => {
				const fileUri = URI.file(result.path);
				try {
					await editorService.openEditor({ resource: fileUri });
				} catch (error) {
					console.error(`[VybeChatToolPart] Failed to open file: ${result.path}`, error);
				}
			}));
		}

		return item;
	}

	/**
	 * Create a todo item with checkbox icon, text, and status.
	 */
	private createTodoItem(todo: { id: string; text: string; status: 'pending' | 'in-progress' | 'completed' }): HTMLElement {
		const item = $('div', {
			class: 'context-list-item ',
			role: 'button',
			tabindex: '0'
		});

		this._register(dom.addDisposableListener(item, 'mouseenter', () => {
			item.style.backgroundColor = 'var(--vscode-titleBar-activeBackground)';
		}));
		this._register(dom.addDisposableListener(item, 'mouseleave', () => {
			item.style.backgroundColor = '';
		}));

		// Icon container (checkbox/status icon)
		const iconContainer = $('div', {
			class: 'show-file-icons',
			style: 'height: 14px;'
		});

		const iconWrapper = $('div', {
			style: 'position: relative; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;'
		});

		const iconDiv = $('div');
		iconDiv.style.height = '100%';

		// Set icon based on status
		if (todo.status === 'completed') {
			iconDiv.className = 'codicon codicon-check height-override-important !pr-0';
		} else if (todo.status === 'in-progress') {
			iconDiv.className = 'codicon codicon-arrow-right height-override-important !pr-0';
		} else {
			iconDiv.className = 'codicon codicon-circle-outline height-override-important !pr-0';
		}

		iconWrapper.appendChild(iconDiv);
		iconContainer.appendChild(iconWrapper);
		item.appendChild(iconContainer);

		// Content container
		const contentContainer = $('div', {
			class: 'context-list-item-content'
		});

		// Title (todo text)
		const title = $('span', {
			class: 'context-list-item-title',
			style: todo.status === 'completed' ? 'flex-shrink: 1; text-decoration: line-through; opacity: 0.6;' : 'flex-shrink: 1;'
		});
		const titleLabel = $('span', {
			class: 'monaco-highlighted-label '
		});
		titleLabel.textContent = todo.text;
		title.appendChild(titleLabel);
		contentContainer.appendChild(title);

		item.appendChild(contentContainer);

		return item;
	}

	/**
	 * Open the file in the editor (for read operations).
	 * Handles both absolute and relative paths by resolving against workspace root.
	 */
	private async openFile(): Promise<void> {
		if (!this.editorService || !this.filePath) {
			return;
		}

		try {
			let fileUri: URI;

			// Check if path is absolute
			if (path.isAbsolute(this.filePath)) {
				fileUri = URI.file(this.filePath);
			} else {
				// Resolve relative path against workspace root
				const workspaceFolder = this.workspaceContextService?.getWorkspace().folders[0];
				if (workspaceFolder) {
					fileUri = URI.joinPath(workspaceFolder.uri, this.filePath);
				} else {
					// Fallback: try as-is (might fail)
					fileUri = URI.file(this.filePath);
				}
			}

			console.log(`[VybeChatToolPart] Opening file: ${fileUri.fsPath}`);

			const editorInput: { resource: URI; options?: { selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } } } = {
				resource: fileUri
			};

			// If line range is provided, open at that range
			if (this.lineRange) {
				const startLine = this.lineRange.start < 1 ? 1 : this.lineRange.start;
				const endLine = this.lineRange.end < startLine ? startLine : this.lineRange.end;
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
			console.error(`[VybeChatToolPart] Failed to open file: ${this.filePath}`, error);
			if (this.notificationService) {
				this.notificationService.error(`Failed to open file: ${this.filePath}`);
			}
		}
	}
}

