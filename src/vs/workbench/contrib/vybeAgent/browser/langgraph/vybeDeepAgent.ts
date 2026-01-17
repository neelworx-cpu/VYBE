/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StateGraph, START, END, MemorySaver, Annotation } from '@langchain/langgraph';
import { InMemoryStore } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { allVybeTools } from './vybeToolAdapter.js';
import { defaultModel } from './vybeModelSelector.js';

// =====================================================
// DEEP AGENT STATE
// =====================================================

export const DeepAgentStateAnnotation = Annotation.Root({
	// Message history
	messages: Annotation<BaseMessage[]>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),

	// Task decomposition
	tasks: Annotation<Array<{
		id: string;
		description: string;
		status: 'pending' | 'in_progress' | 'completed' | 'failed';
		result?: string;
	}>>({
		reducer: (existing, update) => {
			// Merge tasks by id
			const taskMap = new Map(existing.map(t => [t.id, t]));
			for (const task of update) {
				taskMap.set(task.id, { ...taskMap.get(task.id), ...task });
			}
			return Array.from(taskMap.values());
		},
		default: () => [],
	}),

	// Current task being worked on
	currentTaskId: Annotation<string | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),

	// Subagent results
	subagentResults: Annotation<Record<string, unknown>>({
		reducer: (existing, update) => ({ ...existing, ...update }),
		default: () => ({}),
	}),

	// Filesystem context
	workingDirectory: Annotation<string>({
		reducer: (_, update) => update,
		default: () => process.cwd(),
	}),

	// Files in context
	contextFiles: Annotation<string[]>({
		reducer: (existing, update) => [...new Set([...existing, ...update])],
		default: () => [],
	}),

	// Learned preferences/patterns
	learnings: Annotation<Array<{ key: string; value: string; timestamp: number }>>({
		reducer: (existing, update) => [...existing, ...update],
		default: () => [],
	}),

	// HITL pending
	pendingApproval: Annotation<{
		tool: string;
		args: unknown;
		toolCallId: string;
	} | undefined>({
		reducer: (_, update) => update,
		default: () => undefined,
	}),
});

export type DeepAgentState = typeof DeepAgentStateAnnotation.State;

// =====================================================
// DEEP AGENT CONFIGURATION
// =====================================================

export interface DeepAgentConfig {
	model?: string;
	interruptOn?: Record<string, boolean>;
	maxSubagents?: number;
	memoryPath?: string;
	toolContext?: unknown;
}

// =====================================================
// PLANNING AND TASK DECOMPOSITION
// =====================================================

/**
 * Plan node - decomposes complex tasks into subtasks
 */
async function planTasks(state: DeepAgentState): Promise<Partial<DeepAgentState>> {
	const lastMessage = state.messages[state.messages.length - 1];
	const content = typeof lastMessage.content === 'string'
		? lastMessage.content
		: JSON.stringify(lastMessage.content);

	// Simple task extraction (in production, would use LLM)
	const tasks: DeepAgentState['tasks'] = [];

	// Check if this looks like a multi-step task
	const lines = content.split('\n');
	let taskIndex = 0;

	for (const line of lines) {
		// Look for numbered items or bullet points
		const match = line.match(/^[\d]+\.|^[-*]\s+/);
		if (match) {
			tasks.push({
				id: `task-${taskIndex++}`,
				description: line.replace(/^[\d]+\.|^[-*]\s+/, '').trim(),
				status: 'pending',
			});
		}
	}

	// If no explicit tasks found, create a single task
	if (tasks.length === 0) {
		tasks.push({
			id: 'task-0',
			description: content,
			status: 'pending',
		});
	}

	return {
		tasks,
		currentTaskId: tasks[0]?.id,
	};
}

/**
 * Execute node - works on current task
 */
async function executeTask(state: DeepAgentState): Promise<Partial<DeepAgentState>> {
	const currentTask = state.tasks.find(t => t.id === state.currentTaskId);

	if (!currentTask) {
		return {};
	}

	// Mark as in progress
	const updatedTasks = state.tasks.map(t =>
		t.id === currentTask.id ? { ...t, status: 'in_progress' as const } : t
	);

	// Call LLM to work on the task
	const model = defaultModel.bindTools(allVybeTools);

	const response = await model.invoke([
		{
			role: 'system',
			content: `You are working on the following task: ${currentTask.description}

Context files: ${state.contextFiles.join(', ') || 'none'}
Working directory: ${state.workingDirectory}

Complete this task using the available tools.`,
		},
		...state.messages,
	]);

	return {
		messages: [response as BaseMessage],
		tasks: updatedTasks,
	};
}

