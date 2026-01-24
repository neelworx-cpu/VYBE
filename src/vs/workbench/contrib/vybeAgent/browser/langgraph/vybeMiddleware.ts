/*---------------------------------------------------------------------------------------------
 *  VYBE - Complete Middleware Stack for LangGraph Agent
 *  All built-in LangChain middleware for production-ready agents
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/middleware/overview
 *--------------------------------------------------------------------------------------------*/

// =====================================================
// MIDDLEWARE CONFIGURATION TYPES
// =====================================================

export interface SummarizationConfig {
	model: string;
	trigger: { tokens: number };
	keep: { messages: number };
}

export interface HITLToolConfig {
	allowedDecisions: ('approve' | 'reject' | 'edit')[];
	description: string;
}

export interface HITLConfig {
	interruptOn: Record<string, HITLToolConfig>;
}

export interface ToolCallLimitConfig {
	threadLimit: number;
	runLimit: number;
	toolName?: string;
}

export interface ModelFallbackConfig {
	fallbacks: string[];
}

export interface RetryConfig {
	maxRetries: number;
	backoffMs: number;
}

export interface PIIRedactionConfig {
	patterns: ('email' | 'phone' | 'ssn' | 'api_key' | string)[];
}

export interface LLMToolSelectorConfig {
	model: string;
	maxTools: number;
}

export interface ContextEditingConfig {
	trimToolUses: boolean;
	keepLastN: number;
}

// =====================================================
// MIDDLEWARE IMPLEMENTATIONS
// =====================================================

/**
 * Summarization Middleware
 * Condenses conversation history when approaching token limits
 */
export function createSummarizationMiddleware(config: SummarizationConfig) {
	return {
		name: 'VybeSummarization',
		config,
		beforeModel: async (request: { messages: unknown[] }, handler: (req: unknown) => unknown) => {
			// Count approximate tokens (simplified)
			const approxTokens = JSON.stringify(request.messages).length / 4;

			if (approxTokens > config.trigger.tokens) {
				// In production, this would call the LLM to summarize
				// For now, we just keep the last N messages
				const summarizedMessages = request.messages.slice(-config.keep.messages);
				return handler({ ...request, messages: summarizedMessages });
			}

			return handler(request);
		},
	};
}

/**
 * Human-in-the-Loop Middleware
 * Pauses execution for user approval on certain tools
 */
export function createHITLMiddleware(config: HITLConfig) {
	return {
		name: 'VybeHumanInTheLoop',
		config,
		beforeToolCall: async (
			request: { toolCall: { name: string } },
			handler: (req: unknown) => unknown
		) => {
			const toolConfig = config.interruptOn[request.toolCall.name];
			if (toolConfig) {
				// Signal interrupt to the runtime
				return {
					__interrupt__: {
						tool: request.toolCall.name,
						...toolConfig,
						request,
					},
				};
			}
			return handler(request);
		},
	};
}

/**
 * Tool Call Limit Middleware
 * Prevents runaway loops by limiting tool calls
 */
export function createToolCallLimitMiddleware(config: ToolCallLimitConfig) {
	let threadCount = 0;
	let runCount = 0;

	return {
		name: 'VybeToolCallLimit',
		config,
		beforeToolCall: async (
			request: { toolCall: { name: string } },
			handler: (req: unknown) => unknown
		) => {
			// Check if this is for a specific tool
			if (config.toolName && request.toolCall.name !== config.toolName) {
				return handler(request);
			}

			threadCount++;
			runCount++;

			if (threadCount > config.threadLimit) {
				throw new Error(`Tool call limit exceeded: ${threadCount} calls (max: ${config.threadLimit})`);
			}

			if (runCount > config.runLimit) {
				throw new Error(`Run limit exceeded: ${runCount} calls (max: ${config.runLimit})`);
			}

			return handler(request);
		},
		resetRunCount: () => {
			runCount = 0;
		},
	};
}

/**
 * Model Fallback Middleware
 * Automatically falls back to alternative models on failure
 */
