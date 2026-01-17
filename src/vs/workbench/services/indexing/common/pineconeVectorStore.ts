/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IPineconeVectorStore = createDecorator<IPineconeVectorStore>('pineconeVectorStore');

/**
 * Vector record to be stored in Pinecone
 */
export interface VectorRecord {
	/** Unique vector ID: Format: {workspaceHash}::{filePath}::{chunkIndex} */
	id: string;
	/** Embedding vector (1024 dimensions for voyage-code-3) */
	values: number[];
	/** Metadata associated with the vector */
	metadata: {
		userId: string;          // For defense-in-depth filtering
		workspaceId: string;     // Hash of workspace path
		workspacePath: string;   // Human-readable path for debugging
		filePath: string;        // Relative file path in workspace
		startLine: number;
		endLine: number;
		languageId: string;
		content: string;         // Snippet for display (max 1000 chars)
		indexedAt: number;       // Unix timestamp
	};
}

/**
 * Query result from Pinecone
 */
export interface QueryResult {
	id: string;
	score: number;
	metadata: VectorRecord['metadata'];
}

/**
 * Namespace statistics
 */
export interface NamespaceStats {
	vectorCount: number;
	dimension: number;
}

/**
 * Pinecone Vector Store Service
 *
 * Manages vector storage and retrieval using Pinecone serverless index.
 * All operations are scoped to namespaces for user/workspace isolation.
 */
export interface IPineconeVectorStore {
	readonly _serviceBrand: undefined;

	/**
	 * Upsert vectors into a namespace.
	 * @param namespace Namespace identifier: {userId}::{workspaceHash}
	 * @param vectors Array of vectors to upsert
	 */
	upsert(namespace: string, vectors: VectorRecord[]): Promise<void>;

	/**
	 * Query vectors in a namespace.
	 * @param namespace Namespace identifier: {userId}::{workspaceHash}
	 * @param vector Query vector (1024 dimensions)
	 * @param topK Number of results to return
	 * @returns Array of query results sorted by similarity
	 */
	query(namespace: string, vector: number[], topK: number): Promise<QueryResult[]>;

	/**
	 * Delete specific vectors by ID.
	 * @param namespace Namespace identifier
	 * @param ids Array of vector IDs to delete
	 */
	delete(namespace: string, ids: string[]): Promise<void>;

	/**
	 * Delete all vectors in a namespace (entire workspace index).
	 * @param namespace Namespace identifier
	 */
	deleteNamespace(namespace: string): Promise<void>;

	/**
	 * Get statistics for a namespace.
	 * @param namespace Namespace identifier
	 * @returns Namespace statistics
	 */
	getNamespaceStats(namespace: string): Promise<NamespaceStats>;

	/**
	 * Test connection to Pinecone API.
	 * @returns Connection test result
	 */
	testConnection(): Promise<{ success: boolean; error?: string }>;
}
