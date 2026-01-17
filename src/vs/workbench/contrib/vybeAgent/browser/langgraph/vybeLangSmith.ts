/*---------------------------------------------------------------------------------------------
 *  VYBE - LangSmith Observability Configuration
 *  Tracing, debugging, and evaluation for LangGraph agents
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/langsmith
 *--------------------------------------------------------------------------------------------*/

// =====================================================
// LANGSMITH ENVIRONMENT CONFIGURATION
// =====================================================

/**
 * LangSmith environment variables that need to be set
 * These enable automatic tracing of all LangGraph operations
 */
export const LANGSMITH_ENV = {
	// Enable tracing (set to 'true' to enable)
	LANGSMITH_TRACING: 'LANGSMITH_TRACING',

	// API key from LangSmith dashboard
	LANGSMITH_API_KEY: 'LANGSMITH_API_KEY',

	// Project name for organizing traces
	LANGSMITH_PROJECT: 'LANGSMITH_PROJECT',

	// Endpoint (default: https://api.smith.langchain.com)
	LANGSMITH_ENDPOINT: 'LANGSMITH_ENDPOINT',
};

/**
 * Check if LangSmith is configured
 */
export function isLangSmithEnabled(): boolean {
	if (typeof process === 'undefined') {
		// Browser environment - check for global config
		return false;
	}
	return process.env[LANGSMITH_ENV.LANGSMITH_TRACING] === 'true' &&
		!!process.env[LANGSMITH_ENV.LANGSMITH_API_KEY];
}

/**
 * Get LangSmith configuration
 */
export function getLangSmithConfig(): {
	enabled: boolean;
	project?: string;
	endpoint?: string;
} {
	if (typeof process === 'undefined') {
		return { enabled: false };
	}

	return {
		enabled: isLangSmithEnabled(),
		project: process.env[LANGSMITH_ENV.LANGSMITH_PROJECT] || 'vybe',
		endpoint: process.env[LANGSMITH_ENV.LANGSMITH_ENDPOINT],
	};
}

// =====================================================
// TRACING CONTEXT HELPERS
// =====================================================

export interface TracingMetadata {
	userId?: string;
	workspaceId?: string;
	sessionId?: string;
	model?: string;
	taskType?: string;
	[key: string]: string | undefined;
}

/**
 * Create a tracing context for a run
 * This metadata is attached to all LangSmith traces
 */
export function createTracingContext(
	taskId: string,
	metadata: TracingMetadata = {}
): {
	tags: string[];
	metadata: Record<string, string>;
} {
	const tags = [
		'vybe-agent',
		`task-${taskId}`,
	];

	if (metadata.taskType) {
		tags.push(`type-${metadata.taskType}`);
	}

	const fullMetadata: Record<string, string> = {
		taskId,
		...Object.fromEntries(
			Object.entries(metadata).filter(([_, v]) => v !== undefined) as [string, string][]
		),
	};

	return { tags, metadata: fullMetadata };
}

// =====================================================
// CUSTOM RUN TRACKING
// =====================================================

export interface RunTracker {
	startRun(name: string, inputs: Record<string, unknown>): string;
	endRun(runId: string, outputs: Record<string, unknown>): void;
	recordError(runId: string, error: Error): void;
	addFeedback(runId: string, score: number, comment?: string): void;
}

/**
 * Create a run tracker for manual instrumentation
 * Use when you need fine-grained control over tracing
 */
export function createRunTracker(): RunTracker {
	const runs = new Map<string, { name: string; startTime: number }>();

	return {
		startRun(name: string, _inputs: Record<string, unknown>): string {
			const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			runs.set(runId, { name, startTime: Date.now() });
			console.log(`[LangSmith] Run started: ${name} (${runId})`);
			return runId;
		},

		endRun(runId: string, _outputs: Record<string, unknown>): void {
			const run = runs.get(runId);
			if (run) {
				const duration = Date.now() - run.startTime;
				console.log(`[LangSmith] Run completed: ${run.name} (${runId}) in ${duration}ms`);
				runs.delete(runId);
			}
		},

		recordError(runId: string, error: Error): void {
			const run = runs.get(runId);
			if (run) {
				console.error(`[LangSmith] Run error: ${run.name} (${runId}):`, error.message);
			}
		},

		addFeedback(runId: string, score: number, comment?: string): void {
			console.log(`[LangSmith] Feedback for ${runId}: score=${score}${comment ? `, comment=${comment}` : ''}`);
		},
	};
}

// =====================================================
// EVALUATION HELPERS
// =====================================================

export interface EvaluationResult {
	score: number;
	reasoning?: string;
	metrics?: Record<string, number>;
}

/**
 * Evaluation criteria for agent responses
 */
export interface EvaluationCriteria {
	accuracy?: boolean;
	helpfulness?: boolean;
	safety?: boolean;
	relevance?: boolean;
}

/**
 * Simple evaluation function
 * In production, this would integrate with LangSmith's evaluation API
 */
export function evaluateResponse(
	response: string,
	criteria: EvaluationCriteria = {}
): EvaluationResult {
	let score = 1.0;
	const metrics: Record<string, number> = {};

	// Simple heuristic evaluations
	if (criteria.safety !== false) {
		// Check for dangerous patterns
		const dangerousPatterns = [/rm\s+-rf/, /sudo/, /password/i];
		const safetyScore = dangerousPatterns.some(p => p.test(response)) ? 0.5 : 1.0;
		metrics.safety = safetyScore;
		score *= safetyScore;
	}

	if (criteria.helpfulness !== false) {
		// Check for actionable content
		const hasCode = /```/.test(response);
		const hasExplanation = response.length > 100;
		const helpfulnessScore = (hasCode ? 0.5 : 0) + (hasExplanation ? 0.5 : 0);
		metrics.helpfulness = helpfulnessScore;
		score *= helpfulnessScore || 0.5;
	}

	if (criteria.relevance !== false) {
		// Basic relevance check
		const relevanceScore = response.length > 0 ? 1.0 : 0.0;
		metrics.relevance = relevanceScore;
		score *= relevanceScore;
	}

	return {
		score: Math.max(0, Math.min(1, score)),
		metrics,
	};
}

// =====================================================
// DATASET HELPERS FOR EVALUATION
// =====================================================

export interface EvaluationExample {
	input: string;
	expectedOutput?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Create a dataset for evaluation
 */
export function createEvaluationDataset(
	name: string,
	examples: EvaluationExample[]
): {
	name: string;
	examples: EvaluationExample[];
	created: Date;
} {
	return {
		name,
		examples,
		created: new Date(),
	};
}

// =====================================================
// EXPORT SETUP INSTRUCTIONS
// =====================================================

export const LANGSMITH_SETUP_INSTRUCTIONS = `
# LangSmith Setup for VYBE

To enable LangSmith tracing, set these environment variables:

\`\`\`bash
# Enable tracing
export LANGSMITH_TRACING=true

# Your API key from https://smith.langchain.com
export LANGSMITH_API_KEY=your_api_key_here

# Project name (optional, defaults to 'vybe')
export LANGSMITH_PROJECT=vybe
\`\`\`

Features enabled by LangSmith:
- Full execution path visualization
- Token usage and latency dashboards
- Tool call traces with arguments/results
- Interrupt/resume flow tracking
- Evaluation datasets and scoring
- Custom metadata injection

For VS Code / Cursor, you can also set these in your workspace settings.
`;





