/*---------------------------------------------------------------------------------------------
 *  VYBE - Retrieval and RAG for LangGraph Agent
 *  Vector store, semantic search, and retrieval-augmented generation
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/rag
 *--------------------------------------------------------------------------------------------*/

import { tool } from '@langchain/core/tools';
import * as z from 'zod';

// =====================================================
// RETRIEVER CONTEXT INTERFACE
// =====================================================

export interface VybeRetrieverContext {
	indexingService: {
		semanticSearch: (query: string, directories?: string[]) => Promise<SearchResult[]>;
		getVectorStore: () => VectorStore;
	};
	fileService: {
		glob: (pattern: string) => Promise<string[]>;
		grep: (pattern: string, path?: string, glob?: string) => Promise<string>;
		readFile: (path: string) => Promise<string>;
	};
	terminalService: {
		runInSession: (command: string) => Promise<string>;
	};
}

export interface SearchResult {
	content: string;
	path: string;
	score: number;
	metadata?: Record<string, unknown>;
}

export interface VectorStore {
	asRetriever: (options?: { k?: number }) => Retriever;
	addDocuments: (docs: Document[]) => Promise<void>;
	similaritySearch: (query: string, k?: number) => Promise<Document[]>;
}

export interface Retriever {
	invoke: (query: string) => Promise<Document[]>;
}

export interface Document {
	pageContent: string;
	metadata: {
		path?: string;
		score?: number;
		[key: string]: unknown;
	};
}

// =====================================================
// CODEBASE RETRIEVER TOOL
// =====================================================

/**
 * Semantic search over the codebase using vector embeddings
 */
export const codebaseRetrieverTool = tool(
	async (input: { query: string; k?: number }, config) => {
		const context = config?.configurable?.context as VybeRetrieverContext;
		if (!context?.indexingService) {
			throw new Error('Indexing service not available in context');
		}

		const vectorStore = context.indexingService.getVectorStore();
		const retriever = vectorStore.asRetriever({ k: input.k || 10 });

		const docs = await retriever.invoke(input.query);
		return docs.map(d => ({
			content: d.pageContent,
			path: d.metadata.path,
			score: d.metadata.score,
		}));
	},
	{
		name: 'codebase_retriever',
		description: 'Semantic search over the codebase using vector embeddings. Returns most relevant code snippets.',
		schema: z.object({
			query: z.string().describe('Natural language query to search for'),
			k: z.number().optional().describe('Number of results to return (default: 10)'),
		}),
	}
);

// =====================================================
// FILE SEARCH TOOL (GLOB + GREP)
// =====================================================

/**
 * Search files by pattern and optionally filter by content
 */
export const fileSearchTool = tool(
	async (input: { pattern: string; query?: string; maxResults?: number }, config) => {
		const context = config?.configurable?.context as VybeRetrieverContext;
		if (!context?.fileService) {
			throw new Error('File service not available in context');
		}

		// First, find files matching the glob pattern
		const files = await context.fileService.glob(input.pattern);

		if (input.query) {
			// If a content query is provided, grep within matching files
			const matches = await context.fileService.grep(input.query, undefined, input.pattern);
			return matches;
		}

		// Return file list (limited if maxResults specified)
		const limitedFiles = input.maxResults
			? files.slice(0, input.maxResults)
			: files;

		return limitedFiles.join('\n');
	},
	{
		name: 'file_search',
		description: 'Search files by glob pattern and optionally filter by content. Use for finding specific files or code patterns.',
		schema: z.object({
			pattern: z.string().describe('Glob pattern like **/*.ts, src/**/*.py'),
			query: z.string().optional().describe('Content pattern to search for within files'),
			maxResults: z.number().optional().describe('Maximum number of results to return'),
		}),
	}
);

// =====================================================
// SHELL TOOL (PERSISTENT SESSION)
// =====================================================

