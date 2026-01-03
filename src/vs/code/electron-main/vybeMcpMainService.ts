/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE MCP Main Process Service
 *
 * Spawns and manages MCP subprocess in the main process.
 * This service runs in Electron main process and has access to child_process.
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Disposable } from '../../base/common/lifecycle.js';
import { ILoggerService } from '../../platform/log/common/log.js';
import { IEnvironmentMainService } from '../../platform/environment/electron-main/environmentMainService.js';
import { URI } from '../../base/common/uri.js';
import { VybeStdioToolHost } from '../../workbench/contrib/mcp/common/vybeStdioToolHost.js';
import { registerVybeMcpTools } from './vybeMcpToolBridge.js';
import { BrowserWindow } from 'electron';

export interface SpawnVybeMcpOptions {
	mcpCommand: string;
	cwd?: string;
}

export class VybeMcpMainService extends Disposable {
	private mcpProcess: ChildProcessWithoutNullStreams | null = null;
	private toolHost: VybeStdioToolHost | null = null;
	private isRunning = false;

	constructor(
		private readonly loggerService: ILoggerService,
		private readonly environmentMainService: IEnvironmentMainService,
	) {
		super();
	}

	/**
	 * Spawn MCP subprocess
	 */
	async spawnMcp(options: SpawnVybeMcpOptions): Promise<{ success: boolean; error?: string }> {
		if (this.isRunning) {
			return { success: true }; // Already running
		}

		try {
			// Create logger
			const logsPath = this.environmentMainService.logsHome;
			const loggerUri = URI.joinPath(logsPath, 'mcp-stdio.log');
			const logger = this.loggerService.createLogger(loggerUri, { name: 'VYBE MCP Stdio' });

			logger.info(`Launching MCP process: ${options.mcpCommand}`);

			// Parse executable path (e.g., "node /path/to/index.js" or just "/path/to/index.js")
			const parts = options.mcpCommand.trim().split(/\s+/);
			const command = parts[0];
			const args = parts.slice(1);

			// Set up environment variables
			const env = {
				...process.env,
				// Signal to MCP that it should connect to IDE via stdio
				VYBE_IDE_STDIO: '1'
			};

			// Spawn MCP subprocess with stdio pipes
			this.mcpProcess = spawn(command, args, {
				stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
				cwd: options.cwd,
				env
			});

			// Handle process events
			this.mcpProcess.on('spawn', () => {
				logger.info('MCP process spawned');
				this.isRunning = true;
			});

			this.mcpProcess.on('exit', (code, signal) => {
				this.isRunning = false;
				if (code !== null) {
					logger.info(`MCP process exited with code ${code}`);
				} else if (signal) {
					logger.info(`MCP process exited with signal ${signal}`);
				}
				this.mcpProcess = null;
			});

			this.mcpProcess.on('error', (error: Error) => {
				logger.error(`MCP process error: ${error.message}`);
				this.isRunning = false;
				this.mcpProcess = null;
				return { success: false, error: error.message };
			});

			// Create stdio tool host connected to the spawned process
			this.toolHost = new VybeStdioToolHost(this.mcpProcess, logger);
			this._register(this.toolHost);

			// Register tool handlers that forward to renderer via IPC
			registerVybeMcpTools(this.toolHost);
			logger.info('Registered VYBE MCP tools on stdio tool host');

			// Subscribe to agent events and forward to renderer
			this._register(this.toolHost.onDidReceiveAgentEvent(({ taskId, event }) => {
				// Forward agent event to all renderer windows via IPC
				const windows = BrowserWindow.getAllWindows();
				for (const window of windows) {
					window.webContents.send('vscode:vybeAgentEvent', {
						taskId,
						event
					});
				}
				logger.info(`Forwarded agent_event to renderer: task=${taskId}, type=${event.type}`);
			}));

			// Log stderr for debugging
			this.mcpProcess.stderr.on('data', (data: Buffer) => {
				logger.warn(`MCP stderr: ${data.toString()}`);
			});

			// Wait a bit to see if process spawns successfully
			await new Promise<void>((resolve) => {
				if (this.mcpProcess) {
					this.mcpProcess.once('spawn', () => resolve());
					// Timeout after 5 seconds
					setTimeout(() => resolve(), 5000);
				} else {
					resolve();
				}
			});

			if (this.isRunning) {
				logger.info('VYBE MCP process spawned successfully');
				return { success: true };
			} else {
				return { success: false, error: 'Process failed to spawn' };
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Stop MCP process
	 */
	async stopMcp(): Promise<void> {
		if (!this.isRunning || !this.mcpProcess) {
			return;
		}

		if (this.mcpProcess) {
			this.mcpProcess.kill('SIGTERM');
			// Wait for graceful shutdown
			await new Promise<void>((resolve) => {
				if (this.mcpProcess) {
					this.mcpProcess.once('exit', () => resolve());
					setTimeout(() => {
						if (this.mcpProcess && !this.mcpProcess.killed) {
							this.mcpProcess.kill('SIGKILL');
						}
						resolve();
					}, 5000);
				} else {
					resolve();
				}
			});
		}
		this.isRunning = false;
		this.mcpProcess = null;
	}

	/**
	 * Get the tool host (if spawned)
	 */
	public getToolHost(): VybeStdioToolHost | null {
		return this.toolHost;
	}

	/**
	 * Send a command to the MCP process via stdin and wait for result
	 * Command protocol: JSON messages with "type": "command" (separate from MCP protocol)
	 */
	async sendCommand(command: string, params: any, taskId: string): Promise<{ taskId: string; result: any }> {
		if (!this.mcpProcess || !this.isRunning) {
			throw new Error('MCP process is not running');
		}

		// Create command message (not MCP protocol - no Content-Length header)
		const commandMessage = {
			type: 'command',
			command,
			params,
			task_id: taskId
		};

		const commandJson = JSON.stringify(commandMessage) + '\n';

		// Log the command being sent (for debugging)
		const logger = this.loggerService.createLogger(
			URI.joinPath(this.environmentMainService.logsHome, 'mcp-command.log'),
			{ name: 'VYBE MCP Command' }
		);
		logger.info(`Sending command: ${command} (task_id: ${taskId})`);
		logger.info(`Command JSON: ${commandJson.substring(0, 200)}...`);

		console.log(`[VybeMcpMainService] sendCommand: ${command}`, {
			taskId,
			paramsKeys: Object.keys(params || {}),
			model_id: params?.model_id || 'none'
		});

		// Write command to MCP's stdin
		return new Promise((resolve, reject) => {
			if (!this.mcpProcess || !this.toolHost) {
				reject(new Error('MCP process is not running'));
				return;
			}

			let resultTimeout: ReturnType<typeof setTimeout> | null = null;
			let eventDisposable: { dispose: () => void } | null = null;

			// Listen for command_result via tool host event (more reliable than reading stdout directly)
			const commandResultHandler = (event: { taskId: string; result: any }) => {
				if (event.taskId === taskId) {
					// Found our result
					if (eventDisposable) {
						eventDisposable.dispose();
						eventDisposable = null;
					}
					if (resultTimeout) {
						clearTimeout(resultTimeout);
						resultTimeout = null;
					}
					resolve({
						taskId: event.taskId,
						result: event.result
					});
				}
			};

			// Subscribe to command result event (returns disposable)
			eventDisposable = this.toolHost.onDidReceiveCommandResult(commandResultHandler);

			// Timeout after 5 minutes (tasks can take a while)
			resultTimeout = setTimeout(() => {
				if (eventDisposable) {
					eventDisposable.dispose();
					eventDisposable = null;
				}
				reject(new Error('Command execution timeout after 5 minutes'));
			}, 5 * 60 * 1000);

			// Write command to stdin
			try {
				if (this.mcpProcess.stdin && !this.mcpProcess.stdin.destroyed) {
					this.mcpProcess.stdin.write(commandJson, 'utf8');
					logger.info(`Command written to MCP stdin: ${command} (task_id: ${taskId})`);
				} else {
					if (eventDisposable) {
						eventDisposable.dispose();
						eventDisposable = null;
					}
					if (resultTimeout) {
						clearTimeout(resultTimeout);
						resultTimeout = null;
					}
					reject(new Error('MCP process stdin is not available'));
				}
			} catch (error) {
				if (eventDisposable) {
					eventDisposable.dispose();
					eventDisposable = null;
				}
				if (resultTimeout) {
					clearTimeout(resultTimeout);
					resultTimeout = null;
				}
				reject(error);
			}
		});
	}

	public override dispose(): void {
		if (this.toolHost) {
			this.toolHost.dispose();
			this.toolHost = null;
		}
		this.stopMcp();
		super.dispose();
	}
}

