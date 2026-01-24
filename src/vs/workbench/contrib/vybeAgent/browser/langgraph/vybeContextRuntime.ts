/*---------------------------------------------------------------------------------------------
 *  VYBE - Context Engineering and Guardrails
 *  Runtime context management and safety checks
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/context-engineering
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/guardrails
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod';

// =====================================================
// STATIC RUNTIME CONTEXT SCHEMA
// =====================================================
// Passed at invoke time, available throughout execution

export const vybeRuntimeContextSchema = z.object({
	// User identification
	userId: z.string(),
	sessionId: z.string().optional(),

	// Workspace context
	workspaceRoot: z.string(),
	activeFile: z.string().optional(),
	openFiles: z.array(z.string()).optional(),

	// Project context
	projectType: z.enum(['typescript', 'python', 'rust', 'go', 'java', 'other']),
	projectName: z.string().optional(),

	// User preferences
	userPreferences: z.object({
		codeStyle: z.string().optional(),
		testFramework: z.string().optional(),
		preferredLanguage: z.string().optional(),
		verbosity: z.enum(['minimal', 'normal', 'verbose']).optional(),
	}).optional(),

	// Model preferences
	preferLocal: z.boolean().optional(),
	taskComplexity: z.enum(['simple', 'normal', 'advanced', 'reasoning']).optional(),

	// Safety settings
	allowFileWrites: z.boolean().default(true),
	allowTerminalCommands: z.boolean().default(true),
	allowNetworkAccess: z.boolean().default(false),
	sandboxMode: z.boolean().default(false),
});

export type VybeRuntimeContext = z.infer<typeof vybeRuntimeContextSchema>;

// =====================================================
// DYNAMIC CONTEXT INJECTION
// =====================================================

export interface DynamicContextProvider {
	name: string;
	getContext: () => Promise<Partial<VybeRuntimeContext>>;
}

/**
 * Workspace context provider - gets current workspace state
 */
export const workspaceContextProvider: DynamicContextProvider = {
	name: 'workspace',
	getContext: async () => {
		// In production, this would query the actual workspace state
		return {
			// These would be populated from VS Code APIs
		};
	},
};

/**
 * Git context provider - gets current git state
 */
export const gitContextProvider: DynamicContextProvider = {
	name: 'git',
	getContext: async () => {
		// Would return current branch, changed files, etc.
		return {};
	},
};

// =====================================================
// GUARDRAILS - DETERMINISTIC CHECKS
// =====================================================

export interface GuardrailResult {
	allowed: boolean;
	reason?: string;
	suggestion?: string;
}

/**
 * Dangerous command patterns to block
 */
const DANGEROUS_PATTERNS = [
	// File system destruction
	{ pattern: /rm\s+-rf\s+\/(?!\w)/, reason: 'Attempting to delete root filesystem' },
	{ pattern: /rm\s+-rf\s+~/, reason: 'Attempting to delete home directory' },
	{ pattern: /sudo\s+rm\s+-rf/, reason: 'Attempting privileged file deletion' },

	// Fork bombs and resource exhaustion
	{ pattern: /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/, reason: 'Fork bomb detected' },
	{ pattern: /while\s*true.*do.*done/, reason: 'Potential infinite loop' },

	// Credential exposure
	{ pattern: /curl.*\|\s*bash/, reason: 'Piping remote content to shell' },
	{ pattern: /wget.*\|\s*sh/, reason: 'Piping remote content to shell' },

	// System modification
	{ pattern: /chmod\s+777\s+\//, reason: 'Insecure permission change on system path' },
	{ pattern: /chown.*:.*\/(?:etc|bin|usr)/, reason: 'Changing ownership of system files' },

	// Network attacks
	{ pattern: /nc\s+-l/, reason: 'Opening network listener' },
	{ pattern: /nmap\s/, reason: 'Network scanning detected' },
];

/**
 * Check terminal command for dangerous patterns
 */
export function checkTerminalCommand(command: string): GuardrailResult {
	for (const { pattern, reason } of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			return {
				allowed: false,
				reason: `Blocked: ${reason}`,
				suggestion: 'Please use a safer alternative command.',
			};
		}
	}

	return { allowed: true };
}

/**
 * Sensitive file patterns that require extra caution
 */
const SENSITIVE_FILE_PATTERNS = [
	/^\/etc\//,
	/^\/usr\/bin\//,
	/^\/usr\/local\/bin\//,
	/\.env$/,
	/\.ssh\//,
	/\.aws\//,
	/credentials/i,
	/secrets?/i,
	/\.pem$/,
	/\.key$/,
];

/**
 * Check file path for sensitive locations
 */
export function checkFilePath(filePath: string, operation: 'read' | 'write' | 'delete'): GuardrailResult {
	for (const pattern of SENSITIVE_FILE_PATTERNS) {
		if (pattern.test(filePath)) {
			if (operation === 'write' || operation === 'delete') {
				return {
					allowed: false,
					reason: `Cannot ${operation} sensitive file: ${filePath}`,
					suggestion: 'Sensitive files require manual editing.',
				};
			}
			// Reading is allowed but flagged
			return {
				allowed: true,
				reason: `Warning: Reading sensitive file: ${filePath}`,
			};
		}
	}

	return { allowed: true };
}

