/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Agent Configuration
 *
 * Configuration schema and defaults for the agent system.
 */

import type { ExecutionBudget, AgentLevel, AgentMode } from './vybeAgentTypes.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default execution budget for agent tasks
 */
export const DEFAULT_EXECUTION_BUDGET: ExecutionBudget = {
	maxToolCalls: 50,
	maxIterations: 20,
	maxTokens: 100000,
	maxTimeMs: 5 * 60 * 1000 // 5 minutes
};

/**
 * Default budget overrides by agent level
 */
export const BUDGET_BY_LEVEL: Record<AgentLevel, Partial<ExecutionBudget>> = {
	L1: {
		maxToolCalls: 20,
		maxIterations: 10
	},
	L2: {
		maxToolCalls: 50,
		maxIterations: 20
	},
	L3: {
		maxToolCalls: 100,
		maxIterations: 50
	}
};

/**
 * Default budget overrides by agent mode
 */
export const BUDGET_BY_MODE: Record<AgentMode, Partial<ExecutionBudget>> = {
	ask: {
		maxToolCalls: 10,
		maxIterations: 5
	},
	plan: {
		maxToolCalls: 30,
		maxIterations: 10
	},
	agent: {
		// Use default budget
	}
};

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Default models for different complexity levels
 */
export const DEFAULT_MODELS = {
	simple: 'gemini-2.0-flash',
	moderate: 'gpt-4o',
	complex: 'claude-sonnet-4-20250514'
};

/**
 * Model fallback chains
 * When a model fails, try the next one in the chain
 */
export const MODEL_FALLBACK_CHAINS: Record<string, string[]> = {
	'claude-sonnet-4-20250514': ['gpt-4o', 'gemini-2.0-flash'],
	'gpt-4o': ['claude-sonnet-4-20250514', 'gemini-2.0-flash'],
	'gemini-2.0-flash': ['gpt-4o-mini', 'claude-sonnet-4-20250514'],
	'gpt-4o-mini': ['gemini-2.0-flash', 'gpt-4o'],
	// Ollama models fallback to cloud
	'qwen3': ['gemini-2.0-flash'],
	'llama3': ['gemini-2.0-flash'],
	'deepseek-r1': ['claude-sonnet-4-20250514', 'gpt-4o']
};

/**
 * Complexity thresholds for model routing
 */
export const COMPLEXITY_THRESHOLDS = {
	simple: 0.3,
	moderate: 0.7
	// >= 0.7 is complex
};

// ============================================================================
// Context Configuration
// ============================================================================

/**
 * Context window sizes by model (approximate)
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
	'claude-sonnet-4-20250514': 200000,
	'gpt-4o': 128000,
	'gpt-4o-mini': 128000,
	'gemini-2.0-flash': 1000000,
	'gemini-2.0-pro': 2000000,
	// Ollama models vary
	'qwen3': 32000,
	'llama3': 8000
};

/**
 * Default context configuration
 */
export const CONTEXT_CONFIG = {
	/** Maximum messages to keep in history */
	maxHistoryMessages: 50,
	/** Percentage of context window to reserve for response */
	responseReserve: 0.2,
	/** Minimum messages to keep (system + last user) */
	minMessagesToKeep: 3,
	/** Token estimation multiplier (chars per token) */
	charsPerToken: 4
};

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Provider API endpoints
 */
export const PROVIDER_ENDPOINTS: Record<string, string> = {
	gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
	openrouter: 'https://openrouter.ai/api/v1',
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	ollama: 'http://localhost:11434/v1',
	groq: 'https://api.groq.com/openai/v1',
	deepseek: 'https://api.deepseek.com/v1'
};

/**
 * Rate limit configuration
 */
export const RATE_LIMIT_CONFIG = {
	/** Initial retry delay in ms */
	initialRetryDelayMs: 1000,
	/** Maximum retry delay in ms */
	maxRetryDelayMs: 60000,
	/** Maximum number of retries */
	maxRetries: 3,
	/** Backoff multiplier */
	backoffMultiplier: 2
};

// ============================================================================
// Tool Configuration
// ============================================================================

/**
 * Tools that can be executed in parallel
 */
export const PARALLELIZABLE_TOOLS = new Set([
	'read_file',
	'list_dir',
	'grep',
	'file_search',
	'get_diagnostics',
	'git_status'
]);

/**
 * Tools whose results can be cached
 */
export const CACHEABLE_TOOLS = new Set([
	'read_file',
	'list_dir',
	'git_status'
]);

/**
 * Tools that require user approval
 */
export const APPROVAL_REQUIRED_TOOLS = new Set([
	'write_file',
	'run_terminal_cmd',
	'edit_file',
	'delete_file'
]);

/**
 * Default tool timeout in milliseconds
 */
export const DEFAULT_TOOL_TIMEOUT_MS = 30000;

// ============================================================================
// Logging Configuration
// ============================================================================

/**
 * Log levels for agent operations
 */
export const LOG_CONFIG = {
	/** Log tool calls */
	logToolCalls: true,
	/** Log LLM requests/responses */
	logLLMCalls: false,
	/** Log context compression */
	logContextCompression: false,
	/** Log model routing decisions */
	logModelRouting: true
};






