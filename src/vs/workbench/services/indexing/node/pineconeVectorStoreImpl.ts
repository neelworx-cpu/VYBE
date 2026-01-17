/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPineconeVectorStore, VectorRecord, QueryResult, NamespaceStats } from '../common/pineconeVectorStore.js';
import { isNative } from '../../../../base/common/platform.js';
// eslint-disable-next-line local/code-import-patterns
import { createRequire } from 'module';

const PINECONE_DIMENSIONS = 1024;
const PINECONE_MAX_UPSERT_BATCH = 100; // Pinecone recommends batches of 100

// Lazy load Pinecone SDK to avoid module resolution issues
// Use createRequire to load Node.js packages in extension host (ESM context)
let nodeRequire: NodeRequire | undefined;
try {
	if (typeof import.meta !== 'undefined' && typeof import.meta.url !== 'undefined') {
		// ESM context: use createRequire with import.meta.url
		nodeRequire = createRequire(import.meta.url);
	} else if (typeof require === 'function') {
		// CommonJS context: use require directly
		nodeRequire = require;
	}
} catch (err) {
	// Ignore - will fail gracefully in getPineconeModule
	console.warn('[PineconeVectorStore] Failed to set up nodeRequire:', err);
}

function getPineconeModule(): any {
	// Use require for Node.js packages in extension host (synchronous)
	// Return as 'any' to avoid TypeScript trying to resolve the module type at compile time
	if (!isNative || !nodeRequire) {
		throw new Error('Pinecone SDK is only available in Node.js context');
	}
	return nodeRequire('@pinecone-database/pinecone');
}

// Type aliases for Pinecone types (using any to avoid module resolution issues)
type PineconeClient = any;
type PineconeIndex = any;

export class PineconeVectorStoreImpl extends Disposable implements IPineconeVectorStore {
	declare readonly _serviceBrand: undefined;

	private pinecone: PineconeClient | undefined;
	private index: PineconeIndex | undefined;
	private indexName: string = 'vybe';

