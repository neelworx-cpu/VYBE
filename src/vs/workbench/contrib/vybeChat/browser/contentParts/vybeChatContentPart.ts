/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ModelDropdownState } from '../components/composer/modelDropdown.js';

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
	updateContent?(data: unknown): void;

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
	| 'mermaidDiagram' // Mermaid diagrams with diagram/code view toggle
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
	| 'grepped'        // Grep pattern searches
	| 'listed'         // Listed items/directories
	| 'directory'      // Directory operations
	| 'explored'       // Grouped multiple actions
	// Phase 6: Planning
	| 'planDocument'  // AI-generated plan document
	| 'todo'          // Todo list summary (collapsed/expanded)
	| 'todoItem'      // Individual todo item indicator ("Started to-do")
	| 'phaseIndicator' // "Planning next steps" indicator (appears when agent is planning)
	// Phase 7: Unified Tool UI
	| 'tool'         // Unified tool UI component (read, list, grep, search)
	// Phase 8: Questionnaire
	| 'questionnaireAnswers'; // Questionnaire answers display (shows question-answer pairs)

/**
 * Data for markdown content parts.
 */
export interface IVybeChatMarkdownContent {
	kind: 'markdown';
	id?: string;  // Unique block ID - allows multiple markdown parts in sequence
	content: string;  // Markdown text (final or target for streaming)
	isStreaming?: boolean; // Whether content is currently streaming
}

/**
 * Data for thinking content parts.
 */
export interface IVybeChatThinkingContent {
	kind: 'thinking';
	id?: string;              // Unique block ID - allows multiple thinking parts in sequence (e.g. GPT-5 reasoning summary segments)
	value: string | string[];  // Thinking text (can be array of chunks)
	duration?: number;         // How long AI thought (in ms)
	isStreaming?: boolean;     // Whether the thinking is still in progress
	title?: string;            // Optional title derived from reasoning summary (OpenAI GPT-5.x)
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
	filePath?: string; // Optional full file path for reference codeblocks (enables header with click-to-open)
	lineRange?: { start: number; end: number }; // Optional line range for reference codeblocks
}

/**
 * Data for mermaid diagram content parts.
 */
