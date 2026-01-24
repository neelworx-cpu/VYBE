/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LangGraph Service - Main Process
 *
 * Runs LangGraph agents in the main process where Node.js can load npm packages.
 * Communicates with the browser process via IPC.
 *
 * Architecture:
 * - Browser process sends requests via IPC
 * - Main process runs LangGraph agent
 * - Main process sends events back via IPC
 */

// ============================================================================
// LANGCHAIN/LANGGRAPH IMPORTS
// ============================================================================
// These are ES modules that can only be loaded in Node.js context

// Dynamic imports to handle module loading gracefully
let langGraphLoaded = false;

// LangGraph core
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MemorySaver: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HumanMessage: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ToolMessage: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createAgent: any; // from langchain
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createMiddleware: any; // from langchain for middleware
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Command: any; // from @langchain/langgraph for interrupt
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let isAIMessageChunk: any; // from @langchain/core/messages for type checking

// Zod and LangChain tools
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let z: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tool: any; // from @langchain/core/tools

// ============================================================================
// SHARED API KEY STORE
// ============================================================================
// This store is shared with the IPC handlers so API keys set via IPC are available here
const sharedApiKeyStore: Map<string, string> = new Map();

/**
 * Set an API key in the shared store (called from IPC handlers)
 */
export function setSharedApiKey(provider: string, apiKey: string): void {
	sharedApiKeyStore.set(provider, apiKey);
	console.log(`[VybeLangGraphService] API key stored for: ${provider}`);
}

/**
 * Get an API key from the shared store
 */
export function getSharedApiKey(provider: string): string | undefined {
	return sharedApiKeyStore.get(provider);
}
// AIMessage imported but only needed if we build messages manually

// LangChain model classes - these are the proper adapters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ChatGoogleGenerativeAI: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ChatOpenAI: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AzureChatOpenAI: any; // Dedicated Azure OpenAI class
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ChatAnthropic: any;

// Direct SDKs (not LangChain wrappers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoogleGenAI: any; // Google GenAI SDK for direct access (LangChain doesn't expose thinking)

// ============================================================================
// TYPES
// ============================================================================

export interface LangGraphEvent {
	type: string;
	payload: unknown;
	timestamp: number;
	task_id: string;
}

export interface LangGraphTaskRequest {
	taskId: string;
	goal: string;
	model?: string; // Selected model ID (e.g., 'gemini-2.5-pro', 'gemini-2.5-flash')
	level?: 'L1' | 'L2' | 'L3'; // Budget tier level
	reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh'; // Reasoning effort level (defaults to 'medium')
	context?: {
		workspaceRoot?: string;
		activeFile?: string;
		projectType?: string;
	};
}

export interface LangGraphResumeRequest {
	taskId: string;
	decision: 'approve' | 'reject' | 'edit';
	editedArgs?: Record<string, unknown>;
}

export interface ToolContext {
	fileService: {
		readFile: (path: string, offset?: number, limit?: number) => Promise<string>;
		writeFile: (path: string, contents: string) => Promise<void>;
		editFile: (path: string, oldString: string, newString: string) => Promise<void>;
		grep: (pattern: string, path?: string, glob?: string) => Promise<string>;
		listDir: (path: string) => Promise<string>;
		codebaseSearch: (query: string, directories?: string[]) => Promise<string>;
		deleteFile: (targetFile: string) => Promise<string>;
	};
	terminalService: {
		runCommand: (command: string, isBackground?: boolean) => Promise<string>;
	};
}

// ============================================================================
// AGENT STATE
// ============================================================================

interface AgentMessage {
	role: 'human' | 'ai' | 'tool' | 'system';
	content: string;
	toolCallId?: string;
	toolName?: string;
}

interface AgentState {
	messages: AgentMessage[];
	model?: string;
	level: 'L1' | 'L2' | 'L3'; // Budget tier
	toolCallCount: number;     // Number of tool calls made
	turnCount: number;         // Number of model turns
	startTime: number;         // Task start timestamp
	suggestedUpgrade: boolean; // Whether to suggest tier upgrade
	filesRead: string[];
	filesModified: string[];
	toolsUsed: string[];
	pendingApproval?: {
		tool: string;
		args: Record<string, unknown>;
		toolCallId: string;
	};
	errors: Array<{ tool: string; message: string }>;
}

// ============================================================================
// ACTIVE TASKS
// ============================================================================

interface ActiveTask {
	taskId: string;
	state: AgentState;
	abortController: AbortController;
	eventHandler: (event: LangGraphEvent) => void;
	toolContext?: ToolContext;
	checkpointer?: any;
	reasoningLevel: 'low' | 'medium' | 'high' | 'xhigh';
}

const activeTasks = new Map<string, ActiveTask>();

// ============================================================================
// LANGCHAIN LOADER
// ============================================================================

/**
 * Dynamically load LangChain modules.
 * Called once on first use.
 */
async function loadLangChainModules(): Promise<boolean> {
	if (langGraphLoaded) {
		return true;
	}

	console.log('[VybeLangGraphService] Attempting to load LangChain modules...');

	try {
		// Import LangGraph modules
		console.log('[VybeLangGraphService] Importing @langchain/langgraph...');
		const langGraph = await import('@langchain/langgraph');
		console.log('[VybeLangGraphService] LangGraph imported, keys:', Object.keys(langGraph).slice(0, 10));
		MemorySaver = langGraph.MemorySaver;
		Command = langGraph.Command;
		// Note: interrupt is available but not used - we handle interrupts via event streaming

		// Import createAgent from langchain
		console.log('[VybeLangGraphService] Importing langchain...');
		const langchain = await import('langchain');
		createAgent = langchain.createAgent;
		createMiddleware = langchain.createMiddleware;
		console.log('[VybeLangGraphService] ✓ createAgent loaded');
		console.log('[VybeLangGraphService] ✓ createMiddleware loaded');

		// ToolMessage is already imported from @langchain/core/messages above
		// It's used in the tool error middleware

		// Import LangChain core messages
		console.log('[VybeLangGraphService] Importing @langchain/core/messages...');
		const messages = await import('@langchain/core/messages');
		console.log('[VybeLangGraphService] Messages imported, keys:', Object.keys(messages).slice(0, 10));
		HumanMessage = messages.HumanMessage;
		ToolMessage = messages.ToolMessage;
		// SystemMessage removed - now using systemPrompt parameter in createAgent
		isAIMessageChunk = messages.isAIMessageChunk; // For type checking in stream mode

		// Import LangChain model adapters - these are the proper LangChain way
		console.log('[VybeLangGraphService] Importing LangChain model adapters...');

		try {
			const genai = await import('@langchain/google-genai');
			ChatGoogleGenerativeAI = genai.ChatGoogleGenerativeAI;
			console.log('[VybeLangGraphService] ✓ ChatGoogleGenerativeAI loaded');
		} catch (e) {
			console.warn('[VybeLangGraphService] ChatGoogleGenerativeAI not available:', e);
		}

		try {
			const openai = await import('@langchain/openai');
			ChatOpenAI = openai.ChatOpenAI;
			AzureChatOpenAI = openai.AzureChatOpenAI;
			console.log('[VybeLangGraphService] ✓ ChatOpenAI loaded');
			console.log('[VybeLangGraphService] ✓ AzureChatOpenAI loaded:', !!AzureChatOpenAI);
			if (!AzureChatOpenAI) {
				console.error('[VybeLangGraphService] ⚠️ AzureChatOpenAI is undefined in @langchain/openai package!');
				console.log('[VybeLangGraphService] Available exports:', Object.keys(openai).slice(0, 20));
			}
		} catch (e) {
			console.warn('[VybeLangGraphService] ChatOpenAI not available:', e);
		}

		try {
			const anthropic = await import('@langchain/anthropic');
			ChatAnthropic = anthropic.ChatAnthropic;
			console.log('[VybeLangGraphService] ✓ ChatAnthropic loaded');
		} catch (e) {
			console.warn('[VybeLangGraphService] ChatAnthropic not available:', e);
		}

		// Import Google GenAI SDK directly (LangChain wrapper doesn't expose thinking content)
		try {
			const googleGenAI = await import('@google/genai');
			GoogleGenAI = googleGenAI.GoogleGenAI;
			console.log('[VybeLangGraphService] ✓ Google GenAI SDK loaded (for thinking support)');
		} catch (e) {
			console.warn('[VybeLangGraphService] Google GenAI SDK not available:', e);
		}

		// Azure models now use LangChain's useResponsesApi: true (no direct SDK needed)

		// Import Zod for tool schemas
		try {
			const zodModule = await import('zod');
			z = zodModule.z;
			console.log('[VybeLangGraphService] ✓ Zod loaded');
		} catch (e) {
			console.error('[VybeLangGraphService] ✗ Zod not available:', e);
			return false;
		}

		// Import LangChain tool function
		try {
			const toolsModule = await import('@langchain/core/tools');
			tool = toolsModule.tool;
			console.log('[VybeLangGraphService] ✓ LangChain tool() loaded');
		} catch (e) {
			console.error('[VybeLangGraphService] ✗ LangChain tools not available:', e);
			return false;
		}

		langGraphLoaded = true;
		console.log('[VybeLangGraphService] ✓ All LangChain modules loaded successfully');
		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : '';
		console.error('[VybeLangGraphService] ✗ Failed to load LangChain modules:');
		console.error('  Error:', errorMessage);
		console.error('  Stack:', errorStack);
		return false;
	}
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

// System prompt is used when integrating with actual LLM calls
// Currently, the agent uses a simple ReAct loop for testing

// ============================================================================
// GOOGLE SDK DIRECT STREAMING (FOR THINKING SUPPORT)
// ============================================================================

/**
 * Stream directly from Google GenAI SDK to extract thinking content.
 * LangChain's ChatGoogleGenerativeAI doesn't expose thinking, so we need this.
 *
 * This function streams alongside the LangGraph agent to capture thinking.
 * It's called when we detect a Gemini model that supports thinking.
 */
async function* streamGeminiDirect(
	apiKey: string,
	modelId: string,
	messages: Array<{ role: string; content: string }>,
	systemPrompt: string,
	thinkingBudget: number = 1024
): AsyncGenerator<{ type: 'text' | 'thinking' | 'tool_call' | 'done'; content: string; toolCall?: { name: string; args: Record<string, unknown>; id: string } }> {
	if (!GoogleGenAI) {
		console.error('[VybeLangGraphService] GoogleGenAI SDK not loaded, cannot stream directly');
		return;
	}

	console.log(`[VybeLangGraphService] ===== STARTING DIRECT GOOGLE SDK STREAMING =====`);
	console.log(`[VybeLangGraphService] Model: ${modelId}`);
	console.log(`[VybeLangGraphService] Thinking budget: ${thinkingBudget}`);

	try {
		const genAI = new GoogleGenAI({ apiKey });

		// Convert messages to Google format
		const contents = messages.map(msg => ({
			role: msg.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: msg.content }]
		}));

		// Parse reasoning level from modelId (e.g., "gemini-3-pro-preview-high" -> "high")
		let reasoningLevel: string | null = null;
		const reasoningPatterns = ['-xhigh', '-high', '-medium', '-low'];
		for (const pattern of reasoningPatterns) {
			if (modelId.endsWith(pattern)) {
				reasoningLevel = pattern.slice(1); // Remove leading dash
				break;
			}
		}

		// Determine thinking config based on model
		// For Gemini 3.x use thinkingLevel, for 2.5 use thinkingBudget
		const isGemini3 = modelId.includes('gemini-3-pro') || modelId.includes('gemini-3-flash');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const thinkingConfig: any = {
			includeThoughts: true,
		};

		if (isGemini3) {
			// Map reasoning level to thinkingLevel
			let thinkingLevelValue = 'HIGH'; // Default
			if (reasoningLevel === 'high') {
				thinkingLevelValue = 'HIGH';
			} else if (reasoningLevel === 'medium') {
				thinkingLevelValue = 'MEDIUM';
			} else if (reasoningLevel === 'low') {
				thinkingLevelValue = 'LOW';
			}
			thinkingConfig.thinkingLevel = thinkingLevelValue;
		} else {
			thinkingConfig.thinkingBudget = thinkingBudget;
		}

		console.log(`[VybeLangGraphService] Direct streaming config:`, JSON.stringify({
			model: modelId,
			thinkingConfig,
			systemPromptLength: systemPrompt.length,
			messageCount: messages.length,
			userMessage: messages[0]?.content?.substring(0, 100)
		}, null, 2));

		// Use the Google SDK's models.generateContentStream
		const stream = await genAI.models.generateContentStream({
			model: modelId,
			contents: contents,
			config: {
				systemInstruction: systemPrompt,
				thinkingConfig: thinkingConfig,
			},
		});

		let fullText = '';
		let fullThinking = '';
		let chunkCount = 0;
		let hasToolCall = false;
		let pendingToolCall: { name: string; args: Record<string, unknown>; id: string } | null = null;

		for await (const chunk of stream) {
			chunkCount++;

			// Get parts from the response - this is the correct way per Google docs
			const parts = chunk.candidates?.[0]?.content?.parts || [];

			console.log(`[VybeLangGraphService] Chunk ${chunkCount}: ${parts.length} parts`);

			// Iterate through parts and separate by thought property
			// This is the Google-recommended approach for thinking models
			for (const part of parts) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const partAny = part as any;

				// Skip parts without text (except function calls)
				if (!part.text && !partAny.functionCall) {
					continue;
				}

				// Check the thought property to determine content type
				if (partAny.thought === true) {
					// This is thinking/reasoning content
					if (part.text) {
						fullThinking += part.text;
						console.log(`[VybeLangGraphService] 💭 THINK: +${part.text.length} (total: ${fullThinking.length})`);
						yield { type: 'thinking', content: part.text };
					}
				} else if (partAny.functionCall) {
					// This is a function/tool call
					hasToolCall = true;
					pendingToolCall = {
						name: partAny.functionCall.name || '',
						args: partAny.functionCall.args || {},
						id: partAny.functionCall.id || `call_${Date.now()}`
					};
					console.log(`[VybeLangGraphService] 🔧 TOOL: ${pendingToolCall.name}`);
					yield {
						type: 'tool_call',
						content: pendingToolCall.name,
						toolCall: pendingToolCall
					};
				} else if (part.text) {
					// This is answer/response content (thought is undefined or false)
					fullText += part.text;
					console.log(`[VybeLangGraphService] 📝 TEXT: +${part.text.length} (total: ${fullText.length})`);
					yield { type: 'text', content: part.text };
				}
			}

			// Also check for function calls at chunk level (some models use this)
			if (chunk.functionCalls && chunk.functionCalls.length > 0) {
				hasToolCall = true;
				const fc = chunk.functionCalls[0];
				pendingToolCall = {
					name: fc.name || '',
					args: fc.args || {},
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					id: (fc as any).id || `call_${Date.now()}`
				};
				console.log(`[VybeLangGraphService] 🔧 TOOL (chunk): ${pendingToolCall.name}`);
				yield {
					type: 'tool_call',
					content: pendingToolCall.name,
					toolCall: pendingToolCall
				};
			}
		}

		console.log(`[VybeLangGraphService] ===== DIRECT STREAMING COMPLETE =====`);
		console.log(`[VybeLangGraphService] Total chunks: ${chunkCount}`);
		console.log(`[VybeLangGraphService] Text length: ${fullText.length} chars`);
		console.log(`[VybeLangGraphService] Thinking length: ${fullThinking.length} chars`);
		console.log(`[VybeLangGraphService] Has tool call: ${hasToolCall}`);

		yield { type: 'done', content: fullText };
	} catch (error) {
		console.error('[VybeLangGraphService] Direct Gemini streaming error:', error);
		throw error;
	}
}

// Note: Azure Responses API code removed - GPT-5-Pro not supported (requires Responses API)
// All Azure models now use LangChain's AzureChatOpenAI with Chat Completions API

// ============================================================================
// TOOL DEFINITIONS - LANGCHAIN ZOD-BASED TOOLS
// ============================================================================

/**
 * Tools that require user approval before execution.
 * Used by the human-in-the-loop logic in runAgentLoop.
 */
const TOOLS_REQUIRING_APPROVAL = ['edit_file', 'run_terminal_cmd']; // edit_file requires approval when creating new files

/**
 * Request tool execution from the browser process via IPC.
 * The actual VS Code service calls happen in the browser process.
 */
let requestToolExecution: (toolName: string, args: Record<string, unknown>) => Promise<string>;

/**
 * Set the tool executor function (called from startTask).
 */
export function setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<string>) {
	requestToolExecution = executor;
}