/**
 * Execute command in a persistent shell session
 * State persists between commands (cd, env vars, etc.)
 */
export const shellTool = tool(
	async (input: { command: string; timeout?: number }, config) => {
		const context = config?.configurable?.context as VybeRetrieverContext;
		if (!context?.terminalService) {
			throw new Error('Terminal service not available in context');
		}

		return await context.terminalService.runInSession(input.command);
	},
	{
		name: 'shell',
		description: 'Execute command in a persistent shell session. State persists between commands (cd, environment variables, etc.).',
		schema: z.object({
			command: z.string().describe('Shell command to execute'),
			timeout: z.number().optional().describe('Timeout in milliseconds'),
		}),
	}
);

// =====================================================
// CONTEXT-AWARE RETRIEVAL
// =====================================================

/**
 * Retrieval configuration for different contexts
 */
export interface RetrievalConfig {
	// Number of results to retrieve
	k: number;

	// Minimum similarity score (0-1)
	minScore: number;

	// Include file path in results
	includePath: boolean;

	// Include surrounding context lines
	contextLines: number;

	// File patterns to include/exclude
	includePatterns?: string[];
	excludePatterns?: string[];
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
	k: 10,
	minScore: 0.5,
	includePath: true,
	contextLines: 3,
	excludePatterns: ['node_modules/**', 'dist/**', '.git/**'],
};

/**
 * Create a context-aware retriever
 */
export function createContextAwareRetriever(
	vectorStore: VectorStore,
	config: Partial<RetrievalConfig> = {}
) {
	const fullConfig = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };

	return {
		async retrieve(query: string): Promise<SearchResult[]> {
			const docs = await vectorStore.similaritySearch(query, fullConfig.k * 2);

			// Filter by score
			const filtered = docs.filter(d =>
				(d.metadata.score || 0) >= fullConfig.minScore
			);

			// Apply patterns
			const patternFiltered = filtered.filter(d => {
				const path = d.metadata.path as string;
				if (!path) return true;

				// Check exclude patterns
				if (fullConfig.excludePatterns?.some(p => matchGlob(path, p))) {
					return false;
				}

				// Check include patterns
				if (fullConfig.includePatterns && fullConfig.includePatterns.length > 0) {
					return fullConfig.includePatterns.some(p => matchGlob(path, p));
				}

				return true;
			});

			return patternFiltered.slice(0, fullConfig.k).map(d => ({
				content: d.pageContent,
				path: d.metadata.path as string,
				score: d.metadata.score as number,
				metadata: d.metadata,
			}));
		},
	};
}

/**
 * Simple glob pattern matching
 */
function matchGlob(path: string, pattern: string): boolean {
	const regex = new RegExp(
		'^' +
		pattern
			.replace(/\*\*/g, '.*')
			.replace(/\*/g, '[^/]*')
			.replace(/\?/g, '.') +
		'$'
	);
	return regex.test(path);
}

// =====================================================
// RAG CHAIN HELPERS
// =====================================================

/**
 * Format retrieved documents for context injection
 */
export function formatRetrievedContext(results: SearchResult[]): string {
	if (results.length === 0) {
		return 'No relevant context found.';
	}

	return results
		.map((r, i) => {
			const header = r.path ? `### ${r.path} (relevance: ${(r.score * 100).toFixed(1)}%)` : `### Result ${i + 1}`;
			return `${header}\n\`\`\`\n${r.content}\n\`\`\``;
		})
		.join('\n\n');
}

/**
 * Create a RAG prompt template
 */
export function createRAGPrompt(query: string, context: string): string {
	return `Use the following context to answer the question. If the context doesn't contain relevant information, say so.

Context:
${context}

Question: ${query}

Answer:`;
}

// =====================================================
// EXPORT ALL RETRIEVAL TOOLS
// =====================================================

export const retrievalTools = [
	codebaseRetrieverTool,
	fileSearchTool,
	shellTool,
];