export interface IVybeChatMermaidDiagramContent {
	kind: 'mermaidDiagram';
	diagramCode: string;      // The mermaid diagram code
	diagramType?: string;     // Optional diagram type (flowchart, sequence, etc.)
	isStreaming?: boolean;    // Whether diagram code is currently streaming
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
	requiresConfirmation?: boolean;  // For new files and delete_file - shows confirmation UI
	approvalState?: 'pending' | 'accepted' | 'rejected';  // HITL approval state
	toolCallId?: string;    // Tool call ID for LangGraph HITL resume
	isDelete?: boolean;     // Flag for delete_file operations
	isCreate?: boolean;     // Flag for new file operations
	onFinalized?: () => Promise<void>; // Callback when streaming finalizes (for file write)
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
	toolCallId?: string;       // Tool call ID for LangGraph HITL integration
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
 * Data for grepped content parts.
 */
export interface IVybeChatGreppedContent {
	kind: 'grepped';
	id?: string;
	pattern: string;
	isStreaming?: boolean;
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
		type: 'read' | 'searched' | 'grepped' | 'listed' | 'directory';
		data: IVybeChatReadingFilesContent | IVybeChatSearchedContent | IVybeChatGreppedContent | IVybeChatListedContent | IVybeChatDirectoryContent;
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
	modelState?: ModelDropdownState; // Model selection state
}

/**
 * Todo item data structure
 */
export interface ITodoItem {
	id: string;
	text: string;
	status: 'pending' | 'in-progress' | 'completed';
	order: number;
}

/**
 * Data for todo list summary content parts.
 * Appears in AI response area (can become sticky) or attached to human message.
 */
export interface IVybeChatTodoContent {
	kind: 'todo';
	id?: string; // Unique ID for tracking and updates
	items: ITodoItem[]; // Todo items (minimum 2 required)
	isExpanded?: boolean; // Whether todo list is expanded (default: true when first created)
	isSticky?: boolean; // Whether component is sticky (scrolled past human message)
	isAttachedToHuman?: boolean; // Whether attached to human message (always expanded)
	currentRunningTodo?: string; // Text of currently running todo (for collapsed header)
}

/**
 * Data for individual todo item indicator content parts.
 * Appears in AI response area when a todo starts/completes.
 */
export interface IVybeChatTodoItemContent {
	kind: 'todoItem';
	id?: string; // Unique ID for tracking
	toolCallId?: string; // Tool call ID from LangGraph
	status: 'started' | 'completed'; // Todo item status
	text: string; // Todo item text
}

/**
 * Data for phase indicator content parts.
 * Shows "Planning next steps" when agent enters planning phase.
 */
export interface IVybeChatPhaseIndicatorContent {
	kind: 'phaseIndicator';
	id?: string; // Unique ID for tracking
	phase: 'planning' | 'acting' | 'reflecting' | 'finalizing'; // Agent phase
	isStreaming?: boolean; // Whether phase is active (shows shine animation)
}

/**
 * Data for unified tool UI content parts.
 * Handles all tool types: read, list, grep, search.
 */
export interface IVybeChatToolContent {
	kind: 'tool';
	id: string; // Tool call ID (required for tracking)
	toolType: 'read' | 'list' | 'grep' | 'search' | 'search_web' | 'todos'; // Type of tool
	target: string; // Display name (filename, directory, pattern)
	filePath?: string; // Full file path for opening files (for read operations)
	lineRange?: { start: number; end: number }; // For read operations (optional)
	isStreaming: boolean; // Whether tool is executing
	error?: { code: string; message: string }; // Error if tool failed
	fileList?: Array<{ name: string; type: 'file' | 'directory'; path: string }>; // For list operations: parsed directory entries
	searchResults?: Array<{ file: string; path: string; lineRange?: { start: number; end: number } }>; // For search operations: codebase search results
	grepResults?: Array<{ file: string; path: string; matchCount: number }>; // For grep operations: grouped results with match counts
	webSearchContent?: string; // For web search: markdown content
	todoItems?: Array<{ id: string; text: string; status: 'pending' | 'in-progress' | 'completed' }>; // For todos: todo items list
	totalMatches?: number;  // Total number of matches across all files (for truncation indicator)
	truncated?: boolean;    // Whether results were truncated
}

/**
 * Question-answer pair from questionnaire.
 */
export interface IQuestionnaireAnswer {
	questionId: string;
	questionText: string;
	answerText: string; // The selected option label
}

/**
 * Data for questionnaire answers content parts.
 * Displays question-answer pairs after user answers questionnaire questions.
 */
export interface IVybeChatQuestionnaireAnswersContent {
	kind: 'questionnaireAnswers';
	id?: string; // Unique ID for tracking
	toolCallId?: string; // Tool call ID from LangGraph
	answers: IQuestionnaireAnswer[]; // Array of question-answer pairs
	toolStatus?: 'loading' | 'completed' | 'error'; // Tool status
}

/**
 * Data for code reference content parts.
 * A code reference displays existing code from the codebase with a header (file icon, filename, line range)
 * and the actual code content in a Monaco editor, similar to code blocks but with file metadata.
 * Format: ```startLine:endLine:filepath\ncode content\n```
 */
export interface IVybeChatReferenceContent {
	kind: 'reference';
	filePath: string;      // Full file path (absolute or relative to workspace)
	lineRange: { start: number; end: number }; // Line range to reference
	code: string;          // Code content from markdown (AI provides it)
	language?: string;     // Optional language for syntax highlighting (detected from file extension)
	isStreaming?: boolean; // Whether code is currently streaming
}

/**
 * Union type of all content data.
 * This is what gets passed to content parts for rendering.
 */
export type IVybeChatContentData =
	| IVybeChatMarkdownContent
	| IVybeChatThinkingContent
	| IVybeChatCodeBlockContent
	| IVybeChatMermaidDiagramContent
	| IVybeChatTextEditContent
	| IVybeChatTerminalContent
	| IVybeChatProgressContent
	| IVybeChatErrorContent
	| IVybeChatReadingFilesContent
	| IVybeChatSearchedContent
	| IVybeChatGreppedContent
	| IVybeChatExploredContent
	| IVybeChatListedContent
	| IVybeChatDirectoryContent
	| IVybeChatPlanDocumentContent
	| IVybeChatTodoContent
	| IVybeChatTodoItemContent
	| IVybeChatPhaseIndicatorContent
	| IVybeChatToolContent
	| IVybeChatQuestionnaireAnswersContent
	| IVybeChatReferenceContent;

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


