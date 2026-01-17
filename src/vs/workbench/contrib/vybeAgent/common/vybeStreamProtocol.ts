/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Stream Protocol
 *
 * Unified chunk format for LLM streaming across all providers.
 * All normalization happens in main process; renderer receives ready-to-display chunks.
 */

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported LLM provider names
 */
export type ProviderName =
	| 'azure'      // Azure AI Foundry (OpenAI + serverless models)
	| 'gemini'     // Google AI Studio / Vertex AI
	| 'openai'     // Direct OpenAI
	| 'anthropic'  // Direct Anthropic
	| 'ollama'     // Local Ollama
	| 'unknown';   // For error cases

// ============================================================================
// Chunk Types
// ============================================================================

/**
 * Chunk type discriminator
 */
export type ChunkType = 'content' | 'thinking' | 'tool_call' | 'usage' | 'done' | 'error';

/**
 * Normalized chunk - ready for UI consumption.
 * All providers emit this format. Tool calls are fully assembled before IPC.
 */
export interface NormalizedChunk {
	/** Task identifier this chunk belongs to */
	taskId: string;

	/** Type determines which payload field is set */
	type: ChunkType;

	/** Delta text to append (for 'content' type) */
	content?: string;

	/** Reasoning/thinking text to append (for 'thinking' type) */
	thinking?: string;

	/** Fully assembled tool call (for 'tool_call' type) - never deltas */
	toolCall?: CompleteToolCall;

	/** Token usage statistics (for 'usage' type) */
	usage?: UsageInfo;

	/** Classified error (for 'error' type) */
	error?: StreamError;

	/** Provider that generated this chunk (for logging only) */
	provider: ProviderName;

	/** Timestamp when chunk was created (for logging only) */
	timestamp: number;

	/** Thought signature for Gemini 3 (SDK handles automatically, exposed for debugging) */
	thoughtSignature?: string;
}

// ============================================================================
// Tool Call Types
// ============================================================================

/**
 * Fully assembled tool call - ready for execution.
 * Tool call deltas are assembled in main process before IPC.
 */
export interface CompleteToolCall {
	/** Unique identifier for this tool call */
	id: string;

	/** Name of the tool to execute */
	name: string;

	/** Parsed arguments (already JSON.parse'd) */
	arguments: Record<string, unknown>;

	/** Thought signature for Gemini 3 (required for function calling) */
	thoughtSignature?: string;
}

/**
 * Internal type for tool call delta assembly (main process only).
 * Not exported - renderer never sees this.
 */
export interface ToolCallDelta {
	/** Tool call index (for multi-tool responses) */
	index: number;

	/** Tool call ID (set on first delta) */
	id?: string;

	/** Tool name (set on first delta) */
	name?: string;

	/** Incremental JSON string fragment */
	argumentsDelta?: string;

	/** Thought signature for Gemini 3 (set on first delta with function call) */
	thoughtSignature?: string;
}

// ============================================================================
// Usage Types
// ============================================================================

/**
 * Token usage information
 */
export interface UsageInfo {
	/** Input/prompt tokens consumed */
	inputTokens?: number;

	/** Output/completion tokens generated */
	outputTokens?: number;

	/** Total tokens (if provided separately) */
	totalTokens?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for stream errors.
 * Used for smart recovery decisions.
 */
export type StreamErrorCode =
	| 'rate_limited'   // 429 - wait and retry
	| 'timeout'        // Request timed out - retry with backoff
	| 'auth_failed'    // API key invalid/missing - don't retry
	| 'model_error'    // Model returned error - may retry with different model
	| 'context_length' // Input too long - reduce context
	| 'network'        // Network failure - retry
	| 'cancelled'      // User cancelled - don't retry
	| 'unknown';       // Unknown error - log and show generic message

/**
 * Classified stream error
 */
export interface StreamError {
	/** Error classification code */
	code: StreamErrorCode;

	/** Human-readable error message */
	message: string;

	/** Whether this error is worth retrying */
	retryable: boolean;

	/** How long to wait before retry (for rate_limited) */
	retryAfterMs?: number;

	/** Original error details (for debugging) */
	details?: string;
}

// ============================================================================
// Stream Options
// ============================================================================

/**
 * Options for starting a stream
 */
export interface StreamOptions {
	/** Model identifier (e.g., "ollama:llama3", "gpt-4o", "gemini-2.0-flash") */
	model: string;

	/** Messages to send */
	messages: StreamMessage[];

	/** Tool definitions for function calling */
	tools?: StreamToolDefinition[];

	/** Sampling temperature (0-2) */
	temperature?: number;

	/** Maximum tokens to generate */
	maxTokens?: number;
}

/**
 * Message in a stream request
 */
export interface StreamMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_call_id?: string;
	tool_calls?: CompleteToolCall[];
	name?: string;
}

