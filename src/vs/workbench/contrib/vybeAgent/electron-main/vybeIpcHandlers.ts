/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE IPC Handlers
 *
 * IPC handlers for LangGraph agent communication.
 * All agent operations run through LangGraph in the main process.
 */

import type { IpcMainInvokeEvent } from 'electron';
import { validatedIpcMain } from '../../../../base/parts/ipc/electron-main/ipcMain.js';
import type { ProviderName } from '../common/vybeStreamProtocol.js';
import {
	getLangGraphService,
	setSharedApiKey,
	type LangGraphEvent,
	type ToolContext,
} from './vybeLangGraphService.js';

// ============================================================================
// IPC Channel Names
// ============================================================================

export const IPC_CHANNELS = {
	/** Set API key for a provider */
	API_SET_KEY: 'vscode:vybeApiSetKey',

	// ========================================================================
	// LangGraph Channels
	// ========================================================================

	/** Start a LangGraph agent task */
	LANGGRAPH_START: 'vscode:vybeLangGraphStart',

	/** Receive LangGraph events */
	LANGGRAPH_EVENT: 'vscode:vybeLangGraphEvent',

	/** Resume LangGraph after HITL interrupt */
	LANGGRAPH_RESUME: 'vscode:vybeLangGraphResume',

	/** Cancel LangGraph task */
	LANGGRAPH_CANCEL: 'vscode:vybeLangGraphCancel',

	/** Check if LangGraph is available */
	LANGGRAPH_STATUS: 'vscode:vybeLangGraphStatus',

	/** Resume task from checkpoint after error */
	LANGGRAPH_RESUME_TASK: 'vscode:vybeLangGraphResumeTask',

	/** Retry task from scratch after error */
	LANGGRAPH_RETRY_TASK: 'vscode:vybeLangGraphRetryTask',

	/** Get incomplete tasks for recovery */
	LANGGRAPH_GET_INCOMPLETE_TASKS: 'vscode:vybeLangGraphGetIncompleteTasks',

	/** Execute a tool (called from LangGraph, executed in browser) */
	LANGGRAPH_TOOL_EXEC: 'vscode:vybeLangGraphToolExec',

	/** Tool execution result (from browser back to main) */
	LANGGRAPH_TOOL_RESULT: 'vscode:vybeLangGraphToolResult',

} as const;

// ============================================================================
// Request Types
// ============================================================================

interface SetKeyRequest {
	provider: ProviderName;
	apiKey: string;
}

// ============================================================================
// LangGraph Request Types
// ============================================================================

interface LangGraphStartRequest {
	taskId: string;
	goal: string;
	model?: string; // Selected model ID (e.g., 'gemini-2.5-pro', 'gemini-2.5-flash', 'ollama:qwen3-coder')
	level?: 'L1' | 'L2' | 'L3'; // Budget tier level
	reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh'; // Reasoning effort level (defaults to 'medium')
	context?: {
		workspaceRoot?: string;
		activeFile?: string;
		projectType?: string;
	};
}

interface LangGraphResumeIpcRequest {
	taskId: string;
	decision: 'approve' | 'reject' | 'edit';
	editedArgs?: Record<string, unknown>;
}

interface ToolExecResult {
	taskId: string;
	toolCallId: string;
	result?: string;
	error?: string;
}

// ============================================================================
// Pending Tool Executions
// ============================================================================

/** Pending tool executions waiting for browser response */
const pendingToolExecs = new Map<string, {
	resolve: (result: string) => void;
	reject: (error: Error) => void;
}>();

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register all VYBE IPC handlers.
 * Call this during app initialization.
 */