export function createModelFallbackMiddleware(config: ModelFallbackConfig) {
	return {
		name: 'VybeModelFallback',
		config,
		wrapModelCall: async (
			request: { model?: string },
			handler: (req: unknown) => Promise<unknown>
		): Promise<unknown> => {
			const models = [request.model, ...config.fallbacks].filter(Boolean);

			if (models.length === 0) {
				return handler(request);
			}

			for (let i = 0; i < models.length; i++) {
				try {
					return await handler({ ...request, model: models[i] });
				} catch (error) {
					if (i === models.length - 1) {
						throw error; // Rethrow if all models failed
					}
					console.warn(`Model ${models[i]} failed, trying fallback...`);
				}
			}

			// Should never reach here, but TypeScript needs this
			return handler(request);
		},
	};
}

/**
 * Tool Retry Middleware
 * Retries failed tools with exponential backoff
 */
export function createToolRetryMiddleware(config: RetryConfig) {
	return {
		name: 'VybeToolRetry',
		config,
		wrapToolCall: async (
			request: unknown,
			handler: (req: unknown) => Promise<unknown>
		) => {
			let lastError: Error | undefined;

			for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
				try {
					return await handler(request);
				} catch (error) {
					lastError = error instanceof Error ? error : new Error(String(error));
					if (attempt < config.maxRetries) {
						const delay = config.backoffMs * Math.pow(2, attempt);
						await new Promise(resolve => setTimeout(resolve, delay));
					}
				}
			}

			throw lastError;
		},
	};
}

/**
 * Model Retry Middleware
 * Retries failed model calls with exponential backoff
 */
export function createModelRetryMiddleware(config: RetryConfig) {
	return {
		name: 'VybeModelRetry',
		config,
		wrapModelCall: async (
			request: unknown,
			handler: (req: unknown) => Promise<unknown>
		) => {
			let lastError: Error | undefined;

			for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
				try {
					return await handler(request);
				} catch (error) {
					lastError = error instanceof Error ? error : new Error(String(error));
					if (attempt < config.maxRetries) {
						const delay = config.backoffMs * Math.pow(2, attempt);
						await new Promise(resolve => setTimeout(resolve, delay));
					}
				}
			}

			throw lastError;
		},
	};
}

/**
 * PII Redaction Middleware
 * Redacts sensitive information from messages
 */
