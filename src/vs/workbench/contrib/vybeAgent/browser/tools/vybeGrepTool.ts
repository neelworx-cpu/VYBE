/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Grep Tool
 *
 * Searches for text patterns in files using ISearchService.
 */

import { ISearchService, QueryType, ITextQuery, IFileMatch, DEFAULT_MAX_SEARCH_RESULTS, resultIsMatch, ITextSearchMatch, ITextSearchContext } from '../../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { extUri } from '../../../../../base/common/resources.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

interface GrepMatch {
	file: string;
	line: number;
	column: number;
	match: string;
	preview: string;
}

/**
 * Check if a grep pattern needs multiline mode.
 *
 * Ripgrep by default treats ^ as start of FILE, not start of LINE.
 * To make ^import work as expected (match "import" at start of any line),
 * we need to enable multiline mode via the isMultiline flag.
 */
export function normalizeGrepPattern(pattern: string): { normalized: string; wasNormalized: boolean; needsMultiline: boolean } {
	// Check if pattern contains ^ or $ anchors that need multiline mode
	const needsMultiline = pattern.includes('^') || pattern.includes('$');

	if (needsMultiline) {
		console.log(`[VybeGrepTool] 🔧 Pattern "${pattern}" needs multiline mode for ^ or $ anchors`);
	}

	// Return pattern unchanged - multiline is handled via isMultiline flag
	return { normalized: pattern, wasNormalized: false, needsMultiline };
}

/**
 * Normalize a glob pattern to ensure it matches files in subdirectories.
 *
 * VS Code's search API needs a recursive glob prefix for matching in subdirectories.
 * For example, "*.ts" becomes "**" + "/" + "*.ts" to match TypeScript files in all directories.
 */
export function normalizeGlobPattern(glob: string): string {
	if (!glob) {
		return glob;
	}

	// If glob already has **/, leave it alone
	if (glob.startsWith('**/')) {
		return glob;
	}

	// If glob starts with *, prepend **/ to match in all directories
	// e.g., "*.ts" -> "**/*.ts"
	if (glob.startsWith('*')) {
		const normalized = `**/${glob}`;
		console.log(`[VybeGrepTool] 🔧 Glob normalized: "${glob}" -> "${normalized}"`);
		return normalized;
	}

	return glob;
}