/**
 * Create LangChain Zod tools.
 * Called after Zod and tool() are loaded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createLangChainTools(): any[] {
	if (!z || !tool) {
		throw new Error('Zod and tool() must be loaded before creating tools');
	}

	const readFileTool = tool(
		async (args: { target_file: string; should_read_entire_file?: boolean; start_line_one_indexed?: number; end_line_one_indexed_inclusive?: number; explanation?: string; offset?: number; limit?: number }) => {
			try {
				// Support both Cursor format (start_line_one_indexed, end_line_one_indexed_inclusive) and VYBE format (offset, limit)
				const offset = args.start_line_one_indexed ?? args.offset;
				const limit = args.end_line_one_indexed_inclusive ?? args.limit;
				const result = await requestToolExecution('read_file', { target_file: args.target_file, offset, limit, should_read_entire_file: args.should_read_entire_file });
				return result || 'Tool executed successfully with no output';
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return `Error: ${errorMessage}`;
			}
		},
		{
			name: 'read_file',
			description: 'Read the contents of a file. The output of this tool call will be the 1-indexed file contents from start_line_one_indexed to end_line_one_indexed_inclusive, together with a summary of the lines outside start_line_one_indexed and end_line_one_indexed_inclusive. Note that this call can view at most 250 lines at a time and 200 lines minimum. When using this tool to gather information, it\'s your responsibility to ensure you have the COMPLETE context. Specifically, each time you call this command you should: 1) Assess if the contents you viewed are sufficient to proceed with your task. 2) Take note of where there are lines not shown. 3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines. 4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality. In some cases, if reading a range of lines is not enough, you may choose to read the entire file. Reading entire files is often wasteful and slow, especially for large files (i.e. more than a few hundred lines). So you should use this option sparingly. Reading the entire file is not allowed in most cases. You are only allowed to read the entire file if it has been edited or manually attached to the conversation by the user.',
			schema: z.object({
				target_file: z.string().describe('The path of the file to read. You can use either a relative path in the workspace or an absolute path. If an absolute path is provided, it will be preserved as is.'),
				should_read_entire_file: z.boolean().optional().describe('Whether to read the entire file. Defaults to false. Reading entire files is often wasteful and slow, especially for large files (i.e., more than a few hundred lines). So you should use this option sparingly. Reading the entire file is not allowed in most cases. You are only allowed to read the entire file if it has been edited or manually attached to the conversation by the user.'),
				start_line_one_indexed: z.number().optional().describe('The one-indexed line number to start reading from (inclusive).'),
				end_line_one_indexed_inclusive: z.number().optional().describe('The one-indexed line number to end reading at (inclusive).'),
				explanation: z.string().optional().describe('One sentence explanation as to why this tool is being used, and how it contributes to the goal.'),
				// Backward compatibility with VYBE format
				offset: z.number().optional().describe('[DEPRECATED] Use start_line_one_indexed instead. Line number to start reading from.'),
				limit: z.number().optional().describe('[DEPRECATED] Use end_line_one_indexed_inclusive instead. Number of lines to read.'),
			}),
		}
	);

	// write_file tool removed - use edit_file for all file operations (create, overwrite, edit)

	const editFileTool = tool(
		async ({ file_path, old_string, new_string }: { file_path: string; old_string: string; new_string: string }) => {
			try {
				const result = await requestToolExecution('edit_file', { file_path, old_string, new_string });
				return result || 'Tool executed successfully with no output';
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return `Error: ${errorMessage}`;
			}
		},
		{
			name: 'edit_file',
			description: 'Edit a file by replacing old_string with new_string.',
			schema: z.object({
				file_path: z.string().describe('Path to the file'),
				old_string: z.string().describe('Text to find and replace'),
				new_string: z.string().describe('Replacement text'),
			}),
		}
	);

	const grepTool = tool(
		async (args: {
			pattern: string;
			path?: string;
			glob?: string;
			output_mode?: "content" | "files_with_matches" | "count";
			"-B"?: number;
			"-A"?: number;
			"-C"?: number;
			"-i"?: boolean;
			type?: string;
			head_limit?: number;
			multiline?: boolean;
		}) => {
			// Map Cursor's -i (case insensitive) to VYBE's caseSensitive (opposite logic)
			const caseSensitive = args["-i"] === true ? false : (args["-i"] === false ? true : undefined);

			console.log(`[VybeLangGraphService] 🔍 Grep tool called:`, {
				pattern: args.pattern,
				path: args.path || '(workspace root)',
				glob: args.glob,
				output_mode: args.output_mode,
				"-B": args["-B"],
				"-A": args["-A"],
				"-C": args["-C"],
				"-i": args["-i"],
				type: args.type,
				head_limit: args.head_limit,
				multiline: args.multiline,
			});

			try {
				const result = await requestToolExecution('grep', {
					pattern: args.pattern,
					path: args.path,
					glob: args.glob,
					caseSensitive: caseSensitive,
					outputMode: args.output_mode,
					beforeLines: args["-B"],
					afterLines: args["-A"],
					contextLines: args["-C"],
					fileType: args.type,
					headLimit: args.head_limit,
					multiline: args.multiline,
				});
				return result || 'Tool executed successfully with no output';
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return `Error: ${errorMessage}`;
			}
		},
		{
			name: 'grep',
			description: 'A powerful search tool built on ripgrep. Usage: Prefer grep for exact symbol/string searches. Whenever possible, use this instead of terminal grep/rg. This tool is faster and respects .gitignore/.cursorignore. Supports full regex syntax, e.g. "log.*Error", "function\\s+\\w+". Ensure you escape special chars to get exact matches, e.g. "functionCall\\(". Avoid overly broad glob patterns (e.g., "--glob *") as they bypass .gitignore rules and may be slow. Only use "type" (or "glob" for file types) when certain of the file type needed. Note: import paths may not match source file types (.js vs .ts). Output modes: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows only file paths (supports head_limit), "count" shows match counts per file. Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (e.g. use interface\\{\\} to find interface{} in Go code). Multiline matching: By default patterns match within single lines only. For cross-line patterns like struct \\{[\\s\\S]*?field, use multiline: true. Results are capped for responsiveness; truncated results show "at least" counts. Content output follows ripgrep format: "-" for context lines, ":" for match lines, and all lines grouped by file. Unsaved or out of workspace active editors are also searched and show "(unsaved)" or "(out of workspace)". Use absolute paths to read/edit these files.',
			schema: z.object({
				pattern: z.string().describe('The regular expression pattern to search for in file contents (rg --regexp)'),
				path: z.string().optional().describe('File or directory to search in (rg pattern -- PATH). Defaults to Cursor workspace roots.'),
				glob: z.string().optional().describe('Glob pattern (rg --glob GLOB -- PATH) to filter files (e.g., "*.js", "*.{ts,tsx}").'),
				output_mode: z.enum(["content", "files_with_matches", "count"]).optional().describe('Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows only file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "content".'),
				"-B": z.number().optional().describe('Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.'),
				"-A": z.number().optional().describe('Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.'),
				"-C": z.number().optional().describe('Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.'),
				"-i": z.boolean().optional().describe('Case insensitive search (rg -i). Defaults to false.'),
				type: z.string().optional().describe('File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than glob for standard file types.'),
				head_limit: z.number().optional().describe('Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). When unspecified, shows all ripgrep results.'),
				multiline: z.boolean().optional().describe('Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.'),
			}),
		}
	);

	const listDirTool = tool(
		async (args: { target_directory: string; ignore_globs?: string[]; explanation?: string }) => {
			try {
				// Validate against using "." - Cursor explicitly says "never use '.' unless explicitly listing the workspace root"
				if (args.target_directory === '.' || args.target_directory === './') {
					throw new Error('Do not use "." as the directory path. Use the actual directory name or path (e.g., "src", "src/components"). Only use "." if explicitly listing the workspace root.');
				}

				const result = await requestToolExecution('list_dir', {
					target_directory: args.target_directory,
					ignore_globs: args.ignore_globs
				});
				return result || 'Tool executed successfully with no output';
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return `Error: ${errorMessage}`;
			}
		},
		{
			name: 'list_dir',
			description: 'Lists files and directories in a given path. The target_directory parameter can be relative to the workspace root or absolute. You can optionally provide an array of glob patterns to ignore with the "ignore_globs" parameter. Other details: The result does not display dot-files and dot-directories. IMPORTANT: Always use the actual directory name or path - never use "." unless explicitly listing the workspace root.',
			schema: z.object({
				target_directory: z.string().describe('Path to directory to list contents of. Always use the actual directory name or path (e.g., "src", "src/components"). Never use "." unless explicitly listing the workspace root.'),
				ignore_globs: z.array(z.string()).optional().describe('Optional array of glob patterns to ignore. All patterns match anywhere in the target directory. Patterns not starting with "**/" are automatically prepended with "**/". Examples: "*.js" (becomes "**/*.js") - ignore all .js files, "**/node_modules/**" - ignore all node_modules directories, "**/test/**/test_*.ts" - ignore all test_*.ts files in any test directory.'),
				explanation: z.string().optional().describe('One sentence explanation as to why this tool is being used, and how it contributes to the goal.'),
			}),
		}
	);

	const runTerminalCmdTool = tool(
		async ({ command, is_background, explanation }: { command: string; is_background: boolean; explanation?: string }) => {
			try {
				const result = await requestToolExecution('run_terminal_cmd', { command, is_background: is_background ?? false, explanation });
				return result || 'Tool executed successfully with no output';
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return `Error: ${errorMessage}`;
			}
		},
		{
			name: 'run_terminal_cmd',
			description: 'PROPOSE a command to run on behalf of the user. Note that the user may have to approve the command before it is executed. The user may reject it if it is not to their liking, or may modify the command before approving it. If they do change it, take those changes into account. In using these tools, adhere to the following guidelines: 1. Based on the contents of the conversation, you will be told if you are in the same shell as a previous step or a different shell. 2. If in a new shell, you should cd to the appropriate directory and do necessary setup in addition to running the command. By default, the shell will initialize in the project root. 3. If in the same shell, LOOK IN CHAT HISTORY for your current working directory. The environment also persists (e.g. exported env vars, venv/nvm activations). 4. For ANY commands that would require user interaction, ASSUME THE USER IS NOT AVAILABLE TO INTERACT and PASS THE NON-INTERACTIVE FLAGS (e.g. --yes for npx). 5. For commands that are long running/expected to run indefinitely until interruption, please run them in the background. To run jobs in the background, set is_background to true rather than changing the details of the command.',
			schema: z.object({
				command: z.string().describe('The terminal command to execute'),
				is_background: z.boolean().describe('Whether the command should be run in the background'),
				explanation: z.string().optional().describe('One sentence explanation as to why this command needs to be run and how it contributes to the goal.'),
			}),
		}
	);

	// write_todos tool for planning and task tracking (Deep Agents TodoListMiddleware)
	// This tool allows the agent to create and update a todo list for complex multi-step tasks
	const writeTodosTool = tool(
		async ({ todos }: { todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed' }> }) => {
			// This tool doesn't need to execute anything - it just tracks state
			// The state is handled by the agent loop and emitted as events
			return JSON.stringify({ success: true, todosCount: todos.length });
		},
		{
			name: 'write_todos',
			description: `Create or update a to-do list for tracking complex multi-step tasks.

IMPORTANT: This is the ONLY way to create task lists. Do NOT use markdown checkboxes like "- [ ]" or HTML inputs.

Use this tool when:
- Working on tasks with 3+ steps
- Implementing features with multiple components
- Doing refactoring or migrations
- Any multi-step work that benefits from progress tracking

The todos will render as an interactive UI component in the chat.`,
			schema: z.object({
				todos: z.array(z.object({
					id: z.string().describe('Unique identifier for the todo item (e.g., "1", "step-1", etc.)'),
					content: z.string().describe('Clear, actionable description of what needs to be done'),
					status: z.enum(['pending', 'in_progress', 'completed']).describe('pending=not started, in_progress=currently working on, completed=done')
				})).min(2).describe('Array of todo items (minimum 2 required for UI to render)')
			}),
		}
	);

	// get_todos tool for retrieving current todo list
	// This tool allows the agent to check the current state of todos
	const getTodosTool = tool(
		async () => {
			// TODO: Access actual todos from agent state/middleware
			// For now, return empty array - this will be enhanced to access the actual state
			// The middleware stores todos in state, but we need to access it from the tool execution context
			return JSON.stringify({ todos: [] });
		},
		{
			name: 'get_todos',
			description: `Retrieve the current to-do list to check progress and see what tasks remain.

Use this tool when:
- You need to recall what tasks were planned
- You want to check which todos are pending, in-progress, or completed
- You need to see the full task list before continuing work

Returns the current list of todos with their status.`,
			schema: z.object({}),
		}
	);

	const codebaseSearchTool = tool(
		async ({ explanation, query, target_directories, maxResults }: { explanation: string; query: string; target_directories: string[]; maxResults?: number }) => {
			try {
				const result = await requestToolExecution('codebase_search', { explanation, query, target_directories, maxResults });
				return result || 'Tool executed successfully with no output';
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return `Error: ${errorMessage}`;
			}
		},
		{
			name: 'codebase_search',
			description: 'Semantic search that finds code by meaning, not exact text. Use codebase_search when you need to: Explore unfamiliar codebases, Ask "how / where / what" questions to understand behavior, Find code by meaning rather than exact text. Skip codebase_search for: Exact text matches (use grep), Reading known files (use read_file), Simple symbol lookups (use grep), Find file by name (use file_search). Target Directories: Provide ONE directory or file path; [] searches the whole repo. No globs or wildcards. Good: ["backend/api/"] - focus directory, ["src/components/Button.tsx"] - single file, [] - search everywhere when unsure. BAD: ["frontend/", "backend/"] - multiple paths, ["src/**/utils/**"] - globs, ["*.ts"] or ["**/*"] - wildcard paths. Search Strategy: 1. Start with exploratory queries - semantic search is powerful and often finds relevant context in one go. Begin broad with [] if you\'re not sure where relevant code is. 2. Review results; if a directory or file stands out, rerun with that as the target. 3. Break large questions into smaller ones (e.g. auth roles vs session storage). 4. For big files (>1K lines) run codebase_search, or grep if you know the exact symbols you\'re looking for, scoped to that file instead of reading the entire file. Usage: When full chunk contents are provided, avoid re-reading the exact same chunk contents using the read_file tool. Sometimes, just the chunk signatures and not the full chunks will be shown. Chunk signatures are usually Class or Function signatures that chunks are contained in. Use the read_file or grep tools to explore these chunks or files if you think they might be relevant. When reading chunks that weren\'t provided as full chunks (e.g. only as line ranges or signatures), you\'ll sometimes want to expand the chunk ranges to include the start of the file to see imports, expand the range to include lines from the signature, or expand the range to read multiple chunks from a file at once.',
			schema: z.object({
				explanation: z.string().describe('One sentence explanation as to why this tool is being used, and how it contributes to the goal.'),
				query: z.string().describe('A complete question about what you want to understand. Ask as if talking to a colleague: \'How does X work?\', \'What happens when Y?\', \'Where is Z handled?\''),
				target_directories: z.array(z.string()).describe('Prefix directory paths to limit search scope (single directory only, no glob patterns). Use [] to search the whole repo.'),
				maxResults: z.number().optional().describe('[INTERNAL] Maximum number of results to return (default: 20)'),
			}),
		}
	);

	return [readFileTool, editFileTool, grepTool, listDirTool, runTerminalCmdTool, writeTodosTool, getTodosTool, codebaseSearchTool];
}

// Cached tools - created once after modules load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let langchainTools: any[] | null = null;

// ============================================================================
// LANGGRAPH SERVICE
// ============================================================================

export class VybeLangGraphService {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private checkpointer: any = null;
	private initialized = false;

	constructor() {
		// Will be initialized on first use
	}

	/**
	 * Initialize LangGraph components.
	 */
	async initialize(): Promise<boolean> {
		if (this.initialized) {
			return true;
		}

		const loaded = await loadLangChainModules();
		if (!loaded) {
			return false;
		}

		try {
			// Create checkpointer for durable execution
			this.checkpointer = new MemorySaver();

			// Auto-fetch API keys from Supabase Edge Function
			await this.fetchApiKeysFromSupabase();

			// Model will be configured per-request based on settings
			this.initialized = true;
			console.log('[VybeLangGraphService] Initialized successfully');
			return true;
		} catch (error) {
			console.error('[VybeLangGraphService] Initialization failed:', error);
			return false;
		}
	}

