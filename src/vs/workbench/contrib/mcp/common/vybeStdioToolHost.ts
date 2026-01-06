/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE stdio Tool Host
 *
 * Implements MCP protocol over stdio to expose IDE tools to spawned MCP process.
 * This acts as an MCP SERVER (tool host), not a client.
 *
 * Architecture:
 * - IDE spawns MCP subprocess with stdio pipes
 * - This tool host reads from MCP's stdout and writes to MCP's stdin
 * - MCP client in MCP process connects to its own stdin/stdout (which are connected to this host)
 * - Tool calls flow: MCP client → MCP stdin → IDE stdout → this host → IDE services
 */

import type { ChildProcessWithoutNullStreams } from 'child_process';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { ILogger, LogLevel } from '../../../../platform/log/common/log.js';
import { McpConnectionState } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';
import { IMcpMessageTransport } from './mcpRegistryTypes.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';

/**
 * Tool handler function signature
 */
export type VybeToolHandler = (params: unknown, token: CancellationToken) => Promise<unknown>;

/**
 * Tool definition for stdio tool host
 */
export interface VybeToolDefinition {
	name: string;
	description: string;
	inputSchema?: IJSONSchema;
	handler: VybeToolHandler;
}

/**
 * stdio Tool Host that implements MCP server protocol over stdio
 *
 * This host:
 * - Reads JSON-RPC messages from MCP process stdout
 * - Writes JSON-RPC responses to MCP process stdin
 * - Handles MCP protocol messages (initialize, tools/list, tools/call, etc.)
 * - Routes tool calls to registered handlers
 */
export class VybeStdioToolHost extends Disposable implements IMcpMessageTransport {
	private readonly _state = observableValue<McpConnectionState>('vybeStdioToolHostState', { state: McpConnectionState.Kind.Stopped });
	private readonly _onDidReceiveMessageEmitter = new Emitter<MCP.JSONRPCMessage>();
	private readonly _onDidLogEmitter = new Emitter<{ level: LogLevel; message: string }>();
	private readonly _onDidReceiveCommandResultEmitter = new Emitter<{ taskId: string; result: any }>();
	private readonly _onDidReceiveAgentEventEmitter = new Emitter<{ taskId: string; event: any }>();

	public readonly state: IObservable<McpConnectionState> = this._state;
	public readonly onDidReceiveMessage: Event<MCP.JSONRPCMessage> = this._onDidReceiveMessageEmitter.event;
	public readonly onDidLog: Event<{ level: LogLevel; message: string }> = this._onDidLogEmitter.event;
	public readonly onDidReceiveCommandResult: Event<{ taskId: string; result: any }> = this._onDidReceiveCommandResultEmitter.event;
	public readonly onDidReceiveAgentEvent: Event<{ taskId: string; event: any }> = this._onDidReceiveAgentEventEmitter.event;

	private readonly tools = new Map<string, VybeToolDefinition>();
	private pendingRequests = new Map<MCP.RequestId, { resolve: (result: MCP.Result) => void; reject: (error: Error) => void }>();
	private buffer = '';

	constructor(
		private readonly mcpProcess: ChildProcessWithoutNullStreams,
		private readonly logger: ILogger
	) {
		super();

		// Set up message reading from MCP process stdout
		mcpProcess.stdout.setEncoding('utf8');
		mcpProcess.stdout.on('data', (chunk: string) => {
			this.log(LogLevel.Info, `[ToolHost] Received ${chunk.length} bytes from MCP process`);
			this.buffer += chunk;
			this.processBuffer();
		});

		mcpProcess.stdout.on('end', () => {
			// MCP process stdout ended
		});

		mcpProcess.stdout.on('error', (error: Error) => {
			this.log(LogLevel.Error, `MCP process stdout error: ${error.message}`);
			this._state.set({ state: McpConnectionState.Kind.Error, message: error.message }, undefined);
		});

		mcpProcess.stderr.on('data', (data: Buffer) => {
			const stderrText = data.toString().trimEnd();
			this.log(LogLevel.Warning, `[MCP stderr] ${stderrText}`);
		});

		mcpProcess.on('exit', (code, signal) => {
			if (code !== null) {
				this.log(LogLevel.Info, `MCP process exited with code ${code}`);
			} else if (signal) {
				this.log(LogLevel.Info, `MCP process exited with signal ${signal}`);
			}
			this._state.set({ state: McpConnectionState.Kind.Stopped }, undefined);
		});

		mcpProcess.on('error', (error: Error) => {
			this.log(LogLevel.Error, `MCP process error: ${error.message}`);
			this._state.set({ state: McpConnectionState.Kind.Error, message: error.message }, undefined);
		});

		// Start in starting state
		this._state.set({ state: McpConnectionState.Kind.Starting }, undefined);
	}