// =====================================================
// GUARDRAILS - MODEL-BASED CHECKS
// =====================================================

/**
 * Content categories for model-based safety
 */
export type ContentCategory =
	| 'safe'
	| 'potentially_harmful'
	| 'requires_review'
	| 'blocked';

/**
 * Check content for safety (simplified - would use LLM in production)
 */
export function checkContentSafety(content: string): ContentCategory {
	// Simple keyword-based check (production would use LLM)
	const harmfulKeywords = [
		'exploit',
		'vulnerability',
		'hack',
		'malware',
		'ransomware',
		'keylogger',
	];

	const lowerContent = content.toLowerCase();
	if (harmfulKeywords.some(kw => lowerContent.includes(kw))) {
		return 'requires_review';
	}

	return 'safe';
}

// =====================================================
// DYNAMIC PROMPT MIDDLEWARE
// =====================================================

export interface DynamicPromptRequest {
	runtime: {
		context?: Partial<VybeRuntimeContext>;
	};
	systemPromptAddition?: string;
}

/**
 * Create middleware that adapts prompts based on context
 */
export function createDynamicPromptMiddleware() {
	return {
		name: 'VybeDynamicPrompt',
		beforeModel: <T>(
			request: DynamicPromptRequest,
			handler: (req: DynamicPromptRequest) => T
		): T => {
			const context = request.runtime.context || {};

			// Build additional context for the prompt
			const additions: string[] = [];

			if (context.projectType) {
				additions.push(`Project type: ${context.projectType}`);
			}

			if (context.workspaceRoot) {
				additions.push(`Workspace: ${context.workspaceRoot}`);
			}

			if (context.activeFile) {
				additions.push(`Current file: ${context.activeFile}`);
			}

			if (context.sandboxMode) {
				additions.push('SANDBOX MODE: Do not make actual changes to the filesystem.');
			}

			const systemPromptAddition = additions.length > 0
				? `\n\nContext:\n${additions.join('\n')}`
				: '';

			return handler({
				...request,
				systemPromptAddition: (request.systemPromptAddition || '') + systemPromptAddition,
			});
		},
	};
}

// =====================================================
// GUARDRAILS MIDDLEWARE
// =====================================================

export interface GuardrailsRequest {
	toolCall?: {
		name: string;
		args: {
			command?: string;
			file_path?: string;
			target_file?: string;
		};
	};
	content?: string;
}

/**
 * Create middleware that enforces guardrails
 */
export function createGuardrailsMiddleware() {
	return {
		name: 'VybeGuardrails',

		// Check tool calls before execution
		beforeToolCall: <T>(
			request: GuardrailsRequest,
			handler: (req: GuardrailsRequest) => T
		): T | { blocked: true; reason: string } => {
			if (!request.toolCall) {
				return handler(request);
			}

			const { name, args } = request.toolCall;

			// Check terminal commands
			if (name === 'run_terminal_cmd' && args.command) {
				const result = checkTerminalCommand(args.command);
				if (!result.allowed) {
					return {
						blocked: true,
						reason: result.reason || 'Command blocked by guardrails',
					};
				}
			}

			// Check file operations
			if (name === 'edit_file' && (args.file_path || args.target_file)) {
				const filePath = args.file_path || args.target_file || '';
				const result = checkFilePath(filePath, 'write');
				if (!result.allowed) {
					return {
						blocked: true,
						reason: result.reason || 'File operation blocked by guardrails',
					};
				}
			}

			return handler(request);
		},

		// Check model output after generation
		afterModel: <T extends { content?: string }>(
			response: T,
			handler: (res: T) => T
		): T => {
			if (response.content) {
				const safety = checkContentSafety(response.content);
				if (safety === 'blocked') {
					return {
						...response,
						content: 'I cannot provide this response due to safety concerns.',
					};
				}
			}
			return handler(response);
		},
	};
}

// Export middleware instances
export const dynamicPromptMiddleware = createDynamicPromptMiddleware();
export const vybeGuardrailsMiddleware = createGuardrailsMiddleware();

// =====================================================
// CONTEXT HELPER FUNCTIONS
// =====================================================

/**
 * Merge multiple context sources
 */
export function mergeContexts(...contexts: Partial<VybeRuntimeContext>[]): Partial<VybeRuntimeContext> {
	return contexts.reduce((merged, ctx) => ({
		...merged,
		...ctx,
		userPreferences: {
			...merged.userPreferences,
			...ctx.userPreferences,
		},
	}), {});
}

/**
 * Create default context for a workspace
 */
export function createDefaultContext(workspaceRoot: string): Partial<VybeRuntimeContext> {
	return {
		workspaceRoot,
		userId: 'default',
		projectType: 'other',
		allowFileWrites: true,
		allowTerminalCommands: true,
		allowNetworkAccess: false,
		sandboxMode: false,
	};
}





