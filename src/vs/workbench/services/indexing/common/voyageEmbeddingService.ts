/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IVoyageEmbeddingService = createDecorator<IVoyageEmbeddingService>('voyageEmbeddingService');

/**
 * Voyage AI Embedding Service
 *
 * Generates embeddings using Voyage-code-3 model for code semantic search.
 * Model specifications:
 * - Model: voyage-code-3
 * - Dimensions: 1024
 * - Max tokens per text: 16,000
 * - Batch size: Up to 128 texts per request
 * - Rate limit: 300 RPM (free tier)
 */
export interface IVoyageEmbeddingService {
	readonly _serviceBrand: undefined;

	/**
	 * Generate embeddings for the given texts.
	 * @param texts Array of text strings to embed
	 * @param inputType 'document' for code chunks, 'query' for search queries
	 * @returns Array of embedding vectors (1024 dimensions each)
	 */
	embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]>;

	/**
	 * Check if API key is configured and valid.
	 * @returns 'valid' if API key works, 'invalid' if key is wrong, 'missing' if not set
	 */
	getApiKeyStatus(): Promise<'valid' | 'invalid' | 'missing'>;

	/**
	 * Test the API connection with a simple embedding request.
	 * @returns true if connection successful, false otherwise
	 */
	testConnection(): Promise<{ success: boolean; error?: string }>;
}