	/**
	 * Register a tool handler
	 */
	public registerTool(tool: VybeToolDefinition): IDisposable {
		this.tools.set(tool.name, tool);
		this.log(LogLevel.Debug, `Registered tool: ${tool.name}`);
		return {
			dispose: () => {
				this.tools.delete(tool.name);
				this.log(LogLevel.Debug, `Unregistered tool: ${tool.name}`);
			}
		};
	}

	/**
	 * Send a JSON-RPC message to MCP process
	 * Uses MCP protocol format: Content-Length header followed by JSON
	 */
	public send(message: MCP.JSONRPCMessage): void {
		if (this.mcpProcess.stdin.destroyed) {
			this.log(LogLevel.Warning, 'Cannot send message: stdin is destroyed');
			return;
		}

		try {
			const json = JSON.stringify(message);
			const contentLength = Buffer.byteLength(json, 'utf8');
			const header = `Content-Length: ${contentLength}\r\n\r\n`;
			const data = header + json;
			this.mcpProcess.stdin.write(data, 'utf8');
			// Log message type (request has 'method', response has 'result' or 'error')
			const messageType = 'method' in message ? message.method : ('result' in message ? 'response' : 'error');
			this.log(LogLevel.Info, `[ToolHost] Sent message: ${messageType} (${contentLength} bytes)`);
		} catch (error) {
			console.error(`[VYBE ToolHost] Failed to send message:`, error);
			this.log(LogLevel.Error, `[ToolHost] Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Stop the tool host
	 */
	public stop(): void {
		if (this.mcpProcess.stdin && !this.mcpProcess.stdin.destroyed) {
			this.mcpProcess.stdin.end();
		}
		this._state.set({ state: McpConnectionState.Kind.Stopped }, undefined);
	}

	/**
	 * Process incoming buffer, extracting complete JSON-RPC messages
	 * MCP protocol uses Content-Length headers, not newline-separated JSON
	 */
	private processBuffer(): void {
		// Check for command_result and agent_event messages (non-MCP protocol) before processing MCP messages
		// These are plain JSON lines with "type": "command_result" or "type": "agent_event"
		const lines = this.buffer.split('\n');
		for (let i = 0; i < lines.length - 1; i++) { // -1 to keep last (potentially incomplete) line
			const line = lines[i].trim();
			if (line.startsWith('{') && line.endsWith('}')) {
				try {
					const parsed = JSON.parse(line);
					if (parsed.type === 'command_result' && parsed.task_id) {
						// Found a command result - emit it and remove from buffer
						this._onDidReceiveCommandResultEmitter.fire({
							taskId: parsed.task_id,
							result: parsed.result
						});
						// Remove this line from buffer (including the newline)
						const lineIndex = this.buffer.indexOf(line);
						if (lineIndex !== -1) {
							this.buffer = this.buffer.substring(0, lineIndex) + this.buffer.substring(lineIndex + line.length + 1);
						}
					} else if (parsed.type === 'agent_event' && parsed.task_id && parsed.event) {
						// Found an agent event - emit it and remove from buffer
						this._onDidReceiveAgentEventEmitter.fire({
							taskId: parsed.task_id,
							event: parsed.event
						});
						// Remove this line from buffer (including the newline)
						const lineIndex = this.buffer.indexOf(line);
						if (lineIndex !== -1) {
							this.buffer = this.buffer.substring(0, lineIndex) + this.buffer.substring(lineIndex + line.length + 1);
						}
					}
				} catch {
					// Not valid JSON, continue
				}
			}
		}

		// Skip any non-MCP protocol messages (logs, etc.) by finding the first "Content-Length:" header
		const firstContentLength = this.buffer.indexOf('Content-Length:');

		if (firstContentLength > 0) {
			// There's non-MCP content before the first MCP message, skip it
			this.buffer = this.buffer.substring(firstContentLength);
		} else if (firstContentLength === -1) {
			// No Content-Length found at all - this might be stderr output or the MCP message hasn't arrived yet
			// Don't clear the buffer - wait for more data that might contain the MCP message
			// The buffer will accumulate until we get the actual MCP protocol message
			return;
		}

		while (this.buffer.length > 0) {
			// Look for Content-Length header (must be at the start now)
			if (!this.buffer.startsWith('Content-Length:')) {
				// Not an MCP message, try to find the next one
				const nextContentLength = this.buffer.indexOf('Content-Length:');
				if (nextContentLength === -1) {
					// No MCP messages in buffer, clear it
					this.buffer = '';
					break;
				}
				this.buffer = this.buffer.substring(nextContentLength);
			}

			const headerEnd = this.buffer.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				break; // Need more data for header
			}

			const headerText = this.buffer.substring(0, headerEnd);
			const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
			if (!contentLengthMatch) {
				console.error(`[VYBE ToolHost] Invalid MCP message header: ${headerText}`);
				this.log(LogLevel.Error, 'Invalid MCP message header');
				// Skip to next potential header
				const nextHeader = this.buffer.indexOf('Content-Length:', headerEnd + 4);
				if (nextHeader === -1) {
					this.buffer = '';
					break;
				}
				this.buffer = this.buffer.substring(nextHeader);
				continue;
			}

			const contentLength = parseInt(contentLengthMatch[1], 10);
			const messageStart = headerEnd + 4; // After \r\n\r\n

			// Convert to Buffer to work with bytes, not characters (for UTF-8 safety)
			const bufferBytes = Buffer.from(this.buffer, 'utf-8');
			const messageStartBytes = Buffer.byteLength(this.buffer.substring(0, messageStart), 'utf-8');
			const messageEndBytes = messageStartBytes + contentLength;
			const availableBytes = bufferBytes.length - messageStartBytes;

			if (availableBytes < contentLength) {
				break; // Need more data for message body
			}

			// Extract exactly contentLength bytes
			const messageBytes = bufferBytes.subarray(messageStartBytes, messageEndBytes);
			const messageJson = messageBytes.toString('utf-8');

			// Remove processed message from buffer (by bytes)
			const remainingBufferBytes = bufferBytes.subarray(messageEndBytes);
			this.buffer = remainingBufferBytes.toString('utf-8');

			try {
				const message = JSON.parse(messageJson) as MCP.JSONRPCMessage;
				const msgType = 'method' in message ? message.method : 'response/error';
				this.log(LogLevel.Info, `[ToolHost] Parsed message: ${msgType}`);
				this.handleMessage(message);
			} catch (error) {
				console.error(`[VYBE ToolHost] Failed to parse message:`, error);
				this.log(LogLevel.Error, `[ToolHost] Failed to parse message: ${error instanceof Error ? error.message : String(error)}`);
				this.log(LogLevel.Info, `[ToolHost] Message content: ${messageJson.substring(0, 200)}`);
			}
		}
	}

	/**
	 * Handle incoming JSON-RPC message from MCP process
	 */
	private handleMessage(message: MCP.JSONRPCMessage): void {
		this._onDidReceiveMessageEmitter.fire(message);

		// Handle requests (from MCP client)
		if ('id' in message && 'method' in message) {
			this.handleRequest(message as MCP.Request & { id: MCP.RequestId });
		}
		// Handle responses (to our requests)
		else if ('id' in message && 'result' in message) {
			this.handleResponse(message as MCP.JSONRPCResponse);
		}
		// Handle errors (to our requests)
		else if ('id' in message && 'error' in message) {
			this.handleErrorResponse(message as MCP.JSONRPCError);
		}
		// Handle notifications
		else if ('method' in message && !('id' in message)) {
			this.handleNotification(message as MCP.Notification);
		}
	}

	/**
	 * Handle MCP protocol request
	 */
	private async handleRequest(request: MCP.Request & { id: MCP.RequestId }): Promise<void> {
		this.log(LogLevel.Info, `Handling request: ${request.method} (id: ${request.id})`);
		try {
			let result: MCP.Result;

			switch (request.method) {
				case 'initialize':
					result = await this.handleInitialize(request.params as MCP.InitializeRequestParams);
					this._state.set({ state: McpConnectionState.Kind.Running }, undefined);
					this.log(LogLevel.Info, `Initialize complete, sending response`);
					break;

				case 'tools/list':
					result = await this.handleToolsList();
					break;

				case 'tools/call':
					result = await this.handleToolsCall(request.params as MCP.CallToolRequestParams);
					break;

				case 'ping':
					result = { value: 'pong' };
					break;

				default:
					throw new Error(`Unknown method: ${request.method}`);
			}

			this.log(LogLevel.Info, `Sending response for request ${request.id}`);
			this.sendResponse(request.id, result);
		} catch (error) {
			this.log(LogLevel.Error, `Error handling request ${request.id}: ${error instanceof Error ? error.message : String(error)}`);
			this.sendError(request.id, error instanceof Error ? error.message : String(error), -32603);
		}
	}

	/**
	 * Handle initialize request
	 */
	private async handleInitialize(params: MCP.InitializeRequestParams | undefined): Promise<MCP.InitializeResult> {
		this.log(LogLevel.Info, `Received initialize request from client`);

		// Use the client's requested protocol version, or fall back to latest if not provided
		// The MCP SDK client may not support the latest version, so we should match what it requests
		const requestedVersion = params?.protocolVersion || MCP.LATEST_PROTOCOL_VERSION;

		const result = {
			protocolVersion: requestedVersion, // Return the version the client requested
			capabilities: {
				tools: {}
			},
			serverInfo: {
				name: 'vybe-ide-tool-host',
				version: '1.0.0'
			}
		};
		this.log(LogLevel.Info, `Sending initialize response with protocol version: ${requestedVersion}`);
		return result;
	}

	/**
	 * Handle tools/list request
	 */
	private async handleToolsList(): Promise<MCP.ListToolsResult> {
		const tools: MCP.Tool[] = Array.from(this.tools.values()).map(tool => {
			// Convert IJSONSchema to MCP.Tool['inputSchema'] format
			// MCP.Tool requires inputSchema.type to be the literal "object"
			const inputSchema = tool.inputSchema;
			const mcpInputSchema: MCP.Tool['inputSchema'] = (() => {
				if (inputSchema && typeof inputSchema === 'object' && 'type' in inputSchema) {
					const schemaType = inputSchema.type;
					// Only use if type is "object" (literal or in array)
					if (schemaType === 'object' || (Array.isArray(schemaType) && schemaType.includes('object'))) {
						return {
							type: 'object' as const,
							properties: 'properties' in inputSchema && inputSchema.properties ? (inputSchema.properties as { [key: string]: object }) : undefined,
							required: 'required' in inputSchema && Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : undefined,
							$schema: '$schema' in inputSchema ? (inputSchema.$schema as string | undefined) : undefined
						};
					}
				}
				// Default: return minimal object schema
				return { type: 'object' as const };
			})();

			return {
				name: tool.name,
				description: tool.description,
				inputSchema: mcpInputSchema
			};
		});

		return { tools };
	}

	/**
	 * Handle tools/call request
	 */
	private async handleToolsCall(params: MCP.CallToolRequestParams): Promise<MCP.CallToolResult> {
		const tool = this.tools.get(params.name);
		if (!tool) {
			console.error(`[VYBE ToolHost] Tool not found: ${params.name}. Available tools:`, Array.from(this.tools.keys()));
			throw new Error(`Tool not found: ${params.name}`);
		}

		const token = CancellationToken.None; // TODO: Support cancellation tokens from MCP

		try {
			const result = await tool.handler(params.arguments || {}, token);
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result)
					}
				]
			};
		} catch (error) {
			console.error(`[VYBE ToolHost] Tool handler error for ${params.name}:`, error);
			throw error;
		}
	}

	/**
	 * Public method to call an MCP tool directly
	 * First checks if it's an IDE-side tool, otherwise sends MCP request to server
	 */
	public async callTool(toolName: string, arguments_: any): Promise<any> {
		this.log(LogLevel.Info, `[ToolHost] callTool: ${toolName}`);
		this.log(LogLevel.Debug, `[ToolHost] Available IDE tools: ${Array.from(this.tools.keys()).join(', ')}`);

		// Check if MCP connection is established
		const currentState = this._state.get();
		if (currentState.state !== McpConnectionState.Kind.Running) {
			const error = new Error(`MCP connection not ready. Current state: ${currentState.state}`);
			this.log(LogLevel.Error, error.message);
			throw error;
		}

		// First check if it's an IDE-side tool (registered via registerTool)
		if (this.tools.has(toolName)) {
			this.log(LogLevel.Info, `[ToolHost] Calling IDE-side tool: ${toolName}`);
			return this.handleToolsCall({
				name: toolName,
				arguments: arguments_
			}).then(result => {
				// Extract the text content from the result
				if (result.content && result.content.length > 0) {
					const textContent = result.content[0];
					if (textContent.type === 'text') {
						try {
							return JSON.parse(textContent.text);
						} catch {
							return textContent.text;
						}
					}
				}
				return result;
			});
		}

		// Not an IDE-side tool - send MCP request to server
		this.log(LogLevel.Info, `[ToolHost] Calling server-side tool via MCP: ${toolName}`);
		try {
			const result = await this.sendMcpRequest('tools/call', {
				name: toolName,
				arguments: arguments_
			});

			this.log(LogLevel.Info, `[ToolHost] MCP tool result received for: ${toolName}`);

			// MCP tools/call returns CallToolResult with content array
			if (result && 'content' in result && Array.isArray(result.content)) {
				const textContent = result.content.find((c: any) => c.type === 'text');
				if (textContent && textContent.text) {
					try {
						return JSON.parse(textContent.text);
					} catch {
						return textContent.text;
					}
				}
			}
			return result;
		} catch (error) {
			this.log(LogLevel.Error, `[ToolHost] Error calling MCP tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Send an MCP request to the server and wait for response
	 */
	private async sendMcpRequest(method: string, params: any): Promise<MCP.Result> {
		const requestId: MCP.RequestId = Math.random().toString(36).substring(2, 15);

		const request: MCP.JSONRPCRequest = {
			jsonrpc: MCP.JSONRPC_VERSION,
			id: requestId,
			method,
			params
		};

		this.log(LogLevel.Info, `[ToolHost] Sending MCP request: ${method} (id: ${requestId})`);

		return new Promise((resolve, reject) => {
			// Timeout after 30 seconds
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(requestId);
				const error = new Error(`MCP request timeout: ${method}`);
				this.log(LogLevel.Error, error.message);
				reject(error);
			}, 30000);

			// Store pending request with timeout cleanup
			this.pendingRequests.set(requestId, {
				resolve: (result) => {
					clearTimeout(timeout);
					this.log(LogLevel.Info, `[ToolHost] MCP request resolved: ${method} (id: ${requestId})`);
					resolve(result);
				},
				reject: (error: unknown) => {
					clearTimeout(timeout);
					// Extract error message from MCP.Error or regular Error
					let errorMessage: string;
					if (error && typeof error === 'object') {
						if ('message' in error && typeof error.message === 'string') {
							errorMessage = error.message;
						} else if (error instanceof Error) {
							errorMessage = error.message;
						} else {
							errorMessage = String(error);
						}
					} else if (error instanceof Error) {
						errorMessage = error.message;
					} else {
						errorMessage = String(error);
					}
					this.log(LogLevel.Error, `[ToolHost] MCP request rejected: ${method} (id: ${requestId}) - ${errorMessage}`);
					// Always reject with a proper Error object for IPC serialization
					reject(new Error(errorMessage));
				}
			});

			// Send request
			try {
				this.send(request);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingRequests.delete(requestId);
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.log(LogLevel.Error, `[ToolHost] Failed to send MCP request: ${errorMessage}`);
				reject(new Error(`Failed to send MCP request: ${errorMessage}`));
			}
		});
	}

	/**
	 * Handle notification (no response needed)
	 */
	private handleNotification(notification: MCP.Notification): void {
		this.log(LogLevel.Debug, `Received notification: ${notification.method}`);
		// Notifications don't require responses
	}

	/**
	 * Handle response to our request
	 */
	private handleResponse(response: MCP.JSONRPCResponse): void {
		const pending = this.pendingRequests.get(response.id);
		if (pending) {
			this.pendingRequests.delete(response.id);
			pending.resolve(response.result);
		}
	}

	/**
	 * Handle error response to our request
	 */
	private handleErrorResponse(errorResponse: MCP.JSONRPCError): void {
		const pending = this.pendingRequests.get(errorResponse.id);
		if (pending) {
			this.pendingRequests.delete(errorResponse.id);
			// Extract message from MCP.Error and create a proper Error object for IPC serialization
			const errorMessage = errorResponse.error?.message || `MCP error ${errorResponse.error?.code || 'unknown'}`;
			this.log(LogLevel.Error, `[ToolHost] MCP error response: ${errorMessage}`);
			pending.reject(new Error(errorMessage));
		}
	}

	/**
	 * Send a response to a request
	 */
	private sendResponse(id: MCP.RequestId, result: MCP.Result): void {
		const response: MCP.JSONRPCResponse = {
			jsonrpc: MCP.JSONRPC_VERSION,
			id,
			result
		};
		this.send(response);
	}

	/**
	 * Send an error response
	 */
	private sendError(id: MCP.RequestId, message: string, code: number): void {
		const errorResponse: MCP.JSONRPCError = {
			jsonrpc: MCP.JSONRPC_VERSION,
			id,
			error: {
				code,
				message
			}
		};
		this.send(errorResponse);
	}

	/**
	 * Log a message
	 */
	private log(level: LogLevel, message: string): void {
		this._onDidLogEmitter.fire({ level, message });
		if (canLog(this.logger, level)) {
			log(this.logger, level, message);
		}
	}

	public override dispose(): void {
		this.stop();
		this._onDidReceiveMessageEmitter.dispose();
		this._onDidLogEmitter.dispose();
		this._onDidReceiveCommandResultEmitter.dispose();
		this._onDidReceiveAgentEventEmitter.dispose();
		super.dispose();
	}
}

function canLog(logger: ILogger, level: LogLevel): boolean {
	// Simple check - in real implementation, check logger's log level
	return true;
}

function log(logger: ILogger, level: LogLevel, message: string): void {
	switch (level) {
		case LogLevel.Error:
			logger.error(message);
			break;
		case LogLevel.Warning:
			logger.warn(message);
			break;
		case LogLevel.Info:
			logger.info(message);
			break;
		case LogLevel.Debug:
			logger.debug(message);
			break;
		case LogLevel.Trace:
			logger.trace(message);
			break;
	}
}

