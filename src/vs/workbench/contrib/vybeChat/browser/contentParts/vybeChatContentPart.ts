/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';

/**
 * Base interface for all VYBE Chat content parts.
 * Each content part represents a piece of AI response (markdown, code, thinking, etc.)
 * and is responsible for rendering itself and handling updates.
 */
export interface IVybeChatContentPart extends Disposable {
	/**
	 * The DOM element that represents this content part.
	 * This will be inserted into the message container.
	 */
	readonly domNode: HTMLElement;

	/**
	 * The kind of content this part represents.
	 * Used for identification and re-rendering optimization.
	 */
	readonly kind: VybeChatContentPartKind;

	/**
	 * Check if this part has the same content as another part.
	 * Used to optimize re-rendering - if content is the same, no need to update.
	 */
	hasSameContent(other: IVybeChatContentPart): boolean;

	/**
	 * Update this content part with new data.
	 * Called when streaming updates arrive.
	 */
	updateContent?(data: any): void;

	/**
	 * Callback for streaming updates.
	 * Called when content is streaming to trigger parent scroll updates.
	 */
	onStreamingUpdate?: () => void;
}

/**
 * All possible content part kinds in VYBE Chat.
 * Starting with Phase 1 types, will expand in later phases.
 */
export type VybeChatContentPartKind =
	// Phase 1: Foundation
	| 'markdown'        // Main text responses
	| 'thinking'        // Collapsible AI thinking process
	| 'progress'        // Loading/status messages
	| 'error'          // Error messages
	// Phase 2: Code (coming soon)
	| 'codeBlock'      // Code blocks with syntax highlighting
	// Phase 3: File Edits (coming soon)
	| 'textEdit'       // File edit suggestions
	| 'diff'           // Side-by-side diff view
	// Phase 4: Advanced (coming soon)
	| 'terminal'       // Terminal command execution
	| 'reference'      // File references
	| 'command'        // Command buttons
	// Phase 5: File Operations
	| 'readingFiles'   // Files being read by AI
	| 'searched'       // Search results
	| 'listed'         // Listed items/directories
	| 'directory'      // Directory operations
	| 'explored'       // Grouped multiple actions
	// Phase 6: Planning
	| 'planDocument';  // AI-generated plan document

/**
 * Data for markdown content parts.
 */
export interface IVybeChatMarkdownContent {
	kind: 'markdown';
	content: string;  // Markdown text (final or target for streaming)
	isStreaming?: boolean; // Whether content is currently streaming
}

/**
 * Data for thinking content parts.
 */
export interface IVybeChatThinkingContent {
	kind: 'thinking';
	value: string | string[];  // Thinking text (can be array of chunks)
	duration?: number;         // How long AI thought (in ms)
	isStreaming?: boolean;     // Whether the thinking is still in progress
}

/**
 * Data for code block content parts.
 */
export interface IVybeChatCodeBlockContent {
	kind: 'codeBlock';
	code: string;      // The code content (final or target for streaming)
	language: string;  // Programming language (typescript, python, etc.)
	isStreaming?: boolean; // Whether code is currently streaming line-by-line
	filename?: string; // Optional filename hint (from show_code tool)
}

/**
 * Data for text edit content parts (file edits with diff view).
 */
export interface IVybeChatTextEditContent {
	kind: 'textEdit';
	fileName: string;       // Name of the file being edited
	filePath?: string;      // Full path (optional)
	originalContent: string; // Original file content
	modifiedContent: string; // Modified file content (final after streaming)
	streamingContent?: string; // Current content being streamed (partial)
	language: string;       // Programming language
	addedLines: number;     // Number of lines added
	deletedLines: number;   // Number of lines deleted
	isApplied?: boolean;    // Whether the edit has been applied
	isLoading?: boolean;    // Whether the edit is currently streaming
	isStreaming?: boolean;  // Whether currently showing streaming code (not diff yet)
}

/**
 * Data for terminal content parts (command execution).
 */
export interface IVybeChatTerminalContent {
	kind: 'terminal';
	command: string;           // The shell command executed
	output: string;            // Terminal output (final or target for streaming)
	phase: 'pending' | 'running' | 'completed'; // Execution phase (pending = ask permission, running = executing, completed = done)
	status: 'success' | 'failed' | 'cancelled' | null; // Final status (null when pending/running)
	permission?: string;       // Permission level (e.g., "Ask Every Time", "Always Allow")
	isStreaming?: boolean;     // Whether output is currently streaming
	exitCode?: number;         // Command exit code
}

/**
 * Data for progress content parts.
 */
export interface IVybeChatProgressContent {
	kind: 'progress';
	message: string;  // Progress message (e.g., "Reading file...")
}

