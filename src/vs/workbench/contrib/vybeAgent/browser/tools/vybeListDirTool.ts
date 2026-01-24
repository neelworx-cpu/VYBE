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
		description: 'Lists files and directories in a given path. The target_directory parameter can be relative to the workspace root or absolute. You can optionally provide an array of glob patterns to ignore with the "ignore_globs" parameter. Other details: The result does not display dot-files and dot-directories. IMPORTANT: Always use the actual directory name or path - never use "." unless explicitly listing the workspace root.',
		parameters: {
			type: 'object',
			properties: {
				target_directory: {
					type: 'string',
					description: 'Path to directory to list contents of. Always use the actual directory name or path (e.g., "src", "src/components"). Never use "." unless explicitly listing the workspace root.',
				},
				ignore_globs: {
					type: 'array',
					items: {
						type: 'string',
					},
					description: 'Optional array of glob patterns to ignore. All patterns match anywhere in the target directory. Patterns not starting with "**/" are automatically prepended with "**/". Examples: "*.js" (becomes "**/*.js") - ignore all .js files, "**/node_modules/**" - ignore all node_modules directories, "**/test/**/test_*.ts" - ignore all test_*.ts files in any test directory.',
				},
				// Internal-only parameters (not in Cursor spec, but kept for backward compatibility)
				recursive: {
					type: 'boolean',
					description: '[INTERNAL] Whether to list contents recursively (default: false)',
				},
				maxDepth: {
					type: 'number',
					description: '[INTERNAL] Maximum depth for recursive listing (default: 3)',
				},
			},
			required: ['target_directory'],
		},
		requiredCapabilities: ['fileSystem'],
		parallelizable: true,
		cacheable: true,
		cacheTtlMs: 10000, // 10 seconds

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// Support both parameter naming conventions:
			// - Cursor format: 'target_directory' (required)
			// - Legacy: 'path', 'relative_workspace_path'
			const path = (args.target_directory ?? args.relative_workspace_path ?? args.path) as string;
			if (!path || path === '.') {
				throw new Error('target_directory is required. Do not use "." - use the actual directory name or path (e.g., "src", "src/components").');
			}

			const ignoreGlobs = args.ignore_globs as string[] | undefined;
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
							// Removed noisy log: path matching
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

			// Removed noisy log: directory listing

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

			// Helper to check if a path matches any ignore glob pattern
			const shouldIgnore = (entryPath: string): boolean => {
				if (!ignoreGlobs || ignoreGlobs.length === 0) {
					return false;
				}

				// Normalize path separators
				const normalizedPath = entryPath.replace(/\\/g, '/');

				for (const glob of ignoreGlobs) {
					// Normalize glob pattern - add **/ prefix if not present
					let normalizedGlob = glob;
					if (!normalizedGlob.startsWith('**/')) {
						normalizedGlob = `**/${normalizedGlob}`;
					}

					// Simple glob matching (can be enhanced with proper glob library if needed)
					const globRegex = new RegExp(
						normalizedGlob
							.replace(/\./g, '\\.')
							.replace(/\*\*/g, '.*')
							.replace(/\*/g, '[^/]*')
					);

					if (globRegex.test(normalizedPath)) {
						return true;
					}
				}

				return false;
			};

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

					// Check if this entry should be ignored
					if (shouldIgnore(entryName)) {
						continue;
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

