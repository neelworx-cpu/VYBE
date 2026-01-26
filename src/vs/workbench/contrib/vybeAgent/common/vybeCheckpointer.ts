/*---------------------------------------------------------------------------------------------
 *  VYBE - LangGraph Checkpointer Service
 *  Production-grade PostgresSaver with user-scoped thread isolation
 *--------------------------------------------------------------------------------------------*/

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";
import { getEnvironmentVariable } from "@langchain/core/utils/env";

/**
 * Supabase configuration constants
 */
const SUPABASE_URL = 'https://xlrcsusfaynypqvyfmgk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscmNzdXNmYXlueXBxdnlmbWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5NDU3ODksImV4cCI6MjA3OTUyMTc4OX0.7Upe8xKgKSh9YRlsAS7uvLll1gENS27VTNRa6NMXBx8';

/**
 * Get Supabase Postgres connection string.
 * Priority:
 * 1. Environment variable SUPABASE_DB_CONNECTION_STRING
 * 2. Edge Function (if implemented)
 * 3. Construct from service role key (if available)
 */
async function getSupabaseConnectionString(): Promise<string | undefined> {
	// Priority 1: Environment variable
	// Note: Supabase secrets cannot start with "SUPABASE", so we use DB_CONNECTION_STRING
	const envConnectionString = getEnvironmentVariable("DB_CONNECTION_STRING") ||
		getEnvironmentVariable("SUPABASE_DB_CONNECTION_STRING"); // Fallback for backwards compatibility
	if (envConnectionString) {
		return envConnectionString.trim();
	}

	// Priority 2: Try Edge Function (similar to get-llm-key pattern)
	try {
		const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/get-db-connection`;
		const response = await fetch(edgeFunctionUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
			},
		});

		if (response.ok) {
			const data = await response.json() as { connectionString?: string; connection_string?: string };
			const connString = data.connectionString || data.connection_string;
			if (connString) {
				console.log('[VybeCheckpointer] Connection string retrieved from Edge Function');
				// Trim whitespace (Edge Function might return with whitespace)
				return connString.trim();
			} else {
				console.warn('[VybeCheckpointer] Edge Function returned empty connection string');
			}
		} else {
			const errorText = await response.text().catch(() => 'Unknown error');
			console.warn(`[VybeCheckpointer] Edge Function returned error: ${response.status} - ${errorText}`);
		}
	} catch (error) {
		console.warn('[VybeCheckpointer] Edge function fetch failed, trying fallback:', error);
	}

	// Priority 3: Construct from service role key (if available)
	const serviceRoleKey = getEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");
	if (serviceRoleKey) {
		// Note: This is a simplified approach. In production, you'd need the actual DB password
		// For now, return undefined to trigger fallback
		console.warn('[VybeCheckpointer] Service role key found but connection string construction not implemented');
	}

	return undefined;
}

/**
 * Create a PostgresSaver checkpointer with Supabase connection.
 *
 * @param userId - User ID for scoping (not used in connection, but logged)
 * @returns PostgresSaver instance, or undefined if connection fails
 */
export async function createPostgresCheckpointer(userId: string): Promise<PostgresSaver | undefined> {
	try {
		const connectionString = await getSupabaseConnectionString();

		if (!connectionString) {
			console.error('[VybeCheckpointer] No Supabase connection string available. Set DB_CONNECTION_STRING environment variable or ensure Edge Function secret is set.');
			return undefined;
		}

		// Trim whitespace (Edge Function might return with whitespace)
		const trimmedConnectionString = connectionString.trim();

		// Validate connection string format
		if (!trimmedConnectionString.startsWith('postgresql://') && !trimmedConnectionString.startsWith('postgres://')) {
			console.error('[VybeCheckpointer] Invalid connection string format. Must start with postgresql:// or postgres://');
			console.error('[VybeCheckpointer] Connection string preview:', trimmedConnectionString.substring(0, 50));
			console.error('[VybeCheckpointer] First 10 chars (hex):', Array.from(trimmedConnectionString.substring(0, 10)).map(c => c.charCodeAt(0).toString(16)).join(' '));
			return undefined;
		}

		console.log('[VybeCheckpointer] Creating PostgresSaver with Supabase connection...');
		console.log(`[VybeCheckpointer] User ID: ${userId}`);

		// Log connection string preview (first 30 chars + last 20 chars for debugging, redact password)
		const connPreview = trimmedConnectionString.replace(/:([^:@]+)@/, ':***@');
		console.log('[VybeCheckpointer] Connection string preview:', connPreview.substring(0, 50) + '...');

		// Create connection pool
		const pool = new Pool({
			connectionString: trimmedConnectionString,
			min: 2,
			max: 10,
			idleTimeoutMillis: 30000,
		});

		// Create PostgresSaver with default schema ("public")
		const checkpointer = new PostgresSaver(pool, undefined, {
			schema: "public",
		});

		// Setup tables (creates checkpoints, checkpoint_blobs, checkpoint_writes, checkpoint_migrations)
		await checkpointer.setup();
		console.log('[VybeCheckpointer] PostgresSaver initialized successfully');

		return checkpointer;
	} catch (error) {
		console.error('[VybeCheckpointer] Failed to create PostgresSaver:', error);
		return undefined;
	}
}

/**
 * Generate user-scoped thread ID.
 * Format: ${userId}::${taskId}
 *
 * @param userId - User identifier
 * @param taskId - Task identifier
 * @returns User-scoped thread ID
 */
export function getUserScopedThreadId(userId: string, taskId: string): string {
	return `${userId}::${taskId}`;
}

/**
 * Parse thread ID to extract userId and taskId.
 * Handles both new format (${userId}::${taskId}) and legacy format (${taskId}).
 *
 * @param threadId - Thread ID to parse
 * @returns Object with userId and taskId, or undefined if parsing fails
 */
export function parseThreadId(threadId: string): { userId: string; taskId: string } | undefined {
	const parts = threadId.split('::');

	if (parts.length === 2) {
		// New format: userId::taskId
		return {
			userId: parts[0],
			taskId: parts[1],
		};
	} else if (parts.length === 1) {
		// Legacy format: just taskId (no userId prefix)
		// Return with empty userId to indicate legacy thread
		return {
			userId: '',
			taskId: parts[0],
		};
	}

	return undefined;
}

/**
 * Get the latest checkpoint for a thread.
 *
 * @param checkpointer - PostgresSaver instance
 * @param threadId - Thread ID
 * @returns Latest checkpoint tuple, or undefined if not found
 */
export async function getLatestCheckpoint(
	checkpointer: PostgresSaver,
	threadId: string
): Promise<any | undefined> {
	try {
		const config = {
			configurable: {
				thread_id: threadId,
			},
		};

		const tuple = await checkpointer.getTuple(config);
		return tuple;
	} catch (error) {
		console.error(`[VybeCheckpointer] Failed to get latest checkpoint for thread ${threadId}:`, error);
		return undefined;
	}
}

/**
 * List checkpoints for a thread.
 *
 * @param checkpointer - PostgresSaver instance
 * @param threadId - Thread ID
 * @param limit - Maximum number of checkpoints to return
 * @returns Array of checkpoint tuples
 */
export async function listCheckpoints(
	checkpointer: PostgresSaver,
	threadId: string,
	limit?: number
): Promise<any[]> {
	try {
		const config = {
			configurable: {
				thread_id: threadId,
			},
		};

		const checkpoints: any[] = [];
		const iterator = checkpointer.list(config);

		for await (const checkpoint of iterator) {
			checkpoints.push(checkpoint);
			if (limit && checkpoints.length >= limit) {
				break;
			}
		}

		return checkpoints;
	} catch (error) {
		console.error(`[VybeCheckpointer] Failed to list checkpoints for thread ${threadId}:`, error);
		return [];
	}
}

/**
 * Delete all checkpoints for a thread.
 *
 * @param checkpointer - PostgresSaver instance
 * @param threadId - Thread ID
 */
export async function deleteThread(
	checkpointer: PostgresSaver,
	threadId: string
): Promise<void> {
	try {
		// PostgresSaver.deleteThread takes threadId as string, not config object
		await checkpointer.deleteThread(threadId);
		console.log(`[VybeCheckpointer] Deleted thread: ${threadId}`);
	} catch (error) {
		console.error(`[VybeCheckpointer] Failed to delete thread ${threadId}:`, error);
		throw error;
	}
}

/**
 * Thread information returned by listUserThreads
 */
export interface ThreadInfo {
	threadId: string;
	lastCheckpointId: string;
	lastUpdated: Date;
	messageCount: number;
	preview: string;
}

/**
 * List all threads for a user from the checkpoints table.
 * Queries the database for threads starting with `${userId}::`
 *
 * @param userId - User identifier
 * @param checkpointer - PostgresSaver instance (optional, will create if not provided)
 * @returns Array of thread information
 */
export async function listUserThreads(
	userId: string,
	checkpointer?: PostgresSaver
): Promise<ThreadInfo[]> {
	try {
		// If checkpointer not provided, try to create one
		let checkpointerInstance = checkpointer;
		if (!checkpointerInstance) {
			checkpointerInstance = await createPostgresCheckpointer(userId);
			if (!checkpointerInstance) {
				console.warn('[VybeCheckpointer] No checkpointer available, cannot list threads');
				return [];
			}
		}

		// Access the pool from PostgresSaver to query directly
		// PostgresSaver doesn't expose a direct "list all threads" method
		// We need to query the checkpoints table directly
		const pool = (checkpointerInstance as any).pool as Pool;
		if (!pool) {
			console.warn('[VybeCheckpointer] PostgresSaver pool not accessible');
			return [];
		}

		// Query checkpoints table for threads starting with userId::
		const threadPrefix = `${userId}::`;
		const query = `
			SELECT DISTINCT
				thread_id,
				MAX(checkpoint_id) as latest_checkpoint_id,
				MAX(parent_checkpoint_id) as parent_checkpoint_id,
				MAX(ts) as last_updated
			FROM checkpoints
			WHERE thread_id LIKE $1
			GROUP BY thread_id
			ORDER BY last_updated DESC
		`;

		const result = await pool.query(query, [`${threadPrefix}%`]);
		const threads: ThreadInfo[] = [];

		for (const row of result.rows) {
			// Get the latest checkpoint to extract message count and preview
			const threadId = row.thread_id;
			const latestCheckpointId = row.latest_checkpoint_id;
			const lastUpdated = new Date(row.last_updated);

			// Try to get checkpoint details for message count and preview
			let messageCount = 0;
			let preview = 'No message preview';

			try {
				const config = {
					configurable: {
						thread_id: threadId,
					},
				};
				const checkpoint = await checkpointerInstance.getTuple(config);
				if (checkpoint && checkpoint.checkpoint) {
					const state = checkpoint.checkpoint;
					// Extract messages from state - messages are in channel_values
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const channelValues = (state as any).channel_values;
					if (channelValues && channelValues.messages && Array.isArray(channelValues.messages)) {
						messageCount = channelValues.messages.length;
						// Get last human or AI message for preview
						for (let i = channelValues.messages.length - 1; i >= 0; i--) {
							const msg = channelValues.messages[i];
							if (msg && typeof msg === 'object' && 'content' in msg) {
								const content = String(msg.content || '');
								if (content.length > 0) {
									preview = content.substring(0, 100);
									break;
								}
							}
						}
					}
				}
			} catch (checkpointError) {
				console.warn(`[VybeCheckpointer] Could not get checkpoint details for ${threadId}:`, checkpointError);
			}

			threads.push({
				threadId,
				lastCheckpointId: latestCheckpointId,
				lastUpdated,
				messageCount,
				preview,
			});
		}

		return threads;
	} catch (error) {
		console.error('[VybeCheckpointer] Failed to list user threads:', error);
		return [];
	}
}
