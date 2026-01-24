/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StateGraph, START, END, MemorySaver, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import * as z from 'zod';
import { allVybeTools, toolErrorHandlerMiddleware, type VybeToolContext } from './vybeToolAdapter.js';
import { vybeMiddlewareStack } from './vybeMiddleware.js';
import { VYBE_SYSTEM_PROMPT, buildDynamicSystemPrompt, type VybeContext, vybeContextSchema } from './vybeSystemPrompt.js';
import { defaultModel, modelPool } from './vybeModelSelector.js';
import { vybeAgentStateSchema } from './vybeMemory.js';

// =====================================================
// STRUCTURED OUTPUT SCHEMA
// =====================================================
// Agent can return structured data validated by Zod

export const VybeResponseSchema = z.object({
	answer: z.string().describe('The response to the user'),
	filesModified: z.array(z.string()).optional().describe('List of files that were modified'),
	nextSteps: z.array(z.string()).optional().describe('Suggested next steps for the user'),
	confidence: z.enum(['high', 'medium', 'low']).optional().describe('Confidence in the response'),
});

export type VybeResponse = z.infer<typeof VybeResponseSchema>;

// =====================================================
// AGENT STATE ANNOTATION
// =====================================================
// LangGraph state with message history and custom fields

export const VybeAgentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	filesRead: Annotation<string[]>({
		reducer: (existing, update) => [...new Set([...existing, ...update])],
		default: () => [],
	}),
	filesModified: Annotation<string[]>({
		reducer: (existing, update) => [...new Set([...existing, ...update])],
		default: () => [],
	}),
	toolsUsed: Annotation<string[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	currentTask: Annotation<string | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),
	taskProgress: Annotation<number>({
		reducer: (_, update) => update,
		default: () => 0,
	}),
	errors: Annotation<Array<{ tool: string; message: string }>>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	structuredResponse: Annotation<VybeResponse | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),
	// Interrupt state for HITL
	pendingApproval: Annotation<{
		tool: string;
		args: unknown;
		toolCallId: string;
	} | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),
});

export type VybeAgentGraphState = typeof VybeAgentStateAnnotation.State;

// =====================================================
// AGENT CONFIGURATION
// =====================================================

export interface VybeAgentConfig {
	model?: string;
	systemPrompt?: string;
	context?: Partial<VybeContext>;
	toolContext?: VybeToolContext;
	enableHITL?: boolean;
	maxIterations?: number;
}

// =====================================================
// AGENT NODE FUNCTIONS
// =====================================================

/**
 * Model node - calls the LLM with current state
 */
async function callModel(
	state: VybeAgentGraphState,
	config: VybeAgentConfig
): Promise<Partial<VybeAgentGraphState>> {
	// Build dynamic system prompt
	const systemPrompt = config.context
		? buildDynamicSystemPrompt(config.context)
		: VYBE_SYSTEM_PROMPT;

	// Get the model to use
	const model = defaultModel.bindTools(allVybeTools);

	// Add system prompt to messages if not present
	const messages = state.messages;

	// Call the model
	const response = await model.invoke([
		{ role: 'system', content: systemPrompt },
		...messages,
	]);

	return {
		messages: [response as BaseMessage],
	};
}

/**
 * Tool execution node - executes tool calls from the model
 */
async function executeTools(
	state: VybeAgentGraphState,
	config: VybeAgentConfig
): Promise<Partial<VybeAgentGraphState>> {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	const toolCalls = lastMessage.tool_calls || [];

	if (toolCalls.length === 0) {
		return {};
	}

	const toolResults: BaseMessage[] = [];
	const filesRead: string[] = [];
	const filesModified: string[] = [];
	const toolsUsed: string[] = [];
	const errors: Array<{ tool: string; message: string }> = [];

	for (const toolCall of toolCalls) {
		// Ensure tool call has an ID - generate one if missing
		const toolCallId = toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		const tool = allVybeTools.find((t: { name: string }) => t.name === toolCall.name);

		if (!tool) {
			toolResults.push({
				role: 'tool',
				content: `Tool ${toolCall.name} not found`,
				tool_call_id: toolCallId,
			} as unknown as BaseMessage);
			continue;
		}

		// Check for HITL interrupt
		// edit_file: Requires HITL when creating new files (old_string empty and file doesn't exist)
		// delete_file: Always requires HITL (destructive)
		// run_terminal_cmd: Always requires HITL
		const isNewFileEdit = toolCall.name === 'edit_file' &&
			(toolCall.args as { old_string?: string })?.old_string?.trim() === '';
		if (config.enableHITL && (toolCall.name === 'run_terminal_cmd' || toolCall.name === 'delete_file' || isNewFileEdit)) {
			// Return interrupt state with any results collected so far
			return {
				messages: toolResults.length > 0 ? toolResults : undefined,
				pendingApproval: {
					tool: toolCall.name,
					args: toolCall.args,
					toolCallId: toolCallId,
				},
				filesRead: filesRead.length > 0 ? filesRead : undefined,
				filesModified: filesModified.length > 0 ? filesModified : undefined,
				toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
				errors: errors.length > 0 ? errors : undefined,
			};
		}

		try {
			// Execute tool with error handling
			const result = await toolErrorHandlerMiddleware.wrapToolCall(
				{ toolCall },
				async () => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return await (tool as any).invoke(toolCall.args, {
						configurable: { context: config.toolContext },
					});
				}
			);

			toolsUsed.push(toolCall.name);

			// Track file operations
			const args = toolCall.args as { target_file?: string; file_path?: string };
			if (args.target_file || args.file_path) {
				const filePath = args.target_file || args.file_path || '';
				if (toolCall.name === 'read_file') {
					filesRead.push(filePath);
				} else if (toolCall.name === 'edit_file') {
					filesModified.push(filePath);
				}
			}

			// Ensure result is always a valid string
			let resultContent: string;
			if (result === undefined || result === null) {
				resultContent = 'Tool executed successfully with no output';
			} else if (typeof result === 'string') {
				resultContent = result;
			} else {
				try {
					resultContent = JSON.stringify(result);
				} catch (stringifyError) {
					resultContent = `Tool executed but result could not be serialized: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}`;
				}
			}

			toolResults.push({
				role: 'tool',
				content: resultContent,
				tool_call_id: toolCallId,
			} as unknown as BaseMessage);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			errors.push({ tool: toolCall.name, message: errorMessage });
			toolResults.push({
				role: 'tool',
				content: `Error: ${errorMessage}`,
				tool_call_id: toolCallId,
			} as unknown as BaseMessage);
		}
	}

	return {
		messages: toolResults,
		filesRead,
		filesModified,
		toolsUsed,
		errors,
	};
}

