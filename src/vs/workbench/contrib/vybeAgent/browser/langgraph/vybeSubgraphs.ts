/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StateGraph, START, END, MemorySaver, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { readFileTool, writeFileTool, editFileTool, grepTool, codebaseSearchTool } from './vybeToolAdapter.js';
import { defaultModel } from './vybeModelSelector.js';

// =====================================================
// SUBGRAPH STATE
// =====================================================

export const SubgraphStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	result: Annotation<string | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),
	toolsUsed: Annotation<string[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	success: Annotation<boolean>({
		reducer: (_, update) => update,
		default: () => true,
	}),
});

export type SubgraphState = typeof SubgraphStateAnnotation.State;

// =====================================================
// CODER SUBGRAPH
// =====================================================

const CODER_SYSTEM_PROMPT = `You are a coding specialist focused on implementation.

Your responsibilities:
- Write clean, well-documented code
- Follow existing patterns in the codebase
- Handle edge cases and error scenarios
- Use appropriate types and interfaces

Available tools: read_file, write_file, edit_file, grep

Guidelines:
- Read existing code before making changes
- Make minimal, focused changes
- Preserve existing functionality
- Add comments for complex logic`;

const coderTools = [readFileTool, writeFileTool, editFileTool, grepTool];

async function coderExecute(state: SubgraphState): Promise<Partial<SubgraphState>> {
	const model = defaultModel.bindTools(coderTools);

	const response = await model.invoke([
		{ role: 'system', content: CODER_SYSTEM_PROMPT },
		...state.messages,
	]);

	return {
		messages: [response as BaseMessage],
	};
}