	/**
	 * Fetch API keys from Supabase Edge Function at startup.
	 * Keys are stored in shared memory for LangChain models to use.
	 */
	private async fetchApiKeysFromSupabase(): Promise<void> {
		// Supabase configuration
		const SUPABASE_URL = 'https://xlrcsusfaynypqvyfmgk.supabase.co';
		const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscmNzdXNmYXlueXBxdnlmbWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5NDU3ODksImV4cCI6MjA3OTUyMTc4OX0.7Upe8xKgKSh9YRlsAS7uvLll1gENS27VTNRa6NMXBx8';
		const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/get-llm-key`;

		const providers = ['gemini', 'openai', 'anthropic', 'azure'];

		for (const provider of providers) {
			try {
				console.log(`[VybeLangGraphService] Fetching ${provider} API key from Supabase...`);
				const response = await fetch(edgeFunctionUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
					},
					body: JSON.stringify({ provider }),
				});

				if (!response.ok) {
					console.warn(`[VybeLangGraphService] Failed to fetch ${provider} key: ${response.status}`);
					continue;
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const data = await response.json() as any;
				const apiKey = data.apiKey || data.api_key || data.key;

				if (apiKey) {
					setSharedApiKey(provider, apiKey);
					console.log(`[VybeLangGraphService] ✓ ${provider} API key loaded from Supabase`);

					// For Azure, also fetch endpoint and API version if available
					if (provider === 'azure') {
						const endpoint = data.endpoint || data.azure_endpoint;
						const apiVersion = data.apiVersion || data.azure_api_version || data.api_version;

						// Validate endpoint is a URL, not an API key
						if (endpoint) {
							// Check if endpoint looks like a URL (starts with http:// or https://)
							if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
								console.error(`[VybeLangGraphService] ⚠️ Azure endpoint appears to be invalid (not a URL): ${endpoint.substring(0, 50)}...`);
								console.error(`[VybeLangGraphService] ⚠️ Expected format: https://vybe-models-resource.services.ai.azure.com/api/projects/vybe-models`);
								console.error(`[VybeLangGraphService] ⚠️ Please check your Supabase AZURE_ENDPOINT secret`);
							} else {
								setSharedApiKey('azure_endpoint', endpoint);
								console.log(`[VybeLangGraphService] ✓ Azure endpoint loaded from Supabase: ${endpoint.substring(0, 60)}...`);
							}
						}

						if (apiVersion) {
							setSharedApiKey('azure_api_version', apiVersion);
							console.log(`[VybeLangGraphService] ✓ Azure API version loaded from Supabase: ${apiVersion}`);
						}
					}
				}
			} catch (error) {
				console.warn(`[VybeLangGraphService] Could not fetch ${provider} key:`, error);
				// Continue with other providers
			}
		}
	}

	/**
	 * Start a new agent task.
	 */
	async startTask(
		request: LangGraphTaskRequest,
		eventHandler: (event: LangGraphEvent) => void,
		toolContext?: ToolContext
	): Promise<void> {
		const { taskId, goal, model, level = 'L2', reasoningLevel = 'medium', context } = request;
		const finalReasoningLevel = reasoningLevel || 'medium'; // Ensure it's never null/undefined
		console.log(`[VybeLangGraphService] Starting task ${taskId} with model: ${model || 'default'}, level: ${level}, reasoningLevel: ${finalReasoningLevel}`);

		// Ensure initialized
		if (!await this.initialize()) {
			eventHandler({
				type: 'error',
				payload: { message: 'LangGraph service not initialized', code: 'INIT_ERROR', recoverable: false },
				timestamp: Date.now(),
				task_id: taskId,
			});
			return;
		}

		// Set up tool executor to call browser process via IPC
		// This is used by createAgent for frontier models (Gemini, OpenAI, etc.)
		if (toolContext) {
			// Tool execution queue to serialize tool calls (one at a time, like Cursor)
			// This prevents multiple tools from showing "Reading" simultaneously
			let toolExecutionQueue: Promise<string> = Promise.resolve('');
			let toolQueuePosition = 0;
			const TOOL_SEQUENTIAL_DELAY_MS = 300; // Delay between tools for visual separation

			setToolExecutor(async (toolName: string, args: Record<string, unknown>): Promise<string> => {
				const myPosition = ++toolQueuePosition;
				const executionStartTime = Date.now();
				console.log(`[VybeLangGraphService] 🔧 TOOL EXEC START: ${toolName} (position ${myPosition})`, {
					args: JSON.stringify(args).substring(0, 200),
					timestamp: executionStartTime
				});

				// Queue this tool execution after all previous ones complete
				const executeThisTool = async (): Promise<string> => {
					// Emit tool.call event for UI
					const toolCallId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
					console.log(`[VybeLangGraphService] 🔧 TOOL CALL ID GENERATED: ${toolCallId} for ${toolName}`);

					eventHandler({
						type: 'token',
						payload: {
							content: '',
							tool_call: {
								id: toolCallId,
								name: toolName,
								args: JSON.stringify(args),
							},
						},
						timestamp: Date.now(),
						task_id: taskId,
					});

					// Maximum tool result size to prevent context window overflow
					const MAX_TOOL_RESULT_SIZE = 32000; // ~8k tokens

					const truncateResult = (result: string, maxSize: number): string => {
						if (result.length <= maxSize) {
							return result;
						}
						const truncated = result.substring(0, maxSize);
						const suffix = `\n\n[... TRUNCATED: File too large. Showing first ${maxSize} characters of ${result.length} total. Use offset/limit parameters to read specific sections.]`;
						return truncated + suffix;
					};

					try {
						console.log(`[VybeLangGraphService] 🔧 TOOL EXEC BEGIN: ${toolName} (id: ${toolCallId})`);
						let result: string;
						// CRITICAL: Declare these outside switch so emergency fallback can access them
						let fullGrepResult: string | undefined; // Store full grep result for parsing
						let fullGrepResultJson: { matches?: Array<{ file?: string; path?: string; line?: number; match?: string }> } | undefined; // Store full JSON result for parsing
						switch (toolName) {
							case 'read_file':
								result = await toolContext.fileService.readFile(
									args.target_file as string,
									args.offset as number | undefined,
									args.limit as number | undefined
								);
								// Removed verbose logging
								// Truncate if too large
								if (result.length > MAX_TOOL_RESULT_SIZE) {
									console.warn(`[VybeLangGraphService] ⚠️ Truncating large read_file result from ${result.length} to ${MAX_TOOL_RESULT_SIZE}`);
									result = truncateResult(result, MAX_TOOL_RESULT_SIZE);
								}
								break;
							// write_file tool removed - use edit_file for all file operations
							case 'edit_file': {
								const editFileResult = await toolContext.fileService.editFile(
									args.file_path as string,
									args.old_string as string,
									args.new_string as string
								);
								// Parse result to check for deferred write
								try {
									const parsedResult = typeof editFileResult === 'string' ? JSON.parse(editFileResult) : editFileResult;
									if (parsedResult?.deferred === true) {
										// File write is deferred - use the message from tool or construct clear message
										result = parsedResult.message || `File edited successfully: ${args.file_path as string}. The file system has confirmed the write operation.`;
									} else if (parsedResult?.created === true) {
										// New file was created immediately
										result = `File created successfully: ${args.file_path as string}`;
									} else {
										// File was written immediately (shouldn't happen for existing files, but handle gracefully)
										result = `File edited successfully: ${args.file_path as string}`;
									}
								} catch {
									// If parsing fails, use the result as-is (should be a string)
									result = typeof editFileResult === 'string' ? editFileResult : 'File edited successfully';
								}
								break;
							}
							case 'grep':
								// fileService.grep() executes tool in browser, returns JSON string from createGrepTool
								try {
									const pattern = args.pattern as string;
									if (!pattern || typeof pattern !== 'string') {
										throw new Error('Invalid pattern: pattern must be a non-empty string');
									}

									const grepResult = await toolContext.fileService.grep(
										pattern,
										args.path as string | undefined,
										args.glob as string | undefined
									);

									// IPC always returns a string, so parse it immediately to get the full object
									// Store the FULL string before any truncation
									fullGrepResult = typeof grepResult === 'string' ? grepResult : JSON.stringify(grepResult);

									// CRITICAL: Parse the FULL JSON string immediately to get all matches
									// This must happen BEFORE truncation, so we have access to all 806 files
									if (typeof grepResult === 'string' && grepResult.trim().startsWith('{')) {
										try {
											// eslint-disable-next-line @typescript-eslint/no-explicit-any
											const parsedJson = JSON.parse(grepResult) as any;

											// Check for error in parsed result
											if (parsedJson.error) {
												console.warn(`[VybeLangGraphService] 🔍 ⚠️ Grep tool returned error: ${parsedJson.error}`);
												// Still store it so we can show the error in UI
												fullGrepResultJson = parsedJson;
											} else {
												fullGrepResultJson = parsedJson;
											}
										} catch (e) {
											const errorMsg = e instanceof Error ? e.message : String(e);
											console.error(`[VybeLangGraphService] 🔍 ❌ Failed to parse grep result as JSON:`, errorMsg);
											console.warn(`[VybeLangGraphService] 🔍 Result length: ${grepResult.length}, preview: ${grepResult.substring(0, 500)}`);
											// Set error result
											// eslint-disable-next-line @typescript-eslint/no-explicit-any
											fullGrepResultJson = {
												error: `Failed to parse grep result: ${errorMsg}`,
												matches: [],
												totalMatches: 0,
												fileCount: 0,
												truncated: false
												// eslint-disable-next-line @typescript-eslint/no-explicit-any
											} as any;
										}
									} else if (typeof grepResult === 'object' && grepResult !== null) {
										// Shouldn't happen (IPC returns string), but handle it just in case
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										fullGrepResultJson = grepResult as any;
									} else {
										// Invalid result type
										console.error(`[VybeLangGraphService] 🔍 ❌ Invalid grep result type: ${typeof grepResult}`);
										fullGrepResultJson = {
											error: 'Invalid grep result format',
											matches: [],
											totalMatches: 0,
											fileCount: 0,
											truncated: false
										} as any;
									}


									// Convert to string for result (truncate only the preview, not the full data)
									result = typeof grepResult === 'string' ? grepResult : JSON.stringify(grepResult);

									if (result.length > MAX_TOOL_RESULT_SIZE) {
										console.warn(`[VybeLangGraphService] ⚠️ Truncating large grep result preview from ${result.length} to ${MAX_TOOL_RESULT_SIZE} (full data preserved in fullGrepResultJson)`);
										result = truncateResult(result, MAX_TOOL_RESULT_SIZE);
									}
								} catch (error) {
									const errorMsg = error instanceof Error ? error.message : String(error);
									console.error(`[VybeLangGraphService] ❌ fileService.grep() failed:`, errorMsg);
									// Set error result
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									fullGrepResultJson = {
										error: `Grep execution failed: ${errorMsg}`,
										matches: [],
										totalMatches: 0,
										fileCount: 0,
										truncated: false
									} as any;
									result = JSON.stringify(fullGrepResultJson);
								}
								break;
							case 'list_dir':
								result = await toolContext.fileService.listDir(args.target_directory as string);
								if (result.length > MAX_TOOL_RESULT_SIZE) {
									console.warn(`[VybeLangGraphService] ⚠️ Truncating large list_dir result from ${result.length} to ${MAX_TOOL_RESULT_SIZE}`);
									result = truncateResult(result, MAX_TOOL_RESULT_SIZE);
								}
								break;
							case 'delete_file':
								result = await toolContext.fileService.deleteFile(args.target_file as string);
								if (result.length > MAX_TOOL_RESULT_SIZE) {
									console.warn(`[VybeLangGraphService] ⚠️ Truncating large delete_file result from ${result.length} to ${MAX_TOOL_RESULT_SIZE}`);
									result = truncateResult(result, MAX_TOOL_RESULT_SIZE);
								}
								break;
							case 'run_terminal_cmd':
								result = await toolContext.terminalService.runCommand(
									args.command as string,
									args.is_background as boolean | undefined
								);
								if (result.length > MAX_TOOL_RESULT_SIZE) {
									console.warn(`[VybeLangGraphService] ⚠️ Truncating large terminal result from ${result.length} to ${MAX_TOOL_RESULT_SIZE}`);
									result = truncateResult(result, MAX_TOOL_RESULT_SIZE);
								}
								break;
							case 'codebase_search':
								result = await toolContext.fileService.codebaseSearch(
									args.query as string,
									args.target_directories as string[] | undefined
								);
								if (result.length > MAX_TOOL_RESULT_SIZE) {
									console.warn(`[VybeLangGraphService] ⚠️ Truncating large codebase_search result from ${result.length} to ${MAX_TOOL_RESULT_SIZE}`);
									result = truncateResult(result, MAX_TOOL_RESULT_SIZE);
								}
								break;
							default:
								result = `Unknown tool: ${toolName}`;
						}

						// Emit tool.result event to update UI from "Reading" to "Read"
						// Removed verbose logging

						// For list_dir and grep, parse and send structured data for UI
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						let resultPayload: any = {
							tool_id: toolCallId,
							tool_name: toolName,
							result: result.substring(0, 500), // Preview only for UI
						};

						// CRITICAL: For grep, always initialize grepResults immediately (even before parsing)
						// This ensures it exists in the payload structure from the start
						if (toolName === 'grep') {
							resultPayload.grepResults = [];
							resultPayload.totalMatches = 0;
							resultPayload.truncated = false;
						}

						if (toolName === 'list_dir') {
							try {
								// Try to parse the result as JSON array
								const parsed = typeof result === 'string' ? JSON.parse(result) : result;
								if (Array.isArray(parsed)) {
									resultPayload.fileList = parsed; // Send full array for UI
									// Removed verbose logging
								}
							} catch (parseError) {
								console.warn(`[VybeLangGraphService] ⚠️ Failed to parse list_dir result:`, parseError);
							}
						} else if (toolName === 'grep') {
							// CRITICAL: Ensure grepResults is initialized (should already be done above, but double-check)
							if (!resultPayload.grepResults || !Array.isArray(resultPayload.grepResults)) {
								resultPayload.grepResults = [];
								resultPayload.totalMatches = 0;
								resultPayload.truncated = false;
								console.warn(`[VybeLangGraphService] 🔍 ⚠️ grepResults not pre-initialized, initializing now`);
							}

							try {
								// The tool might return JSON (VS Code search service) or string (fileService.grep())
								// Use fullGrepResultJson if available (object), otherwise parse fullGrepResult or result
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								let parsed: any = null;

								// CRITICAL: Always try to parse from fullGrepResult first (before truncation)
								// This ensures we have access to the complete JSON even if fullGrepResultJson wasn't set
								if (fullGrepResult && typeof fullGrepResult === 'string' && fullGrepResult.trim().startsWith('{')) {
									try {
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										const parsedFromFull = JSON.parse(fullGrepResult) as any;
										if (parsedFromFull && parsedFromFull.matches && Array.isArray(parsedFromFull.matches)) {
											parsed = parsedFromFull;
										}
									} catch (e) {
										console.warn(`[VybeLangGraphService] 🔍 ⚠️ Failed to parse fullGrepResult:`, e instanceof Error ? e.message : String(e));
									}
								}

								// Prefer the full JSON object if we captured it (this is the primary path)
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								if (!parsed && fullGrepResultJson && !(fullGrepResultJson as any).error) {
									parsed = fullGrepResultJson;
								}

								// Validate parsed structure and create grepResults
								if (parsed && typeof parsed === 'object' && !parsed.error) {
									// Directly create grepResults from parsed if it has matches
									if (parsed.matches && Array.isArray(parsed.matches)) {
										if (parsed.matches.length > 0) {
											const fileMap = new Map<string, number>();
											let matchesWithFile = 0;
											let matchesWithoutFile = 0;

											for (const match of parsed.matches) {
												if (match && typeof match === 'object') {
													const filePath = match.file || match.path || '';
													if (filePath && typeof filePath === 'string') {
														fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
														matchesWithFile++;
													} else {
														matchesWithoutFile++;
													}
												}
											}

											console.log(`[VybeLangGraphService] 🔍 Grouped into ${fileMap.size} files (${matchesWithFile} matches with file, ${matchesWithoutFile} without)`);

											if (fileMap.size > 0) {
												resultPayload.grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
													const pathParts = path.split(/[/\\]/);
													return {
														file: pathParts[pathParts.length - 1] || path,
														path: path,
														matchCount: count
													};
												});
												// Use totalMatches from parsed if available, otherwise use matches.length
												resultPayload.totalMatches = typeof parsed.totalMatches === 'number' ? parsed.totalMatches : parsed.matches.length;
												resultPayload.truncated = typeof parsed.truncated === 'boolean' ? parsed.truncated : false;
												console.log(`[VybeLangGraphService] 🔍 ✅ Created grepResults: ${resultPayload.grepResults.length} files, ${resultPayload.totalMatches} total matches`);
											} else {
												// No files found after grouping
												resultPayload.grepResults = [];
												resultPayload.totalMatches = parsed.matches.length;
												resultPayload.truncated = typeof parsed.truncated === 'boolean' ? parsed.truncated : false;
												console.warn(`[VybeLangGraphService] 🔍 ⚠️ No files found after grouping ${parsed.matches.length} matches`);
											}
										} else {
											// Empty matches array - valid result
											resultPayload.grepResults = [];
											resultPayload.totalMatches = 0;
											resultPayload.truncated = typeof parsed.truncated === 'boolean' ? parsed.truncated : false;
											console.log(`[VybeLangGraphService] 🔍 ℹ️ Empty matches array (0 matches)`);
										}
									} else {
										// No matches array in parsed result
										resultPayload.grepResults = [];
										resultPayload.totalMatches = 0;
										resultPayload.truncated = false;
										console.warn(`[VybeLangGraphService] 🔍 ⚠️ No matches array in parsed result. Keys: ${Object.keys(parsed).join(', ')}`);
									}
								}

								// If we still don't have parsed data with matches, try parsing from fullGrepResult or result
								if (!parsed || !parsed.matches || !Array.isArray(parsed.matches)) {
									// Only try fallback if we haven't successfully parsed yet
									if (!parsed) {
										// Fallback: Parse from string (shouldn't happen if IPC works correctly)
										console.log(`[VybeLangGraphService] 🔍 ⚠️ No parsed data yet, will parse string (fullGrepResult length: ${fullGrepResult?.length || 0}, result length: ${result?.length || 0})`);
										const rawResult = fullGrepResult || result;

										// Try parsing as JSON first
										if (typeof rawResult === 'string') {
											// Check if it looks like JSON (might be truncated)
											if (rawResult.trim().startsWith('{') || rawResult.trim().startsWith('[')) {
												try {
													// Try to parse the full result if available, otherwise try truncated
													parsed = JSON.parse(rawResult);
													console.log(`[VybeLangGraphService] 🔍 ✅ Parsed JSON from string: ${parsed.matches?.length || 0} matches`);
												} catch (e) {
													console.warn(`[VybeLangGraphService] 🔍 ⚠️ Failed to parse JSON string:`, e);
													// If truncated JSON, try to extract what we can
													// Look for the matches array in the truncated string
													const matchesMatch = rawResult.match(/"matches"\s*:\s*\[([\s\S]*?)\]/);
													if (matchesMatch) {
														// Try to extract individual match objects
														const fileMap = new Map<string, number>();
														const filePattern = /\{"file":"([^"]+)"/g;
														let fileMatch;
														while ((fileMatch = filePattern.exec(rawResult)) !== null) {
															const filePath = fileMatch[1];
															if (filePath) {
																fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
															}
														}
														if (fileMap.size > 0) {
															resultPayload.grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
																const pathParts = path.split(/[/\\]/);
																return {
																	file: pathParts[pathParts.length - 1] || path,
																	path: path,
																	matchCount: count
																};
															});
															// Try to extract totalMatches and truncated from truncated JSON
															const totalMatchesMatch = rawResult.match(/"totalMatches"\s*:\s*(\d+)/);
															const truncatedMatch = rawResult.match(/"truncated"\s*:\s*(true|false)/);
															if (totalMatchesMatch) {
																resultPayload.totalMatches = parseInt(totalMatchesMatch[1], 10);
															}
															if (truncatedMatch) {
																resultPayload.truncated = truncatedMatch[1] === 'true';
															}
															console.log(`[VybeLangGraphService] 🔍 ✅ Extracted ${resultPayload.grepResults.length} files from truncated JSON`);
														}
													}
												}
											}
										} else if (typeof rawResult === 'object' && rawResult !== null) {
											parsed = rawResult;
										}

										// If we successfully parsed JSON, process it
										if (parsed && parsed.matches && Array.isArray(parsed.matches)) {
											const fileMap = new Map<string, number>();
											for (const match of parsed.matches) {
												if (match && typeof match === 'object') {
													const filePath = match.file || match.path || '';
													if (filePath && typeof filePath === 'string') {
														fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
													}
												}
											}

											if (fileMap.size > 0) {
												resultPayload.grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
													const pathParts = path.split(/[/\\]/);
													return {
														file: pathParts[pathParts.length - 1] || path,
														path: path,
														matchCount: count
													};
												});
												// Use parsed.totalMatches if available, otherwise use matches.length
												resultPayload.totalMatches = typeof parsed.totalMatches === 'number' ? parsed.totalMatches : parsed.matches.length;
												resultPayload.truncated = typeof parsed.truncated === 'boolean' ? parsed.truncated : false;
											} else if (parsed.matches.length === 0) {
												// Empty matches array - valid result
												resultPayload.grepResults = [];
												resultPayload.totalMatches = 0;
												resultPayload.truncated = typeof parsed.truncated === 'boolean' ? parsed.truncated : false;
											} else {
												// Matches exist but no file paths found
												resultPayload.grepResults = [];
												resultPayload.totalMatches = parsed.matches.length;
												resultPayload.truncated = typeof parsed.truncated === 'boolean' ? parsed.truncated : false;
												console.warn(`[VybeLangGraphService] 🔍 ⚠️ No files found in matches array (matches.length=${parsed.matches.length})`);
											}
										} else if (fullGrepResult && typeof fullGrepResult === 'string' && !fullGrepResult.trim().startsWith('{')) {
											// String format from fileService.grep(): "file:line:content\nfile:line:content..."
											const lines = fullGrepResult.split('\n').filter(line => line.trim());
											const fileMap = new Map<string, number>();
											let matchedLines = 0;

											for (const line of lines) {
												const match = line.match(/^(.+?):(\d+):(.+)$/);
												if (match && match[1]) {
													const filePath = match[1];
													fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
													matchedLines++;
												}
											}

											if (fileMap.size > 0) {
												resultPayload.grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
													const pathParts = path.split(/[/\\]/);
													return {
														file: pathParts[pathParts.length - 1] || path,
														path: path,
														matchCount: count
													};
												});
												resultPayload.totalMatches = matchedLines;
												resultPayload.truncated = false;
											} else {
												resultPayload.grepResults = [];
												resultPayload.totalMatches = 0;
												resultPayload.truncated = false;
											}
										} else {
											// No valid result format found
											resultPayload.grepResults = [];
											resultPayload.totalMatches = 0;
											resultPayload.truncated = false;
											console.warn(`[VybeLangGraphService] 🔍 ⚠️ Could not parse grep result - no valid format found`);
										}
									}
								}
							} catch (parseError) {
								console.error(`[VybeLangGraphService] ❌ Failed to parse grep result:`, parseError);
								// On error, ensure empty array is set so frontend knows parsing was attempted
								// CRITICAL: Always ensure these properties exist, even on error
								if (!resultPayload.grepResults || !Array.isArray(resultPayload.grepResults)) {
									resultPayload.grepResults = [];
								}
								if (typeof resultPayload.totalMatches !== 'number') {
									resultPayload.totalMatches = 0;
								}
								if (typeof resultPayload.truncated !== 'boolean') {
									resultPayload.truncated = false;
								}
								console.warn(`[VybeLangGraphService] 🔍 ⚠️ Error fallback: grepResults=${resultPayload.grepResults?.length || 0}, totalMatches=${resultPayload.totalMatches}, truncated=${resultPayload.truncated}`);
							}
						}

						// CRITICAL: Final validation for grep - ensure grepResults is ALWAYS in payload
						if (toolName === 'grep') {
							// Final safety check - ensure grepResults exists and is an array
							if (!resultPayload.grepResults || !Array.isArray(resultPayload.grepResults)) {
								console.error(`[VybeLangGraphService] 🔍 ❌ CRITICAL: grepResults missing or invalid before sending! Setting empty array.`);
								resultPayload.grepResults = [];
							}
							// Validate totalMatches and truncated
							if (typeof resultPayload.totalMatches !== 'number') {
								resultPayload.totalMatches = resultPayload.grepResults.length > 0 ? resultPayload.grepResults.reduce((sum: number, r: { file: string; path: string; matchCount: number }) => sum + (r.matchCount || 0), 0) : 0;
							}
							if (typeof resultPayload.truncated !== 'boolean') {
								resultPayload.truncated = false;
							}

						} else if (toolName === 'codebase_search') {
							// Parse codebase_search results
							try {
								const parsed = typeof result === 'string' ? JSON.parse(result) : result;
								if (parsed && typeof parsed === 'object' && parsed.results && Array.isArray(parsed.results)) {
									// Format results for UI (same structure as search toolType expects)
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									resultPayload.searchResults = parsed.results.map((r: any) => ({
										file: r.file || r.path?.split('/').pop() || '',
										path: r.path || r.file || '',
										lineRange: r.lineRange ? {
											start: r.lineRange.start || r.lineRange.startLineNumber || 1,
											end: r.lineRange.end || r.lineRange.endLineNumber || r.lineRange.start || 1,
										} : undefined,
									}));
									resultPayload.totalResults = parsed.totalResults || parsed.results.length;
								} else {
									resultPayload.searchResults = [];
									resultPayload.totalResults = 0;
									console.warn(`[VybeLangGraphService] 🔍 ⚠️ Invalid codebase_search result structure`);
								}
							} catch (parseError) {
								console.warn(`[VybeLangGraphService] 🔍 ⚠️ Failed to parse codebase_search result:`, parseError);
								resultPayload.searchResults = [];
								resultPayload.totalResults = 0;
							}
						}

						// ABSOLUTE FINAL CHECK: If grepResults is still missing for grep tool, try emergency parsing
						if (toolName === 'grep') {
							const hasGrepResults = resultPayload.grepResults && Array.isArray(resultPayload.grepResults) && resultPayload.grepResults.length > 0;
							if (!hasGrepResults) {
								console.error(`[VybeLangGraphService] 🔍 🚨 EMERGENCY: grepResults missing or empty! Attempting emergency parse...`);
								console.error(`[VybeLangGraphService] 🔍 Emergency context: fullGrepResult=${!!fullGrepResult}, fullGrepResultJson=${!!fullGrepResultJson}, result length=${result?.length || 0}, resultPayload.grepResults=${resultPayload.grepResults ? (Array.isArray(resultPayload.grepResults) ? resultPayload.grepResults.length : 'not array') : 'undefined'}`);

								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								let emergencyParsed: any = null;

								// Try 1: Parse from fullGrepResultJson if available
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								if (fullGrepResultJson && !(fullGrepResultJson as any).error && fullGrepResultJson.matches && Array.isArray(fullGrepResultJson.matches)) {
									emergencyParsed = fullGrepResultJson;
								}
								// Try 2: Parse from fullGrepResult string
								else if (fullGrepResult && typeof fullGrepResult === 'string' && fullGrepResult.trim().startsWith('{')) {
									try {
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										emergencyParsed = JSON.parse(fullGrepResult) as any;
									} catch (e) {
										console.error(`[VybeLangGraphService] 🔍 Emergency: Failed to parse fullGrepResult:`, e);
									}
								}
								// Try 3: Parse from result string (might be truncated, but better than nothing)
								else if (result && typeof result === 'string' && result.trim().startsWith('{')) {
									try {
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										emergencyParsed = JSON.parse(result) as any;
									} catch (e) {
										console.error(`[VybeLangGraphService] 🔍 Emergency: Failed to parse result string:`, e);
									}
								}

								// If we got parsed data, create grepResults
								if (emergencyParsed && emergencyParsed.matches && Array.isArray(emergencyParsed.matches) && emergencyParsed.matches.length > 0) {
									// Group by file
									const fileMap = new Map<string, number>();
									for (const match of emergencyParsed.matches) {
										if (match && typeof match === 'object') {
											const filePath = match.file || match.path || '';
											if (filePath && typeof filePath === 'string') {
												fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
											}
										}
									}
									if (fileMap.size > 0) {
										resultPayload.grepResults = Array.from(fileMap.entries()).map(([path, count]) => {
											const pathParts = path.split(/[/\\]/);
											return {
												file: pathParts[pathParts.length - 1] || path,
												path: path,
												matchCount: count
											};
										});
										resultPayload.totalMatches = typeof emergencyParsed.totalMatches === 'number' ? emergencyParsed.totalMatches : emergencyParsed.matches.length;
										resultPayload.truncated = typeof emergencyParsed.truncated === 'boolean' ? emergencyParsed.truncated : false;
									}
								}

								// If still empty, set empty array so frontend knows
								if (!resultPayload.grepResults || !Array.isArray(resultPayload.grepResults)) {
									resultPayload.grepResults = [];
									resultPayload.totalMatches = 0;
									resultPayload.truncated = false;
									console.error(`[VybeLangGraphService] 🔍 ❌ Emergency parse failed - setting empty array`);
								}
							}
						}

						const executionEndTime = Date.now();
						const executionDuration = executionEndTime - executionStartTime;
						console.log(`[VybeLangGraphService] 🔧 TOOL EXEC SUCCESS: ${toolName} (id: ${toolCallId})`, {
							resultLength: result.length,
							duration: `${executionDuration}ms`,
							timestamp: executionEndTime
						});

						eventHandler({
							type: 'tool.result',
							payload: resultPayload,
							timestamp: Date.now(),
							task_id: taskId,
						});

						// CRITICAL: Ensure we always return a valid string (LangGraph requirement)
						if (!result || typeof result !== 'string') {
							console.error(`[VybeLangGraphService] 🔧 ❌ CRITICAL: Tool ${toolName} returned invalid result type: ${typeof result}`);
							result = `Tool ${toolName} executed but returned invalid result type: ${typeof result}`;
						}

						return result;
					} catch (error) {
						const executionEndTime = Date.now();
						const executionDuration = executionEndTime - executionStartTime;
						const msg = error instanceof Error ? error.message : String(error);
						console.error(`[VybeLangGraphService] 🔧 ❌ TOOL EXEC ERROR: ${toolName} (id: ${toolCallId})`, {
							error: msg,
							duration: `${executionDuration}ms`,
							timestamp: executionEndTime,
							stack: error instanceof Error ? error.stack : undefined
						});

						// Emit tool.error event for UI to display popup
						eventHandler({
							type: 'tool.error',
							payload: {
								tool_name: toolName,
								tool_call_id: toolCallId,
								error: msg,
								code: 'TOOL_EXECUTION_ERROR'
							},
							timestamp: Date.now(),
							task_id: taskId,
						});

						// Emit tool.result even on error to update UI state
						eventHandler({
							type: 'tool.result',
							payload: {
								tool_id: toolCallId,
								tool_name: toolName,
								result: `Error: ${msg}`,
								error: true,
							},
							timestamp: Date.now(),
							task_id: taskId,
						});

						// CRITICAL: Always return a valid string even on error (LangGraph requirement)
						return `Tool execution error: ${msg}`;
					}
				};

				// Chain this execution onto the queue (sequential execution)
				// Create a new promise for THIS specific tool execution
				const thisToolPromise = toolExecutionQueue.then(async () => {
					// Small delay between tools for visual separation (skip for first tool)
					if (myPosition > 1) {
						console.log(`[VybeLangGraphService] ⏳ Waiting ${TOOL_SEQUENTIAL_DELAY_MS}ms before tool ${toolName}`);
						await new Promise(resolve => setTimeout(resolve, TOOL_SEQUENTIAL_DELAY_MS));
					}
					return executeThisTool();
				}).catch(err => {
					// Don't let errors break the queue
					console.error(`[VybeLangGraphService] ❌ Tool ${toolName} failed:`, err);
					return `Error: ${err.message || err}`;
				});

				// Update the queue to include this tool (for the next tool to wait on)
				toolExecutionQueue = thisToolPromise;

				console.log(`[VybeLangGraphService] 📋 Queue updated, returning promise for ${toolName}`);
				// Return this tool's specific promise (not the entire queue)
				return thisToolPromise;
			});
		}

		// Create abort controller
		const abortController = new AbortController();

		// Initialize state with selected model and budget tier
		// Use our AgentMessage format (NOT LangChain HumanMessage)
		const initialState: AgentState = {
			messages: [{ role: 'human', content: goal }],
			model: model, // Use selected model from request
			level: level, // Budget tier (L1/L2/L3)
			toolCallCount: 0,
			turnCount: 0,
			startTime: Date.now(),
			suggestedUpgrade: false,
			filesRead: [],
			filesModified: [],
			toolsUsed: [],
			errors: [],
		};

		// Store active task
		const activeTask: ActiveTask = {
			taskId,
			state: initialState,
			abortController,
			eventHandler,
			toolContext,
			reasoningLevel: finalReasoningLevel,
			checkpointer: this.checkpointer,
		};
		activeTasks.set(taskId, activeTask);

		// Emit start event
		eventHandler({
			type: 'agent.phase',
			payload: { phase: 'planning' },
			timestamp: Date.now(),
			task_id: taskId,
		});

		try {
			// All models use createAgent (GPT, Claude, Gemini)
			const modelId = model || 'azure/gpt-5.2';
			console.log(`[VybeLangGraphService] Using createAgent loop for: ${modelId}`);
			await this.runAgentLoop(activeTask, context);
		} catch (error) {
			if (abortController.signal.aborted) {
				eventHandler({
					type: 'task_complete',
					payload: { status: 'cancelled' },
					timestamp: Date.now(),
					task_id: taskId,
				});
			} else {
				const errorMessage = error instanceof Error ? error.message : String(error);
				eventHandler({
					type: 'error',
					payload: { message: errorMessage, code: 'AGENT_ERROR', recoverable: false },
					timestamp: Date.now(),
					task_id: taskId,
				});
			}
		} finally {
			activeTasks.delete(taskId);
		}
	}

	/**
	 * Create tool error handler middleware that emits error events to UI
	 */
	private createToolErrorHandlerMiddleware(
		eventHandler: (event: LangGraphEvent) => void,
		taskId: string
	): any {
		if (!createMiddleware || !ToolMessage) {
			console.warn('[VybeLangGraphService] createMiddleware or ToolMessage not available, skipping tool error middleware');
			return null;
		}

		return createMiddleware({
			name: 'VybeToolErrorHandler',
			wrapToolCall: async (request: any, handler: any) => {
				try {
					return await handler(request);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					const toolName = request.toolCall?.name || 'unknown';
					const toolCallId = request.toolCall?.id || 'unknown';

					// Emit error event for UI to display
					eventHandler({
						type: 'tool.error',
						payload: {
							tool_name: toolName,
							tool_call_id: toolCallId,
							error: errorMessage,
							code: 'TOOL_EXECUTION_ERROR'
						},
						timestamp: Date.now(),
						task_id: taskId
					});

					// Return ToolMessage to model for retry
					return new ToolMessage({
						content: `Tool error: ${errorMessage}. Please check your input and try again.`,
						tool_call_id: toolCallId,
					});
				}
			},
		});
	}

	/**
	 * Run the agent using LangChain's createAgent with proper streaming.
	 * This is the proper LangChain pattern with ordered event streaming.
	 */
	private async runAgentLoop(
		task: ActiveTask,
		context?: LangGraphTaskRequest['context']
	): Promise<void> {
		const { taskId, state, abortController, eventHandler } = task;

		// Track tool calls from model to match with results
		const toolCallIdMap = new Map<string, { toolName: string; args: Record<string, unknown>; timestamp: number }>();

		// Import budget tier configuration
		const { BUDGET_TIERS } = await import('./vybePromptConfig.js');
		const tier = BUDGET_TIERS[state.level];

		console.log(`[VybeLangGraphService] Starting ${state.level} mode with createAgent: max ${tier.maxToolCalls} tools, ${tier.maxTurns} turns`);

		try {
			// Get the LangChain model
			const modelId = state.model || 'azure/gpt-5.2';

			// Build dynamic system prompt
			const { buildDynamicSystemPrompt } = await import('./vybeDynamicPrompt.js');
			const systemPrompt = buildDynamicSystemPrompt({
				level: state.level,
				context: context || {},
				toolCallCount: state.toolCallCount,
				turnCount: state.turnCount,
				messageCount: state.messages.length,
				modelName: modelId,
			});
			const reasoningLevel = task.reasoningLevel || 'medium';
			console.log(`[VybeLangGraphService] ===== MODEL SELECTION =====`);
			console.log(`[VybeLangGraphService] Requested model ID: ${modelId}`);
			console.log(`[VybeLangGraphService] Reasoning level: ${reasoningLevel}`);
			console.log(`[VybeLangGraphService] State model: ${state.model || 'undefined (using default)'}`);
			console.log(`[VybeLangGraphService] Task ID: ${taskId}`);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let model: any;
			try {
				model = this.createLangChainModel(modelId, reasoningLevel);
			} catch (modelError) {
				const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
				console.error(`[VybeLangGraphService] Error creating model ${modelId}:`, errorMsg);
				throw new Error(`Failed to create model ${modelId}: ${errorMsg}`);
			}

			if (!model) {
				throw new Error(`No LangChain adapter available for model: ${modelId}`);
			}

			// Log the actual model instance details
			console.log(`[VybeLangGraphService] Model created successfully`);
			console.log(`[VybeLangGraphService] Model type: ${model.constructor?.name || 'unknown'}`);
			if (model.model) {
				console.log(`[VybeLangGraphService] Model.model property: ${model.model}`);
			}
			if (model.modelName) {
				console.log(`[VybeLangGraphService] Model.modelName property: ${model.modelName}`);
			}
			console.log(`[VybeLangGraphService] ============================`);

			// Get or create LangChain tools (always recreate to ensure latest tools are included)
			langchainTools = createLangChainTools();
			const toolNames = langchainTools.map((t: any) => t.name || 'unknown').join(', ');
			console.log('[VybeLangGraphService] Created', langchainTools.length, 'LangChain tools:', toolNames);
			console.log('[VybeLangGraphService] ✅ codebase_search tool included:', langchainTools.some((t: any) => t.name === 'codebase_search'));

			// Parse reasoning level from modelId for direct streaming
			// NOTE: parseReasoningLevel is only used for Gemini thinking detection
			// For Azure/OpenAI models, reasoning level comes from task.reasoningLevel, not modelId
			const { baseModelId: directBaseModelId, reasoningLevel: directReasoningLevel } = this.parseReasoningLevel(modelId);

			// For non-Gemini models, use the actual reasoning level from the task
			const actualReasoningLevel = task.reasoningLevel || directReasoningLevel;

			// Check if this is a Gemini model that supports thinking
			// CRITICAL: Only check for Gemini models, not Ollama or other providers
			const isGeminiModel = directBaseModelId.startsWith('gemini') || directBaseModelId.includes('gemini-');
			const supportsThinking = isGeminiModel && (
				directBaseModelId.includes('gemini-2.5') ||
				directBaseModelId.includes('gemini-3-pro') ||
				directBaseModelId.includes('gemini-3-flash')
			);

			console.log(`[VybeLangGraphService] ===== THINKING CHECK =====`);
			console.log(`[VybeLangGraphService] Model: ${modelId}, BaseModel: ${directBaseModelId}, ParsedReasoningLevel: ${directReasoningLevel}, ActualReasoningLevel: ${actualReasoningLevel}`);
			console.log(`[VybeLangGraphService] Is Gemini model: ${isGeminiModel}`);
			console.log(`[VybeLangGraphService] Supports thinking: ${supportsThinking}`);
			console.log(`[VybeLangGraphService] GoogleGenAI loaded: ${!!GoogleGenAI}`);

			const isGeminiThinking = isGeminiModel && GoogleGenAI && supportsThinking;

			// For Gemini models with thinking support, we use DIRECT Google SDK streaming
			// This is because LangChain's ChatGoogleGenerativeAI doesn't expose thinking content
			// HYBRID FLOW: Use direct streaming for text/thinking, fall back to LangGraph for tool execution
			if (isGeminiThinking) {
				console.log(`[VybeLangGraphService] ✅ Using DIRECT Google SDK streaming for ${directBaseModelId} (thinking support)`);
				const apiKeys = this.getApiKeys();

				if (apiKeys.gemini) {
					let needsToolExecution = false;
					let detectedToolCall: { name: string; args: Record<string, unknown>; id: string } | null = null;

					try {
						// Stream directly with Google SDK to get thinking
						const thinkingBudget = directBaseModelId.includes('2.5-pro') ? 128 : 1024;
						const userMessage = state.messages[0]?.content || '';

						for await (const chunk of streamGeminiDirect(
							apiKeys.gemini,
							directBaseModelId, // Use base model ID for API call
							[{ role: 'user', content: userMessage }],
							systemPrompt,
							thinkingBudget
						)) {
							if (abortController.signal.aborted) {
								console.log('[VybeLangGraphService] Direct stream aborted');
								break;
							}

							if (chunk.type === 'thinking') {
								console.log(`[VybeLangGraphService] 📤 EMITTING token (thinking): ${chunk.content.length} chars`);
								eventHandler({
									type: 'token',
									payload: { thinking: chunk.content },
									timestamp: Date.now(),
									task_id: taskId,
								});
							} else if (chunk.type === 'text') {
								console.log(`[VybeLangGraphService] 📤 EMITTING token (text): ${chunk.content.length} chars`);
								eventHandler({
									type: 'token',
									payload: { content: chunk.content },
									timestamp: Date.now(),
									task_id: taskId,
								});
							} else if (chunk.type === 'tool_call' && chunk.toolCall) {
								// Tool call detected - flag for LangGraph execution
								console.log(`[VybeLangGraphService] Tool call detected in direct stream: ${chunk.toolCall.name}`);
								needsToolExecution = true;
								detectedToolCall = chunk.toolCall;

								// Emit the tool call as token event
								console.log(`[VybeLangGraphService] 🔧 EMITTING tool call (direct stream): ${chunk.toolCall.name} (id: ${chunk.toolCall.id})`);
								eventHandler({
									type: 'token',
									payload: {
										content: '',
										tool_call: {
											id: chunk.toolCall.id,
											name: chunk.toolCall.name,
											args: JSON.stringify(chunk.toolCall.args),
										},
									},
									timestamp: Date.now(),
									task_id: taskId,
								});
								console.log(`[VybeLangGraphService] ✅ Tool call event emitted (direct stream)`);
							} else if (chunk.type === 'done') {
								console.log(`[VybeLangGraphService] Direct streaming complete`);
							}
						}

						// If a tool call was detected, we need to execute it via LangGraph
						if (needsToolExecution && detectedToolCall) {
							console.log(`[VybeLangGraphService] Tool call detected, executing via LangGraph: ${detectedToolCall.name}`);

							// Execute the tool directly
							if (requestToolExecution) {
								try {
									const toolResult = await requestToolExecution(detectedToolCall.name, detectedToolCall.args);

									// Emit tool result
									eventHandler({
										type: 'tool.result',
										payload: {
											tool_id: detectedToolCall.id,
											tool_name: detectedToolCall.name,
											result: toolResult,
										},
										timestamp: Date.now(),
										task_id: taskId,
									});

									console.log(`[VybeLangGraphService] Tool executed, result length: ${toolResult.length}`);
								} catch (toolError) {
									console.error(`[VybeLangGraphService] Tool execution error:`, toolError);
									eventHandler({
										type: 'tool.result',
										payload: {
											tool_id: detectedToolCall.id,
											tool_name: detectedToolCall.name,
											error: toolError instanceof Error ? toolError.message : String(toolError),
										},
										timestamp: Date.now(),
										task_id: taskId,
									});
								}
							}
						}

						// Emit complete
						eventHandler({
							type: 'complete',
							payload: { status: 'success' },
							timestamp: Date.now(),
							task_id: taskId,
						});
						return; // Exit after direct streaming
					} catch (directError) {
						console.error('[VybeLangGraphService] Direct streaming failed, falling back to LangChain:', directError);
						// Fall through to LangChain streaming
					}
				}
			}

			// Create the ReAct agent with LangChain's createAgent
			// Build middleware array
			const middleware: any[] = [];

			// Add tool error handler middleware
			const toolErrorMiddleware = this.createToolErrorHandlerMiddleware(eventHandler, taskId);
			if (toolErrorMiddleware) {
				middleware.push(toolErrorMiddleware);
			}

			const agent = createAgent({
				model: model,
				tools: langchainTools,
				checkpointer: this.checkpointer, // renamed from checkpointSaver
				systemPrompt: systemPrompt, // moved from inputMessages
				middleware: middleware.length > 0 ? middleware : undefined,
			});

			// Create the initial messages (systemPrompt is now in agent config)
			const inputMessages = [
				new HumanMessage(state.messages[0]?.content || ''),
			];

			// Thread config for checkpointing
			const config = {
				configurable: {
					thread_id: taskId,
				},
				// Increased from 2x to 4x for complex multi-tool tasks
				// L1: 20, L2: 60, L3: 200
				recursionLimit: tier.maxTurns * 4,
			};

			console.log(`[VybeLangGraphService] ===== NATIVE STREAMING STARTED =====`);
			console.log(`[VybeLangGraphService] Using agent.stream() with streamMode: "messages"`);
			console.log(`[VybeLangGraphService] Using createAgent (LangChain v1)`);
			console.log(`[VybeLangGraphService] Model: ${modelId}`);
			console.log(`[VybeLangGraphService] Task ID: ${taskId}`);

			// Use agent.stream() with streamMode: "messages" for native LangGraph streaming
			// This returns [token, metadata] tuples where token is an AIMessageChunk
			const stream = await agent.stream(
				{ messages: inputMessages },
				{ ...config, streamMode: 'messages' as const }
			);

			let pendingToolApproval = false;
			let totalTokens = 0;
			// Track emitted content to prevent duplicates - simpler than delta calculation
			const emittedContentSet = new Set<string>();
			let lastEmittedContent = ''; // For delta calculation from cumulative chunks

			// NEW: Track summaries by index (structured approach)
			const summaryByIndex = new Map<number, string>(); // Accumulate summaries by index
			const emittedSummaryIndices = new Set<number>(); // Track which summary indices we've emitted

			// DEPRECATED: Keep for backward compatibility with Anthropic thinking
			let accumulatedReasoning = ''; // Accumulate reasoning summaries across chunks
			let lastEmittedReasoning = ''; // Track last emitted reasoning to detect new reasoning parts
			let currentReasoningPart = ''; // Track current reasoning part being built

			for await (const [token] of stream) {
				if (abortController.signal.aborted) {
					console.log('[VybeLangGraphService] Stream aborted');
					break;
				}

				totalTokens++;

				// Check if this is an AI message chunk
				if (isAIMessageChunk && isAIMessageChunk(token)) {

					// Handle complete tool calls (not chunks - chunks are partial)
					// Note: Tool call events are emitted from setToolExecutor when tools are actually executed
					// We check both tool_calls (complete) and tool_call_chunks (partial) but only track complete ones
					const completeToolCalls = token.tool_calls || [];
					const hasCompleteToolCalls = completeToolCalls.length > 0;

					// Also check if we have complete tool calls in chunks (when all chunks are assembled)
					let completeToolCallsFromChunks: Array<{ name: string; args: Record<string, unknown>; id: string }> = [];
					if (token.tool_call_chunks && token.tool_call_chunks.length > 0) {
						// Group chunks by ID and check if any are complete (have both name and id)
						const chunksById = new Map<string, { name: string; args: Record<string, unknown>; id: string }>();
						for (const tc of token.tool_call_chunks) {
							const chunkId = tc.id;
							if (chunkId && tc.name) {
								// This is a complete chunk - has both id and name
								chunksById.set(chunkId, {
									name: tc.name,
									args: typeof tc.args === 'object' ? tc.args : {},
									id: chunkId
								});
							}
						}
						completeToolCallsFromChunks = Array.from(chunksById.values());
					}

					if (hasCompleteToolCalls || completeToolCallsFromChunks.length > 0) {
						const allCompleteToolCalls = hasCompleteToolCalls ? completeToolCalls : completeToolCallsFromChunks;
						console.log(`[VybeLangGraphService] 🔧 MODEL TOOL CALLS RECEIVED: ${allCompleteToolCalls.length} complete tool call(s)`);

						// CRITICAL: Emit current reasoning part as complete BEFORE resetting
						// This ensures the frontend finalizes the thinking block before tool calls
						// New reasoning after tools will go to a new thinking block
						if (currentReasoningPart.length > 0 && currentReasoningPart !== lastEmittedReasoning) {
							eventHandler({
								type: 'token',
								payload: {
									thinking: currentReasoningPart, // Emit complete current part
								},
								timestamp: Date.now(),
								task_id: taskId,
							});
							lastEmittedReasoning = currentReasoningPart;
						}

						// Reset content tracking when tool call happens (new markdown block will start after)
						lastEmittedContent = '';
						// CRITICAL: Reset reasoning tracking when tool call happens - next reasoning will be a new part
						// NEW: Clear structured summary tracking
						summaryByIndex.clear();
						emittedSummaryIndices.clear();
						// DEPRECATED: Keep for backward compatibility
						accumulatedReasoning = '';
						lastEmittedReasoning = '';
						currentReasoningPart = '';
						emittedContentSet.clear(); // Clear emitted content set for new block

						for (const tc of allCompleteToolCalls) {
							const toolName = tc.name || '';
							const modelToolCallId = tc.id || 'undefined';

							// Validate that we have both name and id, and args is a valid object
							const hasValidArgs = tc.args && typeof tc.args === 'object' && Object.keys(tc.args).length > 0;
							const isValidToolCall = modelToolCallId !== 'undefined' && toolName && hasValidArgs;

							if (!isValidToolCall) {
								console.log(`[VybeLangGraphService] 🔧 ⚠️ Skipping incomplete tool call: name=${toolName}, id=${modelToolCallId}, hasValidArgs=${hasValidArgs}`);
								continue; // Skip incomplete tool calls
							}

							console.log(`[VybeLangGraphService] 🔧 MODEL TOOL CALL: name=${toolName}, id=${modelToolCallId}`, {
								args: typeof tc.args === 'object' ? JSON.stringify(tc.args).substring(0, 200) : String(tc.args).substring(0, 200),
								timestamp: Date.now()
							});

							// Track tool call from model (only if we have a valid ID, name, and args)
							toolCallIdMap.set(modelToolCallId, {
								toolName,
								args: typeof tc.args === 'object' ? tc.args : {},
								timestamp: Date.now()
							});

							// Check if tool requires approval
							if (toolName && TOOLS_REQUIRING_APPROVAL.includes(toolName)) {
								pendingToolApproval = true;
								state.pendingApproval = {
									tool: toolName,
									args: typeof tc.args === 'object' ? tc.args : {},
									toolCallId: modelToolCallId,
								};
							}
						}
					}

					// Handle text content and extract thinking/reasoning
					const content = token.content;
					if (content) {
						// Use extractThinkingContent for comprehensive thinking extraction
						// This handles both OpenAI reasoning tokens and Anthropic thinking blocks
						const { thinking, thinkingSummaries, content: textContent } = this.extractThinkingContent(token);

						// NEW: Use structured summaries if available (OpenAI Responses API)
						// LangChain converts response.reasoning_summary_text.delta events to summary items
						// Each delta event creates a summary array with one item containing the delta text
						// We accumulate these deltas by summary_index on the frontend
						if (thinkingSummaries && thinkingSummaries.length > 0) {
							for (const summaryItem of thinkingSummaries) {
								const index = summaryItem.index;
								const text = summaryItem.text || '';

								// Emit delta - each summaryItem.text is a delta from response.reasoning_summary_text.delta
								// Frontend accumulates these deltas by summaryIndex
								if (text.length > 0) {
									const isNewSummary = !emittedSummaryIndices.has(index);
									if (isNewSummary) {
										emittedSummaryIndices.add(index);
									}

									eventHandler({
										type: 'token',
										payload: {
											thinking: text, // Delta from response.reasoning_summary_text.delta event
											summaryIndex: index, // From event.summary_index
											isNewSummary: isNewSummary, // First time seeing this summary_index
										},
										timestamp: Date.now(),
										task_id: taskId,
									});
								}
							}
						}
						// DEPRECATED: Fallback to text-based approach for Anthropic thinking (backward compatibility)
						else if (thinking) {
							// CRITICAL: If reasoning tracking was reset (after tool call), this is definitely a new part
							const isAfterToolCall = accumulatedReasoning.length === 0 && currentReasoningPart.length === 0;

							// Check if this is a continuation of the current reasoning part or a new one
							// Reasoning summaries are cumulative within a part, but new parts start fresh
							// If the new thinking doesn't start with the accumulated reasoning, it's a new part
							const isNewReasoningPart = !isAfterToolCall && accumulatedReasoning.length > 0 &&
								!thinking.startsWith(accumulatedReasoning) &&
								!accumulatedReasoning.endsWith(thinking.substring(0, Math.min(thinking.length, accumulatedReasoning.length)));

							// Also check if thinking starts with a title pattern (new reasoning part indicator)
							const hasTitlePattern = /^\s*\*\*[^*]+\*\*/.test(thinking.trim());
							const isNewPartByTitle = hasTitlePattern && accumulatedReasoning.length > 0;

							if (isAfterToolCall || isNewReasoningPart || isNewPartByTitle) {
								// This is a new reasoning part - emit the previous part if it exists, then start new
								if (currentReasoningPart.length > 0 && currentReasoningPart !== lastEmittedReasoning) {
									console.log(`[VybeLangGraphService] ✅ Emitting complete reasoning part 1: ${currentReasoningPart.length} chars`);
									eventHandler({
										type: 'token',
										payload: {
											thinking: currentReasoningPart, // Emit complete previous part
										},
										timestamp: Date.now(),
										task_id: taskId,
									});
									lastEmittedReasoning = currentReasoningPart;
								}
								// Start new reasoning part
								currentReasoningPart = thinking;
								accumulatedReasoning = thinking;
								console.log(`[VybeLangGraphService] ✅ Starting new reasoning part: ${thinking.length} chars${isAfterToolCall ? ' (after tool call)' : ''}`);

								// CRITICAL: Emit the first chunk of the new reasoning part immediately
								// This ensures the frontend creates a new thinking block right away
								eventHandler({
									type: 'token',
									payload: {
										thinking: thinking, // Emit full content of new part (frontend will detect it's a new part by title pattern)
									},
									timestamp: Date.now(),
									task_id: taskId,
								});
							} else {
								// This is a continuation of the current reasoning part
								// Calculate delta: new content = current thinking - accumulated reasoning
								let reasoningDelta = thinking;
								if (thinking.startsWith(accumulatedReasoning)) {
									// Thinking is cumulative - extract delta
									reasoningDelta = thinking.slice(accumulatedReasoning.length);
								} else if (accumulatedReasoning.length > 0) {
									// Check if this is a true continuation (new text appended)
									// If accumulated reasoning is at the start of thinking, it's cumulative
									if (thinking.length > accumulatedReasoning.length) {
										reasoningDelta = thinking.slice(accumulatedReasoning.length);
									}
								}

								if (reasoningDelta.length > 0) {
									currentReasoningPart += reasoningDelta;
									accumulatedReasoning = thinking; // Update accumulated to match current thinking
									console.log(`[VybeLangGraphService] ✅ Emitting reasoning delta: ${reasoningDelta.length} chars (part total: ${currentReasoningPart.length} chars)`);
									eventHandler({
										type: 'token',
										payload: {
											thinking: reasoningDelta, // Emit delta for current part
										},
										timestamp: Date.now(),
										task_id: taskId,
									});
								}
							}
						}

						// Emit text content - calculate delta from cumulative content
						if (textContent) {
							// AIMessageChunk.content is CUMULATIVE (full content each time)
							// Calculate delta: new portion = current - previous
							// Use raw textContent for delta calculation to preserve exact content
							let deltaContent = textContent;
							if (lastEmittedContent && lastEmittedContent.length > 0) {
								// Check if current content starts with previous (cumulative check)
								// Use exact string match to avoid slicing at wrong positions
								if (textContent.startsWith(lastEmittedContent)) {
									// Content is cumulative - extract only the new portion
									deltaContent = textContent.slice(lastEmittedContent.length);
								} else {
									// Content doesn't start with previous - might be a new block or reset
									// This can happen if content format changed or provider sent non-cumulative chunks
									// Emit the full content to ensure nothing is lost
									console.log(`[VybeLangGraphService] ⚠️ Content doesn't continue previous (prev: ${lastEmittedContent.length} chars, new: ${textContent.length} chars)`);
									deltaContent = textContent;
									// Reset tracking for new block
									lastEmittedContent = '';
									emittedContentSet.clear();
								}
							}

							// Only emit if there's new content
							if (deltaContent.length > 0) {
								// Check for exact duplicate - but be less aggressive
								// Only skip if we've seen this EXACT cumulative content before
								// This prevents the same cumulative content from being emitted twice
								if (emittedContentSet.has(textContent)) {
									// Exact duplicate - skip but update tracking
									console.log(`[VybeLangGraphService] 🚫 Skipping exact duplicate (${textContent.length} chars)`);
									lastEmittedContent = textContent;
									continue;
								}

								console.log(`[VybeLangGraphService] ✅ Emitting delta: ${deltaContent.length} chars, cumulative: ${textContent.length} chars`);
								eventHandler({
									type: 'token',
									payload: { content: deltaContent },
									timestamp: Date.now(),
									task_id: taskId,
								});

								// Track the full cumulative content to prevent duplicates
								// Use raw content for tracking to match delta calculation
								emittedContentSet.add(textContent);
								lastEmittedContent = textContent;
							} else {
								// Track even empty deltas to prevent duplicates
								emittedContentSet.add(textContent);
								lastEmittedContent = textContent;
							}
						}
					}
				} else {
					// Log non-AI message types for debugging
					const tokenType = token?.constructor?.name || typeof token;
					const tokenAny = token as any;

					// Check if this might be a tool call in a different format
					if (tokenAny.tool_calls || tokenAny.tool_call || tokenAny.name) {
						console.log(`[VybeLangGraphService] 🔧 Potential tool call in non-AI token (${tokenType}):`, {
							hasToolCalls: !!tokenAny.tool_calls,
							hasToolCall: !!tokenAny.tool_call,
							hasName: !!tokenAny.name,
							keys: Object.keys(tokenAny || {}).slice(0, 10)
						});
					}

					if (totalTokens <= 20) {
						console.log(`[VybeLangGraphService] Non-AI token type: ${tokenType}, keys: ${Object.keys(tokenAny || {}).slice(0, 10).join(', ')}`);
					}

					// Check if this is a complete AIMessage (not a chunk)
					// ROOT CAUSE FIX: LangGraph sends both AIMessageChunk (during streaming) AND a final AIMessage (at end)
					// The final AIMessage contains the same content that was already streamed in chunks
					// PRODUCTION SOLUTION: Skip content from complete AIMessage - it's redundant
					// Only process thinking content (which might only appear in complete message for some providers)
					if (tokenType === 'AIMessage') {
						// Extract thinking content from complete messages (for OpenAI reasoning tokens)
						// This is the ONLY thing we should process from complete messages
						const { thinking, thinkingSummaries, content: textContent } = this.extractThinkingContent(tokenAny);

						// NEW: Use structured summaries if available
						if (thinkingSummaries && thinkingSummaries.length > 0) {
							for (const summaryItem of thinkingSummaries) {
								const index = summaryItem.index;
								const text = summaryItem.text || '';

								// Always emit delta (not full accumulated content)
								// Frontend will handle accumulation
								if (text.length > 0) {
									const isNewSummary = !emittedSummaryIndices.has(index);
									if (isNewSummary) {
										emittedSummaryIndices.add(index);
									}

									eventHandler({
										type: 'token',
										payload: {
											thinking: text, // Always delta
											summaryIndex: index,
											isNewSummary: isNewSummary, // Flag for frontend
										},
										timestamp: Date.now(),
										task_id: taskId,
									});
								}
							}
						}
						// DEPRECATED: Fallback to text-based approach for Anthropic
						else if (thinking) {
							// Check if this is a new reasoning part or continuation
							const isNewReasoningPart = accumulatedReasoning.length > 0 &&
								!thinking.startsWith(accumulatedReasoning) &&
								!accumulatedReasoning.endsWith(thinking.substring(0, Math.min(thinking.length, accumulatedReasoning.length)));
							const hasTitlePattern = /^\s*\*\*[^*]+\*\*/.test(thinking.trim());
							const isNewPartByTitle = hasTitlePattern && accumulatedReasoning.length > 0;

							if (isNewReasoningPart || isNewPartByTitle) {
								// Emit previous part if exists
								if (currentReasoningPart.length > 0 && currentReasoningPart !== lastEmittedReasoning) {
									console.log(`[VybeLangGraphService] ✅ Emitting complete reasoning part from AIMessage: ${currentReasoningPart.length} chars`);
									eventHandler({
										type: 'token',
										payload: { thinking: currentReasoningPart },
										timestamp: Date.now(),
										task_id: taskId,
									});
									lastEmittedReasoning = currentReasoningPart;
								}
								// Start new part
								currentReasoningPart = thinking;
								accumulatedReasoning = thinking;
							} else {
								// Continuation - update current part
								if (thinking.startsWith(accumulatedReasoning)) {
									const delta = thinking.slice(accumulatedReasoning.length);
									if (delta.length > 0) {
										currentReasoningPart += delta;
									}
								} else if (thinking.length > accumulatedReasoning.length) {
									const delta = thinking.slice(accumulatedReasoning.length);
									if (delta.length > 0) {
										currentReasoningPart += delta;
									}
								}
								accumulatedReasoning = thinking;
							}

							// Emit the final reasoning part if it hasn't been emitted
							if (currentReasoningPart.length > 0 && currentReasoningPart !== lastEmittedReasoning) {
								console.log(`[VybeLangGraphService] ✅ Emitting final reasoning part from AIMessage: ${currentReasoningPart.length} chars`);
								eventHandler({
									type: 'token',
									payload: { thinking: currentReasoningPart },
									timestamp: Date.now(),
									task_id: taskId,
								});
							}

							// CRITICAL: Skip text content from complete AIMessage
							// LangGraph's design sends the same content twice:
							// 1. During streaming: AIMessageChunk tokens (cumulative content) - we process these
							// 2. At end: Complete AIMessage (same cumulative content) - we SKIP this to prevent duplicates
							if (textContent) {
								const normalizedContent = textContent.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
								const wasEmitted = emittedContentSet.has(normalizedContent) ||
									Array.from(emittedContentSet).some(emitted =>
										normalizedContent.length > 20 && (
											emitted === normalizedContent ||
											emitted.includes(normalizedContent) ||
											normalizedContent.includes(emitted)
										)
									);

								if (wasEmitted) {
									console.log(`[VybeLangGraphService] 🚫 Complete AIMessage: SKIPPING redundant content (already streamed in chunks, ${textContent.length} chars)`);
									// Content was already emitted from chunks - skip it
								} else {
									// Edge case: Content wasn't in chunks (shouldn't happen, but handle gracefully)
									console.log(`[VybeLangGraphService] ⚠️ Complete AIMessage: Content NOT in Set (${textContent.length} chars) - this shouldn't happen`);
									// Still skip it - if it wasn't in chunks, it means it's new content that will come in chunks
									// OR it's a different message entirely (which would be a new block anyway)
								}
							}
							if (tokenAny.tool_calls && tokenAny.tool_calls.length > 0) {
								console.log(`[VybeLangGraphService] 🔧 Found complete AIMessage with ${tokenAny.tool_calls.length} tool call(s) - will be emitted from executor`);
								// Reset content tracking when tool call happens (new markdown block will start after)
								lastEmittedContent = '';
								// CRITICAL: Reset reasoning tracking when tool call happens - next reasoning will be a new part
								accumulatedReasoning = '';
								lastEmittedReasoning = '';
								currentReasoningPart = '';
								emittedContentSet.clear(); // Clear emitted content set for new block
							}
						}
					}

					// Log ToolMessage content for debugging
					// NOTE: We no longer emit tool.call from ToolMessage - it's now emitted from the executor
					// where we have the actual args. This prevents duplicate events.
					if (tokenType === 'ToolMessage' && token.content) {
						const content = typeof token.content === 'string' ? token.content : JSON.stringify(token.content);
						const toolCallId = token.tool_call_id || 'undefined';
						const trackedCall = toolCallId !== 'undefined' ? toolCallIdMap.get(toolCallId) : undefined;
						console.log(`[VybeLangGraphService] 🔧 TOOL MESSAGE RECEIVED: ${token.name}`, {
							tool_call_id: toolCallId,
							contentLength: content.length,
							contentPreview: content.substring(0, 200),
							wasTracked: !!trackedCall,
							trackedToolName: trackedCall?.toolName,
							timestamp: Date.now()
						});

						// Remove from tracking map once we receive the result
						if (toolCallId !== 'undefined') {
							toolCallIdMap.delete(toolCallId);
						}
					}
				}
			}

			// Emit final reasoning part if it hasn't been emitted yet
			if (currentReasoningPart.length > 0 && currentReasoningPart !== lastEmittedReasoning) {
				console.log(`[VybeLangGraphService] ✅ Emitting final reasoning part after stream: ${currentReasoningPart.length} chars`);
				eventHandler({
					type: 'token',
					payload: {
						thinking: currentReasoningPart, // Emit complete final part
					},
					timestamp: Date.now(),
					task_id: taskId,
				});
			}

			console.log(`[VybeLangGraphService] ===== STREAMING COMPLETE =====`);
			console.log(`[VybeLangGraphService] Total tokens: ${totalTokens}`);

			// Emit complete event
			if (!pendingToolApproval) {
				eventHandler({
					type: 'complete',
					payload: { status: 'success' },
					timestamp: Date.now(),
					task_id: taskId,
				});
			}

			// NOTE: Legacy streamEvents code removed - now using agent.stream() with streamMode: "messages"

			// If we have pending approval, we'll resume later via resumeWithApproval
			if (pendingToolApproval) {
				console.log('[VybeLangGraphService] Waiting for tool approval...');
				return;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			console.error('[VybeLangGraphService] 🔧 ❌ AGENT ERROR:', errorMessage, {
				stack: errorStack,
				remainingToolCalls: Array.from(toolCallIdMap.entries()).map(([id, info]) => ({
					id,
					toolName: info.toolName,
					age: Date.now() - info.timestamp
				})),
				timestamp: Date.now()
			});

			// Log any untracked tool calls (these might be causing the "No tool output found" error)
			if (toolCallIdMap.size > 0) {
				console.error('[VybeLangGraphService] 🔧 ⚠️ UNTRACKED TOOL CALLS (no result received):',
					Array.from(toolCallIdMap.entries()).map(([id, info]) => `${info.toolName} (${id})`).join(', '));
			}

			eventHandler({
				type: 'error',
				payload: { message: errorMessage, code: 'AGENT_ERROR', recoverable: false },
				timestamp: Date.now(),
				task_id: taskId,
			});

			eventHandler({
				type: 'complete',
				payload: { status: 'failed', summary: errorMessage },
				timestamp: Date.now(),
				task_id: taskId,
			});
		}
	}

	// Note: getModelWithTools and callLLMWithStreaming were replaced by createAgent.stream()
	// The new approach uses LangGraph's native streaming (agent.stream() with streamMode: "messages")

	/**
	 * Create the appropriate LangChain model based on model ID.
	 * Uses the LangChain adapters we installed via npm.
	 */
	/**
	 * Parse reasoning level from model ID (e.g., "openai/gpt-5.2-high" -> "high")
	 * Returns the reasoning level and the base model ID without the reasoning suffix
	 */
	private parseReasoningLevel(modelId: string): { baseModelId: string; reasoningLevel: string | null } {
		// Check for reasoning level suffixes: -xhigh, -high, -medium, -low
		const reasoningPatterns = ['-xhigh', '-high', '-medium', '-low'];
		for (const pattern of reasoningPatterns) {
			if (modelId.endsWith(pattern)) {
				const baseModelId = modelId.slice(0, -pattern.length);
				const reasoningLevel = pattern.slice(1); // Remove leading dash
				return { baseModelId, reasoningLevel };
			}
		}
		return { baseModelId: modelId, reasoningLevel: null };
	}

	private createLangChainModel(modelId: string, reasoningLevel: 'low' | 'medium' | 'high' | 'xhigh' = 'medium'): any {
		// Parse provider from model ID (no longer parsing reasoning from modelId)
		const provider = this.parseProvider(modelId);
		const baseModelId = modelId; // Model ID is now clean, no reasoning suffix
		console.log(`[VybeLangGraphService] createLangChainModel: modelId=${modelId}, reasoningLevel=${reasoningLevel}, provider=${provider}`);

		// Get API key from settings (stored in our settings system)
		// For now, use environment variables as fallback
		const apiKeys = this.getApiKeys();

		switch (provider) {
			case 'gemini':
				console.log(`[VybeLangGraphService] Gemini check: adapter=${!!ChatGoogleGenerativeAI}, hasKey=${!!apiKeys.gemini}`);
				if (ChatGoogleGenerativeAI && apiKeys.gemini) {
					console.log(`[VybeLangGraphService] Creating ChatGoogleGenerativeAI for: ${baseModelId}`);
					// Check if model supports thinking
					// Gemini 2.5 Flash, 2.5 Pro, and 3.0 models all support thinking
					const supportsThinking = baseModelId.includes('2.5-pro') ||
						baseModelId.includes('2.5-flash') ||
						baseModelId.includes('3-pro') ||
						baseModelId.includes('3-flash');

					const modelConfig: any = {
						model: baseModelId, // Use base model ID for API call
						apiKey: apiKeys.gemini,
						streaming: true, // Ensure streaming is enabled
					};

					// Enable thinking mode for models that support it
					// CRITICAL: We need BOTH thinking_budget AND include_thoughts
					// - thinking_budget: Controls token usage (0=disable, -1=dynamic, positive=fixed)
					//   - For 2.5-pro: minimum is 128, can't disable
					//   - For 2.5-flash and 3.0: can use any budget including 0 to disable
					// - include_thoughts: Includes thought summaries in the response (REQUIRED to see thinking!)
					//   When include_thoughts=True, content should be an ARRAY, not a string!
					if (supportsThinking) {
						// Determine thinking config based on model version and reasoning level
						const isGemini3 = baseModelId.includes('3-pro') || baseModelId.includes('3-flash');

						if (isGemini3) {
							// Gemini 3.x uses thinkingLevel: 'HIGH' | 'MEDIUM' | 'LOW'
							let thinkingLevelValue = 'HIGH'; // Default
							if (reasoningLevel === 'high') {
								thinkingLevelValue = 'HIGH';
							} else if (reasoningLevel === 'medium') {
								thinkingLevelValue = 'MEDIUM';
							} else if (reasoningLevel === 'low') {
								thinkingLevelValue = 'LOW';
							}

							modelConfig.thinkingLevel = thinkingLevelValue;
							modelConfig.include_thoughts = true;
							modelConfig.includeThoughts = true;

							// Try outputVersion parameter - some LangChain versions need this for thinking
							modelConfig.outputVersion = 'v1';

							// Also try passing via generationConfig (Google API format)
							modelConfig.generationConfig = {
								thinkingConfig: {
									thinkingLevel: thinkingLevelValue,
									includeThoughts: true
								}
							};

							console.log(`[VybeLangGraphService] Enabling thinking mode for ${baseModelId}: thinkingLevel=${thinkingLevelValue}, include_thoughts=true, outputVersion=v1`);
						} else {
							// Gemini 2.5 uses thinkingBudget (dynamic for 2.5 Pro/Flash)
							const thinkingBudget = baseModelId.includes('2.5-pro') ? 128 : 1024; // Use fixed budget for flash to ensure thinking

							modelConfig.thinking_budget = thinkingBudget;
							modelConfig.thinkingBudget = thinkingBudget; // Try camelCase too
							modelConfig.include_thoughts = true;
							modelConfig.includeThoughts = true; // Try camelCase too

							// Try outputVersion parameter - some LangChain versions need this for thinking
							modelConfig.outputVersion = 'v1';

							// Also try passing via generationConfig (Google API format)
							modelConfig.generationConfig = {
								thinkingConfig: {
									thinkingBudget: thinkingBudget,
									includeThoughts: true
								}
							};

							console.log(`[VybeLangGraphService] Enabling thinking mode for ${baseModelId}: budget=${thinkingBudget}, include_thoughts=true, outputVersion=v1`);
						}

						console.log(`[VybeLangGraphService] Full model config:`, JSON.stringify(modelConfig, null, 2));

						// After creating the model, verify the parameters were actually set
						// Some LangChain versions might not support these parameters
						setTimeout(() => {
							if (model && typeof model === 'object') {
								console.log(`[VybeLangGraphService] Verifying model config after creation...`);
								// Try to access internal config to verify parameters
								const modelAny = model as any;
								if (modelAny.thinking_budget !== undefined) {
									console.log(`[VybeLangGraphService] ✓ thinking_budget found on model: ${modelAny.thinking_budget}`);
								} else {
									console.warn(`[VybeLangGraphService] ⚠️ thinking_budget NOT found on model instance!`);
								}
								if (modelAny.include_thoughts !== undefined) {
									console.log(`[VybeLangGraphService] ✓ include_thoughts found on model: ${modelAny.include_thoughts}`);
								} else {
									console.warn(`[VybeLangGraphService] ⚠️ include_thoughts NOT found on model instance!`);
								}
								if (modelAny.outputVersion !== undefined) {
									console.log(`[VybeLangGraphService] ✓ outputVersion found on model: ${modelAny.outputVersion}`);
								} else {
									console.warn(`[VybeLangGraphService] ⚠️ outputVersion NOT found on model instance!`);
								}
							}
						}, 100);
					}

					const model = new ChatGoogleGenerativeAI(modelConfig);

					// Verify the model instance has the config
					console.log(`[VybeLangGraphService] Model instance created, checking config...`);
					if (model && typeof model === 'object') {
						// Try to access the config to verify it was set
						const modelKeys = Object.keys(model);
						console.log(`[VybeLangGraphService] Model instance keys (first 20):`, modelKeys.slice(0, 20));

						// Try to access internal _client or similar to see if we can pass config directly
						const modelAny = model as any;
						if (modelAny._client) {
							console.log(`[VybeLangGraphService] Found _client on model instance`);
							console.log(`[VybeLangGraphService] _client type:`, typeof modelAny._client);
							console.log(`[VybeLangGraphService] _client keys:`, Object.keys(modelAny._client || {}).slice(0, 10));
						}
						if (modelAny.client) {
							console.log(`[VybeLangGraphService] Found client on model instance`);
							console.log(`[VybeLangGraphService] client type:`, typeof modelAny.client);
							console.log(`[VybeLangGraphService] client keys:`, Object.keys(modelAny.client || {}).slice(0, 10));

							// Try to access the Google SDK client directly
							const client = modelAny.client;
							if (client && typeof client === 'object') {
								// Check if it has models.generateContentStream or similar
								if (client.models) {
									console.log(`[VybeLangGraphService] ✓ Found client.models`);
									console.log(`[VybeLangGraphService] client.models keys:`, Object.keys(client.models || {}).slice(0, 10));
								}

								// CRITICAL: Try to patch the client to ensure thinkingConfig is passed
								// LangChain might not be passing it correctly
								if (supportsThinking && client.models && typeof client.models.generateContentStream === 'function') {
									const originalGenerateContentStream = client.models.generateContentStream;
									client.models.generateContentStream = function (...args: any[]) {
										console.log(`[VybeLangGraphService] Intercepting generateContentStream call...`);
										// Ensure thinkingConfig is in the config
										if (args.length > 0 && args[0] && typeof args[0] === 'object') {
											const config = args[0].config || {};
											if (!config.thinkingConfig) {
												console.log(`[VybeLangGraphService] Adding thinkingConfig to request...`);
												config.thinkingConfig = {
													thinkingBudget: modelConfig.thinking_budget || modelConfig.thinkingBudget || 1024,
													includeThoughts: true
												};
												args[0].config = config;
											}
										}
										return originalGenerateContentStream.apply(this, args);
									};
									console.log(`[VybeLangGraphService] ✓ Patched generateContentStream to ensure thinkingConfig`);
								}
							}
						}
						if (modelAny.lc_kwargs) {
							console.log(`[VybeLangGraphService] lc_kwargs:`, Object.keys(modelAny.lc_kwargs || {}));
							// Check if thinking params are in lc_kwargs
							if (modelAny.lc_kwargs.thinking_budget !== undefined) {
								console.log(`[VybeLangGraphService] ✓ thinking_budget in lc_kwargs: ${modelAny.lc_kwargs.thinking_budget}`);
							}
							if (modelAny.lc_kwargs.include_thoughts !== undefined) {
								console.log(`[VybeLangGraphService] ✓ include_thoughts in lc_kwargs: ${modelAny.lc_kwargs.include_thoughts}`);
							}
						}
					}

					// CRITICAL: If thinking parameters aren't on the model, try to set them after creation
					// Some LangChain versions might require this
					if (supportsThinking && model) {
						const modelAny = model as any;
						// Try setting them directly on the instance
						if (modelAny.thinking_budget === undefined) {
							console.log(`[VybeLangGraphService] Attempting to set thinking_budget directly on model instance...`);
							try {
								modelAny.thinking_budget = modelConfig.thinking_budget;
								modelAny.include_thoughts = modelConfig.include_thoughts;
								console.log(`[VybeLangGraphService] ✓ Set thinking parameters directly on instance`);
							} catch (e) {
								console.warn(`[VybeLangGraphService] Failed to set thinking parameters directly:`, e);
							}
						}
					}

					return model;
				}
				console.warn(`[VybeLangGraphService] Cannot create Gemini model: adapter=${!!ChatGoogleGenerativeAI}, hasKey=${!!apiKeys.gemini}`);
				break;

			case 'openai':
				if (ChatOpenAI && apiKeys.openai) {
					const modelName = baseModelId.replace('openai/', '');
					console.log(`[VybeLangGraphService] OpenAI model creation: baseModelId=${baseModelId}, modelName=${modelName}, reasoningLevel=${reasoningLevel}`);
					const isGPT5 = modelName.startsWith('gpt-5');
					const isGPT52 = modelName.startsWith('gpt-5.2');
					const isGPT51 = modelName.startsWith('gpt-5.1');
					const isCodex = modelName.startsWith('codex');
					console.log(`[VybeLangGraphService] Model checks: isGPT5=${isGPT5}, isGPT52=${isGPT52}, isGPT51=${isGPT51}, isCodex=${isCodex}`);

					const openaiConfig: any = {
						model: modelName, // Use base model name for API call
						apiKey: apiKeys.openai,
						streaming: true,
					};

					// Set verbosity to 'high' for GPT-5, GPT-5.1, GPT-5.2 models and variants
					if (isGPT52 || isGPT51 || isGPT5 || isCodex) {
						openaiConfig.verbosity = 'high'; // High verbosity for GPT-5.x models
					}

					// GPT-5.2, GPT-5.1, GPT-5, and Codex models with reasoning effort levels
					if ((isGPT52 || isGPT51 || isGPT5 || isCodex) && reasoningLevel) {
						// GPT-5.2 supports: low, medium, high, xhigh
						// GPT-5.1 supports: low, medium, high (no xhigh)
						let effort: string;
						if (reasoningLevel === 'xhigh') {
							if (isGPT52) {
								effort = 'xhigh'; // Only GPT-5.2 supports xhigh
							} else {
								effort = 'high'; // Fallback to high for GPT-5.1
								console.warn(`[VybeLangGraphService] GPT-5.1 does not support xhigh, using high instead`);
							}
						} else {
							effort = reasoningLevel; // low, medium, high
						}

						openaiConfig.reasoning = {
							effort: effort,
							summary: 'auto', // Include reasoning summary in response
						};

						// CRITICAL: All GPT-5.x and Codex models need Responses API for reasoning to work properly
						// This ensures reasoning parameters are actually applied and summaries are returned
						if (isGPT52 || isGPT51 || isGPT5 || isCodex) {
							openaiConfig.useResponsesApi = true;
							console.log(`[VybeLangGraphService] Enabling Responses API for reasoning support: ${modelName}`);
						}

						console.log(`[VybeLangGraphService] ✅ GPT-5 reasoning config: ${modelName}, effort=${effort}, summary=auto, useResponsesApi=true`);
						console.log(`[VybeLangGraphService] ✅ Full OpenAI config:`, JSON.stringify({
							model: modelName,
							reasoning: openaiConfig.reasoning,
							useResponsesApi: openaiConfig.useResponsesApi,
							streaming: openaiConfig.streaming
						}, null, 2));
					}

					console.log(`[VybeLangGraphService] Creating ChatOpenAI: ${modelName}`);
					const model = new ChatOpenAI(openaiConfig);

					// Verify reasoning parameters were set on the model instance
					const modelAny = model as any;
					if (openaiConfig.reasoning) {
						console.log(`[VybeLangGraphService] ✅ Model created, checking reasoning config...`);
						console.log(`[VybeLangGraphService] Model.reasoning:`, modelAny.reasoning);
						console.log(`[VybeLangGraphService] Model.useResponsesApi:`, modelAny.useResponsesApi);
						if (!modelAny.reasoning) {
							console.error(`[VybeLangGraphService] ❌ ERROR: reasoning parameter NOT found on model instance!`);
						}
						if (openaiConfig.useResponsesApi && !modelAny.useResponsesApi) {
							console.error(`[VybeLangGraphService] ❌ ERROR: useResponsesApi NOT found on model instance!`);
						}
					}

					return model;
				}
				console.warn(`[VybeLangGraphService] Cannot create OpenAI model: adapter=${!!ChatOpenAI}, hasKey=${!!apiKeys.openai}`);
				break;

			case 'anthropic':
				if (ChatAnthropic && apiKeys.anthropic) {
					const modelName = baseModelId.replace('anthropic/', '');
					const isOpus = modelName.includes('opus');
					const isSonnet = modelName.includes('sonnet');
					const isHaiku = modelName.includes('haiku');
					// Check if this is a thinking variant (has "-thinking" suffix)
					const hasThinking = modelName.endsWith('-thinking');
					// Remove "-thinking" suffix to get base model name for mapping
					const baseModelName = hasThinking ? modelName.replace('-thinking', '') : modelName;

					// Map friendly names to Anthropic API model identifiers
					// Using correct model IDs from Anthropic API
					const anthropicModelMap: Record<string, string> = {
						'claude-opus-4.5': 'claude-opus-4-5-20251101', // Opus 4.5
						'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929', // Sonnet 4.5
						'claude-haiku-4.5': 'claude-haiku-4-5-20251001', // Haiku 4.5
					};
					const apiModelName = anthropicModelMap[baseModelName] || baseModelName;

					const anthropicConfig: any = {
						model: apiModelName,
						apiKey: apiKeys.anthropic,
						streaming: true,
						maxTokens: 8192,
					};

					// Extended thinking for models with "-thinking" suffix
					// All Claude 4.5 models support extended thinking
					if (hasThinking) {
						// High effort: Use maximum budget_tokens for each model
						// Opus: 16000, Sonnet: 8000, Haiku: 4000
						let budgetTokens: number;
						if (isOpus) {
							budgetTokens = 16000; // Maximum for Opus
						} else if (isSonnet) {
							budgetTokens = 8000; // Maximum for Sonnet
						} else if (isHaiku) {
							budgetTokens = 4000; // Maximum for Haiku
						} else {
							budgetTokens = 8000; // Default
						}

						anthropicConfig.thinking = {
							type: 'enabled',
							budget_tokens: budgetTokens,
						};
						console.log(`[VybeLangGraphService] Extended thinking enabled for ${apiModelName}: budget=${budgetTokens} (high effort)`);
					}

					console.log(`[VybeLangGraphService] Creating ChatAnthropic: ${apiModelName}, thinking=${hasThinking}`);
					return new ChatAnthropic(anthropicConfig);
				}
				console.warn(`[VybeLangGraphService] Cannot create Anthropic model: adapter=${!!ChatAnthropic}, hasKey=${!!apiKeys.anthropic}`);
				break;

			case 'azure':
				console.log(`[VybeLangGraphService] Azure case hit for model: ${modelId}`);
				console.log(`[VybeLangGraphService] AzureChatOpenAI loaded: ${!!AzureChatOpenAI}`);
				// Use AzureChatOpenAI from @langchain/openai - dedicated Azure class
				if (!AzureChatOpenAI) {
					console.error(`[VybeLangGraphService] AzureChatOpenAI adapter not loaded - cannot create Azure model`);
					throw new Error(`AzureChatOpenAI adapter not available. Please ensure @langchain/openai is installed.`);
				}

				const azureConfig = this.getAzureConfig();
				console.log(`[VybeLangGraphService] Azure config check:`, {
					hasConfig: !!azureConfig,
					hasKey: !!azureConfig?.apiKey,
					hasInstance: !!azureConfig?.instanceName,
					hasEndpoint: !!azureConfig?.endpoint,
					instanceName: azureConfig?.instanceName,
					endpoint: azureConfig?.endpoint?.substring(0, 60),
					apiVersion: azureConfig?.apiVersion
				});

				if (!azureConfig || !azureConfig.apiKey) {
					console.error(`[VybeLangGraphService] Azure API key not found. Check Supabase secrets or environment variables.`);
					throw new Error(`Azure API key not configured. Please set 'azure' key in Supabase secrets.`);
				}

				// Extract deployment name from base model ID (e.g., "azure/gpt-5.2" -> "gpt-5.2")
				// Use baseModelId to ensure we don't include reasoning suffixes
				const deploymentName = baseModelId.replace('azure/', '');
				const modelName = deploymentName; // Model name for API calls
				console.log(`[VybeLangGraphService] Azure model creation: baseModelId=${baseModelId}, deploymentName=${deploymentName}, modelName=${modelName}, reasoningLevel=${reasoningLevel}`);

				// Check if this is a GPT-5 model with reasoning support
				const isGPT52 = modelName.startsWith('gpt-5.2');
				const isGPT51 = modelName.startsWith('gpt-5.1');
				const isGPT5 = modelName.startsWith('gpt-5');
				const isCodex = modelName.startsWith('gpt-5') && modelName.includes('codex');
				console.log(`[VybeLangGraphService] Azure model checks: isGPT5=${isGPT5}, isGPT52=${isGPT52}, isGPT51=${isGPT51}, isCodex=${isCodex}`);

				console.log(`[VybeLangGraphService] Creating AzureChatOpenAI for deployment: ${deploymentName}, reasoningLevel: ${reasoningLevel}`);

				// Build base config for AzureChatOpenAI
				const azureBaseConfig: any = {
					azureOpenAIApiDeploymentName: deploymentName,
					streaming: true,
				};

				// Set verbosity to 'high' for GPT-5, GPT-5.1, GPT-5.2 models and variants
				if (isGPT52 || isGPT51 || isGPT5 || isCodex) {
					azureBaseConfig.verbosity = 'high'; // High verbosity for GPT-5.x models
				}

				// Add reasoning parameter if model supports reasoning (GPT-5.2, GPT-5.1, Codex variants)
				if ((isGPT52 || isGPT51 || isGPT5 || isCodex) && reasoningLevel) {
					// GPT-5.2 supports: low, medium, high, xhigh
					// GPT-5.1 supports: low, medium, high (no xhigh)
					let effort: string;
					if (reasoningLevel === 'xhigh') {
						if (isGPT52) {
							effort = 'xhigh'; // Only GPT-5.2 supports xhigh
						} else {
							effort = 'high'; // Fallback to high for GPT-5.1
							console.warn(`[VybeLangGraphService] Azure GPT-5.1 does not support xhigh, using high instead`);
						}
					} else {
						effort = reasoningLevel; // low, medium, high
					}

					azureBaseConfig.reasoning = {
						effort: effort,
						summary: 'auto', // Include reasoning summary in response
					};

					// NOTE: For now, use standard Chat Completions API instead of Responses API
					// Responses API requires different endpoint structure which is causing issues with AzureChatOpenAI
					// Reasoning parameters should still work with Chat Completions API
					// TODO: Re-enable Responses API once we have a working solution
					// if (isGPT52 || isGPT51 || isGPT5 || isCodex) {
					// 	azureBaseConfig.useResponsesApi = true;
					// 	azureBaseConfig.model = deploymentName;
					// 	console.log(`[VybeLangGraphService] Azure GPT-5/Codex: Enabling Responses API for reasoning support`);
					// }

					console.log(`[VybeLangGraphService] ✅ Azure GPT-5 reasoning config: ${modelName}, effort=${effort}, summary=auto, useResponsesApi=true`);
					console.log(`[VybeLangGraphService] ✅ Full Azure config:`, JSON.stringify({
						deploymentName: deploymentName,
						reasoning: azureBaseConfig.reasoning,
						useResponsesApi: azureBaseConfig.useResponsesApi,
						streaming: azureBaseConfig.streaming
					}, null, 2));
				}

				// For Azure AI Foundry (custom domain), use ChatOpenAI with baseURL
				// For standard Azure OpenAI, use AzureChatOpenAI with azureOpenAIApiInstanceName
				if (azureConfig.endpoint) {
					// Check if this is Azure AI Foundry format (services.ai.azure.com)
					const isFoundry = azureConfig.endpoint.includes('services.ai.azure.com');

					// Verify API key format (should not be empty)
					if (!azureConfig.apiKey || azureConfig.apiKey.trim().length === 0) {
						throw new Error(`Azure API key is empty or invalid`);
					}

					if (isFoundry) {
						// Azure AI Foundry format detected, but user says to use standard Azure OpenAI endpoint
						// Project overview says: https://vybe-models-resource.openai.azure.com/
						// Extract instance name from endpoint or use standard format
						// If endpoint is Foundry format, extract resource name and convert to standard

						const endpoint = azureConfig.endpoint.trim().replace(/\/$/, '');
						const apiVersion = azureConfig.apiVersion || '2024-05-01-preview';

						// Extract instance name from endpoint
						// Try to extract from Foundry format first: https://{resource}.services.ai.azure.com/...
						let instanceName = azureConfig.instanceName;
						if (!instanceName) {
							const foundryMatch = endpoint.match(/https?:\/\/([^\.]+)\.services\.ai\.azure\.com/);
							if (foundryMatch) {
								instanceName = foundryMatch[1];
								console.log(`[VybeLangGraphService] 🔄 Extracted instance name from Foundry endpoint: ${instanceName}`);
							} else {
								// Try standard format: https://{instance}.openai.azure.com
								const standardMatch = endpoint.match(/https?:\/\/([^\.]+)\.openai\.azure\.com/);
								if (standardMatch) {
									instanceName = standardMatch[1];
									console.log(`[VybeLangGraphService] 🔄 Extracted instance name from standard endpoint: ${instanceName}`);
								}
							}
						}

						if (!instanceName) {
							// Default to extracting from any endpoint format
							const match = endpoint.match(/https?:\/\/([^\/\.]+)/);
							if (match) {
								instanceName = match[1];
								console.log(`[VybeLangGraphService] 🔄 Extracted instance name from endpoint: ${instanceName}`);
							}
						}

						if (!instanceName) {
							throw new Error(`Could not extract instance name from endpoint: ${endpoint}`);
						}

						// Extract and validate API key
						const apiKey = azureConfig.apiKey?.trim();
						if (!apiKey) {
							throw new Error(`Azure API key is required`);
						}

						console.log(`[VybeLangGraphService] Using standard Azure OpenAI endpoint format`);
						console.log(`[VybeLangGraphService] Config:`, {
							instanceName: instanceName,
							deploymentName: deploymentName,
							hasApiKey: !!apiKey,
							apiKeyLength: apiKey.length,
							apiKeyPrefix: apiKey.substring(0, 10),
							apiVersion: apiVersion,
							useResponsesApi: azureBaseConfig.useResponsesApi
						});

						// Use standard Azure OpenAI configuration with instanceName
						// This will construct: https://{instanceName}.openai.azure.com/openai/deployments/{deploymentName}
						const modelConfig: any = {
							...azureBaseConfig,
							azureOpenAIApiKey: apiKey,
							azureOpenAIApiInstanceName: instanceName,
							azureOpenAIApiDeploymentName: deploymentName,
							azureOpenAIApiVersion: apiVersion
						};

						// Log the EXACT config being passed to AzureChatOpenAI
						console.log(`[VybeLangGraphService] 🔍 EXACT CONFIG PASSED TO AzureChatOpenAI (Standard Azure OpenAI):`, JSON.stringify({
							azureOpenAIApiInstanceName: modelConfig.azureOpenAIApiInstanceName,
							azureOpenAIApiDeploymentName: modelConfig.azureOpenAIApiDeploymentName,
							expectedEndpoint: `https://${instanceName}.openai.azure.com/openai/deployments/${deploymentName}`,
							model: modelConfig.model,
							reasoning: modelConfig.reasoning,
							useResponsesApi: modelConfig.useResponsesApi,
							streaming: modelConfig.streaming,
							hasAzureOpenAIApiKey: !!modelConfig.azureOpenAIApiKey,
							apiKeyLength: modelConfig.azureOpenAIApiKey?.length,
							apiKeyPrefix: modelConfig.azureOpenAIApiKey?.substring(0, 10),
							azureOpenAIApiVersion: modelConfig.azureOpenAIApiVersion
						}, null, 2));

						// Use AzureChatOpenAI with standard Azure OpenAI endpoint
						const model = new AzureChatOpenAI(modelConfig);
						console.log(`[VybeLangGraphService] ✅ Created AzureChatOpenAI for standard Azure OpenAI endpoint`);

						// Log what was actually set on the instance
						const modelAny = model as any;
						console.log(`[VybeLangGraphService] 🔍 Model instance properties:`, {
							model: modelAny.model,
							azureOpenAIApiInstanceName: modelAny.azureOpenAIApiInstanceName,
							azureOpenAIApiDeploymentName: modelAny.azureOpenAIApiDeploymentName,
							reasoning: modelAny.reasoning,
							useResponsesApi: modelAny.useResponsesApi,
							hasAzureOpenAIApiKey: !!modelAny.azureOpenAIApiKey,
							apiKeyLength: modelAny.azureOpenAIApiKey?.length
						});

						// Verify reasoning parameters were set on the model instance
						if (azureBaseConfig.reasoning) {
							console.log(`[VybeLangGraphService] ✅ Model created, checking reasoning config...`);
							console.log(`[VybeLangGraphService] Model.reasoning:`, modelAny.reasoning);
							console.log(`[VybeLangGraphService] Model.useResponsesApi:`, modelAny.useResponsesApi);
							console.log(`[VybeLangGraphService] Model.model property: ${modelAny.model}`);
							if (!modelAny.reasoning) {
								console.error(`[VybeLangGraphService] ❌ ERROR: reasoning parameter NOT found on model instance!`);
							}
							if (azureBaseConfig.useResponsesApi && !modelAny.useResponsesApi) {
								console.error(`[VybeLangGraphService] ❌ ERROR: useResponsesApi NOT found on model instance!`);
							}
							if (azureBaseConfig.useResponsesApi && modelAny.model !== deploymentName) {
								console.error(`[VybeLangGraphService] ❌ ERROR: Model.model (${modelAny.model}) does not match deploymentName (${deploymentName})!`);
							}
						}

						return model;
					} else {
						// Standard Azure OpenAI format (openai.azure.com)
						// CRITICAL: For Azure Responses API, we need to match the OpenAI SDK pattern:
						// - baseURL: "https://{instance-name}.openai.azure.com/openai/v1/"
						// - model: deploymentName (e.g., "gpt-5.2")
						// - apiKey: Azure API key
						// - reasoning: { effort: "...", summary: "..." }

						const endpoint = azureConfig.endpoint.trim().replace(/\/$/, '');
						const apiVersion = azureConfig.apiVersion || '2024-05-01-preview';

						// Extract instance name from endpoint URL
						// Format: https://{instance-name}.openai.azure.com/
						let instanceName = azureConfig.instanceName;
						if (!instanceName && endpoint) {
							const match = endpoint.match(/https?:\/\/([^\/\.]+)\.openai\.azure\.com/);
							if (match) {
								instanceName = match[1];
								console.log(`[VybeLangGraphService] 🔄 Extracted instance name from standard endpoint: ${instanceName}`);
							}
						}

						if (!instanceName) {
							throw new Error(`Could not extract instance name from endpoint: ${endpoint}. Please set AZURE_ENDPOINT to https://{instance-name}.openai.azure.com`);
						}

						console.log(`[VybeLangGraphService] Azure standard config:`, {
							instanceName: instanceName,
							endpoint: endpoint,
							deploymentName: deploymentName,
							hasApiKey: !!azureConfig.apiKey,
							apiKeyLength: azureConfig.apiKey?.length || 0,
							apiVersion: apiVersion,
							useResponsesApi: azureBaseConfig.useResponsesApi
						});

						// CRITICAL: For Azure Responses API, use ChatOpenAI (not AzureChatOpenAI)
						// Per Azure Foundry example: use standard OpenAI SDK with baseURL set to Responses API endpoint
						// Pattern: baseURL = "https://{instance-name}.openai.azure.com/openai/v1/"
						// This matches the Azure Foundry example exactly
						const responsesApiBaseURL = `https://${instanceName}.openai.azure.com/openai/v1/`;

						console.log(`[VybeLangGraphService] 🔍 Using ChatOpenAI for Responses API (Azure Foundry pattern)`);
						console.log(`[VybeLangGraphService] 🔍 Responses API baseURL: ${responsesApiBaseURL}`);

						// Use ChatOpenAI with baseURL set to Responses API endpoint (exactly like Azure Foundry example)
						// CRITICAL: Azure requires 'api-key' header, but ChatOpenAI uses 'Authorization: Bearer' when apiKey is set
						// Solution: Set apiKey for validation, but override headers to use 'api-key' instead
						const apiKey = azureConfig.apiKey?.trim();
						if (!apiKey) {
							throw new Error('Azure API key is required');
						}

						// CRITICAL: Use 'configuration' object to set baseURL and headers
						// This ensures ChatOpenAI respects the baseURL and doesn't default to OpenAI's servers
						const modelConfig: any = {
							...azureBaseConfig,
							model: deploymentName, // Deployment name as model (per Azure Foundry example)
							useResponsesApi: true, // Explicitly set - Responses API only
							// Use 'configuration' object to set client options (baseURL, headers, etc.)
							configuration: {
								baseURL: responsesApiBaseURL, // Responses API endpoint (per Azure Foundry example)
								apiKey: apiKey, // API key (but we'll override headers to use api-key)
								// Set defaultHeaders to use api-key instead of Authorization: Bearer
								defaultHeaders: {
									'api-key': apiKey // Azure requires api-key header
								}
							}
						};

						// Log the EXACT config being passed to ChatOpenAI
						console.log(`[VybeLangGraphService] 🔍 EXACT CONFIG PASSED TO ChatOpenAI (Responses API):`, JSON.stringify({
							baseURL: modelConfig.configuration?.baseURL,
							model: modelConfig.model,
							reasoning: modelConfig.reasoning,
							useResponsesApi: modelConfig.useResponsesApi,
							streaming: modelConfig.streaming,
							hasApiKey: !!modelConfig.configuration?.apiKey,
							apiKeyLength: modelConfig.configuration?.apiKey?.length,
							hasApiKeyHeader: !!modelConfig.configuration?.defaultHeaders?.['api-key']
						}, null, 2));

						// Use ChatOpenAI for Responses API (matches Azure Foundry example)
						const model = new ChatOpenAI(modelConfig);

						// CRITICAL: Override client to use 'api-key' header instead of 'Authorization: Bearer'
						// ChatOpenAI sets Authorization: Bearer when apiKey is provided, but Azure requires api-key header
						const modelAny = model as any;

						// CRITICAL: Override client to use 'api-key' header instead of 'Authorization: Bearer'
						// Also ensure baseURL is set correctly
						if (modelAny.client) {
							// Ensure baseURL is set on the client
							if (modelAny.clientConfig) {
								modelAny.clientConfig.baseURL = responsesApiBaseURL;
								console.log(`[VybeLangGraphService] ✅ Set baseURL in clientConfig: ${responsesApiBaseURL}`);
							}

							// Store original request method
							const originalRequest = modelAny.client._client?.request;

							if (originalRequest && modelAny.client._client) {
								// Wrap the request method to override headers and ensure baseURL
								modelAny.client._client.request = async function (options: any) {
									// Ensure baseURL is set
									if (!options.baseURL) {
										options.baseURL = responsesApiBaseURL;
									}

									// Remove Authorization header if present
									if (options.headers) {
										delete options.headers['Authorization'];
										delete options.headers['authorization'];
										// Set api-key header
										options.headers['api-key'] = apiKey;
									}
									return originalRequest.call(this, options);
								};
								console.log(`[VybeLangGraphService] ✅ Wrapped client._client.request to use api-key header and baseURL`);
							}

							// Also set defaultHeaders to ensure api-key is used
							if (modelAny.clientConfig) {
								modelAny.clientConfig.defaultHeaders = {
									...(modelAny.clientConfig.defaultHeaders || {}),
									'api-key': apiKey
								};
								// Remove Authorization from defaultHeaders
								if (modelAny.clientConfig.defaultHeaders['Authorization']) {
									delete modelAny.clientConfig.defaultHeaders['Authorization'];
								}
								console.log(`[VybeLangGraphService] ✅ Set api-key in clientConfig.defaultHeaders`);
							}
						}

						console.log(`[VybeLangGraphService] ✅ Created ChatOpenAI for Azure Responses API`);

						// Log what was actually set on the instance
						console.log(`[VybeLangGraphService] 🔍 Model instance properties (ChatOpenAI):`, {
							model: modelAny.model,
							baseURL: modelAny.clientConfig?.baseURL || modelAny.baseURL,
							reasoning: modelAny.reasoning,
							useResponsesApi: modelAny.useResponsesApi,
							hasApiKey: !!modelAny.apiKey,
							hasApiKeyHeader: !!modelAny.clientConfig?.defaultHeaders?.['api-key']
						});

						// Post-creation override if still needed (though constructor should have set it)
						if (azureBaseConfig.useResponsesApi && modelAny.model !== deploymentName) {
							console.warn(`[VybeLangGraphService] ⚠️ Model.model (${modelAny.model}) doesn't match deploymentName (${deploymentName}), attempting override...`);
							modelAny.model = deploymentName;
							console.log(`[VybeLangGraphService] ✅ Overrode model property to ${deploymentName}`);
						}

						// Verify reasoning parameters were set on the model instance
						if (azureBaseConfig.reasoning) {
							console.log(`[VybeLangGraphService] ✅ Azure standard model created, checking reasoning config...`);
							console.log(`[VybeLangGraphService] Model.reasoning:`, modelAny.reasoning);
							console.log(`[VybeLangGraphService] Model.useResponsesApi:`, modelAny.useResponsesApi);
							console.log(`[VybeLangGraphService] Model.model property: ${modelAny.model}`);
							console.log(`[VybeLangGraphService] Model.azureOpenAIApiDeploymentName: ${modelAny.azureOpenAIApiDeploymentName}`);
							if (!modelAny.reasoning) {
								console.error(`[VybeLangGraphService] ❌ ERROR: reasoning parameter NOT found on Azure standard model instance!`);
							}
							if (azureBaseConfig.useResponsesApi && !modelAny.useResponsesApi) {
								console.error(`[VybeLangGraphService] ❌ ERROR: useResponsesApi NOT found on Azure standard model instance!`);
							}
							if (azureBaseConfig.useResponsesApi && modelAny.model !== deploymentName) {
								console.error(`[VybeLangGraphService] ❌ ERROR: Model.model (${modelAny.model}) does not match deploymentName (${deploymentName})!`);
							}
						}

						return model;
					}
				} else if (azureConfig.instanceName) {
					// Standard Azure OpenAI format
					const model = new AzureChatOpenAI({
						...azureBaseConfig,
						model: deploymentName,
						azureOpenAIApiKey: azureConfig.apiKey,
						azureOpenAIApiInstanceName: azureConfig.instanceName,
						azureOpenAIApiVersion: azureConfig.apiVersion || '2024-05-01-preview',
					});

					// CRITICAL: When using Responses API, explicitly set the model property
					// AzureChatOpenAI may default to gpt-3.5-turbo, so we need to override it
					const modelAny = model as any;
					if (azureBaseConfig.useResponsesApi && azureBaseConfig.model) {
						modelAny.model = azureBaseConfig.model;
						console.log(`[VybeLangGraphService] ✅ Set model property to ${azureBaseConfig.model} for Responses API (instanceName)`);
					}

					// Verify reasoning parameters were set on the model instance
					if (azureBaseConfig.reasoning) {
						console.log(`[VybeLangGraphService] ✅ Azure instanceName model created, checking reasoning config...`);
						console.log(`[VybeLangGraphService] Model.reasoning:`, modelAny.reasoning);
						console.log(`[VybeLangGraphService] Model.useResponsesApi:`, modelAny.useResponsesApi);
						console.log(`[VybeLangGraphService] Model.model property: ${modelAny.model}`);
						console.log(`[VybeLangGraphService] Model.azureOpenAIApiDeploymentName: ${modelAny.azureOpenAIApiDeploymentName}`);
						if (!modelAny.reasoning) {
							console.error(`[VybeLangGraphService] ❌ ERROR: reasoning parameter NOT found on Azure instanceName model instance!`);
						}
						if (azureBaseConfig.useResponsesApi && !modelAny.useResponsesApi) {
							console.error(`[VybeLangGraphService] ❌ ERROR: useResponsesApi NOT found on Azure instanceName model instance!`);
						}
						if (azureBaseConfig.useResponsesApi && modelAny.model !== deploymentName) {
							console.error(`[VybeLangGraphService] ❌ ERROR: Model.model (${modelAny.model}) does not match deploymentName (${deploymentName})!`);
						}
					}

					return model;
				}

				// Should not reach here, but just in case
				throw new Error(`Azure configuration incomplete: missing endpoint or instance name`);
		}

		// No fallback - return null and let caller handle the error with a clear message
		console.error(`[VybeLangGraphService] No adapter available for model: ${modelId}`);
		console.error(`[VybeLangGraphService] Provider: ${provider}, Available adapters: Gemini=${!!ChatGoogleGenerativeAI}, OpenAI=${!!ChatOpenAI}, Azure=${!!AzureChatOpenAI}, Anthropic=${!!ChatAnthropic}`);
		return null;
	}

	/**
	 * Parse provider from model ID.
	 */
	private parseProvider(modelId: string): 'gemini' | 'openai' | 'anthropic' | 'azure' {
		// CRITICAL: Check azure/ FIRST before checking gpt- to avoid misclassification
		// e.g., "azure/gpt-5.2" should be 'azure', not 'openai'
		if (modelId.startsWith('azure/')) return 'azure';
		if (modelId.startsWith('gemini')) return 'gemini';
		// OpenAI models: gpt-*, codex*, openai/*
		if (modelId.startsWith('gpt-') || modelId.startsWith('openai/') ||
			modelId.startsWith('codex')) return 'openai';
		// Anthropic models: claude*, anthropic/*
		if (modelId.startsWith('claude') || modelId.startsWith('anthropic/')) return 'anthropic';
		// Default to gemini for models like "gemini-2.5-pro", "gemini-3-flash-preview"
		if (modelId.includes('gemini')) return 'gemini';
		// Default to gemini if no match (ollama removed)
		return 'gemini';
	}

	/**
	 * Extract reasoning/thinking content from AI message.
	 * Handles both OpenAI reasoning tokens and Anthropic extended thinking.
	 *
	 * OpenAI: Reasoning is in additional_kwargs.reasoning.summary
	 * Anthropic: Thinking is in content blocks with type "thinking"
	 *
	 * @param message - The AI message from LangChain
	 * @returns Object with optional thinking content (for backward compatibility) and structured thinking summaries
	 */
	private extractThinkingContent(message: any): {
		thinking?: string; // Deprecated - kept for backward compatibility
		thinkingSummaries?: Array<{ text: string; index: number; type: string }>; // Structured summaries with index tracking
		content: string;
	} {
		// OpenAI Responses API reasoning events (via LangChain conversion):
		// - response.reasoning_summary_text.delta → additional_kwargs.reasoning.summary with one item: { text: delta, type: "summary_text", index: summary_index }
		// - response.reasoning_summary_part.added → additional_kwargs.reasoning.summary with one item: { ...part, index: summary_index }
		// LangChain accumulates these into message.additional_kwargs.reasoning.summary as an array
		// Each streaming chunk may contain multiple summary items (one per delta event)
		// We extract all summary_text items and group them by index for proper accumulation
		if (message.additional_kwargs?.reasoning?.summary) {
			const summary = message.additional_kwargs.reasoning.summary;

			if (Array.isArray(summary) && summary.length > 0) {
				// Extract all summary_text items
				// In streaming, each chunk may have one delta, but we extract all available
				// Group by index to handle multiple reasoning parts correctly
				const summaryItems = summary
					.filter((item: any) => item.type === 'summary_text' && item.text)
					.sort((a: any, b: any) => {
						// Sort by index if available, otherwise maintain order
						const aIndex = a.index !== undefined ? a.index : 0;
						const bIndex = b.index !== undefined ? b.index : 0;
						return aIndex - bIndex;
					});

				if (summaryItems.length > 0) {
					// Return structured summaries with index tracking
					// Each summary item is separate - no joining needed
					const thinkingSummaries = summaryItems.map((item: any) => ({
						text: item.text || '',
						index: item.index !== undefined ? item.index : 0,
						type: item.type || 'summary_text'
					}));

					console.log(`[VybeLangGraphService] ✅ Extracted ${thinkingSummaries.length} structured reasoning summary item(s)`);

					// For backward compatibility, also provide joined thinking string
					// This will be removed in Phase 3
					let reasoning = '';
					for (let i = 0; i < summaryItems.length; i++) {
						const item = summaryItems[i];
						const text = item.text || '';

						if (i > 0) {
							const prevText = summaryItems[i - 1].text || '';
							if (!prevText.endsWith('\n') && !text.startsWith('\n')) {
								if (/^\s*\*\*/.test(text)) {
									reasoning += '\n\n';
								} else {
									reasoning += '\n';
								}
							}
						}
						reasoning += text;
					}

					return {
						thinking: reasoning, // Backward compatibility
						thinkingSummaries, // New structured format
						content: typeof message.content === 'string' ? message.content : ''
					};
				}
			}
		}

		// Anthropic extended thinking (in content array as blocks)
		// Anthropic doesn't use structured summaries, so keep backward compatibility
		if (Array.isArray(message.content)) {
			const thinkingBlocks = message.content
				.filter((block: any) => block.type === 'thinking')
				.map((block: any) => block.thinking)
				.join('\n');
			const textBlocks = message.content
				.filter((block: any) => block.type === 'text')
				.map((block: any) => block.text)
				.join('');
			return {
				thinking: thinkingBlocks || undefined,
				thinkingSummaries: undefined, // Anthropic doesn't use structured summaries
				content: textBlocks
			};
		}

		// Standard message content
		return {
			thinking: undefined,
			thinkingSummaries: undefined,
			content: typeof message.content === 'string' ? message.content : ''
		};
	}

	/**
	 * Get API keys from shared store or environment.
	 * Shared store is populated via IPC when user sets API keys.
	 */
	private getApiKeys(): Record<string, string | undefined> {
		return {
			gemini: getSharedApiKey('gemini') || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
			openai: getSharedApiKey('openai') || process.env.OPENAI_API_KEY,
			anthropic: getSharedApiKey('anthropic') || process.env.ANTHROPIC_API_KEY,
		};
	}

	/**
	 * Get Azure OpenAI configuration.
	 * Azure requires: endpoint (to extract instance name), API key, and API version.
	 * For Azure AI Foundry, we also need the full endpoint URL.
	 */
	private getAzureConfig(): { apiKey?: string; instanceName?: string; endpoint?: string; apiVersion?: string } | null {
		// Get Azure API key
		const apiKey = getSharedApiKey('azure') || process.env.AZURE_OPENAI_API_KEY;
		console.log(`[VybeLangGraphService] Azure API key check: hasKey=${!!apiKey}, fromStore=${!!getSharedApiKey('azure')}, fromEnv=${!!process.env.AZURE_OPENAI_API_KEY}`);

		// Get Azure endpoint (e.g., "https://my-resource.openai.azure.com/" or "https://vybe-models-resource.services.ai.azure.com/api/projects/vybe-models")
		// Extract instance name from endpoint
		let endpoint = getSharedApiKey('azure_endpoint') || process.env.AZURE_OPENAI_ENDPOINT;

		// Validate endpoint is a URL, not an API key
		if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
			console.error(`[VybeLangGraphService] ⚠️ Azure endpoint is invalid (not a URL): ${endpoint.substring(0, 50)}...`);
			console.error(`[VybeLangGraphService] ⚠️ This looks like an API key, not an endpoint URL!`);
			console.error(`[VybeLangGraphService] ⚠️ Expected format: https://vybe-models-resource.services.ai.azure.com/api/projects/vybe-models`);
			console.error(`[VybeLangGraphService] ⚠️ Please update your Supabase AZURE_ENDPOINT secret with the correct URL`);
			endpoint = undefined; // Clear invalid endpoint
		}

		console.log(`[VybeLangGraphService] Azure endpoint check: hasEndpoint=${!!endpoint}, endpoint=${endpoint?.substring(0, 50)}...`);
		let instanceName: string | undefined;

		if (endpoint) {
			// Extract instance name from endpoint
			// Azure OpenAI format: https://<instance-name>.openai.azure.com/
			// Azure AI Foundry format: https://<instance-name>.services.ai.azure.com/...
			// For Foundry, extract from the first part before .services.ai.azure.com
			let match = endpoint.match(/https?:\/\/([^.]+)\.(openai|services\.ai)\.azure\.com/);
			if (match) {
				instanceName = match[1];
				console.log(`[VybeLangGraphService] Extracted instance name: ${instanceName}`);
			} else {
				// Try alternative formats
				match = endpoint.match(/https?:\/\/([^.]+)\.models\.ai\.azure\.com/);
				if (match) {
					instanceName = match[1];
					console.log(`[VybeLangGraphService] Extracted instance name (alt format): ${instanceName}`);
				} else {
					console.warn(`[VybeLangGraphService] Could not extract instance name from Azure endpoint: ${endpoint}`);
				}
			}
		}

		// Get API version (default to 2024-05-01-preview for Azure AI Foundry)
		const apiVersion = getSharedApiKey('azure_api_version') || process.env.AZURE_OPENAI_API_VERSION || '2024-05-01-preview';

		if (!apiKey) {
			return null;
		}

		// Return config with either instanceName (standard Azure) or endpoint (Azure Foundry)
		return { apiKey, instanceName, endpoint, apiVersion };
	}

	// Note: buildLangChainMessages was removed - createAgent handles messages directly
	// Note: executeTool was removed - tools are now executed by createAgent internally
	// Note: resumeWithApproval uses native LangGraph streaming (agent.stream() with streamMode: "messages")

	/**
	 * Resume a task after user approval.
	 */
	async resumeWithApproval(request: LangGraphResumeRequest): Promise<void> {
		const { taskId, decision, editedArgs } = request;
		const task = activeTasks.get(taskId);

		if (!task) {
			console.warn(`[VybeLangGraphService] No active task found: ${taskId}`);
			return;
		}

		const { state, eventHandler, toolContext } = task;

		if (!state.pendingApproval) {
			console.warn(`[VybeLangGraphService] No pending approval for task: ${taskId}`);
			return;
		}

		const pendingTool = state.pendingApproval;
		console.log(`[VybeLangGraphService] Resuming with decision: ${decision} for tool: ${pendingTool.tool}`);

		if (decision === 'reject') {
			// User rejected - emit cancellation
			eventHandler({
				type: 'complete',
				payload: { status: 'cancelled' },
				timestamp: Date.now(),
				task_id: taskId,
			});

			// Clear pending and stop
			state.pendingApproval = undefined;
			task.abortController.abort();
			activeTasks.delete(taskId);
			return;
		}

		// Clear pending approval
		state.pendingApproval = undefined;

		// Execute the approved tool manually and then resume the graph
		const toolArgs = decision === 'edit' && editedArgs ? editedArgs : pendingTool.args;

		try {
			// Emit tool start
			eventHandler({
				type: 'tool.call',
				payload: {
					tool_name: pendingTool.tool,
					tool_id: pendingTool.toolCallId,
					arguments: toolArgs,
				},
				timestamp: Date.now(),
				task_id: taskId,
			});

			// Execute the tool via toolContext
			let result = 'Tool executed';
			if (toolContext) {
				switch (pendingTool.tool) {
					// write_file tool removed - use edit_file for all file operations
					case 'edit_file': {
						const resumeEditFileResult = await toolContext.fileService.editFile(
							toolArgs.file_path as string,
							toolArgs.old_string as string,
							toolArgs.new_string as string
						);
						// Parse result to check for deferred write
						try {
							const parsedResult = typeof resumeEditFileResult === 'string' ? JSON.parse(resumeEditFileResult) : resumeEditFileResult;
							if (parsedResult?.deferred === true) {
								// File write is deferred - use the message from tool or construct clear message
								result = parsedResult.message || `File edited successfully: ${toolArgs.file_path as string}. The file system has confirmed the write operation.`;
							} else if (parsedResult?.created === true) {
								// New file was created immediately
								result = `File created successfully: ${toolArgs.file_path as string}`;
							} else {
								// File was written immediately (shouldn't happen for existing files, but handle gracefully)
								result = `File edited successfully: ${toolArgs.file_path as string}`;
							}
						} catch {
							// If parsing fails, use the result as-is (should be a string)
							result = typeof resumeEditFileResult === 'string' ? resumeEditFileResult : 'File edited successfully';
						}
						break;
					}
					case 'run_terminal_cmd':
						result = await toolContext.terminalService.runCommand(
							toolArgs.command as string,
							toolArgs.is_background as boolean | undefined
						);
						break;
					case 'delete_file':
						result = await toolContext.fileService.deleteFile(toolArgs.target_file as string);
						break;
				}
			}

			// Emit tool complete
			eventHandler({
				type: 'tool.result',
				payload: {
					tool_name: pendingTool.tool,
					tool_id: pendingTool.toolCallId,
					result,
				},
				timestamp: Date.now(),
				task_id: taskId,
			});

			state.toolCallCount++;

			// Update messages with tool result
			state.messages.push({
				role: 'tool',
				content: result,
				toolCallId: pendingTool.toolCallId,
				toolName: pendingTool.tool,
			});

			// Resume the agent graph using Command.resume()
			// Get the agent and resume from checkpoint
			const modelId = state.model || 'azure/gpt-5.2';
			const reasoningLevel = task.reasoningLevel || 'medium';
			const model = this.createLangChainModel(modelId, reasoningLevel);
			if (!model) {
				throw new Error(`No model available: ${modelId}`);
			}

			// Always recreate tools to ensure latest tools are included
			langchainTools = createLangChainTools();
			const toolNames = langchainTools.map((t: any) => t.name || 'unknown').join(', ');
			console.log('[VybeLangGraphService] Created', langchainTools.length, 'LangChain tools:', toolNames);

			// Build middleware array for resume
			const middleware: any[] = [];

			// Add tool error handler middleware
			const toolErrorMiddleware = this.createToolErrorHandlerMiddleware(eventHandler, taskId);
			if (toolErrorMiddleware) {
				middleware.push(toolErrorMiddleware);
			}

			// Build system prompt for resume (same as initial creation)
			// Note: context is not available in resumeWithApproval, use empty object
			const { buildDynamicSystemPrompt } = await import('./vybeDynamicPrompt.js');
			const systemPrompt = buildDynamicSystemPrompt({
				level: state.level,
				context: {}, // Context not available in resume, use empty object
				toolCallCount: state.toolCallCount,
				turnCount: state.turnCount,
				messageCount: state.messages.length,
				modelName: modelId,
			});

			const agent = createAgent({
				model: model,
				tools: langchainTools,
				checkpointer: this.checkpointer, // renamed from checkpointSaver
				systemPrompt: systemPrompt, // moved from inputMessages
				middleware: middleware.length > 0 ? middleware : undefined,
			});

			// Resume from the checkpoint with the tool result
			// Import budget tier for recursion limit
			const { BUDGET_TIERS } = await import('./vybePromptConfig.js');
			const tier = BUDGET_TIERS[state.level];
			const config = {
				configurable: { thread_id: taskId },
				recursionLimit: tier.maxTurns * 4,
			};

			// Use Command.resume() to continue the graph
			// The tool result is passed back to continue execution
			const toolMessage = new ToolMessage({
				content: result,
				tool_call_id: pendingTool.toolCallId,
				name: pendingTool.tool,
			});

			// Continue streaming using native LangGraph streaming
			console.log(`[VybeLangGraphService] Resuming with native streaming after tool approval`);
			const stream = await agent.stream(
				Command.resume({ messages: [toolMessage] }),
				{ ...config, streamMode: 'messages' as const }
			);

			let pendingToolApproval = false;
			let totalTokens = 0;
			// Track emitted content to prevent duplicates - simpler than delta calculation
			const emittedContentSet = new Set<string>();
			let lastEmittedContent = ''; // For delta calculation from cumulative chunks

			for await (const [token, _metadata] of stream) {
				if (task.abortController.signal.aborted) {
					console.log('[VybeLangGraphService] Resume stream aborted');
					break;
				}

				totalTokens++;

				// Check if this is an AI message chunk
				if (isAIMessageChunk && isAIMessageChunk(token)) {
					// Handle tool call chunks
					if (token.tool_call_chunks && token.tool_call_chunks.length > 0) {
						for (const tc of token.tool_call_chunks) {
							const toolName = tc.name || '';
							console.log(`[VybeLangGraphService] Resume: Tool call chunk: ${toolName || 'unnamed'}`);

							// Emit token event with tool call info
							eventHandler({
								type: 'token',
								payload: {
									content: '',
									tool_call: {
										id: tc.id || `tool_${Date.now()}`,
										name: toolName,
										args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
									},
								},
								timestamp: Date.now(),
								task_id: taskId,
							});

							// Check if tool requires approval
							if (toolName && TOOLS_REQUIRING_APPROVAL.includes(toolName)) {
								pendingToolApproval = true;
								state.pendingApproval = {
									tool: toolName,
									args: typeof tc.args === 'object' ? tc.args : {},
									toolCallId: tc.id || `tool_${Date.now()}`,
								};
							}
						}
					}

					// Handle text content
					const content = token.content;
					if (content) {
						let textContent = '';

						if (typeof content === 'string') {
							textContent = content;
						} else if (Array.isArray(content)) {
							// Content can be an array of content blocks
							for (const block of content) {
								if (typeof block === 'string') {
									textContent += block;
								} else if (block && typeof block === 'object') {
									// Check for thinking content
									if (block.type === 'thinking' || block.thought === true) {
										const thinkingText = block.text || block.thinking || '';
										if (thinkingText) {
											// Emit thinking content directly
											eventHandler({
												type: 'token',
												payload: {
													thinking: thinkingText,
												},
												timestamp: Date.now(),
												task_id: taskId,
											});
										}
									} else if (block.type === 'text' || block.text) {
										textContent += block.text || '';
									}
								}
							}
						}

						if (textContent) {
							// CRITICAL: Check if this exact content was already emitted (prevent duplicates)
							if (emittedContentSet.has(textContent)) {
								console.log(`[VybeLangGraphService] Resume: 🚫 SKIPPING duplicate content (${textContent.length} chars)`);
								continue; // Skip this token entirely
							}

							// AIMessageChunk.content is CUMULATIVE (full content each time)
							// Calculate delta: new portion = current - previous
							let deltaContent = textContent;
							if (lastEmittedContent && textContent.startsWith(lastEmittedContent)) {
								// Content is cumulative - extract only the new portion
								deltaContent = textContent.slice(lastEmittedContent.length);
							} else if (lastEmittedContent && lastEmittedContent.length > 0) {
								// Content doesn't start with previous - might be a new block or reset
								console.log(`[VybeLangGraphService] Resume: ⚠️ Content doesn't continue previous (prev: ${lastEmittedContent.length} chars, new: ${textContent.length} chars)`);
								lastEmittedContent = '';
								deltaContent = textContent;
							}

							// Only emit if there's new content
							if (deltaContent.length > 0) {
								console.log(`[VybeLangGraphService] Resume: ✅ Emitting text delta: ${deltaContent.length} chars (cumulative: ${textContent.length} chars)`);
								eventHandler({
									type: 'token',
									payload: { content: deltaContent },
									timestamp: Date.now(),
									task_id: taskId,
								});
								// Track the full cumulative content to prevent duplicates
								emittedContentSet.add(textContent);
								// Update last emitted to the full cumulative content
								lastEmittedContent = textContent;
							}
						}
					}
				}
			}

			console.log(`[VybeLangGraphService] Resume streaming complete: ${totalTokens} tokens`);

			// Emit complete event
			if (!pendingToolApproval) {
				eventHandler({
					type: 'complete',
					payload: { status: 'success' },
					timestamp: Date.now(),
					task_id: taskId,
				});
			}

			// If we have pending approval, we'll resume again later
			if (pendingToolApproval) {
				console.log('[VybeLangGraphService] Resume: Waiting for tool approval...');
				return;
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('[VybeLangGraphService] Resume error:', errorMessage);

			eventHandler({
				type: 'tool.result',
				payload: {
					tool_name: pendingTool.tool,
					tool_id: pendingTool.toolCallId,
					error: errorMessage,
				},
				timestamp: Date.now(),
				task_id: taskId,
			});

			eventHandler({
				type: 'complete',
				payload: { status: 'failed', summary: errorMessage },
				timestamp: Date.now(),
				task_id: taskId,
			});
		} finally {
			activeTasks.delete(taskId);
		}
	}

	/**
	 * Cancel a running task.
	 */
	cancelTask(taskId: string): void {
		const task = activeTasks.get(taskId);
		if (task) {
			task.abortController.abort();
			activeTasks.delete(taskId);
		}
	}

	/**
	 * Check if LangGraph is available.
	 */
	isAvailable(): boolean {
		return langGraphLoaded;
	}

	/**
	 * Get task state for debugging.
	 */
	getTaskState(taskId: string): AgentState | undefined {
		return activeTasks.get(taskId)?.state;
	}
}

// ============================================================================
// SINGLETON
// ============================================================================

let langGraphServiceInstance: VybeLangGraphService | null = null;

export function getLangGraphService(): VybeLangGraphService {
	if (!langGraphServiceInstance) {
		langGraphServiceInstance = new VybeLangGraphService();
	}
	return langGraphServiceInstance;
}

