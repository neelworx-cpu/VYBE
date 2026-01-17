/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Write File Tool
 *
 * Writes file content using ITextFileService.
 */

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

export function createWriteFileTool(
	textFileService: ITextFileService,
	workspaceService: IWorkspaceContextService
): VybeTool {
	return {
		name: 'write_file',
		description: 'Write content to a file. Creates the file if it does not exist, or overwrites existing content.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path to the file from the workspace root',
				},
				content: {
					type: 'string',
					description: 'Content to write to the file',
				},
			},
			required: ['path', 'content'],
		},
		requiredCapabilities: ['fileSystem', 'editor'],
		parallelizable: false, // Writes should not be parallel
		cacheable: false,

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// Support both parameter naming conventions:
			// - 'path'/'content' (legacy browser tool)
			// - 'file_path'/'contents' (LangGraph tool definition)
			const path = (args.file_path ?? args.path) as string;
			const content = (args.contents ?? args.content) as string;
			if (!path) {
				throw new Error('write_file requires either "path" or "file_path" parameter');
			}
			if (content === undefined) {
				throw new Error('write_file requires either "content" or "contents" parameter');
			}

			// Resolve path - handles both absolute and relative paths correctly
			const uri = extUri.resolvePath(context.workspaceRoot, path);

			// Validate path is within workspace
			if (!workspaceService.isInsideWorkspace(uri)) {
				throw new Error(`Path is outside workspace: ${path}`);
			}

			// Write file using text file service
			await textFileService.write(uri, content);

			return {
				success: true,
				path: path,
				bytesWritten: VSBuffer.fromString(content).byteLength,
			};
		},
	};
}