async function coderTools_(state: SubgraphState, config?: { configurable?: { context?: unknown } }): Promise<Partial<SubgraphState>> {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	const toolCalls = lastMessage.tool_calls || [];

	const results: BaseMessage[] = [];
	const toolsUsed: string[] = [];

	for (const toolCall of toolCalls) {
		const tool = coderTools.find(t => t.name === toolCall.name);
		if (!tool) continue;

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (tool as any).invoke(toolCall.args, config);
			toolsUsed.push(toolCall.name);
			results.push({
				role: 'tool',
				content: typeof result === 'string' ? result : JSON.stringify(result),
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		} catch (error) {
			results.push({
				role: 'tool',
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		}
	}

	return { messages: results, toolsUsed };
}

function coderShouldContinue(state: SubgraphState): 'tools' | 'end' {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	if (lastMessage?.tool_calls?.length) {
		return 'tools';
	}
	return 'end';
}

export const coderSubgraph = new StateGraph(SubgraphStateAnnotation)
	.addNode('execute', coderExecute)
	.addNode('tools', coderTools_)
	.addEdge(START, 'execute')
	.addConditionalEdges('execute', coderShouldContinue, {
		tools: 'tools',
		end: END,
	})
	.addEdge('tools', 'execute');

// =====================================================
// PLANNER SUBGRAPH
// =====================================================

const PLANNER_SYSTEM_PROMPT = `You are a planning specialist focused on task decomposition.

Your responsibilities:
- Break down complex tasks into manageable steps
- Identify dependencies between tasks
- Estimate effort and prioritize work
- Consider potential blockers and risks

Available tools: codebase_search, read_file

Guidelines:
- Research the codebase before planning
- Create clear, actionable task descriptions
- Group related tasks together
- Consider the order of operations`;

const plannerTools = [codebaseSearchTool, readFileTool];

async function plannerExecute(state: SubgraphState): Promise<Partial<SubgraphState>> {
	const model = defaultModel.bindTools(plannerTools);

	const response = await model.invoke([
		{ role: 'system', content: PLANNER_SYSTEM_PROMPT },
		...state.messages,
	]);

	return {
		messages: [response as BaseMessage],
	};
}

async function plannerTools_(state: SubgraphState, config?: { configurable?: { context?: unknown } }): Promise<Partial<SubgraphState>> {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	const toolCalls = lastMessage.tool_calls || [];

	const results: BaseMessage[] = [];
	const toolsUsed: string[] = [];

	for (const toolCall of toolCalls) {
		const tool = plannerTools.find(t => t.name === toolCall.name);
		if (!tool) continue;

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (tool as any).invoke(toolCall.args, config);
			toolsUsed.push(toolCall.name);
			results.push({
				role: 'tool',
				content: typeof result === 'string' ? result : JSON.stringify(result),
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		} catch (error) {
			results.push({
				role: 'tool',
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		}
	}

	return { messages: results, toolsUsed };
}

function plannerShouldContinue(state: SubgraphState): 'tools' | 'end' {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	if (lastMessage?.tool_calls?.length) {
		return 'tools';
	}
	return 'end';
}

export const plannerSubgraph = new StateGraph(SubgraphStateAnnotation)
	.addNode('execute', plannerExecute)
	.addNode('tools', plannerTools_)
	.addEdge(START, 'execute')
	.addConditionalEdges('execute', plannerShouldContinue, {
		tools: 'tools',
		end: END,
	})
	.addEdge('tools', 'execute');

// =====================================================
// REVIEWER SUBGRAPH
// =====================================================

const REVIEWER_SYSTEM_PROMPT = `You are a code reviewer focused on quality and correctness.

Your responsibilities:
- Review code changes for bugs and issues
- Check for security vulnerabilities
- Ensure code follows best practices
- Verify tests cover the changes

Available tools: read_file, grep

Guidelines:
- Read the entire context before reviewing
- Look for edge cases and error handling
- Check for performance implications
- Suggest improvements constructively`;

const reviewerTools = [readFileTool, grepTool];

async function reviewerExecute(state: SubgraphState): Promise<Partial<SubgraphState>> {
	const model = defaultModel.bindTools(reviewerTools);

	const response = await model.invoke([
		{ role: 'system', content: REVIEWER_SYSTEM_PROMPT },
		...state.messages,
	]);

	return {
		messages: [response as BaseMessage],
	};
}

async function reviewerTools_(state: SubgraphState, config?: { configurable?: { context?: unknown } }): Promise<Partial<SubgraphState>> {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	const toolCalls = lastMessage.tool_calls || [];

	const results: BaseMessage[] = [];
	const toolsUsed: string[] = [];

	for (const toolCall of toolCalls) {
		const tool = reviewerTools.find(t => t.name === toolCall.name);
		if (!tool) continue;

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (tool as any).invoke(toolCall.args, config);
			toolsUsed.push(toolCall.name);
			results.push({
				role: 'tool',
				content: typeof result === 'string' ? result : JSON.stringify(result),
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		} catch (error) {
			results.push({
				role: 'tool',
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		}
	}

	return { messages: results, toolsUsed };
}

function reviewerShouldContinue(state: SubgraphState): 'tools' | 'end' {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	if (lastMessage?.tool_calls?.length) {
		return 'tools';
	}
	return 'end';
}

export const reviewerSubgraph = new StateGraph(SubgraphStateAnnotation)
	.addNode('execute', reviewerExecute)
	.addNode('tools', reviewerTools_)
	.addEdge(START, 'execute')
	.addConditionalEdges('execute', reviewerShouldContinue, {
		tools: 'tools',
		end: END,
	})
	.addEdge('tools', 'execute');

// =====================================================
// PARENT ORCHESTRATOR GRAPH
// =====================================================

export const ParentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	task: Annotation<string>({
		reducer: (_, update) => update,
		default: () => '',
	}),
	taskType: Annotation<'code' | 'plan' | 'review' | 'unknown'>({
		reducer: (_, update) => update,
		default: () => 'unknown',
	}),
	subgraphResult: Annotation<string | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),
});

export type ParentState = typeof ParentStateAnnotation.State;

/**
 * Router node - analyzes task and routes to appropriate subgraph
 */
async function routeTask(state: ParentState): Promise<Partial<ParentState>> {
	const task = state.task.toLowerCase();

	let taskType: ParentState['taskType'] = 'unknown';

	// Simple keyword-based routing (production would use LLM)
	if (
		task.includes('implement') ||
		task.includes('create') ||
		task.includes('write') ||
		task.includes('fix') ||
		task.includes('add') ||
		task.includes('edit')
	) {
		taskType = 'code';
	} else if (
		task.includes('plan') ||
		task.includes('break down') ||
		task.includes('decompose') ||
		task.includes('organize') ||
		task.includes('structure')
	) {
		taskType = 'plan';
	} else if (
		task.includes('review') ||
		task.includes('check') ||
		task.includes('verify') ||
		task.includes('audit') ||
		task.includes('analyze')
	) {
		taskType = 'review';
	}

	return { taskType };
}

/**
 * Determine which subgraph to use
 */
function selectSubgraph(state: ParentState): 'coder' | 'planner' | 'reviewer' | 'end' {
	switch (state.taskType) {
		case 'code':
			return 'coder';
		case 'plan':
			return 'planner';
		case 'review':
			return 'reviewer';
		default:
			return 'end';
	}
}

/**
 * Create the parent orchestrator with compiled subgraphs
 */
export function createOrchestratorGraph(checkpointer?: MemorySaver) {
	// Compile subgraphs
	const compiledCoder = coderSubgraph.compile({ checkpointer });
	const compiledPlanner = plannerSubgraph.compile({ checkpointer });
	const compiledReviewer = reviewerSubgraph.compile({ checkpointer });

	// Create parent graph
	const parentGraph = new StateGraph(ParentStateAnnotation)
		.addNode('router', routeTask)
		.addNode('coder', async (state) => {
			const result = await compiledCoder.invoke({
				messages: [new HumanMessage(state.task)],
			});
			const lastMessage = result.messages[result.messages.length - 1];
			return {
				subgraphResult: typeof lastMessage.content === 'string'
					? lastMessage.content
					: JSON.stringify(lastMessage.content),
			};
		})
		.addNode('planner', async (state) => {
			const result = await compiledPlanner.invoke({
				messages: [new HumanMessage(state.task)],
			});
			const lastMessage = result.messages[result.messages.length - 1];
			return {
				subgraphResult: typeof lastMessage.content === 'string'
					? lastMessage.content
					: JSON.stringify(lastMessage.content),
			};
		})
		.addNode('reviewer', async (state) => {
			const result = await compiledReviewer.invoke({
				messages: [new HumanMessage(state.task)],
			});
			const lastMessage = result.messages[result.messages.length - 1];
			return {
				subgraphResult: typeof lastMessage.content === 'string'
					? lastMessage.content
					: JSON.stringify(lastMessage.content),
			};
		})
		.addEdge(START, 'router')
		.addConditionalEdges('router', selectSubgraph, {
			coder: 'coder',
			planner: 'planner',
			reviewer: 'reviewer',
			end: END,
		})
		.addEdge('coder', END)
		.addEdge('planner', END)
		.addEdge('reviewer', END);

	return parentGraph.compile({ checkpointer });
}

// =====================================================
// RESEARCH SUBGRAPH (for exploration tasks)
// =====================================================

export const ResearchStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	searchResults: Annotation<string[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
	filesRead: Annotation<string[]>({
		reducer: (existing, update) => [...new Set([...existing, ...update])],
		default: () => [],
	}),
	insights: Annotation<string[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),
});

// Research tools available for the research subgraph
// Note: These tools are used in the research subgraph implementation below

async function researchSearch(state: typeof ResearchStateAnnotation.State): Promise<Partial<typeof ResearchStateAnnotation.State>> {
	// Extract query from last message
	const lastMessage = state.messages[state.messages.length - 1];
	const query = typeof lastMessage.content === 'string'
		? lastMessage.content
		: JSON.stringify(lastMessage.content);

	try {
		const result = await codebaseSearchTool.invoke({ query });
		return {
			searchResults: [typeof result === 'string' ? result : JSON.stringify(result)],
		};
	} catch {
		return { searchResults: [] };
	}
}

async function researchRead(state: typeof ResearchStateAnnotation.State): Promise<Partial<typeof ResearchStateAnnotation.State>> {
	// Would read files identified from search results
	// For now, just pass through
	return {};
}

export const researchSubgraph = new StateGraph(ResearchStateAnnotation)
	.addNode('search', researchSearch)
	.addNode('read', researchRead)
	.addEdge(START, 'search')
	.addEdge('search', 'read')
	.addEdge('read', END);

// =====================================================
// EXPORTS
// =====================================================

export {
	CODER_SYSTEM_PROMPT,
	PLANNER_SYSTEM_PROMPT,
	REVIEWER_SYSTEM_PROMPT,
};

