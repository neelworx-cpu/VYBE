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

	public override dispose(): void {
		if (this.toolHost) {
			this.toolHost.dispose();
			this.toolHost = null;
		}
		this.stopMcp();
		super.dispose();
	}
}