/**
 * Data for error content parts.
 */
export interface IVybeChatErrorContent {
	kind: 'error';
	message: string;  // Error message
	level: 'info' | 'warning' | 'error';
}

/**
 * File metadata for content parts.
 */
export interface IFileMetadata {
	name: string;
	path?: string;
	uri?: string; // URI string (more reliable than path)
	lineRange?: { start: number; end: number };
	language?: string; // For syntax highlighting
	iconClasses?: string[]; // VS Code icon classes
	exists?: boolean; // Whether file exists (for error handling)
}

/**
 * Data for reading files content parts.
 */
export interface IVybeChatReadingFilesContent {
	kind: 'readingFiles';
	id?: string; // Unique ID for tracking and updates
	files: Array<IFileMetadata>;
	isStreaming?: boolean;
	error?: {
		code: string;
		message: string;
	};
}

/**
 * Search type for different search operations.
 */
export type SearchType = 'codebase' | 'semantic' | 'web' | 'documentation';

/**
 * Web search result (for web searches).
 */
export interface IWebSearchResult {
	title: string;
	url: string;
	snippet: string;
}

/**
 * Data for searched content parts.
 */
export interface IVybeChatSearchedContent {
	kind: 'searched';
	id?: string; // Unique ID for tracking and updates
	searchType?: SearchType; // Type of search (defaults to 'codebase')
	query: string;
	files: Array<IFileMetadata>;
	webResults?: Array<IWebSearchResult>; // For web searches
	isStreaming?: boolean;
	error?: {
		code: string;
		message: string;
	};
}

/**
 * Data for listed content parts.
 */
export interface IVybeChatListedContent {
	kind: 'listed';
	id?: string;
	name: string;
	isStreaming?: boolean;
}

/**
 * Data for directory content parts.
 */
export interface IVybeChatDirectoryContent {
	kind: 'directory';
	id?: string;
	name: string;
	isStreaming?: boolean;
}

/**
 * Data for explored content parts.
 */
export interface IVybeChatExploredContent {
	kind: 'explored';
	id?: string; // Unique ID for tracking and updates
	actions: Array<{
		type: 'read' | 'searched' | 'listed' | 'directory';
		data: IVybeChatReadingFilesContent | IVybeChatSearchedContent | IVybeChatListedContent | IVybeChatDirectoryContent;
	}>;
	isStreaming?: boolean;
}

/**
 * Data for plan document content parts.
 */
export interface IVybeChatPlanDocumentContent {
	kind: 'planDocument';
	id?: string; // Unique ID for tracking and updates
	filename: string; // Plan filename (e.g., "complete-mcp-integration.plan.md")
	title: string; // Plan title
	summary: string; // Plan summary (shown in collapsed mode)
	content: string; // Full plan content (markdown, shown in expanded mode)
	isExpanded?: boolean; // Whether plan is expanded (default: false)
	isStreaming?: boolean; // Whether plan is still being generated
	modelState?: { // Model selection state
		isAutoEnabled: boolean;
		isMaxModeEnabled: boolean;
		selectedModelId: string;
	};
}

/**
 * Union type of all content data.
 * This is what gets passed to content parts for rendering.
 */
export type IVybeChatContentData =
	| IVybeChatMarkdownContent
	| IVybeChatThinkingContent
	| IVybeChatCodeBlockContent
	| IVybeChatTextEditContent
	| IVybeChatTerminalContent
	| IVybeChatProgressContent
	| IVybeChatErrorContent
	| IVybeChatReadingFilesContent
	| IVybeChatSearchedContent
	| IVybeChatExploredContent
	| IVybeChatListedContent
	| IVybeChatDirectoryContent
	| IVybeChatPlanDocumentContent;

/**
 * Base class for content parts.
 * Provides common functionality that all parts need.
 */
export abstract class VybeChatContentPart extends Disposable implements IVybeChatContentPart {
	private _domNode: HTMLElement | undefined;

	constructor(
		public readonly kind: VybeChatContentPartKind
	) {
		super();
	}

	/**
	 * Get the DOM node for this content part.
	 * Lazy initialization - creates on first access.
	 */
	get domNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = this.createDomNode();
		}
		return this._domNode;
	}

	/**
	 * Create the DOM node for this content part.
	 * Must be implemented by subclasses.
	 */
	protected abstract createDomNode(): HTMLElement;

	/**
	 * Default implementation - compare by kind and content.
	 * Subclasses can override for more specific comparisons.
	 */
	hasSameContent(other: IVybeChatContentPart): boolean {
		return this.kind === other.kind;
	}

	override dispose(): void {
		super.dispose();
		this._domNode?.remove();
		this._domNode = undefined;
	}
}


