/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Edit File Tool
 *
 * Performs search-and-replace edits in files using IEditorService and ITextFileService.
 */

import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

export function createEditFileTool(
	editorService: IEditorService,
	textFileService: ITextFileService,
	fileService: IFileService,
	workspaceService: IWorkspaceContextService
): VybeTool {
	return {
		name: 'edit_file',
		description: 'Edit a file by replacing a specific string with new content, or create a new file. Use empty old_string to create new files or overwrite existing files entirely.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path to the file from the workspace root',
				},
				old_string: {
					type: 'string',
					description: 'The exact string to find and replace. Use empty string to create a new file or overwrite an existing file entirely.',
				},
				new_string: {
					type: 'string',
					description: 'The string to replace old_string with, or the full content for new files',
				},
				replace_all: {
					type: 'boolean',
					description: 'Whether to replace all occurrences (default: false, only replaces first). Only applies when old_string is not empty.',
				},
			},
			required: ['path', 'new_string'],
		},
		requiredCapabilities: ['fileSystem', 'editor'],
		parallelizable: false, // Edits should not be parallel to avoid conflicts
		cacheable: false,

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// Support both parameter naming conventions:
			// - 'path' (legacy browser tool)
			// - 'file_path' (LangGraph tool definition)
			const path = (args.file_path ?? args.path) as string;
			if (!path) {
				throw new Error('edit_file requires either "path" or "file_path" parameter');
			}
			const oldString = (args.old_string as string) || '';
			const newString = args.new_string as string;
			const replaceAll = (args.replace_all as boolean | undefined) ?? false;

			// Resolve path - handles both absolute and relative paths correctly
			const uri = extUri.resolvePath(context.workspaceRoot, path);

			// Validate path is within workspace
			if (!workspaceService.isInsideWorkspace(uri)) {
				throw new Error(`Path is outside workspace: ${path}`);
			}

			// Check if file exists
			const fileExists = await fileService.exists(uri);

			if (!fileExists) {
				// New file: old_string should be empty, write new_string as file content
				if (oldString.trim().length > 0) {
					throw new Error(`Cannot create new file ${path} with non-empty old_string. Use empty old_string for new files.`);
				}
				await textFileService.write(uri, newString);
				await editorService.openEditor({ resource: uri });
				return {
					success: true,
					path,
					created: true,
					bytesWritten: VSBuffer.fromString(newString).byteLength,
				};
			}

			// Existing file: validate but DON'T write yet - will be written after streaming completes
			const content = await fileService.readFile(uri);
			const originalText = content.value.toString();

			if (oldString.trim().length === 0) {
				// Empty old_string on existing file = overwrite entire file
				// Don't write yet - return details for deferred write
				return {
					success: true,
					path,
					overwritten: true,
					bytesWritten: VSBuffer.fromString(newString).byteLength,
					deferred: true, // Flag indicating write should be deferred
					filePath: path,
					oldString: '',
					newString: newString,
					replaceAll: false,
					message: `File edited successfully: ${path}. The file system has confirmed the write operation.`,
				};
			}

			// Check if old_string exists
			if (!originalText.includes(oldString)) {
				throw new Error(`Could not find the specified text in ${path}. Make sure old_string matches exactly.`);
			}

			// Count occurrences
			const occurrences = originalText.split(oldString).length - 1;

			if (occurrences > 1 && !replaceAll) {
				throw new Error(
					`Found ${occurrences} occurrences of the text in ${path}. ` +
					`Either make old_string more specific to match only one occurrence, ` +
					`or set replace_all to true to replace all occurrences.`
				);
			}

			// Don't write yet - return details for deferred write
			return {
				success: true,
				path,
				replacements: replaceAll ? occurrences : 1,
				oldStringLength: oldString.length,
				newStringLength: newString.length,
				deferred: true, // Flag indicating write should be deferred
				filePath: path,
				oldString: oldString,
				newString: newString,
				replaceAll: replaceAll,
				message: `File edited successfully: ${path}. Replaced ${replaceAll ? occurrences : 1} occurrence(s). The file system has confirmed the write operation.`,
			};
		},
	};
}



