/*---------------------------------------------------------------------------------------------
 *  VYBE - Tool Adapter for LangGraph Agent
 *  Wraps all VYBE tools with Zod schemas for LangGraph compatibility
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/agents#defining-tools
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/agents#tool-error-handling
 *--------------------------------------------------------------------------------------------*/

import { tool } from '@langchain/core/tools';
import * as z from 'zod';

// =====================================================
// TOOL CONTEXT INTERFACE
// =====================================================
// Context passed to tools from the agent runtime

export interface VybeToolContext {
	fileService: {
		readFile: (path: string, offset?: number, limit?: number) => Promise<string>;
		writeFile: (path: string, contents: string) => Promise<void>;
		editFile: (path: string, oldString: string, newString: string) => Promise<void>;
		grep: (pattern: string, path?: string, glob?: string) => Promise<string>;
		listDir: (path: string) => Promise<string>;
		glob: (pattern: string) => Promise<string[]>;
	};
	terminalService: {
		runCommand: (command: string, isBackground?: boolean) => Promise<string>;
		runInSession: (command: string) => Promise<string>;
	};
	indexService: {
		semanticSearch: (query: string, directories?: string[]) => Promise<string>;
		getVectorStore: () => unknown;
	};
}

// =====================================================
// TOOL DEFINITIONS WITH ZOD SCHEMAS
// =====================================================

/**
 * Read a file from the workspace
 */
export const readFileTool = tool(
	async (input: { target_file: string; offset?: number; limit?: number }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}
		const content = await context.fileService.readFile(
			input.target_file,
			input.offset,
			input.limit
		);
		return content;
	},
	{
		name: 'read_file',
		description: 'Read a file from the workspace. Returns file contents with line numbers.',
		schema: z.object({
			target_file: z.string().describe('Path to the file (relative or absolute)'),
			offset: z.number().optional().describe('Line number to start reading from'),
			limit: z.number().optional().describe('Number of lines to read'),
		}),
	}
);

/**
 * Write contents to a file
 */
export const writeFileTool = tool(
	async (input: { file_path: string; contents: string }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}
		await context.fileService.writeFile(input.file_path, input.contents);
		return `Successfully wrote ${input.contents.length} characters to ${input.file_path}`;
	},
	{
		name: 'write_file',
		description: 'Write contents to a file, creating it if it doesn\'t exist or overwriting if it does.',
		schema: z.object({
			file_path: z.string().describe('Path to the file to write'),
			contents: z.string().describe('The full contents to write'),
		}),
	}
);

/**
 * Edit a file by replacing old_string with new_string
 */
export const editFileTool = tool(
	async (input: { file_path: string; old_string: string; new_string: string }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}
		await context.fileService.editFile(input.file_path, input.old_string, input.new_string);
		return `Successfully replaced content in ${input.file_path}`;
	},
	{
		name: 'edit_file',
		description: 'Edit a file by replacing old_string with new_string. The old_string must be unique.',
		schema: z.object({
			file_path: z.string().describe('Path to the file to edit'),
			old_string: z.string().describe('The exact text to find and replace'),
			new_string: z.string().describe('The new text to replace with'),
		}),
	}
);

/**
 * Search for a regex pattern in files
 */
export const grepTool = tool(
	async (input: { pattern: string; path?: string; glob?: string }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}
		return await context.fileService.grep(input.pattern, input.path, input.glob);
	},
	{
		name: 'grep',
		description: 'Search for a regex pattern in files. Returns matching lines with context.',
		schema: z.object({
			pattern: z.string().describe('Regex pattern to search for'),
			path: z.string().optional().describe('Directory to search in'),
			glob: z.string().optional().describe('File pattern like *.ts'),
		}),
	}
);

/**
 * List files and directories in a path
 */
export const listDirTool = tool(
	async (input: { target_directory: string }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}
		return await context.fileService.listDir(input.target_directory);
	},
	{
		name: 'list_dir',
		description: 'List files and directories in a path. Always use relative paths or workspace folder names (e.g., "void", "src", "void/src") - NEVER use absolute paths like "/Users/neel/void". Never use "." unless explicitly listing the workspace root. For multi-root workspaces, you can use workspace folder names directly (e.g., "void" to list the void workspace folder).',
		schema: z.object({
			target_directory: z.string().describe('Directory name or relative path to list. Use relative names like "void", "src", "void/src". NEVER use absolute paths. Only use "." for workspace root.'),
		}),
	}
);

