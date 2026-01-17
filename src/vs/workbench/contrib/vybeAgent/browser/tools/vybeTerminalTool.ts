/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Terminal Tool
 *
 * Executes commands in the terminal using ITerminalService.
 */

import { ITerminalService, ITerminalGroupService } from '../../../terminal/browser/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { extUri } from '../../../../../base/common/resources.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

const STORAGE_KEY_TERMINAL_RUN_EVERYTHING = 'vybe.terminal.runEverything';

export function createTerminalTool(
	terminalService: ITerminalService,
	terminalGroupService: ITerminalGroupService,
	workspaceService: IWorkspaceContextService,
	storageService: IStorageService
): VybeTool {
	return {
		name: 'run_terminal_cmd',
		description: 'Execute a command in the terminal. Returns the command that was sent (output is streamed to terminal).',
		parameters: {
			type: 'object',
			properties: {
				command: {
					type: 'string',
					description: 'The command to execute',
				},
				cwd: {
					type: 'string',
					description: 'Optional: Working directory for the command (relative to workspace root)',
				},
				background: {
					type: 'boolean',
					description: 'Whether to run in background (default: false)',
				},
			},
			required: ['command'],
		},
		requiredCapabilities: ['terminal'],
		parallelizable: false, // Terminal commands should not run in parallel
		cacheable: false,

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			const command = args.command as string;
			const cwd = args.cwd as string | undefined;
			// Support both parameter naming conventions:
			// - 'background' (legacy browser tool)
			// - 'is_background' (LangGraph tool definition)
			const background = (args.is_background ?? args.background ?? false) as boolean;

			// Check permission: If "Run Everything" is not enabled, require user approval via UI
			const runEverything = storageService.getBoolean(STORAGE_KEY_TERMINAL_RUN_EVERYTHING, StorageScope.PROFILE, false);
			if (!runEverything) {
				// Permission not granted - return error so UI can show Skip/Run buttons
				// The terminal content part will handle execution when user clicks Run
				throw new Error('TERMINAL_PERMISSION_REQUIRED: Terminal command requires user approval. Please use the Run button in the terminal content part.');
			}

			// Get or create terminal
			const terminals = terminalService.instances;
			let terminal = terminals.find((t: { title: string }) => t.title.includes('VYBE'));

			// Determine working directory - handles both absolute and relative paths correctly
			const workingDir = cwd ? extUri.resolvePath(context.workspaceRoot, cwd) : context.workspaceRoot;

			if (!terminal) {
				// Create a new terminal for VYBE
				terminal = await terminalService.createTerminal({
					config: {
						name: 'VYBE Agent',
						cwd: workingDir,
					},
				});
			}

			// Show the terminal
			terminalService.setActiveInstance(terminal);
			await terminalGroupService.showPanel(true);

			// Send command
			terminal.sendText(command, true);

			return {
				success: true,
				command,
				terminalId: terminal.instanceId,
				note: background
					? 'Command started in background'
					: 'Command sent to terminal. Check terminal for output.',
			};
		},
	};
}

