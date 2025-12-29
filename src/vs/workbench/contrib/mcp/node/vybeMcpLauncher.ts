/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE MCP Launcher
 *
 * Spawns MCP subprocess and manages its lifecycle.
 * Configures stdio transport and connects it to the tool host.
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogger } from '../../../../platform/log/common/log.js';
import { VybeStdioToolHost } from '../common/vybeStdioToolHost.js';
import { McpStdioStateHandler } from './mcpStdioStateHandler.js';

export interface VybeMcpLauncherOptions {
	/** Path to MCP executable (e.g., node /path/to/VYBE-MCP/build/index.js) */
	mcpExecutablePath: string;
	/** Working directory for MCP process */
	cwd?: string;
	/** Environment variables for MCP process */
	env?: Record<string, string>;
	/** Logger instance */
	logger: ILogger;
}

/**
 * Launches and manages MCP subprocess with stdio transport
 */
export class VybeMcpLauncher extends Disposable {
	private mcpProcess: ChildProcessWithoutNullStreams | null = null;
	private toolHost: VybeStdioToolHost | null = null;
	private stdioStateHandler: McpStdioStateHandler | null = null;
	private isRunning = false;

	constructor(
		private readonly options: VybeMcpLauncherOptions
	) {
		super();
	}

	/**
	 * Launch MCP subprocess and create tool host
	 */
	public async launch(): Promise<VybeStdioToolHost> {
		if (this.isRunning) {
			if (this.toolHost) {
				return this.toolHost;
			}
			throw new Error('MCP launcher is in invalid state');
		}

		this.options.logger.info(`Launching MCP process: ${this.options.mcpExecutablePath}`);

		// Parse executable path (e.g., "node /path/to/index.js" or just "/path/to/index.js")
		const parts = this.options.mcpExecutablePath.trim().split(/\s+/);
		const command = parts[0];
		const args = parts.slice(1);

		// Set up environment variables
		const env = {
			...process.env,
			...this.options.env,
			// Signal to MCP that it should connect to IDE via stdio
			VYBE_IDE_STDIO: '1'
		};

		// Spawn MCP subprocess with stdio pipes
		this.mcpProcess = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
			cwd: this.options.cwd,
			env
		});

		// Create stdio state handler for graceful shutdown
		this.stdioStateHandler = new McpStdioStateHandler(this.mcpProcess);

		// Create tool host connected to MCP process stdio
		this.toolHost = new VybeStdioToolHost(this.mcpProcess, this.options.logger);

		// Handle process events
		this.mcpProcess.on('spawn', () => {
			this.options.logger.info('MCP process spawned');
			this.isRunning = true;
		});

		this.mcpProcess.on('exit', (code, signal) => {
			this.isRunning = false;
			if (code !== null) {
				this.options.logger.info(`MCP process exited with code ${code}`);
			} else if (signal) {
				this.options.logger.info(`MCP process exited with signal ${signal}`);
			}
			this.cleanup();
		});

		this.mcpProcess.on('error', (error: Error) => {
			this.options.logger.error(`MCP process error: ${error.message}`);
			this.isRunning = false;
			this.cleanup();
		});

		// Register stdio state handler for disposal
		this._register(this.stdioStateHandler);

		// Register tool host for disposal
		this._register(this.toolHost);

		return this.toolHost;
	}

	/**
	 * Stop MCP process gracefully
	 */
	public async stop(): Promise<void> {
		if (!this.isRunning || !this.mcpProcess) {
			return;
		}

		this.options.logger.info('Stopping MCP process');

		// Stop tool host first (closes stdin)
		if (this.toolHost) {
			this.toolHost.stop();
		}

		// Use stdio state handler for graceful shutdown
		if (this.stdioStateHandler) {
			this.stdioStateHandler.stop();
		}

		// Wait for process to exit (with timeout)
		if (this.mcpProcess) {
			return new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					if (this.mcpProcess && !this.mcpProcess.killed) {
						this.options.logger.warn('MCP process did not exit gracefully, forcing termination');
						this.mcpProcess.kill('SIGKILL');
					}
					resolve();
				}, 10000); // 10 second timeout

				const process = this.mcpProcess;
				if (process) {
					process.once('exit', () => {
						clearTimeout(timeout);
						resolve();
					});

					// If process already exited, resolve immediately
					if (process.killed || process.exitCode !== null) {
						clearTimeout(timeout);
						resolve();
					}
				} else {
					clearTimeout(timeout);
					resolve();
				}
			});
		}
		return Promise.resolve();
	}

	/**
	 * Restart MCP process
	 */
	public async restart(): Promise<VybeStdioToolHost> {
		await this.stop();
		return this.launch();
	}

	/**
	 * Get the tool host (if launched)
	 */
	public getToolHost(): VybeStdioToolHost | null {
		return this.toolHost;
	}

	/**
	 * Check if MCP process is running
	 */
	public isProcessRunning(): boolean {
		return this.isRunning && this.mcpProcess !== null && !this.mcpProcess.killed;
	}

	/**
	 * Cleanup resources
	 */
	private cleanup(): void {
		if (this.toolHost) {
			this.toolHost.dispose();
			this.toolHost = null;
		}
		if (this.stdioStateHandler) {
			this.stdioStateHandler.dispose();
			this.stdioStateHandler = null;
		}
		this.mcpProcess = null;
	}

	public override dispose(): void {
		this.stop();
		this.cleanup();
		super.dispose();
	}
}