/**
 * Router function - determines next node
 */
function shouldContinue(state: VybeAgentGraphState): 'tools' | 'end' {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

	// Check for pending approval (HITL interrupt)
	if (state.pendingApproval) {
		return 'end'; // Will resume after approval
	}

	// Check if there are tool calls
	if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
		return 'tools';
	}

	return 'end';
}

// =====================================================
// CREATE VYBE AGENT
// =====================================================

export function createVybeAgent(checkpointer?: MemorySaver) {
	// Build the graph
	const graph = new StateGraph(VybeAgentStateAnnotation)
		.addNode('model', async (state) => callModel(state, {}))
		.addNode('tools', async (state) => executeTools(state, {}))
		.addEdge(START, 'model')
		.addConditionalEdges('model', shouldContinue, {
			tools: 'tools',
			end: END,
		})
		.addEdge('tools', 'model');

	// Compile with checkpointer if provided
	return graph.compile({
		checkpointer,
	});
}

// =====================================================
// CREATE CONFIGURED AGENT
// =====================================================

export function createConfiguredVybeAgent(
	config: VybeAgentConfig,
	checkpointer?: MemorySaver
) {
	// Build the graph with config
	const graph = new StateGraph(VybeAgentStateAnnotation)
		.addNode('model', async (state) => callModel(state, config))
		.addNode('tools', async (state) => executeTools(state, config))
		.addEdge(START, 'model')
		.addConditionalEdges('model', shouldContinue, {
			tools: 'tools',
			end: END,
		})
		.addEdge('tools', 'model');

	// Compile with checkpointer if provided
	return graph.compile({
		checkpointer,
		// Enable interrupts for HITL
		interruptBefore: config.enableHITL ? ['tools'] : undefined,
	});
}

// =====================================================
// AGENT INVOCATION HELPER
// =====================================================

export interface InvokeOptions {
	threadId: string;
	context?: Partial<VybeContext>;
	toolContext?: VybeToolContext;
}

export async function invokeAgent(
	agent: ReturnType<typeof createVybeAgent>,
	message: string,
	options: InvokeOptions
) {
	const result = await agent.invoke(
		{
			messages: [new HumanMessage(message)],
		},
		{
			configurable: {
				thread_id: options.threadId,
				context: options.context,
				toolContext: options.toolContext,
			},
		}
	);

	return result;
}

// =====================================================
// RESUME AFTER HITL APPROVAL
// =====================================================

export async function resumeWithApproval(
	agent: ReturnType<typeof createVybeAgent>,
	threadId: string,
	decision: 'approve' | 'reject' | 'edit',
	editedArgs?: unknown
) {
	// Get current state
	const state = await agent.getState({ configurable: { thread_id: threadId } });

	if (!state.values.pendingApproval) {
		throw new Error('No pending approval to resume');
	}

	if (decision === 'reject') {
		// Add rejection message and clear pending
		return await agent.updateState(
			{ configurable: { thread_id: threadId } },
			{
				messages: [{
					role: 'tool',
					content: 'User rejected the tool call',
					tool_call_id: state.values.pendingApproval.toolCallId,
				} as unknown as BaseMessage],
				pendingApproval: undefined,
			}
		);
	}

	// For approve/edit, resume execution
	// Note: edited args would be used to update the tool call before re-execution
	const _args = decision === 'edit' ? editedArgs : state.values.pendingApproval.args;
	void _args; // Reserved for future use with edit functionality

	// Clear pending and continue
	await agent.updateState(
		{ configurable: { thread_id: threadId } },
		{ pendingApproval: undefined }
	);

	// Resume the graph
	return await agent.invoke(null, { configurable: { thread_id: threadId } });
}

// =====================================================
// EXPORTS
// =====================================================

export {
	defaultModel,
	modelPool,
	allVybeTools,
	vybeMiddlewareStack,
	vybeContextSchema,
	VYBE_SYSTEM_PROMPT,
	vybeAgentStateSchema,
};

