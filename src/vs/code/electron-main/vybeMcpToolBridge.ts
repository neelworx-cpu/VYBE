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
 * Helper to forward tool calls to renderer via IPC
 */
function forwardToolToRenderer(toolName: string, params: unknown): Promise<unknown> {
	ensureResponseHandlerRegistered();

	return new Promise((resolve, reject) => {
		const requestId = `tool_${Date.now()}_${Math.random()}`;

		pendingToolRequests.set(requestId, { resolve, reject });

		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			windows[0].webContents.send('vscode:vybeMcpToolRequest', {
				requestId,
				toolName,
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
			return forwardToolToRenderer('vybe.send_llm_message', params);
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
			return forwardToolToRenderer('vybe.list_models', params);
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
			return forwardToolToRenderer('vybe.abort_llm_request', params);
		}
	});

	// Tool: vybe.read_file
	toolHost.registerTool({
		name: 'vybe.read_file',
		description: 'Read file content from workspace. Read-only operation.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to read'
				}
			},
			required: ['uri']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.read_file', params);
		}
	});

	// Tool: vybe.list_files
	toolHost.registerTool({
		name: 'vybe.list_files',
		description: 'List files and directories in a workspace directory. Read-only operation.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'Directory URI to list'
				},
				recursive: {
					type: 'boolean',
					description: 'Whether to recurse into subdirectories',
					default: false
				}
			},
			required: ['uri']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.list_files', params);
		}
	});

	// Tool: vybe.get_file_info
	toolHost.registerTool({
		name: 'vybe.get_file_info',
		description: 'Get file metadata (size, mtime, type). Read-only operation.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to get info for'
				}
			},
			required: ['uri']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.get_file_info', params);
		}
	});

	// Tool: vybe.compute_diff
	toolHost.registerTool({
		name: 'vybe.compute_diff',
		description: 'Compute diff between two content strings. Pure computation, no side effects.',
		inputSchema: {
			type: 'object',
			properties: {
				original: {
					type: 'string',
					description: 'Original content'
				},
				modified: {
					type: 'string',
					description: 'Modified content'
				},
				languageId: {
					type: 'string',
					description: 'Optional language ID for syntax-aware diff'
				},
				ignoreTrimWhitespace: {
					type: 'boolean',
					description: 'Whether to ignore whitespace changes',
					default: false
				},
				maxComputationTimeMs: {
					type: 'number',
					description: 'Maximum computation time in milliseconds',
					default: 3000
				}
			},
			required: ['original', 'modified']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.compute_diff', params);
		}
	});

	// Tool: vybe.get_diff_areas
	toolHost.registerTool({
		name: 'vybe.get_diff_areas',
		description: 'Get existing diff areas for a file. Read-only operation.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to get diff areas for'
				}
			},
			required: ['uri']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.get_diff_areas', params);
		}
	});

	// Tool: vybe.create_edit_transaction
	toolHost.registerTool({
		name: 'vybe.create_edit_transaction',
		description: 'Create a new edit transaction for a file. No approval required.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI for the transaction'
				},
				originalContent: {
					type: 'string',
					description: 'Original file content (baseline snapshot)'
				},
				streaming: {
					type: 'boolean',
					description: 'Whether this transaction is for streaming content',
					default: false
				}
			},
			required: ['uri', 'originalContent']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.create_edit_transaction', params);
		}
	});

	// Tool: vybe.accept_diff
	toolHost.registerTool({
		name: 'vybe.accept_diff',
		description: 'Accept a single diff, applying the change to the file. Requires approval.',
		inputSchema: {
			type: 'object',
			properties: {
				diffId: {
					type: 'string',
					description: 'Unique identifier of the diff to accept'
				}
			},
			required: ['diffId']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.accept_diff', params);
		}
	});

	// Tool: vybe.reject_diff
	toolHost.registerTool({
		name: 'vybe.reject_diff',
		description: 'Reject a single diff, reverting the change. Requires approval.',
		inputSchema: {
			type: 'object',
			properties: {
				diffId: {
					type: 'string',
					description: 'Unique identifier of the diff to reject'
				}
			},
			required: ['diffId']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.reject_diff', params);
		}
	});

	// Tool: vybe.accept_file
	toolHost.registerTool({
		name: 'vybe.accept_file',
		description: 'Accept all diffs in a file. Requires approval.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to accept all diffs for'
				}
			},
			required: ['uri']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.accept_file', params);
		}
	});

	// Tool: vybe.reject_file
	toolHost.registerTool({
		name: 'vybe.reject_file',
		description: 'Reject all diffs in a file, reverting all changes. Requires approval.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to reject all diffs for'
				}
			},
			required: ['uri']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.reject_file', params);
		}
	});

	// Tool: vybe.write_file
	toolHost.registerTool({
		name: 'vybe.write_file',
		description: 'Write content to a file. Creates transaction, seeds diffs, requires approval, and saves to disk.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to write to'
				},
				content: {
					type: 'string',
					description: 'New file content'
				},
				overwrite: {
					type: 'boolean',
					description: 'Whether to overwrite if file exists (default: true)',
					default: true
				}
			},
			required: ['uri', 'content']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.write_file', params);
		}
	});

	// Tool: vybe.apply_patch
	toolHost.registerTool({
		name: 'vybe.apply_patch',
		description: 'Apply a unified diff patch to a file. Validates patch, creates transaction, seeds diffs, requires approval, and saves to disk.',
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'File URI to apply patch to'
				},
				patch: {
					type: 'string',
					description: 'Unified diff format patch string'
				}
			},
			required: ['uri', 'patch']
		} as IJSONSchema,
		handler: async (params: unknown, token: CancellationToken) => {
			return forwardToolToRenderer('vybe.apply_patch', params);
		}
	});
}

