/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE MCP Tool Bridge (Main Process)
 *
 * Bridges tool calls from MCP tool host to renderer via IPC.
 * Tool handlers in main process forward to renderer for execution.
 */

import { CancellationToken } from '../../base/common/cancellation.js';
import { VybeStdioToolHost } from '../../workbench/contrib/mcp/common/vybeStdioToolHost.js';
import { IJSONSchema } from '../../base/common/jsonSchema.js';
import { BrowserWindow } from 'electron';
import { validatedIpcMain } from '../../base/parts/ipc/electron-main/ipcMain.js';

export interface ToolExecutionResult {
	success: boolean;
	result?: unknown;
	error?: string;
}

// Map of pending tool execution requests
const pendingToolRequests = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();

// Register IPC handler for tool responses (one-time setup)
let responseHandlerRegistered = false;
function ensureResponseHandlerRegistered(): void {
	if (responseHandlerRegistered) {
		return;
	}
	responseHandlerRegistered = true;

	validatedIpcMain.on('vscode:vybeMcpToolResponse', (event, requestId: string, result: ToolExecutionResult) => {
		const pending = pendingToolRequests.get(requestId);
		if (pending) {
			pendingToolRequests.delete(requestId);
			if (result.success) {
				pending.resolve(result.result);
			} else {
				pending.reject(new Error(result.error || 'Tool execution failed'));
			}
		}
	});
}

/**
 * Register tool handlers that forward to renderer via IPC
 */
export function registerVybeMcpTools(toolHost: VybeStdioToolHost): void {
	// Tool: vybe.send_llm_message
	toolHost.registerTool({
		name: 'vybe.send_llm_message',
		description: 'Send LLM message via IDE\'s LLM transport (Ollama, LM Studio). IDE resolves provider/model defaults.',
		inputSchema: {
			type: 'object',
			properties: {
				messages: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							role: { type: 'string' },
							content: { type: 'string' }
						},
						required: ['role', 'content']
					}
				},
				options: {
					type: 'object',
					properties: {
						temperature: { type: 'number' },
						maxTokens: { type: 'number' }
					}
				},
				stream: { type: 'boolean' }
			},
			required: ['messages']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			// Forward to renderer via IPC
			ensureResponseHandlerRegistered();

			return new Promise((resolve, reject) => {
				// Create a unique request ID
				const requestId = `tool_${Date.now()}_${Math.random()}`;

				// Store pending request
				pendingToolRequests.set(requestId, { resolve, reject });

				// Send request to renderer
				const windows = BrowserWindow.getAllWindows();
				if (windows.length > 0) {
					windows[0].webContents.send('vscode:vybeMcpToolRequest', {
						requestId,
						toolName: 'vybe.send_llm_message',
						params
					});
				} else {
					pendingToolRequests.delete(requestId);
					reject(new Error('No renderer window available'));
					return;
				}

				// Timeout after 60 seconds
				setTimeout(() => {
					if (pendingToolRequests.has(requestId)) {
						pendingToolRequests.delete(requestId);
						reject(new Error('Tool execution timeout'));
					}
				}, 60000);
			});
		}
	});

	// Tool: vybe.list_models
	toolHost.registerTool({
		name: 'vybe.list_models',
		description: 'List available models from IDE\'s LLM providers (Ollama, LM Studio).',
		inputSchema: {
			type: 'object',
			properties: {
				providerName: {
					type: 'string',
					enum: ['ollama', 'vLLM', 'lmStudio']
				}
			}
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			ensureResponseHandlerRegistered();

			return new Promise((resolve, reject) => {
				const requestId = `tool_${Date.now()}_${Math.random()}`;

				pendingToolRequests.set(requestId, { resolve, reject });

				const windows = BrowserWindow.getAllWindows();
				if (windows.length > 0) {
					windows[0].webContents.send('vscode:vybeMcpToolRequest', {
						requestId,
						toolName: 'vybe.list_models',
						params
					});
				} else {
					pendingToolRequests.delete(requestId);
					reject(new Error('No renderer window available'));
					return;
				}

				setTimeout(() => {
					if (pendingToolRequests.has(requestId)) {
						pendingToolRequests.delete(requestId);
						reject(new Error('Tool execution timeout'));
					}
				}, 60000);
			});
		}
	});

	// Tool: vybe.abort_llm_request
	toolHost.registerTool({
		name: 'vybe.abort_llm_request',
		description: 'Abort an in-flight LLM request.',
		inputSchema: {
			type: 'object',
			properties: {
				requestId: {
					type: 'string',
					description: 'The request ID of the LLM request to abort'
				}
			},
			required: ['requestId']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			ensureResponseHandlerRegistered();

			return new Promise((resolve, reject) => {
				const requestId = `tool_${Date.now()}_${Math.random()}`;

				pendingToolRequests.set(requestId, { resolve, reject });

				const windows = BrowserWindow.getAllWindows();
				if (windows.length > 0) {
					windows[0].webContents.send('vscode:vybeMcpToolRequest', {
						requestId,
						toolName: 'vybe.abort_llm_request',
						params
					});
				} else {
					pendingToolRequests.delete(requestId);
					reject(new Error('No renderer window available'));
					return;
				}

				setTimeout(() => {
					if (pendingToolRequests.has(requestId)) {
						pendingToolRequests.delete(requestId);
						reject(new Error('Tool execution timeout'));
					}
				}, 60000);
			});
		}
	});
}