export function registerVybeIpcHandlers(): void {
	console.log('[VybeIpcHandlers] Starting handler registration...');

	const langGraphService = getLangGraphService();

	// ========================================================================
	// Set API Key - stores key for LangGraph model access
	// ========================================================================

	validatedIpcMain.handle(IPC_CHANNELS.API_SET_KEY, async (_event: IpcMainInvokeEvent, request: SetKeyRequest) => {
		console.log('[VybeIpcHandlers] Setting API key:', { provider: request.provider, hasKey: !!request.apiKey });
		setSharedApiKey(request.provider, request.apiKey);
		console.log('[VybeIpcHandlers] API key set successfully for:', request.provider);
		return { success: true };
	});

	// Also handle the legacy vscode:vybeSetApiKey channel
	validatedIpcMain.handle('vscode:vybeSetApiKey', async (_event: IpcMainInvokeEvent, provider: string, apiKey: string) => {
		console.log('[VybeIpcHandlers] Setting API key (legacy):', { provider, hasKey: !!apiKey });
		setSharedApiKey(provider, apiKey);
		return { success: true };
	});

	// ========================================================================
	// Model Listing - Static list for now, can be enhanced with LangChain
	// ========================================================================

	validatedIpcMain.handle('vscode:vybeAgentFetchModels', async (_event: IpcMainInvokeEvent, request: { provider: string }) => {
		console.log('[VybeIpcHandlers] Fetching models for provider:', request.provider);

		// Return curated static model list
		const modelsByProvider: Record<string, Array<{
			id: string;
			displayName: string;
			description: string;
			provider: string;
			supportsTools: boolean;
			supportsReasoning: boolean;
		}>> = {
			gemini: [
				{ id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', description: 'Most capable Gemini model with advanced reasoning', provider: 'gemini', supportsTools: true, supportsReasoning: true },
				{ id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: 'Fast and efficient for quick tasks', provider: 'gemini', supportsTools: true, supportsReasoning: false },
				{ id: 'gemini-3-pro-preview', displayName: 'Gemini 3.0 Pro (Preview)', description: 'Next-gen preview with enhanced capabilities', provider: 'gemini', supportsTools: true, supportsReasoning: true },
				{ id: 'gemini-3-flash-preview', displayName: 'Gemini 3.0 Flash (Preview)', description: 'Next-gen fast preview model', provider: 'gemini', supportsTools: true, supportsReasoning: false },
			],
			openrouter: [
				{ id: 'openrouter/anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet (OpenRouter)', description: 'Via OpenRouter', provider: 'openrouter', supportsTools: true, supportsReasoning: true },
				{ id: 'openrouter/openai/gpt-4o', displayName: 'GPT-4o (OpenRouter)', description: 'Via OpenRouter', provider: 'openrouter', supportsTools: true, supportsReasoning: false },
			],
			openai: [
				{ id: 'gpt-4o', displayName: 'GPT-4o', description: 'Most capable OpenAI model', provider: 'openai', supportsTools: true, supportsReasoning: false },
				{ id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', description: 'Fast and affordable', provider: 'openai', supportsTools: true, supportsReasoning: false },
			],
			anthropic: [
				{ id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', description: 'Best balance of performance', provider: 'anthropic', supportsTools: true, supportsReasoning: true },
				{ id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', description: 'Fast and efficient', provider: 'anthropic', supportsTools: true, supportsReasoning: false },
			],
			azure: [
				{ id: 'azure/gpt-5.2', displayName: 'GPT-5.2 (Azure)', description: 'Latest GPT-5.2 model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5.2-codex', displayName: 'GPT-5.2 Codex (Azure)', description: 'GPT-5.2 Codex model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5.1-codex-max', displayName: 'GPT-5.1 Codex Max (Azure)', description: 'Maximum capability codex model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5.1', displayName: 'GPT-5.1 (Azure)', description: 'GPT-5.1 model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5.1-codex', displayName: 'GPT-5.1 Codex (Azure)', description: 'Codex model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5.1-codex-mini', displayName: 'GPT-5.1 Codex Mini (Azure)', description: 'Lightweight codex model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5', displayName: 'GPT-5 (Azure)', description: 'GPT-5 model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
				{ id: 'azure/gpt-5-codex', displayName: 'GPT-5 Codex (Azure)', description: 'GPT-5 Codex model via Azure', provider: 'azure', supportsTools: true, supportsReasoning: true },
			],
		};

		const models = modelsByProvider[request.provider] || [];
		console.log('[VybeIpcHandlers] Returning', models.length, 'models for', request.provider);
		return { models };
	});

	// ========================================================================
	// LangGraph Handlers
	// ========================================================================

	// Start a LangGraph agent task
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_START, async (event: IpcMainInvokeEvent, request: LangGraphStartRequest) => {
		const { taskId, goal, model, level, reasoningLevel = 'medium', context } = request;

		// Removed noisy log: task start

		// Create tool context that calls back to browser for execution
		const toolContext: ToolContext = {
			fileService: {
				readFile: (path: string, offset?: number, limit?: number) =>
					executeToolInBrowser(event, taskId, 'read_file', { target_file: path, offset, limit }),
				writeFile: async (path: string, contents: string) => {
					await executeToolInBrowser(event, taskId, 'write_file', { file_path: path, contents });
				},
				editFile: async (path: string, oldString: string, newString: string) => {
					await executeToolInBrowser(event, taskId, 'edit_file', { file_path: path, old_string: oldString, new_string: newString });
				},
				grep: (pattern: string, path?: string, glob?: string) =>
					executeToolInBrowser(event, taskId, 'grep', { pattern, path, glob }),
				listDir: (path: string) =>
					executeToolInBrowser(event, taskId, 'list_dir', { target_directory: path }),
				codebaseSearch: (query: string, directories?: string[]) =>
					executeToolInBrowser(event, taskId, 'codebase_search', { query, target_directories: directories }),
				deleteFile: (targetFile: string) =>
					executeToolInBrowser(event, taskId, 'delete_file', { target_file: targetFile }),
			},
			terminalService: {
				runCommand: (command: string, isBackground?: boolean) =>
					executeToolInBrowser(event, taskId, 'run_terminal_cmd', { command, is_background: isBackground }),
			},
		};

		// Event handler sends events to browser
		const eventHandler = (langGraphEvent: LangGraphEvent) => {
			try {
				event.sender.send(IPC_CHANNELS.LANGGRAPH_EVENT, langGraphEvent);
			} catch {
				// Window might be closed
			}
		};

		// Start the task (pass model, level, and reasoningLevel through)
		langGraphService.startTask(
			{ taskId, goal, model, level, reasoningLevel, context },
			eventHandler,
			toolContext
		).catch(error => {
			console.error('[VybeIpcHandlers] LangGraph task error:', error);
			try {
				event.sender.send(IPC_CHANNELS.LANGGRAPH_EVENT, {
					type: 'error',
					payload: { message: error instanceof Error ? error.message : String(error), code: 'IPC_ERROR', recoverable: false },
					timestamp: Date.now(),
					task_id: taskId,
				});
			} catch {
				// Window might be closed
			}
		});

		return { taskId, started: true };
	});

	// Resume LangGraph after HITL interrupt
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_RESUME, async (_event: IpcMainInvokeEvent, request: LangGraphResumeIpcRequest) => {
		const { taskId, decision, editedArgs } = request;
		console.log('[VybeIpcHandlers] Resuming LangGraph task:', taskId, 'decision:', decision);

		await langGraphService.resumeWithApproval({ taskId, decision, editedArgs });
		return { resumed: true };
	});

	// Cancel LangGraph task
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_CANCEL, async (_event: IpcMainInvokeEvent, taskId: string) => {
		console.log('[VybeIpcHandlers] Cancelling LangGraph task:', taskId);
		langGraphService.cancelTask(taskId);
		return { cancelled: true };
	});

	// Check LangGraph status
	console.log('[VybeIpcHandlers] Registering LANGGRAPH_STATUS handler...');
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_STATUS, async () => {
		console.log('[VybeIpcHandlers] LANGGRAPH_STATUS called, initializing...');
		const initialized = await langGraphService.initialize();
		console.log('[VybeIpcHandlers] LANGGRAPH_STATUS result:', { available: langGraphService.isAvailable(), initialized });
		return {
			available: langGraphService.isAvailable(),
			initialized,
		};
	});
	console.log('[VybeIpcHandlers] LANGGRAPH_STATUS handler registered');

	// Receive tool execution result from browser
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_TOOL_RESULT, async (_event: IpcMainInvokeEvent, result: ToolExecResult) => {
		const { toolCallId, result: toolResult, error } = result;
		const pending = pendingToolExecs.get(toolCallId);

		if (pending) {
			pendingToolExecs.delete(toolCallId);
			if (error) {
				pending.reject(new Error(error));
			} else {
				pending.resolve(toolResult || '');
			}
		}

		return { received: true };
	});

	// Resume task from checkpoint after error
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_RESUME_TASK, async (event: IpcMainInvokeEvent, request: { taskId: string; modelId?: string; reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh' }) => {
		const { taskId, modelId, reasoningLevel } = request;
		console.log('[VybeIpcHandlers] Resuming task from checkpoint:', taskId);

		// Get tool context (same as startTask)
		const toolContext: ToolContext = {
			fileService: {
				readFile: (path: string, offset?: number, limit?: number) =>
					executeToolInBrowser(event, taskId, 'read_file', { path, offset, limit }),
				writeFile: async (path: string, contents: string) => {
					await executeToolInBrowser(event, taskId, 'write_file', { path, contents });
				},
				editFile: async (path: string, oldString: string, newString: string) => {
					await executeToolInBrowser(event, taskId, 'edit_file', { path, old_string: oldString, new_string: newString });
				},
				grep: (pattern: string, path?: string, glob?: string) =>
					executeToolInBrowser(event, taskId, 'grep', { pattern, path, glob }),
				listDir: (path: string) =>
					executeToolInBrowser(event, taskId, 'list_dir', { path }),
				codebaseSearch: (query: string, directories?: string[]) =>
					executeToolInBrowser(event, taskId, 'codebase_search', { query, directories }),
				deleteFile: (targetFile: string) =>
					executeToolInBrowser(event, taskId, 'delete_file', { target_file: targetFile }),
			},
			terminalService: {
				runCommand: (command: string, isBackground?: boolean) =>
					executeToolInBrowser(event, taskId, 'run_terminal_cmd', { command, is_background: isBackground }),
			},
		};

		// Event handler sends events to browser
		const eventHandler = (langGraphEvent: LangGraphEvent) => {
			try {
				event.sender.send(IPC_CHANNELS.LANGGRAPH_EVENT, langGraphEvent);
			} catch {
				// Window might be closed
			}
		};

		await langGraphService.resumeTask(taskId, eventHandler, modelId, reasoningLevel, toolContext).catch(error => {
			console.error('[VybeIpcHandlers] Resume task error:', error);
			try {
				event.sender.send(IPC_CHANNELS.LANGGRAPH_EVENT, {
					type: 'error',
					payload: { message: error instanceof Error ? error.message : String(error), code: 'RESUME_ERROR', recoverable: false },
					timestamp: Date.now(),
					task_id: taskId,
				});
			} catch {
				// Window might be closed
			}
		});

		return { resumed: true };
	});

	// Retry task from scratch after error
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_RETRY_TASK, async (event: IpcMainInvokeEvent, request: LangGraphStartRequest) => {
		const { taskId, goal, model, level, reasoningLevel, context } = request;
		console.log('[VybeIpcHandlers] Retrying task from scratch:', taskId);

		// Get tool context (same as startTask)
		const toolContext: ToolContext = {
			fileService: {
				readFile: (path: string, offset?: number, limit?: number) =>
					executeToolInBrowser(event, taskId, 'read_file', { path, offset, limit }),
				writeFile: async (path: string, contents: string) => {
					await executeToolInBrowser(event, taskId, 'write_file', { path, contents });
				},
				editFile: async (path: string, oldString: string, newString: string) => {
					await executeToolInBrowser(event, taskId, 'edit_file', { path, old_string: oldString, new_string: newString });
				},
				grep: (pattern: string, path?: string, glob?: string) =>
					executeToolInBrowser(event, taskId, 'grep', { pattern, path, glob }),
				listDir: (path: string) =>
					executeToolInBrowser(event, taskId, 'list_dir', { path }),
				codebaseSearch: (query: string, directories?: string[]) =>
					executeToolInBrowser(event, taskId, 'codebase_search', { query, directories }),
				deleteFile: (targetFile: string) =>
					executeToolInBrowser(event, taskId, 'delete_file', { target_file: targetFile }),
			},
			terminalService: {
				runCommand: (command: string, isBackground?: boolean) =>
					executeToolInBrowser(event, taskId, 'run_terminal_cmd', { command, is_background: isBackground }),
			},
		};

		// Event handler sends events to browser
		const eventHandler = (langGraphEvent: LangGraphEvent) => {
			try {
				event.sender.send(IPC_CHANNELS.LANGGRAPH_EVENT, langGraphEvent);
			} catch {
				// Window might be closed
			}
		};

		await langGraphService.retryTask(
			{ taskId, goal, model, level, reasoningLevel, context },
			eventHandler,
			toolContext
		).catch(error => {
			console.error('[VybeIpcHandlers] Retry task error:', error);
			try {
				event.sender.send(IPC_CHANNELS.LANGGRAPH_EVENT, {
					type: 'error',
					payload: { message: error instanceof Error ? error.message : String(error), code: 'RETRY_ERROR', recoverable: false },
					timestamp: Date.now(),
					task_id: taskId,
				});
			} catch {
				// Window might be closed
			}
		});

		return { retried: true };
	});

	// Get incomplete tasks for recovery
	validatedIpcMain.handle(IPC_CHANNELS.LANGGRAPH_GET_INCOMPLETE_TASKS, async () => {
		console.log('[VybeIpcHandlers] Getting incomplete tasks...');
		const { getUserId } = await import('../../../services/indexing/common/namespaceUtils.js');
		const userId = getUserId();
		const incomplete = await langGraphService.getIncompleteTasks(userId);
		return { tasks: incomplete };
	});

}