/**
 * Execute a terminal command (requires user approval via HITL)
 */
export const terminalTool = tool(
	async (input: { command: string; is_background?: boolean }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.terminalService) {
			throw new Error('Terminal service not available in context');
		}
		// HITL middleware will interrupt here for approval
		return await context.terminalService.runCommand(input.command, input.is_background);
	},
	{
		name: 'run_terminal_cmd',
		description: 'Execute a terminal command. Requires user approval.',
		schema: z.object({
			command: z.string().describe('The command to execute'),
			is_background: z.boolean().optional().describe('Run in background'),
		}),
	}
);

/**
 * Semantic search over the codebase
 */
export const codebaseSearchTool = tool(
	async (input: { query: string; target_directories?: string[] }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.indexService) {
			throw new Error('Index service not available in context');
		}
		return await context.indexService.semanticSearch(input.query, input.target_directories);
	},
	{
		name: 'codebase_search',
		description: 'Semantic search over the codebase using AI embeddings. Use this for conceptual questions like "where is X implemented?", "how does Y work?", "what files handle Z?". This tool understands code meaning, not just text matching. Prefer this over grep for "where/how/what" questions about code functionality, architecture, or implementation details.',
		schema: z.object({
			query: z.string().describe('Natural language query describing what to search for (e.g., "where is authentication handled?", "how does file reading work?")'),
			target_directories: z.array(z.string()).optional().describe('Optional: Array of directory paths to limit search to (relative to workspace root)'),
		}),
	}
);

/**
 * Search files by pattern and content
 */
export const fileSearchTool = tool(
	async (input: { pattern: string; query?: string }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}
		const files = await context.fileService.glob(input.pattern);
		if (input.query) {
			const matches = await context.fileService.grep(input.query, undefined, input.pattern);
			return matches;
		}
		return files.join('\n');
	},
	{
		name: 'file_search',
		description: 'Search files by pattern and content',
		schema: z.object({
			pattern: z.string().describe('Glob pattern like **/*.ts'),
			query: z.string().optional().describe('Content to search for'),
		}),
	}
);

/**
 * Execute command in persistent shell session
 */
export const shellTool = tool(
	async (input: { command: string }, config) => {
		const context = config?.configurable?.context as VybeToolContext;
		if (!context?.terminalService) {
			throw new Error('Terminal service not available in context');
		}
		return await context.terminalService.runInSession(input.command);
	},
	{
		name: 'shell',
		description: 'Execute command in persistent shell session',
		schema: z.object({
			command: z.string().describe('The command to execute'),
		}),
	}
);

// =====================================================
// EXPORT ALL TOOLS
// =====================================================

export const allVybeTools = [
	readFileTool,
	writeFileTool,
	editFileTool,
	grepTool,
	listDirTool,
	terminalTool,
	codebaseSearchTool,
	fileSearchTool,
	shellTool,
];

// =====================================================
// TOOL ERROR HANDLING MIDDLEWARE
// =====================================================

export interface ToolCallRequest {
	toolCall: {
		id?: string;
		name: string;
		args: unknown;
	};
}

export interface ToolMessage {
	content: string;
	tool_call_id: string;
}

export function createToolErrorHandlerMiddleware() {
	return {
		name: 'VybeToolErrorHandler',
		wrapToolCall: async <T>(
			request: ToolCallRequest,
			handler: (req: ToolCallRequest) => Promise<T>
		): Promise<T | ToolMessage> => {
			try {
				return await handler(request);
			} catch (error) {
				// Return custom error message to the model for retry
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					content: `Tool error: ${errorMessage}. Please check your input and try again.`,
					tool_call_id: request.toolCall.id || 'unknown',
				} as ToolMessage as unknown as T;
			}
		},
	};
}

// Export middleware instance
export const toolErrorHandlerMiddleware = createToolErrorHandlerMiddleware();





