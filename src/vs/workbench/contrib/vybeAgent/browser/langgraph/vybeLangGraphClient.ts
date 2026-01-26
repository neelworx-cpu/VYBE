/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LangGraph Client - Browser Process
 *
 * Communicates with the LangGraph service running in the main process via IPC.
 * This is the browser-side interface for the LangGraph agent.
 */

// eslint-disable-next-line no-restricted-imports
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { VybeAgentEvent as VybeEvent } from '../../common/vybeAgentEvents.js';

// ============================================================================
// IPC Channel Names (must match electron-main/vybeIpcHandlers.ts)
// ============================================================================

const IPC_CHANNELS = {
	LANGGRAPH_START: 'vscode:vybeLangGraphStart',
	LANGGRAPH_EVENT: 'vscode:vybeLangGraphEvent',
	LANGGRAPH_RESUME: 'vscode:vybeLangGraphResume',
	LANGGRAPH_CANCEL: 'vscode:vybeLangGraphCancel',
	LANGGRAPH_STATUS: 'vscode:vybeLangGraphStatus',
	LANGGRAPH_TOOL_EXEC: 'vscode:vybeLangGraphToolExec',
	LANGGRAPH_TOOL_RESULT: 'vscode:vybeLangGraphToolResult',
	LANGGRAPH_RESUME_TASK: 'vscode:vybeLangGraphResumeTask',
	LANGGRAPH_RETRY_TASK: 'vscode:vybeLangGraphRetryTask',
	LANGGRAPH_GET_INCOMPLETE_TASKS: 'vscode:vybeLangGraphGetIncompleteTasks',
} as const;

// ============================================================================
// Types
// ============================================================================

export interface LangGraphEvent {
	type: string;
	payload: unknown;
	timestamp: number;
	task_id: string;
}

export interface LangGraphStartRequest {
	taskId: string;
	goal: string;
	model?: string; // Selected model ID (e.g., 'kimi-k2-thinking', 'gemini-2.0-flash')
	level?: 'L1' | 'L2' | 'L3'; // Budget tier (L1=Quick, L2=Standard, L3=Deep)
	reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh'; // Reasoning effort level (defaults to 'medium')
	context?: {
		workspaceRoot?: string;
		activeFile?: string;
		projectType?: string;
	};
}

export interface LangGraphStatus {
	available: boolean;
	initialized: boolean;
}

export interface ToolExecRequest {
	taskId: string;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

// Tool result can be string or object
export type ToolResult = string | Record<string, unknown> | unknown;

export type ToolExecutor = (
	toolName: string,
	args: Record<string, unknown>
) => Promise<ToolResult>;

// ============================================================================
// LangGraph Client
// ============================================================================

/**
 * Browser-side client for the LangGraph service.
 * Handles IPC communication with the main process.
 */
export class VybeLangGraphClient extends Disposable {
	private eventListenerRegistered = false;
	private toolExecListenerRegistered = false;
	private toolExecutor: ToolExecutor | null = null;

	private readonly _onEvent = this._register(new Emitter<LangGraphEvent>());
	readonly onEvent: Event<LangGraphEvent> = this._onEvent.event;

	constructor() {
		super();
		this.registerEventListener();
		this.registerToolExecListener();
	}

	/**
	 * Register the LangGraph event listener.
	 */
	private registerEventListener(): void {
		if (this.eventListenerRegistered || !ipcRenderer) {
			return;
		}

		ipcRenderer.on(IPC_CHANNELS.LANGGRAPH_EVENT, this.handleEventRaw);
		this.eventListenerRegistered = true;
	}

	/**
	 * Raw IPC handler for events.
	 */
	private handleEventRaw = (_ipcEvent: unknown, ...args: unknown[]): void => {
		const event = args[0] as LangGraphEvent | undefined;
		if (event) {
			this._onEvent.fire(event);
		}
	};

	/**
	 * Register the tool execution listener.
	 * Main process sends tool execution requests here.
	 */
	private registerToolExecListener(): void {
		if (this.toolExecListenerRegistered || !ipcRenderer) {
			return;
		}

		ipcRenderer.on(IPC_CHANNELS.LANGGRAPH_TOOL_EXEC, this.handleToolExecRaw);
		this.toolExecListenerRegistered = true;
	}

	/**
	 * Raw IPC handler for tool execution requests.
	 */
	private handleToolExecRaw = async (_ipcEvent: unknown, ...args: unknown[]): Promise<void> => {
		const request = args[0] as ToolExecRequest | undefined;
		if (!request || !this.toolExecutor) {
			// No executor set - send error
			this.sendToolResult(request?.toolCallId || 'unknown', undefined, 'No tool executor available');
			return;
		}

		try {
			const result = await this.toolExecutor(request.toolName, request.args);
			const resultString = typeof result === 'string' ? result : JSON.stringify(result);
			this.sendToolResult(request.toolCallId, resultString);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.sendToolResult(request.toolCallId, undefined, errorMessage);
		}
	};

	/**
	 * Send tool execution result back to main process.
	 */
	private sendToolResult(toolCallId: string, result?: string, error?: string): void {
		if (!ipcRenderer) {
			return;
		}

		ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_TOOL_RESULT, {
			toolCallId,
			result,
			error,
		}).catch(err => {
			console.error('[VybeLangGraphClient] Failed to send tool result:', err);
		});
	}