/**
 * Execute a tool in the browser process and wait for result.
 */
async function executeToolInBrowser(
	event: IpcMainInvokeEvent,
	taskId: string,
	toolName: string,
	args: Record<string, unknown>
): Promise<string> {
	const toolCallId = `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	return new Promise((resolve, reject) => {
		// Store pending execution
		pendingToolExecs.set(toolCallId, { resolve, reject });

		// Set timeout
		const timeout = setTimeout(() => {
			pendingToolExecs.delete(toolCallId);
			reject(new Error(`Tool execution timeout: ${toolName}`));
		}, 60000); // 60 second timeout

		// Send tool execution request to browser
		try {
			event.sender.send(IPC_CHANNELS.LANGGRAPH_TOOL_EXEC, {
				taskId,
				toolCallId,
				toolName,
				args,
			});
		} catch (error) {
			clearTimeout(timeout);
			pendingToolExecs.delete(toolCallId);
			reject(error);
		}

		// Update pending to clear timeout on resolution
		const originalResolve = resolve;
		const originalReject = reject;
		pendingToolExecs.set(toolCallId, {
			resolve: (result: string) => {
				clearTimeout(timeout);
				originalResolve(result);
			},
			reject: (error: Error) => {
				clearTimeout(timeout);
				originalReject(error);
			},
		});
	});
}

/**
 * Unregister all VYBE IPC handlers.
 * Call this during app shutdown.
 */
export function unregisterVybeIpcHandlers(): void {
	// Cancel pending tool executions
	for (const [toolCallId, pending] of pendingToolExecs) {
		pending.reject(new Error('Handler unregistered'));
		pendingToolExecs.delete(toolCallId);
	}

	// Remove handlers
	validatedIpcMain.removeHandler(IPC_CHANNELS.API_SET_KEY);
	validatedIpcMain.removeHandler('vscode:vybeSetApiKey');
	validatedIpcMain.removeHandler('vscode:vybeAgentFetchModels');

	// Remove LangGraph handlers
	validatedIpcMain.removeHandler(IPC_CHANNELS.LANGGRAPH_START);
	validatedIpcMain.removeHandler(IPC_CHANNELS.LANGGRAPH_RESUME);
	validatedIpcMain.removeHandler(IPC_CHANNELS.LANGGRAPH_CANCEL);
	validatedIpcMain.removeHandler(IPC_CHANNELS.LANGGRAPH_STATUS);
	validatedIpcMain.removeHandler(IPC_CHANNELS.LANGGRAPH_TOOL_RESULT);
}