export function createGrepTool(
	searchService: ISearchService,
	workspaceService: IWorkspaceContextService,
	fileService: IFileService
): VybeTool {
	return {
		name: 'grep',
		description: 'Search for a text pattern in files. Returns matching lines with file paths and line numbers. The pattern is treated as a regular expression - use plain text for simple searches (e.g., "import" not "^import" unless you specifically want to match only at the start of lines).',
		parameters: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description: 'Text pattern to search for. Treated as a regular expression - use plain text for simple word searches (e.g., "import" will find "import" anywhere in the line, not just at the start). Only add regex anchors like ^ or $ if you specifically need them.',
				},
				path: {
					type: 'string',
					description: 'Optional: Directory path to search in (relative to workspace root)',
				},
				glob: {
					type: 'string',
					description: 'Optional: Glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}")',
				},
				caseSensitive: {
					type: 'boolean',
					description: 'Whether the search is case-sensitive (default: false)',
				},
				maxResults: {
					type: 'number',
					description: 'Maximum number of results to return (default: 20000)',
				},
			},
			required: ['pattern'],
		},
		requiredCapabilities: ['search'],
		parallelizable: true,
		cacheable: false, // Search results can change frequently

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// Cursor format: pattern is required
			const originalPattern = args.pattern as string;
			if (!originalPattern) {
				throw new Error('grep requires "pattern" parameter');
			}

			// Analyze pattern - check if it needs multiline mode for ^ or $ anchors
			// Use multiline parameter if provided, otherwise auto-detect
			const multilineParam = args.multiline as boolean | undefined;
			const { normalized: pattern, wasNormalized, needsMultiline: autoDetectedMultiline } = normalizeGrepPattern(originalPattern);
			const needsMultiline = multilineParam !== undefined ? multilineParam : autoDetectedMultiline;

			const path = args.path as string | undefined;
			const glob = args.glob as string | undefined;
			// Normalize glob pattern to ensure it matches files in subdirectories
			const normalizedGlob = glob ? normalizeGlobPattern(glob) : undefined;

			// Cursor uses -i (case insensitive), VYBE uses caseSensitive (opposite logic)
			const caseInsensitive = args["-i"] as boolean | undefined;
			const caseSensitive = caseInsensitive === true ? false : (caseInsensitive === false ? true : false);

			// Use VS Code's default maxResults (20000) to match Cursor's behavior
			// head_limit overrides maxResults if provided
			const headLimit = args.head_limit as number | undefined;
			const maxResults = headLimit ?? ((args.maxResults as number | undefined) ?? DEFAULT_MAX_SEARCH_RESULTS);

			// Context lines
			const beforeLines = args["-B"] as number | undefined;
			const afterLines = args["-A"] as number | undefined;
			const contextLines = args["-C"] as number | undefined;

			// File type filter
			const fileType = args.type as string | undefined;

			// Output mode
			const outputMode = args.output_mode as "content" | "files_with_matches" | "count" | undefined;

			console.log(`[VybeGrepTool] 🔍 Executing grep:`, {
				originalPattern,
				normalizedPattern: pattern,
				wasNormalized,
				needsMultiline,
				path: path || '(workspace root)',
				glob: normalizedGlob || '(all files)',
				caseSensitive,
				maxResults,
				headLimit,
				beforeLines,
				afterLines,
				contextLines,
				fileType,
				outputMode,
				workspaceRoot: context.workspaceRoot.path
			});

			// Build folder URI - handles both absolute and relative paths correctly
			let folderUri = path
				? extUri.resolvePath(context.workspaceRoot, path)
				: context.workspaceRoot;

			// Validate path is within workspace
			if (path && !workspaceService.isInsideWorkspace(folderUri)) {
				const error = `Path is outside workspace: ${path}`;
				console.error(`[VybeGrepTool] ❌ ${error}`);
				throw new Error(error);
			}

			// Search API requires a directory as root (ripgrep uses it as cwd). If the user passed
			// a file path, resolve to its parent directory to avoid spawn ENOTDIR.
			// When path is set, validate it exists so we can distinguish "path invalid" from "0 matches".
			let fileOnlyInclude: string | undefined;
			try {
				const stat = await fileService.stat(folderUri);
				if (stat.isFile) {
					fileOnlyInclude = extUri.basename(folderUri);
					folderUri = extUri.dirname(folderUri);
				}
			} catch (err) {
				if (path) {
					const error = `Path does not exist: ${path}`;
					console.error(`[VybeGrepTool] ❌ ${error}`);
					throw new Error(error);
				}
				// path not set (searching workspace root): keep folderUri as-is
			}

			// Build include pattern: optional glob/fileType, and if path was a file then restrict to that file
			let includePattern: Record<string, boolean> | undefined;
			if (fileOnlyInclude) {
				includePattern = normalizedGlob
					? { [`**/${fileOnlyInclude}`]: true, [normalizedGlob]: true }
					: { [fileOnlyInclude]: true };
			} else if (normalizedGlob) {
				includePattern = { [normalizedGlob]: true };
			} else if (fileType) {
				includePattern = { [`**/*.${fileType}`]: true };
			}

			// Context lines: engine uses single number for both before/after (--before-context / --after-context)
			const surroundingContext = Math.max(
				beforeLines ?? 0,
				afterLines ?? 0,
				contextLines ?? 0
			);

			// Build search query (folder is always a directory; file paths were resolved to parent above)
			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: {
					pattern,
					isRegExp: true,
					isCaseSensitive: caseSensitive,
					isMultiline: needsMultiline, // Enable multiline mode so ^ and $ match line boundaries
				},
				folderQueries: [{
					folder: folderUri,
					...(includePattern && { includePattern }),
				}],
				maxResults,
				...(surroundingContext > 0 && { surroundingContext }),
			};

			try {
			// Execute search
				console.log(`[VybeGrepTool] 🔍 Executing textSearch with query:`, {
					pattern: query.contentPattern.pattern,
					isRegExp: query.contentPattern.isRegExp,
					isMultiline: query.contentPattern.isMultiline,
					isCaseSensitive: query.contentPattern.isCaseSensitive,
					folder: query.folderQueries?.[0]?.folder?.path,
					includePattern: query.folderQueries?.[0]?.includePattern,
					maxResults: query.maxResults
				});

			const results = await searchService.textSearch(query, context.cancellationToken);

				console.log(`[VybeGrepTool] 🔍 Raw search results:`, {
					fileCount: results.results?.length || 0,
					limitHit: results.limitHit,
					stats: results.stats
				});

				// Convert results to simple format - handle both ITextSearchMatch and ITextSearchContext
			const matches: GrepMatch[] = [];

				for (const fileMatch of (results.results || []) as IFileMatch[]) {
					// Handle both absolute paths and relative paths
					let relativePath = fileMatch.resource.path;

					// If the path starts with the workspace root, make it relative
					if (relativePath.startsWith(context.workspaceRoot.path)) {
						relativePath = relativePath.substring(context.workspaceRoot.path.length);
						// Remove leading slash if present
						if (relativePath.startsWith('/')) {
							relativePath = relativePath.substring(1);
						}
					}

					const fileResults = fileMatch.results || [];
					// Removed verbose per-file logging (too many files)

					for (const match of fileResults) {
						if (resultIsMatch(match)) {
							// ITextSearchMatch - has rangeLocations and previewText
							const textMatch = match as ITextSearchMatch;
						for (const range of textMatch.rangeLocations || []) {
								matches.push({
									file: relativePath,
									line: range.source.startLineNumber + 1, // Convert to 1-based line numbers
									column: range.source.startColumn + 1, // Convert to 1-based columns
									match: textMatch.previewText || '',
									preview: textMatch.previewText || '',
								});
							}
						} else {
							// ITextSearchContext - has text and lineNumber (context lines)
							const contextMatch = match as ITextSearchContext;
							matches.push({
								file: relativePath,
								line: contextMatch.lineNumber,
								column: 1,
								match: contextMatch.text || '',
								preview: contextMatch.text || '',
							});
						}
					}
				}

				const fileCount = results.results?.length || 0;
				const matchCount = matches.length;
				const truncated = results.limitHit || false;

				console.log(`[VybeGrepTool] ✅ Grep complete:`, {
					pattern,
					matchCount,
					fileCount,
					truncated,
					outputMode
				});

				const summary = `Found ${matchCount} matches in ${fileCount} files${truncated ? ' (results truncated, more matches exist)' : ''}.`;

				// Return shape depends on output_mode (plan 2.3)
				const mode = outputMode ?? 'content';
				if (mode === 'files_with_matches') {
					// Build grepResults [{ file, path, matchCount }] from matches so UI/service can show file list
					const fileToCount = new Map<string, number>();
					for (const m of matches) {
						fileToCount.set(m.file, (fileToCount.get(m.file) ?? 0) + 1);
					}
					const grepResults = Array.from(fileToCount.entries()).map(([path, matchCountPerFile]) => ({
						file: path.split(/[/\\]/).pop() || path,
						path,
						matchCount: matchCountPerFile
					}));
					return {
						summary,
						totalMatches: matchCount,
						fileCount,
						truncated,
						grepResults,
						matches: []
					};
				}
				if (mode === 'count') {
					return {
						summary,
						totalMatches: matchCount,
						fileCount,
						truncated
					};
				}
				// content (default): full matches array for existing UI and agent behavior
				return {
					summary,
					matches,
					truncated,
					totalMatches: matchCount,
					fileCount
				};
			} catch (error) {
				console.error(`[VybeGrepTool] ❌ Search failed:`, error);
				console.error(`[VybeGrepTool] ❌ Pattern was: "${pattern}", isRegExp: true, isMultiline: ${needsMultiline}`);

				// Check if it's a regex error
				if (error instanceof Error) {
					const errorMessage = error.message.toLowerCase();
					if (errorMessage.includes('regex') || errorMessage.includes('pattern') || errorMessage.includes('invalid')) {
						return {
							summary: `Invalid regex pattern: ${pattern}. ${error.message}`,
							matches: [],
							truncated: false,
							totalMatches: 0,
							fileCount: 0,
							error: `Invalid regex pattern: ${pattern}. ${error.message}`,
						};
					}
				}

				// For other errors, return empty result with error message
			return {
					summary: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
					matches: [],
					truncated: false,
					totalMatches: 0,
					fileCount: 0,
					error: error instanceof Error ? error.message : String(error),
			};
			}
		},
	};
}