	/**
	 * Set the tool executor function.
	 * This will be called when the main process requests tool execution.
	 */
	setToolExecutor(executor: ToolExecutor): void {
		this.toolExecutor = executor;
	}

	/**
	 * Start a LangGraph agent task.
	 */
	async startTask(request: LangGraphStartRequest): Promise<{ taskId: string; started: boolean }> {
		if (!ipcRenderer) {
			throw new Error('IPC not available - not in Electron environment');
		}

		try {
			const result = await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_START, request);
			return result as { taskId: string; started: boolean };
		} catch (error) {
			console.error('[VybeLangGraphClient] Failed to start task:', error);
			throw error;
		}
	}

	/**
	 * Resume a task after HITL interrupt.
	 */
	async resumeWithApproval(
		taskId: string,
		decision: 'approve' | 'reject' | 'edit',
		editedArgs?: Record<string, unknown>
	): Promise<void> {
		if (!ipcRenderer) {
			throw new Error('IPC not available - not in Electron environment');
		}

		try {
			await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_RESUME, {
				taskId,
				decision,
				editedArgs,
			});
		} catch (error) {
			console.error('[VybeLangGraphClient] Failed to resume task:', error);
			throw error;
		}
	}

	/**
	 * Cancel a running task.
	 */
	async cancelTask(taskId: string): Promise<void> {
		if (!ipcRenderer) {
			return;
		}

		try {
			await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_CANCEL, taskId);
		} catch (error) {
			console.error('[VybeLangGraphClient] Failed to cancel task:', error);
		}
	}

	/**
	 * Check if LangGraph is available.
	 * Uses retry logic to handle startup timing issues where the browser
	 * process may start before the main process registers handlers.
	 */
	async getStatus(retryCount = 3, retryDelayMs = 500): Promise<LangGraphStatus> {
		if (!ipcRenderer) {
			return { available: false, initialized: false };
		}

		for (let attempt = 0; attempt < retryCount; attempt++) {
			try {
				const result = await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_STATUS);
				return result as LangGraphStatus;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				const isHandlerNotRegistered = errorMessage.includes('No handler registered');

				if (isHandlerNotRegistered && attempt < retryCount - 1) {
					// Handler not registered yet - wait and retry
					console.log(`[VybeLangGraphClient] Handler not ready, retry ${attempt + 1}/${retryCount} in ${retryDelayMs}ms`);
					await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
					continue;
				}

				// Log only on final failure or non-timing errors
				if (attempt === retryCount - 1) {
					console.warn('[VybeLangGraphClient] LangGraph status check failed after retries:', errorMessage);
				}
				return { available: false, initialized: false };
			}
		}

		return { available: false, initialized: false };
	}

	/**
	 * Resume a task from its last checkpoint after an error.
	 */
	async resumeTask(taskId: string, modelId?: string, reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh'): Promise<void> {
		if (!ipcRenderer) {
			throw new Error('IPC renderer not available');
		}

		await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_RESUME_TASK, {
			taskId,
			modelId,
			reasoningLevel,
		});
	}

	/**
	 * Retry a task from scratch after an error.
	 */
	async retryTask(request: LangGraphStartRequest): Promise<void> {
		if (!ipcRenderer) {
			throw new Error('IPC renderer not available');
		}

		await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_RETRY_TASK, request);
	}

	/**
	 * Get incomplete tasks for recovery on startup.
	 */
	async getIncompleteTasks(): Promise<Array<{
		taskId: string;
		threadId: string;
		lastMessage: string;
		timestamp: number;
	}>> {
		if (!ipcRenderer) {
			return [];
		}

		const result = await ipcRenderer.invoke(IPC_CHANNELS.LANGGRAPH_GET_INCOMPLETE_TASKS);
		return (result as { tasks: Array<{ taskId: string; threadId: string; lastMessage: string; timestamp: number }> }).tasks || [];
	}

	/**
	 * Convert LangGraph events to VybeAgentEvents.
	 * Since the backend now emits events in VybeEvent format directly,
	 * this just passes the event through unchanged.
	 */
	static convertToVybeEvent(langGraphEvent: LangGraphEvent): VybeEvent | null {
		// Events are already in VybeEvent format - pass through directly
		// The backend emits type, payload, timestamp, task_id which matches VybeEvent
		const vybeEvent = langGraphEvent as unknown as VybeEvent;

		return vybeEvent;
	}

	override dispose(): void {
		// Remove IPC listeners
		if (ipcRenderer && this.eventListenerRegistered) {
			ipcRenderer.removeListener(IPC_CHANNELS.LANGGRAPH_EVENT, this.handleEventRaw);
			this.eventListenerRegistered = false;
		}
		if (ipcRenderer && this.toolExecListenerRegistered) {
			ipcRenderer.removeListener(IPC_CHANNELS.LANGGRAPH_TOOL_EXEC, this.handleToolExecRaw);
			this.toolExecListenerRegistered = false;
		}
		super.dispose();
	}
}

// ============================================================================
// Singleton
// ============================================================================

let langGraphClientInstance: VybeLangGraphClient | null = null;

export function getLangGraphClient(): VybeLangGraphClient {
	if (!langGraphClientInstance) {
		langGraphClientInstance = new VybeLangGraphClient();
	}
	return langGraphClientInstance;
}