/**
 * Review node - check task completion and decide next steps
 */
async function reviewTask(state: DeepAgentState): Promise<Partial<DeepAgentState>> {
	const currentTask = state.tasks.find(t => t.id === state.currentTaskId);

	if (!currentTask) {
		return {};
	}

	// Check the last message for completion indicators
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

	// If there are tool calls, task is not complete yet
	if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
		return {};
	}

	// Mark task as complete
	const updatedTasks = state.tasks.map(t =>
		t.id === currentTask.id
			? { ...t, status: 'completed' as const, result: String(lastMessage.content) }
			: t
	);

	// Find next pending task
	const nextTask = updatedTasks.find(t => t.status === 'pending');

	return {
		tasks: updatedTasks,
		currentTaskId: nextTask?.id,
	};
}

// =====================================================
// ROUTING LOGIC
// =====================================================

function shouldContinue(state: DeepAgentState): 'execute' | 'tools' | 'review' | 'end' {
	// Check for HITL interrupt
	if (state.pendingApproval) {
		return 'end';
	}

	// Check if there's a current task
	if (!state.currentTaskId) {
		return 'end';
	}

	// Check last message for tool calls
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
		return 'tools';
	}

	// Check if current task is complete
	const currentTask = state.tasks.find(t => t.id === state.currentTaskId);
	if (currentTask?.status === 'in_progress') {
		return 'review';
	}

	if (currentTask?.status === 'pending') {
		return 'execute';
	}

	return 'end';
}

// =====================================================
// TOOL EXECUTION WITH HITL
// =====================================================

