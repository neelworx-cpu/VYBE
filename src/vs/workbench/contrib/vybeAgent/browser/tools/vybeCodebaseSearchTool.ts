/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Codebase Search Tool
 *
 * Performs semantic search over the codebase using Voyage AI and Pinecone.
 * Returns relevant code snippets with file paths and line ranges.
 */

import { IVoyageEmbeddingService } from '../../../../services/indexing/common/voyageEmbeddingService.js';
import { IPineconeVectorStore } from '../../../../services/indexing/common/pineconeVectorStore.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import { getUserId, getNamespace } from '../../../../services/indexing/common/namespaceUtils.js';
import { CONFIG_CLOUD_INDEXING_ENABLED } from '../../../../services/indexing/common/indexingConfiguration.js';
import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

interface SearchResult {
	file: string;
	path: string;
	lineRange?: { start: number; end: number };
	score?: number;
	snippet?: string;
}

export function createCodebaseSearchTool(
	voyageService: IVoyageEmbeddingService,
	pineconeStore: IPineconeVectorStore,
	configurationService: IConfigurationService,
	workspaceService: IWorkspaceContextService
): VybeTool {
	return {
		name: 'codebase_search',
		description: 'Semantic search over the codebase using AI embeddings. Use this for conceptual questions like "where is X implemented?", "how does Y work?", "what files handle Z?". This tool understands code meaning, not just text matching. Prefer this over grep for "where/how/what" questions about code functionality, architecture, or implementation details. Returns relevant code snippets with file paths and line ranges.',
		parameters: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Natural language query describing what to search for (e.g., "where is authentication handled?", "how does file reading work?")',
				},
				target_directories: {
					type: 'array',
					items: {
						type: 'string',
					},
					description: 'Optional: Array of directory paths to limit search to (relative to workspace root)',
				},
				maxResults: {
					type: 'number',
					description: 'Maximum number of results to return (default: 20)',
				},
			},
			required: ['query'],
		},
		requiredCapabilities: ['search'],
		parallelizable: true,
		cacheable: false, // Search results can change as codebase evolves

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			// explanation is required by Cursor's schema but not used in implementation (for future use)
			void (args.explanation as string | undefined);
			const query = args.query as string;
			// Cursor requires target_directories (can be empty array), VYBE had it optional
			const targetDirectories = (args.target_directories as string[] | undefined) ?? [];
			const maxResults = (args.maxResults as number | undefined) ?? 20;

			console.log(`[VybeCodebaseSearchTool] 🔍 Executing codebase search:`, {
				query,
				targetDirectories: targetDirectories || '(all directories)',
				maxResults,
				workspaceRoot: context.workspaceRoot.path
			});

			// Get workspace URI
			const workspaceFolder = workspaceService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				const error = 'No workspace folder found';
				console.error(`[VybeCodebaseSearchTool] ❌ ${error}`);
				return {
					summary: error,
					results: [],
					totalResults: 0,
				};
			}

			const workspaceUri = workspaceFolder.uri;
			const workspacePath = workspaceUri.fsPath;

			// Check if cloud indexing is enabled
			const cloudIndexingEnabled = configurationService.getValue<boolean>(CONFIG_CLOUD_INDEXING_ENABLED) ?? false;
			if (!cloudIndexingEnabled) {
				const error = 'Cloud indexing is disabled. Please enable it in VYBE Settings > Indexing & Docs.';
				console.warn(`[VybeCodebaseSearchTool] ⚠️ ${error}`);
				return {
					summary: error,
					results: [],
					totalResults: 0,
					error: 'Cloud indexing disabled',
				};
			}

			// If target directories specified, validate they're within workspace
			if (targetDirectories && targetDirectories.length > 0) {
				for (const dir of targetDirectories) {
					const dirUri = extUri.resolvePath(workspaceUri, dir);
					if (!workspaceService.isInsideWorkspace(dirUri)) {
						const error = `Directory is outside workspace: ${dir}`;
						console.error(`[VybeCodebaseSearchTool] ❌ ${error}`);
						return {
							summary: error,
							results: [],
							totalResults: 0,
						};
					}
				}
			}

			try {
				// Generate query embedding
				console.log(`[VybeCodebaseSearchTool] 🔍 Embedding query: "${query.substring(0, 100)}..."`);
				const queryEmbeddings = await voyageService.embed([query], 'query');
				if (queryEmbeddings.length === 0 || queryEmbeddings[0].length === 0) {
					throw new Error('Failed to generate query embedding');
				}
				const queryVector = queryEmbeddings[0];

				// Get namespace for this workspace
				const userId = getUserId();
				const namespace = getNamespace(userId, workspacePath);
				console.log(`[VybeCodebaseSearchTool] 🔍 Querying namespace: ${namespace}`);

				// Query Pinecone
				const pineconeResults = await pineconeStore.query(namespace, queryVector, maxResults);

				console.log(`[VybeCodebaseSearchTool] 🔍 Raw search results:`, {
					resultCount: pineconeResults.length,
					results: pineconeResults.slice(0, 3).map(r => ({
						filePath: r.metadata.filePath,
						score: r.score,
						snippet: r.metadata.content?.substring(0, 100),
					})),
				});

				if (pineconeResults.length === 0) {
					const errorMsg = `No results found. Possible reasons:
1. Codebase hasn't been indexed yet - Wait for indexing to complete (check progress in Settings)
2. Query didn't match any indexed content - Try a different query
3. Files may be excluded by .gitignore/.cursorignore`;
					console.warn(`[VybeCodebaseSearchTool] ⚠️ ${errorMsg}`);

					return {
						summary: errorMsg,
						results: [],
						totalResults: 0,
						error: 'No results - indexing may be incomplete',
					};
				}

				// Filter results by target directories if specified
				let filteredResults = pineconeResults;
				if (targetDirectories && targetDirectories.length > 0) {
					filteredResults = pineconeResults.filter(result => {
						const filePath = result.metadata.filePath;
						// Normalize path separators for comparison
						const normalizedPath = filePath.replace(/\\/g, '/');
						return targetDirectories.some(dir => {
							const normalizedDir = dir.replace(/\\/g, '/').replace(/\/$/, '');
							return normalizedPath.startsWith(normalizedDir + '/') ||
								normalizedPath === normalizedDir;
						});
					});
					console.log(`[VybeCodebaseSearchTool] 🔍 Filtered to ${filteredResults.length} results in target directories`);

					if (filteredResults.length === 0) {
						const errorMsg = `No results found in specified directories: ${targetDirectories.join(', ')}. Found ${pineconeResults.length} results in other directories.`;
						console.warn(`[VybeCodebaseSearchTool] ⚠️ ${errorMsg}`);
						return {
							summary: errorMsg,
							results: [],
							totalResults: 0,
							error: 'No results in specified directories',
						};
					}
				}

				// Format results for UI
				const formattedResults: SearchResult[] = [];
				for (const result of filteredResults) {
					const metadata = result.metadata;
					// Normalize relative path (always use forward slashes)
					const relativePath = metadata.filePath.replace(/\\/g, '/');

					// Extract filename from path
					const fileName = relativePath.split('/').pop() || relativePath;

					// Resolve to absolute path for file opening
					const absoluteUri = extUri.resolvePath(workspaceUri, relativePath);
					const absolutePath = absoluteUri.fsPath;

					formattedResults.push({
						file: fileName,
						path: absolutePath, // Use absolute path for reliable file opening
						lineRange: {
							start: metadata.startLine,
							end: metadata.endLine,
						},
						score: result.score,
						snippet: metadata.content,
					});
				}

				console.log(`[VybeCodebaseSearchTool] ✅ Codebase search complete:`, {
					query,
					resultCount: formattedResults.length,
				});

				// Return structured result with summary for AI visibility
				return {
					summary: `Found ${formattedResults.length} relevant result${formattedResults.length === 1 ? '' : 's'} for "${query}".`,
					results: formattedResults,
					totalResults: formattedResults.length,
				};
			} catch (error) {
				console.error(`[VybeCodebaseSearchTool] ❌ Search failed:`, error);

				// Provide more helpful error messages based on error type
				const errorMessage = error instanceof Error ? error.message : String(error);
				let userFriendlyMessage = `Search failed: ${errorMessage}`;
				let errorCode = 'search_failed';

				if (errorMessage.includes('API key') || errorMessage.includes('not initialized') || errorMessage.includes('Pinecone client')) {
					userFriendlyMessage = 'Search service not ready. Please check that indexing is enabled and API keys are configured correctly.';
					errorCode = 'api_key_missing';
				} else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
					userFriendlyMessage = 'Search service temporarily unavailable due to rate limits. Please try again in a moment.';
					errorCode = 'rate_limited';
				} else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
					userFriendlyMessage = 'Network error connecting to search service. Please check your connection and try again.';
					errorCode = 'network_error';
				} else if (errorMessage.includes('embedding')) {
					userFriendlyMessage = 'Failed to process query for semantic search. Please try rephrasing your query.';
					errorCode = 'embedding_failed';
				}

				return {
					summary: userFriendlyMessage,
					results: [],
					totalResults: 0,
					error: errorCode,
					errorDetails: errorMessage,
				};
			}
		},
	};
}