	// Mutex pattern: prevent duplicate initialization
	private initializationPromise: Promise<void> | undefined;
	// Cache API key after first successful fetch
	private cachedApiKey: string | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
		// Index name is hardcoded to 'vybe' (default from config)
		// Configuration is not available in extension host context
		this.indexName = 'vybe';
		this.logService.trace(`[PineconeVectorStore] Using index name: ${this.indexName}`);
		this.initializeClient();
	}

	private async initializeClient(): Promise<void> {
		// Prevent duplicate initializations - return existing promise if in progress
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = this.doInitializeClient();
		return this.initializationPromise;
	}

	private async doInitializeClient(): Promise<void> {
		try {
			console.log('[PineconeVectorStore] Initializing client...');

			// Use cached API key if available, otherwise fetch from Supabase
			const apiKey = this.cachedApiKey || await this.fetchApiKeyFromSupabase();

			if (!apiKey) {
				console.warn('[PineconeVectorStore] No API key found. Please ensure the key is set in Supabase Edge Function secrets.');
				this.logService.warn('[PineconeVectorStore] No API key found. Please ensure the key is set in Supabase Edge Function secrets.');
				// Clear the promise so next call can retry
				this.initializationPromise = undefined;
				return;
			}

			// Cache the API key for future use
			this.cachedApiKey = apiKey;

			console.log('[PineconeVectorStore] API key received, loading Pinecone module...');
			// Lazy load Pinecone module (synchronous require)
			const { Pinecone } = getPineconeModule();

			// Initialize Pinecone client
			this.pinecone = new Pinecone({
				apiKey: apiKey
			});

			// Get index reference
			this.index = this.pinecone.index(this.indexName);

			console.log('[PineconeVectorStore] Client initialized successfully');
			this.logService.info('[PineconeVectorStore] Client initialized successfully');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;
			console.error('[PineconeVectorStore] Failed to initialize client:', message, stack);
			this.logService.error('[PineconeVectorStore] Failed to initialize client:', error);
			// Clear the promise so next call can retry
			this.initializationPromise = undefined;
		}
	}

	private async fetchApiKeyFromSupabase(): Promise<string | undefined> {
		try {
			// Use console.log for visibility (extension host logs appear in console)
			console.log('[PineconeVectorStore] Fetching API key from Supabase Edge Function...');
			this.logService.info('[PineconeVectorStore] Fetching API key from Supabase Edge Function...');

			// Supabase configuration
			const SUPABASE_URL = 'https://xlrcsusfaynypqvyfmgk.supabase.co';
			const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscmNzdXNmYXlueXBxdnlmbWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5NDU3ODksImV4cCI6MjA3OTUyMTc4OX0.7Upe8xKgKSh9YRlsAS7uvLll1gENS27VTNRa6NMXBx8';
			const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/get-llm-key`;

			// In extension host (ESM context), use nodeRequire which was set up at module level
			if (!nodeRequire) {
				console.error('[PineconeVectorStore] nodeRequire not available - cannot fetch API key');
				this.logService.error('[PineconeVectorStore] nodeRequire not available - cannot fetch API key');
				return undefined;
			}
			const https = nodeRequire('https');
			const url = new URL(edgeFunctionUrl);

			console.log(`[PineconeVectorStore] Making request to: ${edgeFunctionUrl}`);
			this.logService.info(`[PineconeVectorStore] Making request to: ${edgeFunctionUrl}`);

			const response = await new Promise<any>((resolve, reject) => {
				const options = {
					hostname: url.hostname,
					port: url.port || (url.protocol === 'https:' ? 443 : 80),
					path: url.pathname + url.search,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
					},
				};

				const req = https.request(options, (res: any) => {
					let data = '';
					res.on('data', (chunk: any) => { data += chunk; });
					res.on('end', () => {
						try {
							const parsed = JSON.parse(data);
							resolve({ ok: res.statusCode === 200, status: res.statusCode, json: () => Promise.resolve(parsed) });
						} catch (e) {
							reject(e);
						}
					});
				});

				req.on('error', reject);
				req.write(JSON.stringify({ provider: 'pinecone' }));
				req.end();
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				console.error(`[PineconeVectorStore] Failed to fetch API key from Supabase: ${response.status}`, errorData);
				this.logService.error(`[PineconeVectorStore] Failed to fetch API key from Supabase: ${response.status}`, errorData);
				return undefined;
			}

			const data = await response.json();
			console.log('[PineconeVectorStore] Supabase response received:', { hasApiKey: !!(data.apiKey || data.api_key || data.key), keys: Object.keys(data) });
			const fetchedKey = data.apiKey || data.api_key || data.key;

			if (fetchedKey) {
				console.log('[PineconeVectorStore] API key fetched from Supabase successfully');
				this.logService.info('[PineconeVectorStore] API key fetched from Supabase successfully');
				return fetchedKey;
			}

			console.warn('[PineconeVectorStore] API key not found in Supabase response', data);
			this.logService.warn('[PineconeVectorStore] API key not found in Supabase response', data);
			return undefined;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;
			console.error('[PineconeVectorStore] Failed to fetch API key from Supabase:', message, stack);
			this.logService.error('[PineconeVectorStore] Failed to fetch API key from Supabase:', message, stack);
			return undefined;
		}
	}


	private async ensureClient(): Promise<PineconeIndex> {
		// Wait for any in-progress initialization to complete
		if (this.initializationPromise) {
			await this.initializationPromise;
		}

		// If still not initialized, try again
		if (!this.pinecone || !this.index) {
			console.log('[PineconeVectorStore] Client not initialized, attempting to initialize...');
			await this.initializeClient();
			if (!this.pinecone || !this.index) {
				const errorMsg = 'Pinecone client not initialized. Please ensure the API key is set in Supabase Edge Function secrets.';
				console.error(`[PineconeVectorStore] ${errorMsg}`);
				this.logService.error(`[PineconeVectorStore] ${errorMsg}`);
				throw new Error(errorMsg);
			}
			console.log('[PineconeVectorStore] Client initialized successfully in ensureClient');
		}
		return this.index;
	}

	async testConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			const index = await this.ensureClient();

			// Test by querying index stats
			const stats = await index.describeIndexStats();

			this.logService.trace(`[PineconeVectorStore] Connection test successful. Index dimension: ${stats.dimension}, total records: ${stats.totalRecordCount}`);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('401') || message.includes('Unauthorized')) {
				return { success: false, error: 'Invalid Pinecone API key' };
			}
			if (message.includes('404') || message.includes('not found')) {
				return { success: false, error: `Index "${this.indexName}" not found` };
			}
			return { success: false, error: message };
		}
	}

	async upsert(namespace: string, vectors: VectorRecord[]): Promise<void> {
		if (vectors.length === 0) {
			return;
		}

		// Validate dimensions
		for (const vector of vectors) {
			if (vector.values.length !== PINECONE_DIMENSIONS) {
				throw new Error(`Invalid vector dimension: expected ${PINECONE_DIMENSIONS}, got ${vector.values.length}`);
			}
		}

		const index = await this.ensureClient();
		const namespaceIndex = index.namespace(namespace);

		// Batch upserts if needed
		if (vectors.length > PINECONE_MAX_UPSERT_BATCH) {
			for (let i = 0; i < vectors.length; i += PINECONE_MAX_UPSERT_BATCH) {
				const batch = vectors.slice(i, i + PINECONE_MAX_UPSERT_BATCH);
				await this.upsertBatch(namespaceIndex, batch);
			}
			return;
		}

		await this.upsertBatch(namespaceIndex, vectors);
	}

	private async upsertBatch(namespaceIndex: ReturnType<PineconeIndex['namespace']>, vectors: VectorRecord[]): Promise<void> {
		this.logService.trace(`[PineconeVectorStore] Upserting ${vectors.length} vector(s) to namespace`);

		try {
			await namespaceIndex.upsert(
				vectors.map(v => ({
					id: v.id,
					values: v.values,
					metadata: {
						userId: v.metadata.userId,
						workspaceId: v.metadata.workspaceId,
						workspacePath: v.metadata.workspacePath,
						filePath: v.metadata.filePath,
						startLine: v.metadata.startLine,
						endLine: v.metadata.endLine,
						languageId: v.metadata.languageId,
						content: v.metadata.content.substring(0, 1000), // Limit content size
						indexedAt: v.metadata.indexedAt,
					},
				}))
			);

			this.logService.trace(`[PineconeVectorStore] Successfully upserted ${vectors.length} vector(s)`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[PineconeVectorStore] Upsert failed: ${message}`);
			if (message.includes('401') || message.includes('Unauthorized')) {
				throw new Error('Invalid Pinecone API key. Please check your settings.');
			}
			if (message.includes('404') || message.includes('not found')) {
				throw new Error(`Pinecone index "${this.indexName}" not found. Please verify the index exists and the name is correct.`);
			}
			throw error;
		}
	}

	async query(namespace: string, vector: number[], topK: number): Promise<QueryResult[]> {
		if (vector.length !== PINECONE_DIMENSIONS) {
			throw new Error(`Invalid query vector dimension: expected ${PINECONE_DIMENSIONS}, got ${vector.length}`);
		}

		const index = await this.ensureClient();
		const namespaceIndex = index.namespace(namespace);

		this.logService.trace(`[PineconeVectorStore] Querying namespace "${namespace}" with topK=${topK}`);

		try {
			const queryResponse = await namespaceIndex.query({
				vector,
				topK,
				includeMetadata: true,
			});

			const results: QueryResult[] = (queryResponse.matches || []).map((match: any) => ({
				id: match.id,
				score: match.score || 0,
				metadata: {
					userId: String(match.metadata?.userId || ''),
					workspaceId: String(match.metadata?.workspaceId || ''),
					workspacePath: String(match.metadata?.workspacePath || ''),
					filePath: String(match.metadata?.filePath || ''),
					startLine: Number(match.metadata?.startLine || 0),
					endLine: Number(match.metadata?.endLine || 0),
					languageId: String(match.metadata?.languageId || ''),
					content: String(match.metadata?.content || ''),
					indexedAt: Number(match.metadata?.indexedAt || 0),
				},
			}));

			this.logService.trace(`[PineconeVectorStore] Query returned ${results.length} result(s)`);
			return results;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[PineconeVectorStore] Query failed: ${message}`);
			if (message.includes('401') || message.includes('Unauthorized')) {
				throw new Error('Invalid Pinecone API key. Please check your settings.');
			}
			throw error;
		}
	}

	async delete(namespace: string, ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}

		const index = await this.ensureClient();
		const namespaceIndex = index.namespace(namespace);

		this.logService.trace(`[PineconeVectorStore] Deleting ${ids.length} vector(s) from namespace "${namespace}"`);

		try {
			await namespaceIndex.deleteMany(ids);
			this.logService.trace(`[PineconeVectorStore] Successfully deleted ${ids.length} vector(s)`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[PineconeVectorStore] Delete failed: ${message}`);
			throw error;
		}
	}

	async deleteNamespace(namespace: string): Promise<void> {
		const index = await this.ensureClient();
		const namespaceIndex = index.namespace(namespace);

		this.logService.trace(`[PineconeVectorStore] Deleting entire namespace "${namespace}"`);

		try {
			await namespaceIndex.deleteAll();
			this.logService.trace(`[PineconeVectorStore] Successfully deleted namespace "${namespace}"`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[PineconeVectorStore] Delete namespace failed: ${message}`);
			throw error;
		}
	}

	async getNamespaceStats(namespace: string): Promise<NamespaceStats> {
		const index = await this.ensureClient();

		try {
			const stats = await index.describeIndexStats();
			const namespaceStats = stats.namespaces?.[namespace];

			return {
				vectorCount: namespaceStats?.recordCount ?? 0,
				dimension: stats.dimension ?? PINECONE_DIMENSIONS,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[PineconeVectorStore] Get namespace stats failed: ${message}`);
			throw error;
		}
	}
}
