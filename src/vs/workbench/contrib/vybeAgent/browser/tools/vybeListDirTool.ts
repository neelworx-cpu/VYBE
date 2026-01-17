/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE List Directory Tool
 *
 * Lists directory contents using IFileService.
 */

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

interface DirectoryEntry {
	name: string;
	type: 'file' | 'directory';
	size?: number;
}

export function createListDirTool(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService
): VybeTool {
	return {
		name: 'list_dir',
		description: 'List the contents of a directory. Returns an array of file and directory names with their types. Always use the actual directory name or path - never use "." unless explicitly listing the workspace root.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Directory name or relative path to list. Use the actual directory name (e.g., "void", "src", "void/src"). Only use "." if explicitly listing the workspace root. For multi-root workspaces, you can use workspace folder names directly (e.g., "void" to list the void workspace folder).',
				},
				recursive: {
					type: 'boolean',
					description: 'Whether to list contents recursively (default: false)',
				},
				maxDepth: {
					type: 'number',
					description: 'Maximum depth for recursive listing (default: 3)',
				},
			},
			required: ['path'],
		},
		requiredCapabilities: ['fileSystem'],
		parallelizable: true,
		cacheable: true,
		cacheTtlMs: 10000, // 10 seconds

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// Support both parameter naming conventions:
			// - 'path' (legacy browser tool)
			// - 'target_directory' (LangGraph tool definition)
			const path = (args.target_directory ?? args.path ?? '.') as string;
			const recursive = args.recursive as boolean | undefined;
			const maxDepth = (args.maxDepth as number | undefined) ?? 3;

			// Check if path matches a workspace folder name
			// If so, use that workspace folder's root instead of the default
			let baseRoot = context.workspaceRoot;
			let actualPath = path;
			const workspace = workspaceService.getWorkspace();

			// Always check for workspace folder matches, even with single folder (in case user specifies folder name)
			if (path !== '.') {
				// First, check if it's an absolute path that matches a workspace folder URI
				let matchedFolder = false;
				try {
					const pathUri = URI.file(path);
					for (const folder of workspace.folders) {
						// Check if absolute path matches workspace folder URI exactly
						if (pathUri.fsPath === folder.uri.fsPath || pathUri.path === folder.uri.path) {
							console.log(`[vybeListDirTool] Matched absolute path to workspace folder: "${path}" -> ${folder.uri.fsPath}`);
							baseRoot = folder.uri;
							actualPath = '.';
							matchedFolder = true;
							break;
						}
					}
				} catch (e) {
					// Not a valid absolute path, continue with relative path matching
				}

				// If not matched as absolute path, try relative path matching
				if (!matchedFolder) {
					for (const folder of workspace.folders) {
						// Try multiple ways to match: folder.name, last path segment, or full path match
						const folderName = folder.name || folder.uri.path.split('/').pop() || '';
						const folderPath = folder.uri.path;
						const folderPathLastSegment = folderPath.split('/').pop() || '';

						// Exact match with folder name or last path segment
						if (path === folderName || path === folderPathLastSegment || folderPath.endsWith(`/${path}`)) {
							// Exact match: list the workspace folder root
							console.log(`[vybeListDirTool] Matched workspace folder: "${path}" -> ${folder.uri.fsPath}`);
							baseRoot = folder.uri;
							actualPath = '.';
							break;
						} else if (path.startsWith(folderName + '/') || path.startsWith(folderPathLastSegment + '/')) {
							// Path starts with folder name: use that folder as base and strip the folder name from path
							const prefix = path.startsWith(folderName + '/') ? folderName : folderPathLastSegment;
							console.log(`[vybeListDirTool] Matched workspace folder prefix: "${path}" -> ${folder.uri.fsPath}/${path.substring(prefix.length + 1)}`);
							baseRoot = folder.uri;
							actualPath = path.substring(prefix.length + 1);
							break;
						}
					}
				}
			}

			console.log(`[vybeListDirTool] Listing directory: path="${path}", baseRoot=${baseRoot.fsPath}, actualPath="${actualPath}"`);

			// Resolve path - handles both absolute and relative paths correctly
			const uri = actualPath === '.' ? baseRoot : extUri.resolvePath(baseRoot, actualPath);

			// Validate path is within workspace
			if (!workspaceService.isInsideWorkspace(uri)) {
				throw new Error(`Directory is outside workspace: ${path}`);
			}

			// Resolve directory - let file service throw native errors if path doesn't exist
			const stat = await fileService.resolve(uri, { resolveMetadata: true });

			if (!stat.isDirectory) {
				throw new Error(`Path is not a directory: ${path}`);
			}

			const entries: DirectoryEntry[] = [];

			// Helper to process directory entries
			const processEntries = async (dirStat: typeof stat, currentDepth: number): Promise<void> => {
				if (!dirStat.children) {
					return;
				}

				for (const child of dirStat.children) {
					// When listing the root of a workspace folder (actualPath === '.'), use just the child name
					// Otherwise, calculate relative path from the base root
					let entryName: string;
					if (actualPath === '.' && baseRoot.path === dirStat.resource.path) {
						// Listing workspace folder root - use just the child name
						entryName = child.name;
					} else {
						// Calculate relative path from the base root
						const relativePath = child.resource.path.substring(baseRoot.path.length + 1);
						entryName = relativePath || child.name;
					}

					entries.push({
						name: entryName,
						type: child.isDirectory ? 'directory' : 'file',
						size: child.size,
					});

					// Recurse if requested and within depth limit
					if (recursive && child.isDirectory && currentDepth < maxDepth) {
						const childStat = await fileService.resolve(child.resource, { resolveMetadata: true });
						await processEntries(childStat, currentDepth + 1);
					}
				}
			};

			await processEntries(stat, 1);

			return entries;
		},
	};
}

