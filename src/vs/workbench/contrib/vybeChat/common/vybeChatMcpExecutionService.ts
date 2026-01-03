/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat MCP Execution Service
 *
 * Bridges chat UI to MCP orchestrator via custom command protocol over stdio.
 * Phase 4.1: Blocking execution only (no streaming yet).
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isNative } from '../../../../base/common/platform.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export const IVybeChatMcpExecutionService = createDecorator<IVybeChatMcpExecutionService>('vybeChatMcpExecutionService');

export interface IVybeChatMcpExecutionService {
	readonly _serviceBrand: undefined;

	/**
	 * Execute a task via MCP orchestrator
	 * Phase 4.2: Blocking execution, returns final result only
	 * Events flow independently via subscribeToTaskEvents()
	 */
	solveTask(params: {
		goal: string;
		repoId: string;
		files?: string[];
		cursorLocation?: { path: string; line: number };
		mode?: 'ask' | 'plan' | 'agent';
		agentLevel?: 'L1' | 'L2' | 'L3';
		taskId?: string; // Optional: if provided, use this taskId (for event subscription)
		modelId?: string; // Optional: selected model ID (format: "provider:modelName" or cloud model ID)
	}): Promise<{
		taskId: string;
		status: 'success' | 'failed' | 'cancelled';
		goal: string;
		summary: string;
		plan?: Array<{ id: string; title: string; description?: string; status?: string }>;
		artifacts?: Array<{ type: string; path?: string; content?: string; metadata?: Record<string, any> }>;
		debug?: {
			agentLevel?: string;
			executionTime?: number;
			contextMetadata?: any;
		};
	}>;

	/**
	 * Subscribe to task events (Phase 4.2: streaming)
	 * Events are forwarded verbatim from MCP - no normalization or transformation
	 */
	subscribeToTaskEvents(taskId: string, callback: (event: any) => void): IDisposable;

	/**
	 * Cancel a running task
	 */
	cancelTask(taskId: string): Promise<void>;
}

export class VybeChatMcpExecutionService implements IVybeChatMcpExecutionService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Execute a task via MCP orchestrator
	 */
	async solveTask(params: {
		goal: string;
		repoId: string;
		files?: string[];
		cursorLocation?: { path: string; line: number };
		mode?: 'ask' | 'plan' | 'agent';
		agentLevel?: 'L1' | 'L2' | 'L3';
		taskId?: string; // Optional: if provided, use this taskId (for event subscription)
		modelId?: string; // Optional: selected model ID (format: "provider:modelName" or cloud model ID)
	}): Promise<{
		taskId: string;
		status: 'success' | 'failed' | 'cancelled';
		goal: string;
		summary: string;
		plan?: Array<{ id: string; title: string; description?: string; status?: string }>;
		artifacts?: Array<{ type: string; path?: string; content?: string; metadata?: Record<string, any> }>;
		debug?: {
			agentLevel?: string;
			executionTime?: number;
			contextMetadata?: any;
		};
	}> {
		if (!isNative || !ipcRenderer) {
			throw new Error('MCP execution service is only available in native Electron environment');
		}

		// Use provided taskId or generate one
		const taskId = params.taskId || generateUuid();

		// Prepare command parameters matching MCP's solve_task schema
		const commandParams = {
			repo_id: params.repoId,
			goal: params.goal,
			files: params.files,
			cursor_location: params.cursorLocation,
			mode: params.mode || 'agent',
			agent_level: params.agentLevel || 'L1',
			model_id: params.modelId, // NEW: Pass selected model ID
		};

		console.log('[VybeChatMcpExecutionService] solveTask called:', {
			taskId,
			goal: params.goal,
			modelId: params.modelId || 'none',
			mode: params.mode,
			agentLevel: params.agentLevel
		});

		// Send command to main process via IPC
		// Main process will write to MCP's stdin and read result from stdout
		console.log('[VybeChatMcpExecutionService] Sending command to main process via IPC...');
		const result = await ipcRenderer.invoke('vscode:sendVybeMcpCommand', {
			command: 'solve_task',
			params: commandParams,
			taskId
		}) as {
			taskId: string;
			result: {
				taskId: string;
				status: 'success' | 'failed' | 'cancelled';
				goal: string;
				summary: string;
				plan?: Array<{ id: string; title: string; description?: string; status?: string }>;
				artifacts?: Array<{ type: string; path?: string; content?: string; metadata?: Record<string, any> }>;
				debug?: {
					agentLevel?: string;
					executionTime?: number;
					contextMetadata?: any;
				};
			};
		};

		// Return full normalized result structure
		return {
			taskId: result.result.taskId || result.taskId,
			status: result.result.status || 'success',
			goal: result.result.goal || params.goal,
			summary: result.result.summary || 'Task completed',
			plan: result.result.plan,
			artifacts: result.result.artifacts,
			debug: result.result.debug,
		};
	}

	/**
	 * Subscribe to task events (Phase 4.2: streaming)
	 * Events are forwarded verbatim from MCP - no normalization or transformation
	 */
	subscribeToTaskEvents(taskId: string, callback: (event: any) => void): IDisposable {
		if (!isNative || !ipcRenderer) {
			throw new Error('MCP execution service is only available in native Electron environment');
		}

		// IPC event handler - filter by taskId and forward to callback
		const handler = (event: any, ...args: unknown[]) => {
			const payload = args[0] as { taskId: string; event: any } | undefined;
			if (payload && payload.taskId === taskId && payload.event) {
				// Forward event verbatim (no transformation)
				callback(payload.event);
			}
		};

		// Subscribe to IPC events
		ipcRenderer.on('vscode:vybeAgentEvent', handler);

		// Return disposable for cleanup
		return {
			dispose: () => {
				ipcRenderer.removeListener('vscode:vybeAgentEvent', handler);
			}
		};
	}

	/**
	 * Cancel a running task
	 */
	async cancelTask(taskId: string): Promise<void> {
		if (!isNative || !ipcRenderer) {
			throw new Error('MCP execution service is only available in native Electron environment');
		}

		// Send cancel command to main process via IPC
		await ipcRenderer.invoke('vscode:sendVybeMcpCommand', {
			command: 'cancel_task',
			params: {
				task_id: taskId
			},
			taskId
		});
	}
}


