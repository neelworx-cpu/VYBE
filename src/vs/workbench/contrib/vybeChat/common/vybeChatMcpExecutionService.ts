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

export const IVybeChatMcpExecutionService = createDecorator<IVybeChatMcpExecutionService>('vybeChatMcpExecutionService');

export interface IVybeChatMcpExecutionService {
	readonly _serviceBrand: undefined;

	/**
	 * Execute a task via MCP orchestrator
	 * Phase 4.1: Blocking execution, returns final result only
	 */
	solveTask(params: {
		goal: string;
		repoId: string;
		files?: string[];
		cursorLocation?: { path: string; line: number };
		mode?: 'ask' | 'plan' | 'agent';
		agentLevel?: 'L1' | 'L2' | 'L3';
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

		const taskId = generateUuid();

		// Prepare command parameters matching MCP's solve_task schema
		const commandParams = {
			repo_id: params.repoId,
			goal: params.goal,
			files: params.files,
			cursor_location: params.cursorLocation,
			mode: params.mode || 'agent',
			agent_level: params.agentLevel || 'L1',
		};

		// Send command to main process via IPC
		// Main process will write to MCP's stdin and read result from stdout
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
}


