/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Delete File Tool
 *
 * Deletes files using IFileService.
 */

import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

export function createDeleteFileTool(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService
): VybeTool {
	return {
		name: 'delete_file',
		description: 'Deletes a file at the specified path. The operation will fail gracefully if: The file doesn\'t exist, The operation is rejected for security reasons, The file cannot be deleted.',
		parameters: {
			type: 'object',
			properties: {
				target_file: {
					type: 'string',
					description: 'The path of the file to delete, relative to the workspace root.',
				},
				explanation: {
					type: 'string',
					description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.',
				},
			},
			required: ['target_file'],
		},
		requiredCapabilities: ['fileSystem'],
		parallelizable: false, // Deletions should not be parallel to avoid conflicts
		cacheable: false,

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			const targetFile = args.target_file as string;
			if (!targetFile) {
				throw new Error('delete_file requires "target_file" parameter');
			}

			// Resolve path - handles both absolute and relative paths correctly
			const uri = extUri.resolvePath(context.workspaceRoot, targetFile);

			// Validate path is within workspace
			if (!workspaceService.isInsideWorkspace(uri)) {
				throw new Error(`Path is outside workspace: ${targetFile}`);
			}

			// Check if file exists
			const fileExists = await fileService.exists(uri);
			if (!fileExists) {
				// Fail gracefully - file doesn't exist
				return {
					success: false,
					path: targetFile,
					error: 'File does not exist',
					message: `File ${targetFile} does not exist. Deletion skipped.`,
				};
			}

			try {
				// Delete the file
				await fileService.del(uri, { recursive: false });
				return {
					success: true,
					path: targetFile,
					message: `File ${targetFile} deleted successfully.`,
				};
			} catch (error) {
				// Fail gracefully - return error information
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					path: targetFile,
					error: errorMessage,
					message: `Failed to delete file ${targetFile}: ${errorMessage}`,
				};
			}
		},
	};
}
