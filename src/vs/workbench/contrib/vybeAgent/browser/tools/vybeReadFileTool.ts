/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Read File Tool
 *
 * Reads file content using IFileService.
 */

import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

export function createReadFileTool(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService
): VybeTool {
	return {
		name: 'read_file',
		description: 'Read the contents of a file. Returns the file content as a string.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path to the file from the workspace root',
				},
				startLine: {
					type: 'number',
					description: 'Optional: Starting line number (1-based) to read from',
				},
				endLine: {
					type: 'number',
					description: 'Optional: Ending line number (1-based, inclusive) to read to',
				},
			},
			required: ['path'],
		},
		requiredCapabilities: ['fileSystem'],
		parallelizable: true,
		cacheable: true,
		cacheTtlMs: 30000, // 30 seconds

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// Support both parameter naming conventions:
			// - 'path' (legacy browser tool)
			// - 'target_file' (LangGraph tool definition)
			const path = (args.target_file ?? args.path) as string;
			if (!path) {
				throw new Error('read_file requires either "path" or "target_file" parameter');
			}

			// Support both line range conventions:
			// - 'startLine'/'endLine' (legacy)
			// - 'offset'/'limit' (LangGraph)
			const startLine = (args.offset ?? args.startLine) as number | undefined;
			const endLine = (args.limit ?? args.endLine) as number | undefined;

			// Resolve path - handles both absolute and relative paths correctly
			const uri = extUri.resolvePath(context.workspaceRoot, path);

			// Validate path is within workspace
			if (!workspaceService.isInsideWorkspace(uri)) {
				throw new Error(`Path is outside workspace: ${path}`);
			}

			// Read file
			const content = await fileService.readFile(uri);
			let text = content.value.toString();

			// Apply line range if specified
			if (startLine !== undefined || endLine !== undefined) {
				const lines = text.split('\n');
				const start = Math.max(1, startLine ?? 1) - 1; // Convert to 0-based
				const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
				text = lines.slice(start, end).join('\n');
			}

			return text;
		},
	};
}



