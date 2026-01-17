/*---------------------------------------------------------------------------------------------
 *  VYBE - System Prompt and Dynamic Prompts for LangGraph Agent
 *  Supports static prompts, cache control, and dynamic prompt adaptation
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/agents#system-prompt
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/agents#dynamic-system-prompt
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod';
import { SystemMessage } from '@langchain/core/messages';

// =====================================================
// STATIC SYSTEM PROMPT
// =====================================================

export const VYBE_SYSTEM_PROMPT = `You are VYBE, an AI coding assistant integrated into an IDE.

Core capabilities:
- Read, write, and edit files in the workspace
- Execute terminal commands (with user approval)
- Search and analyze codebases semantically
- Plan and track tasks with todo lists

Guidelines:
- Be concise and accurate
- Show your reasoning before taking actions
- Ask for clarification when requirements are ambiguous
- Prefer editing existing code over rewriting
- Use tools sequentially, waiting for each result before deciding the next action
- For terminal commands, always wait for user approval before proceeding`;

// =====================================================
// CACHED SYSTEM PROMPT (Anthropic)
// =====================================================
// Uses Anthropic's prompt caching for reduced latency and costs

export const cachedSystemPrompt = new SystemMessage({
	content: [
		{
			type: 'text',
			text: VYBE_SYSTEM_PROMPT,
		},
		{
			type: 'text',
			text: '<workspace context will be injected here>',
			// cache_control is Anthropic-specific for prompt caching
			cache_control: { type: 'ephemeral' } as unknown,
		} as { type: string; text: string; cache_control?: unknown },
	],
});

// =====================================================
// CONTEXT SCHEMA FOR DYNAMIC PROMPTS
// =====================================================

export const vybeContextSchema = z.object({
	userId: z.string(),
	workspaceRoot: z.string(),
	projectType: z.enum(['typescript', 'python', 'rust', 'go', 'java', 'other']),
	userRole: z.enum(['expert', 'intermediate', 'beginner']),
	preferLocal: z.boolean().optional(),
	taskComplexity: z.enum(['simple', 'normal', 'advanced', 'reasoning']).optional(),
	activeFile: z.string().optional(),
});

export type VybeContext = z.infer<typeof vybeContextSchema>;

// =====================================================
// PROJECT-SPECIFIC PROMPT ADDITIONS
// =====================================================

const projectTypePrompts: Record<string, string> = {
	typescript: `
TypeScript conventions:
- Use interfaces over types where possible
- Prefer const assertions for immutable data
- Use strict mode and enable all strict checks
- Prefer async/await over raw promises
- Use proper error handling with try/catch`,

	python: `
Python conventions:
- Use type hints for all function signatures
- Follow PEP 8 style guide
- Prefer f-strings for string formatting
- Use context managers for resource handling
- Document with docstrings`,

	rust: `
Rust conventions:
- Use Result for error handling, avoid unwrap in production code
- Prefer references over clones
- Use Clippy suggestions
- Document with /// comments
- Prefer iterators over explicit loops`,

	go: `
Go conventions:
- Use gofmt for formatting
- Handle errors explicitly
- Use interfaces for abstraction
- Follow the standard project layout
- Use context for cancellation`,

	java: `
Java conventions:
- Follow SOLID principles
- Use dependency injection
- Prefer composition over inheritance
- Document with Javadoc
- Use Optional for nullable returns`,
};

// =====================================================
// USER ROLE PROMPT ADDITIONS
// =====================================================

const userRolePrompts: Record<string, string> = {
	beginner: `
Adapt your responses for a beginner:
- Explain concepts simply and avoid jargon
- Provide step-by-step explanations
- Include comments in code examples
- Suggest learning resources when appropriate`,

	intermediate: `
Adapt your responses for an intermediate developer:
- Balance explanations with efficiency
- Point out best practices and patterns
- Explain the "why" behind recommendations`,

	expert: `
Adapt your responses for an expert:
- Be concise and technical
- Focus on advanced patterns and optimizations
- Skip basic explanations
- Discuss trade-offs and alternatives`,
};

// =====================================================
// DYNAMIC SYSTEM PROMPT BUILDER
// =====================================================

export function buildDynamicSystemPrompt(context: Partial<VybeContext>): string {
	let prompt = VYBE_SYSTEM_PROMPT;

	// Add project-specific conventions
	if (context.projectType && projectTypePrompts[context.projectType]) {
		prompt += '\n\n' + projectTypePrompts[context.projectType];
	}

	// Add user role adaptations
	if (context.userRole && userRolePrompts[context.userRole]) {
		prompt += '\n\n' + userRolePrompts[context.userRole];
	}

	// Add workspace context
	if (context.workspaceRoot) {
		prompt += `\n\nWorkspace root: ${context.workspaceRoot}`;
	}

	if (context.activeFile) {
		prompt += `\nCurrently active file: ${context.activeFile}`;
	}

	return prompt;
}

// =====================================================
// DYNAMIC SYSTEM PROMPT MIDDLEWARE
// =====================================================

export interface DynamicPromptRequest {
	runtime: {
		context?: Partial<VybeContext>;
	};
	systemPromptAddition?: string;
}

export function createDynamicPromptMiddleware() {
	return {
		name: 'VybeDynamicPrompt',
		beforeModel: <T>(
			request: DynamicPromptRequest,
			handler: (req: DynamicPromptRequest) => T
		): T => {
			const context = request.runtime.context || {};
			const dynamicPrompt = buildDynamicSystemPrompt(context);

			return handler({
				...request,
				systemPromptAddition: dynamicPrompt,
			});
		},
	};
}

// Export middleware instance
export const vybeDynamicPromptMiddleware = createDynamicPromptMiddleware();