async function executeTools(
	state: DeepAgentState,
	config?: DeepAgentConfig
): Promise<Partial<DeepAgentState>> {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	const toolCalls = lastMessage.tool_calls || [];

	if (toolCalls.length === 0) {
		return {};
	}

	const toolResults: BaseMessage[] = [];
	const contextFiles: string[] = [];

	for (const toolCall of toolCalls) {
		// Check for HITL
		if (config?.interruptOn?.[toolCall.name]) {
			return {
				pendingApproval: {
					tool: toolCall.name,
					args: toolCall.args,
					toolCallId: toolCall.id || 'unknown',
				},
			};
		}

		const tool = allVybeTools.find((t: { name: string }) => t.name === toolCall.name);
		if (!tool) {
			toolResults.push({
				role: 'tool',
				content: `Tool ${toolCall.name} not found`,
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
			continue;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await (tool as any).invoke(toolCall.args, config?.toolContext ? { configurable: { context: config.toolContext } } : undefined);

			// Track files read
			const args = toolCall.args as { target_file?: string; file_path?: string };
			if (args.target_file || args.file_path) {
				contextFiles.push(args.target_file || args.file_path || '');
			}

			toolResults.push({
				role: 'tool',
				content: typeof result === 'string' ? result : JSON.stringify(result),
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		} catch (error) {
			toolResults.push({
				role: 'tool',
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
				tool_call_id: toolCall.id,
			} as unknown as BaseMessage);
		}
	}

	return {
		messages: toolResults,
		contextFiles,
	};
}

// =====================================================
// CREATE DEEP AGENT
// =====================================================

export function createVybeDeepAgent(
	config?: DeepAgentConfig,
	checkpointer?: MemorySaver,
	store?: InMemoryStore
) {
	const graph = new StateGraph(DeepAgentStateAnnotation)
		// Planning phase
		.addNode('plan', planTasks)

		// Execution phase
		.addNode('execute', executeTask)
		.addNode('tools', (state) => executeTools(state, config))
		.addNode('review', reviewTask)

		// Edges
		.addEdge(START, 'plan')
		.addEdge('plan', 'execute')
		.addConditionalEdges('execute', shouldContinue, {
			execute: 'execute',
			tools: 'tools',
			review: 'review',
			end: END,
		})
		.addEdge('tools', 'execute')
		.addConditionalEdges('review', shouldContinue, {
			execute: 'execute',
			tools: 'tools',
			review: 'review',
			end: END,
		});

	const compileOptions: Parameters<typeof graph.compile>[0] = {
		checkpointer,
		interruptBefore: config?.interruptOn ? ['tools'] : undefined,
	};
	if (store) {
		compileOptions.store = store as InMemoryStore;
	}
	return graph.compile(compileOptions);
}

// =====================================================
// LONG-TERM MEMORY
// =====================================================

export interface MemoryEntry {
	key: string;
	value: string;
	category: 'preference' | 'pattern' | 'convention' | 'error_resolution';
	timestamp: number;
}

/**
 * Memory manager for long-term learning
 */
export class VybeMemoryManager {
	private store: InMemoryStore;
	private namespace = 'vybe_memories';

	constructor(store: InMemoryStore) {
		this.store = store;
	}

	async remember(entry: Omit<MemoryEntry, 'timestamp'>): Promise<void> {
		const fullEntry: MemoryEntry = {
			...entry,
			timestamp: Date.now(),
		};

		await this.store.put(
			[this.namespace, entry.category],
			entry.key,
			fullEntry
		);
	}

	async recall(category: MemoryEntry['category'], key?: string): Promise<MemoryEntry[]> {
		const items = await this.store.search([this.namespace, category], {
			limit: 100,
		});

		const memories = items.map(item => item.value as MemoryEntry);

		if (key) {
			return memories.filter(m => m.key.includes(key));
		}

		return memories;
	}

	async recallAll(): Promise<MemoryEntry[]> {
		const categories: MemoryEntry['category'][] = [
			'preference',
			'pattern',
			'convention',
			'error_resolution',
		];

		const allMemories: MemoryEntry[] = [];
		for (const category of categories) {
			const memories = await this.recall(category);
			allMemories.push(...memories);
		}

		return allMemories;
	}

	async getRelevantContext(query: string): Promise<string> {
		const memories = await this.recallAll();

		// Simple keyword matching (production would use embeddings)
		const queryWords = query.toLowerCase().split(/\s+/);
		const relevant = memories.filter(m =>
			queryWords.some(w => m.key.toLowerCase().includes(w) || m.value.toLowerCase().includes(w))
		);

		if (relevant.length === 0) {
			return '';
		}

		return relevant
			.map(m => `${m.category}: ${m.key} = ${m.value}`)
			.join('\n');
	}
}

// =====================================================
// SUBAGENT SPAWNING
// =====================================================

export interface SubagentConfig {
	name: string;
	systemPrompt: string;
	tools: typeof allVybeTools;
	maxIterations?: number;
}

/**
 * Spawn a specialized subagent for a specific task
 */
export async function spawnSubagent(
	config: SubagentConfig,
	task: string,
	parentState: DeepAgentState,
	checkpointer?: MemorySaver
): Promise<{ result: string; toolsUsed: string[] }> {
	const subGraph = new StateGraph(DeepAgentStateAnnotation)
		.addNode('execute', async (state) => {
			const model = defaultModel.bindTools(config.tools);
			const response = await model.invoke([
				{ role: 'system', content: config.systemPrompt },
				{ role: 'user', content: task },
			]);
			return { messages: [response as BaseMessage] };
		})
		.addNode('tools', (state) => executeTools(state))
		.addEdge(START, 'execute')
		.addConditionalEdges('execute', (state) => {
			const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
			return lastMessage?.tool_calls?.length ? 'tools' : 'end';
		}, {
			tools: 'tools',
			end: END,
		})
		.addEdge('tools', 'execute');

	const compiled = subGraph.compile({ checkpointer });

	const result = await compiled.invoke({
		messages: [new HumanMessage(task)],
		contextFiles: parentState.contextFiles,
		workingDirectory: parentState.workingDirectory,
	});

	const lastMessage = result.messages[result.messages.length - 1];
	const content = typeof lastMessage.content === 'string'
		? lastMessage.content
		: JSON.stringify(lastMessage.content);

	return {
		result: content,
		toolsUsed: [], // Would track actual tools used
	};
}