export function createPIIRedactionMiddleware(config: PIIRedactionConfig) {
	const patterns: Record<string, RegExp> = {
		email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
		phone: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
		ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
		api_key: /(?:api[_-]?key|token|secret)[=:\s]["']?[\w-]{20,}["']?/gi,
	};

	return {
		name: 'VybePIIRedaction',
		config,
		beforeModel: async (
			request: { messages: Array<{ content?: string }> },
			handler: (req: unknown) => unknown
		) => {
			const redactedMessages = request.messages.map(msg => {
				if (typeof msg.content !== 'string') return msg;

				let content = msg.content;
				for (const patternName of config.patterns) {
					const regex = patterns[patternName];
					if (regex) {
						content = content.replace(regex, `[REDACTED_${patternName.toUpperCase()}]`);
					}
				}

				return { ...msg, content };
			});

			return handler({ ...request, messages: redactedMessages });
		},
	};
}

/**
 * Todo List Middleware
 * Enables planning and task tracking
 */
export function createTodoListMiddleware() {
	const todos: Array<{ id: string; content: string; status: string }> = [];

	return {
		name: 'VybeTodoList',
		getTodos: () => todos,
		addTodo: (id: string, content: string) => {
			todos.push({ id, content, status: 'pending' });
		},
		updateTodo: (id: string, status: string) => {
			const todo = todos.find(t => t.id === id);
			if (todo) {
				todo.status = status;
			}
		},
	};
}

/**
 * LLM Tool Selector Middleware
 * Uses an LLM to pick relevant tools for the task
 */
export function createLLMToolSelectorMiddleware(config: LLMToolSelectorConfig) {
	return {
		name: 'VybeLLMToolSelector',
		config,
		beforeModel: async (
			request: { tools?: unknown[] },
			handler: (req: unknown) => unknown
		) => {
			// In production, this would call the LLM to select tools
			// For now, we just limit to maxTools
			if (request.tools && request.tools.length > config.maxTools) {
				return handler({
					...request,
					tools: request.tools.slice(0, config.maxTools),
				});
			}
			return handler(request);
		},
	};
}

/**
 * Context Editing Middleware
 * Manages conversation context
 */
export function createContextEditingMiddleware(config: ContextEditingConfig) {
	return {
		name: 'VybeContextEditing',
		config,
		beforeModel: async (
			request: { messages: Array<{ role?: string }> },
			handler: (req: unknown) => unknown
		) => {
			let messages = [...request.messages];

			// Trim tool use messages if configured
			if (config.trimToolUses) {
				messages = messages.filter(msg => msg.role !== 'tool' || messages.indexOf(msg) >= messages.length - config.keepLastN * 2);
			}

			return handler({ ...request, messages });
		},
	};
}

// =====================================================
// COMPLETE MIDDLEWARE STACK
// =====================================================

export const vybeMiddlewareStack = [
	// 1. SUMMARIZATION - condense history when approaching token limits
	createSummarizationMiddleware({
		model: 'gpt-4o-mini',
		trigger: { tokens: 4000 },
		keep: { messages: 20 },
	}),

	// 2. HUMAN-IN-THE-LOOP - pause for terminal/file approval
	createHITLMiddleware({
		interruptOn: {
			run_terminal_cmd: {
				allowedDecisions: ['approve', 'reject', 'edit'],
				description: 'Terminal command requires user approval',
			},
			// write_file tool removed - use edit_file for all file operations
			edit_file: {
				allowedDecisions: ['approve', 'reject'],
				description: 'File edit requires approval',
			},
		},
	}),

	// 3. TOOL CALL LIMIT - prevent runaway loops (global)
	createToolCallLimitMiddleware({
		threadLimit: 50,
		runLimit: 20,
	}),

	// 4. TOOL CALL LIMIT - limit terminal commands specifically
	createToolCallLimitMiddleware({
		toolName: 'run_terminal_cmd',
		threadLimit: 10,
		runLimit: 5,
	}),

	// 5. MODEL FALLBACK - automatic fallback on failure
	createModelFallbackMiddleware({
		fallbacks: [
			'gpt-4o',
			'claude-sonnet-4-5-20250929',
			'gemini-2.0-flash',
		],
	}),

	// 6. TOOL RETRY - retry failed tools with backoff
	createToolRetryMiddleware({
		maxRetries: 3,
		backoffMs: 1000,
	}),

	// 7. MODEL RETRY - retry failed model calls
	createModelRetryMiddleware({
		maxRetries: 3,
		backoffMs: 500,
	}),

	// 8. PII DETECTION - redact sensitive info
	createPIIRedactionMiddleware({
		patterns: ['email', 'phone', 'ssn', 'api_key'],
	}),

	// 9. TODO LIST - planning and task tracking
	createTodoListMiddleware(),

	// 10. LLM TOOL SELECTOR - use LLM to pick relevant tools
	createLLMToolSelectorMiddleware({
		model: 'gpt-4o-mini',
		maxTools: 10,
	}),

	// 11. CONTEXT EDITING - manage conversation context
	createContextEditingMiddleware({
		trimToolUses: true,
		keepLastN: 5,
	}),
];

// Export individual middleware creators for custom configurations
export {
	createSummarizationMiddleware as summarizationMiddleware,
	createHITLMiddleware as humanInTheLoopMiddleware,
	createToolCallLimitMiddleware as toolCallLimitMiddleware,
	createModelFallbackMiddleware as modelFallbackMiddleware,
	createToolRetryMiddleware as toolRetryMiddleware,
	createModelRetryMiddleware as modelRetryMiddleware,
	createPIIRedactionMiddleware as piiRedactionMiddleware,
	createTodoListMiddleware as todoListMiddleware,
	createLLMToolSelectorMiddleware as llmToolSelectorMiddleware,
	createContextEditingMiddleware as contextEditingMiddleware,
};