/**
 * Tool definition for function calling
 */
export interface StreamToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

// ============================================================================
// Stream Result
// ============================================================================

/**
 * Accumulated result from a complete stream
 */
export interface StreamResult {
	/** Accumulated content text */
	content: string;

	/** Accumulated thinking/reasoning text */
	thinking: string;

	/** All tool calls from the response */
	toolCalls: CompleteToolCall[];

	/** Final usage statistics */
	usage?: UsageInfo;

	/** Error if stream failed */
	error?: StreamError;
}

// ============================================================================
// Model Info
// ============================================================================

/**
 * Information about an available model
 */
export interface ModelInfo {
	/** Unique model identifier */
	id: string;

	/** Provider that hosts this model */
	provider: ProviderName;

	/** Human-readable display name */
	displayName: string;

	/** Model description */
	description?: string;

	/** Context window size in tokens */
	contextWindow?: number;

	/** Whether the model supports function/tool calling */
	supportsTools?: boolean;

	/** Whether the model supports vision/images */
	supportsVision?: boolean;

	/** Whether the model has extended thinking/reasoning */
	supportsReasoning?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a content chunk
 */
export function createContentChunk(
	taskId: string,
	content: string,
	provider: ProviderName
): NormalizedChunk {
	return {
		taskId,
		type: 'content',
		content,
		provider,
		timestamp: Date.now(),
	};
}

/**
 * Create a thinking chunk
 */
export function createThinkingChunk(
	taskId: string,
	thinking: string,
	provider: ProviderName
): NormalizedChunk {
	return {
		taskId,
		type: 'thinking',
		thinking,
		provider,
		timestamp: Date.now(),
	};
}

/**
 * Create a tool call chunk (fully assembled)
 */
export function createToolCallChunk(
	taskId: string,
	toolCall: CompleteToolCall,
	provider: ProviderName
): NormalizedChunk {
	return {
		taskId,
		type: 'tool_call',
		toolCall,
		provider,
		timestamp: Date.now(),
	};
}

/**
 * Create a usage chunk
 */
export function createUsageChunk(
	taskId: string,
	usage: UsageInfo,
	provider: ProviderName
): NormalizedChunk {
	return {
		taskId,
		type: 'usage',
		usage,
		provider,
		timestamp: Date.now(),
	};
}

/**
 * Create a done chunk
 */
export function createDoneChunk(
	taskId: string,
	provider: ProviderName
): NormalizedChunk {
	return {
		taskId,
		type: 'done',
		provider,
		timestamp: Date.now(),
	};
}

/**
 * Create an error chunk
 */
export function createErrorChunk(
	taskId: string,
	error: StreamError,
	provider: ProviderName = 'unknown'
): NormalizedChunk {
	return {
		taskId,
		type: 'error',
		error,
		provider,
		timestamp: Date.now(),
	};
}

/**
 * Classify an HTTP status code into a StreamErrorCode
 */
export function classifyHttpError(status: number, message: string): StreamError {
	switch (status) {
		case 401:
		case 403:
			return {
				code: 'auth_failed',
				message: 'API key is invalid or missing',
				retryable: false,
			};
		case 429:
			return {
				code: 'rate_limited',
				message: 'Too many requests. Please wait before trying again.',
				retryable: true,
				retryAfterMs: 60000, // Default 1 minute
			};
		case 408:
		case 504:
			return {
				code: 'timeout',
				message: 'Request timed out',
				retryable: true,
			};
		case 400:
			// Check for context length error
			if (message.includes('context') || message.includes('token') || message.includes('length')) {
				return {
					code: 'context_length',
					message: 'Input too long for model context window',
					retryable: false,
				};
			}
			return {
				code: 'model_error',
				message: message || 'Bad request',
				retryable: false,
			};
		case 500:
		case 502:
		case 503:
			return {
				code: 'model_error',
				message: 'Server error from provider',
				retryable: true,
			};
		default:
			return {
				code: 'unknown',
				message: message || `HTTP error ${status}`,
				retryable: false,
			};
	}
}

/**
 * Classify a network/fetch error into a StreamError
 */
export function classifyNetworkError(error: Error): StreamError {
	const message = error.message.toLowerCase();

	if (message.includes('abort') || message.includes('cancel')) {
		return {
			code: 'cancelled',
			message: 'Request was cancelled',
			retryable: false,
		};
	}

	if (message.includes('timeout')) {
		return {
			code: 'timeout',
			message: 'Request timed out',
			retryable: true,
		};
	}

	if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
		return {
			code: 'network',
			message: 'Network error - check your connection',
			retryable: true,
		};
	}

	return {
		code: 'unknown',
		message: error.message,
		retryable: false,
		details: error.stack,
	};
}

