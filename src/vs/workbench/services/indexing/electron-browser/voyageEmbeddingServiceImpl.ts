/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
// eslint-disable-next-line no-restricted-imports
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IVoyageEmbeddingService } from '../common/voyageEmbeddingService.js';
const VOYAGE_API_BASE_URL = 'https://api.voyageai.com/v1';
const VOYAGE_MODEL = 'voyage-code-3';
const VOYAGE_DIMENSIONS = 1024;
const VOYAGE_MAX_BATCH_SIZE = 128;
const VOYAGE_RATE_LIMIT_RPM = 300;
const VOYAGE_MAX_TOKENS_PER_BATCH = 120000; // Voyage API limit
const VOYAGE_CHARS_PER_TOKEN = 4; // Rough estimate: 1 token ≈ 4 characters for code

interface VoyageEmbeddingResponse {
	data: Array<{
		embedding: number[];
	}>;
	model: string;
	usage: {
		total_tokens: number;
	};
}

export class VoyageEmbeddingServiceImpl extends Disposable implements IVoyageEmbeddingService {
	declare readonly _serviceBrand: undefined;

	private apiKey: string | undefined;
	private requestsInLastMinute = 0;
	private lastMinuteStart = Date.now();

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.loadApiKey();
	}

	private async loadApiKey(): Promise<void> {
		try {
			// Fetch API key from backend via Supabase edge function
			const result = await ipcRenderer.invoke('vscode:vybeFetchApiKey', { provider: 'voyage' });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data = result as any;
			this.apiKey = data.apiKey || data.api_key || data.key;
			if (this.apiKey) {
				this.logService.trace('[VoyageEmbeddingService] API key loaded from backend');
			} else {
				this.logService.warn('[VoyageEmbeddingService] No API key found from backend');
			}
		} catch (error) {
			this.logService.error('[VoyageEmbeddingService] Failed to load API key from backend:', error);
		}
	}

	async getApiKeyStatus(): Promise<'valid' | 'invalid' | 'missing'> {
		if (!this.apiKey) {
			return 'missing';
		}

		try {
			const testResult = await this.testConnection();
			return testResult.success ? 'valid' : 'invalid';
		} catch {
			return 'invalid';
		}
	}

	async testConnection(): Promise<{ success: boolean; error?: string }> {
		if (!this.apiKey) {
			return { success: false, error: 'API key not configured' };
		}

		try {
			// Test with a simple single embedding
			const result = await this.embed(['test'], 'document');
			if (result.length === 1 && result[0].length === VOYAGE_DIMENSIONS) {
				return { success: true };
			}
			return { success: false, error: 'Unexpected response format' };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	}

	/**
	 * Estimate token count for a text (rough estimate: 1 token ≈ 4 characters for code)
	 */
	private estimateTokens(text: string): number {
		return Math.ceil(text.length / VOYAGE_CHARS_PER_TOKEN);
	}


	/**
	 * Split texts into token-aware batches that don't exceed the API limit
	 */
	private splitIntoBatches(texts: string[]): string[][] {
		const batches: string[][] = [];
		let currentBatch: string[] = [];
		let currentTokens = 0;

		for (const text of texts) {
			const textTokens = this.estimateTokens(text);

			// If single text exceeds limit, truncate it
			if (textTokens > VOYAGE_MAX_TOKENS_PER_BATCH) {
				// Flush current batch first
				if (currentBatch.length > 0) {
					batches.push(currentBatch);
					currentBatch = [];
					currentTokens = 0;
				}

				// Truncate to fit limit (with some margin)
				const maxChars = (VOYAGE_MAX_TOKENS_PER_BATCH - 1000) * VOYAGE_CHARS_PER_TOKEN;
				const truncated = text.substring(0, maxChars);
				this.logService.warn(`[VoyageEmbeddingService] Text truncated from ${text.length} to ${truncated.length} chars to fit token limit`);
				batches.push([truncated]);
				continue;
			}

			// Check if adding this text would exceed limits
			const wouldExceedTokens = currentTokens + textTokens > VOYAGE_MAX_TOKENS_PER_BATCH;
			const wouldExceedCount = currentBatch.length >= VOYAGE_MAX_BATCH_SIZE;

			if (wouldExceedTokens || wouldExceedCount) {
				// Start a new batch
				if (currentBatch.length > 0) {
					batches.push(currentBatch);
				}
				currentBatch = [text];
				currentTokens = textTokens;
			} else {
				currentBatch.push(text);
				currentTokens += textTokens;
			}
		}

		// Don't forget the last batch
		if (currentBatch.length > 0) {
			batches.push(currentBatch);
		}

		return batches;
	}

	async embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
		if (!this.apiKey) {
			// Try to reload the key once more
			await this.loadApiKey();
			if (!this.apiKey) {
				throw new Error('Voyage AI API key not configured. Please ensure the key is set in Supabase Edge Function secrets.');
			}
		}

		if (texts.length === 0) {
			return [];
		}

		// Filter out empty/whitespace-only strings (Voyage API rejects these)
		const filteredTexts = texts.filter(text => text.trim().length > 0);

		if (filteredTexts.length === 0) {
			this.logService.warn('[VoyageEmbeddingService] All texts were empty/whitespace, returning empty results');
			return [];
		}

		if (filteredTexts.length !== texts.length) {
			this.logService.trace(`[VoyageEmbeddingService] Filtered ${texts.length - filteredTexts.length} empty/whitespace texts`);
		}

		// Split into token-aware batches
		const batches = this.splitIntoBatches(filteredTexts);

		if (batches.length > 1) {
			this.logService.trace(`[VoyageEmbeddingService] Split ${filteredTexts.length} texts into ${batches.length} batches for token limits`);
		}

		// Process all batches
		const results: number[][] = [];
		for (const batch of batches) {
			const batchResults = await this.embedBatch(batch, inputType);
			results.push(...batchResults);
		}
		return results;
	}

	private async embedBatch(texts: string[], inputType: 'document' | 'query', retryCount = 0): Promise<number[][]> {
		// Rate limiting: wait if we've exceeded 300 requests per minute
		await this.waitForRateLimit();

		const url = `${VOYAGE_API_BASE_URL}/embeddings`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.apiKey}`,
		};

		const body = {
			model: VOYAGE_MODEL,
			input: texts,
			input_type: inputType,
		};

		this.logService.trace(`[VoyageEmbeddingService] Embedding ${texts.length} text(s) with input_type=${inputType}`);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				if (response.status === 401) {
					throw new Error('Invalid Voyage AI API key. Please check your settings.');
				}
				if (response.status === 429) {
					// Exponential backoff for rate limits
					const maxRetries = 5;
					if (retryCount < maxRetries) {
						const waitTime = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
						this.logService.warn(`[VoyageEmbeddingService] Rate limit hit, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
						return this.embedBatch(texts, inputType, retryCount + 1);
					}
					throw new Error('Rate limit exceeded after retries. Please wait and try again later.');
				}
				throw new Error(`Voyage API error (${response.status}): ${errorText}`);
			}

			const data: VoyageEmbeddingResponse = await response.json();

			if (!data.data || data.data.length !== texts.length) {
				throw new Error(`Unexpected response: expected ${texts.length} embeddings, got ${data.data?.length ?? 0}`);
			}

			const embeddings = data.data.map(item => {
				if (item.embedding.length !== VOYAGE_DIMENSIONS) {
					throw new Error(`Unexpected embedding dimension: expected ${VOYAGE_DIMENSIONS}, got ${item.embedding.length}`);
				}
				return item.embedding;
			});

			this.logService.trace(`[VoyageEmbeddingService] Successfully embedded ${embeddings.length} text(s), used ${data.usage.total_tokens} tokens`);

			return embeddings;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.error(`[VoyageEmbeddingService] Embedding failed: ${message}`);
			throw error;
		}
	}

	private async waitForRateLimit(): Promise<void> {
		const now = Date.now();

		// Reset counter if a minute has passed
		if (now - this.lastMinuteStart >= 60000) {
			this.requestsInLastMinute = 0;
			this.lastMinuteStart = now;
		}

		// If we're at the limit, wait
		if (this.requestsInLastMinute >= VOYAGE_RATE_LIMIT_RPM) {
			const waitTime = 60000 - (now - this.lastMinuteStart);
			this.logService.trace(`[VoyageEmbeddingService] Rate limit reached, waiting ${waitTime}ms`);
			await new Promise(resolve => setTimeout(resolve, waitTime));
			this.requestsInLastMinute = 0;
			this.lastMinuteStart = Date.now();
		}

		this.requestsInLastMinute++;
	}
}
