/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Agent Types
 *
 * Core type definitions for the in-IDE agent system.
 * These types are shared across common, browser, and electron-main layers.
 */

// ============================================================================
// LLM Message Types
// ============================================================================

/**
 * Message role in a conversation
 */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single message in an LLM conversation
 */
export interface LLMMessage {
	role: LLMMessageRole;
	content: string;
	/** Tool call ID when role is 'tool' */
	tool_call_id?: string;
	/** Tool calls made by assistant */
	tool_calls?: ToolCall[];
	/** Optional name for the message sender */
	name?: string;
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * A tool call request from the LLM
 */
export interface ToolCall {
	/** Unique identifier for this tool call */
	id: string;
	/** Name of the tool to execute */
	name: string;
	/** Arguments to pass to the tool */
	arguments: Record<string, unknown>;
	/** Thought signature for Gemini 3 (required for function calling) */
	thoughtSignature?: string;
}

/**
 * Result of executing a tool
 */
export interface ToolResult {
	/** The tool call this result corresponds to */
	tool_id: string;
	/** Name of the tool that was executed */
	tool_name: string;
	/** The result value (can be any JSON-serializable value) */
	result: unknown;
	/** Error message if execution failed */
	error?: string;
	/** Execution time in milliseconds */
	execution_time_ms?: number;
}

/**
 * Tool definition for LLM function calling (OpenAI format)
 */
export interface ToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: JSONSchema;
	};
}

/**
 * JSON Schema type for tool parameters
 */
export interface JSONSchema {
	type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null';
	properties?: Record<string, JSONSchema & { description?: string }>;
	required?: string[];
	items?: JSONSchema;
	enum?: (string | number | boolean)[];
	description?: string;
	default?: unknown;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent execution phase
 */
export type AgentPhase = 'planning' | 'acting' | 'reflecting' | 'finalizing';

/**
 * Agent capability level
 * - L1: Read-only operations
 * - L2: Safe mutations (with approval)
 * - L3: Full autonomy
 */
export type AgentLevel = 'L1' | 'L2' | 'L3';

/**
 * Agent operation mode
 * - ask: Answer questions, no actions
 * - plan: Create plan, no execution
 * - agent: Full autonomous execution
 */
export type AgentMode = 'ask' | 'plan' | 'agent';

/**
 * Task parameters for agent execution
 */
export interface SolveTaskParams {
	/** The goal/prompt from the user */
	goal: string;
	/** Repository/workspace identifier */
	repoId?: string;
	/** Files to include in context */
	files?: string[];
	/** Current cursor location */
	cursorLocation?: { path: string; line: number };
	/** Operation mode */
	mode?: AgentMode;
	/** Reasoning effort level (low/medium/high/xhigh) */
	reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh';
	/** Capability level */
	agentLevel?: AgentLevel;
	/** Specific model to use (overrides auto-routing) */
	modelId?: string;
	/** Optional task ID (generated if not provided) */
	taskId?: string;
}

/**
 * Agent task state during execution
 */
export interface AgentTaskState {
	taskId: string;
	phase: AgentPhase;
	mode: AgentMode;
	level: AgentLevel;
	repoId: string;
	modelId?: string;
	/** Accumulated assistant text response */
	accumulatedText: string;
	/** Accumulated thinking/reasoning text */
	accumulatedThinking: string;
	/** History of tool results */
	toolResults: ToolResult[];
	/** Number of decision iterations */
	iterationCount: number;
	/** Whether the task is complete */
	isDone: boolean;
	/** Whether finalization has been emitted */
	isFinalized: boolean;
}

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * Options for streaming LLM requests
 */
export interface StreamOptions {
	/** Model identifier */
	model?: string;
	/** Sampling temperature (0-2) */
	temperature?: number;
	/** Maximum tokens to generate */
	maxTokens?: number;
	/** Tool definitions for function calling */
	tools?: ToolDefinition[];
	/** Abort signal for cancellation */
	signal?: AbortSignal;
}

/**
 * Result from a streaming LLM call
 */
export interface StreamingResult {
	/** Main content text */
	content: string;
	/** Thinking/reasoning text (if model supports it) */
	thinking: string;
	/** Tool calls extracted from response */
	toolCalls: ToolCall[];
	/** Token usage statistics */
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
	};
}

/**
 * A single chunk from streaming response
 */
export interface StreamChunk {
	/** Delta content text */
	content?: string;
	/** Delta thinking text */
	thinking?: string;
	/** Tool call in progress */
	toolCall?: Partial<ToolCall> & { index?: number };
	/** Usage info (usually only in final chunk) */
	usage?: { inputTokens?: number; outputTokens?: number };
	/** Whether this is the final chunk */
	done?: boolean;
}

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported LLM provider names
 */
export type ProviderName = 'gemini' | 'openrouter' | 'openai' | 'anthropic' | 'ollama' | 'groq' | 'deepseek';

/**
 * Model information
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
	/** Whether the model is enabled for use */
	enabled?: boolean;
}

/**
 * Model selection result from router
 */
export interface ModelSelection {
	/** Selected model ID */
	model: string;
	/** Reason for selection */
	reason: 'simple_query' | 'moderate_complexity' | 'complex_reasoning' | 'user_specified' | 'fallback';
	/** Original requested model (if different) */
	originalRequest?: string;
}

/**
 * Provider status information
 */
export interface ProviderStatus {
	name: ProviderName;
	available: boolean;
	error?: string;
	modelCount: number;
}

// ============================================================================
// Budget Types
// ============================================================================

/**
 * Execution budget for agent tasks
 */
export interface ExecutionBudget {
	/** Maximum number of tool calls */
	maxToolCalls: number;
	/** Maximum number of LLM iterations */
	maxIterations: number;
	/** Maximum total tokens to use */
	maxTokens: number;
	/** Maximum execution time in milliseconds */
	maxTimeMs: number;
}

/**
 * Current budget usage
 */
export interface BudgetUsage {
	toolCalls: number;
	iterations: number;
	tokens: number;
	elapsedMs: number;
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Scored file for context prioritization
 */
export interface ScoredFile {
	path: string;
	score: number;
	reason: 'recent_edit' | 'mentioned' | 'import' | 'related';
}

/**
 * Context compression result
 */
export interface CompressedContext {
	messages: LLMMessage[];
	tokenCount: number;
	removedCount: number;
	summarizedCount: number;
}

