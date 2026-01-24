/*---------------------------------------------------------------------------------------------
 *  VYBE - Short-term Memory State Schema for LangGraph Agent
 *  Defines the state that persists during a conversation
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/agents#memory
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod';
import { BaseMessage } from '@langchain/core/messages';

// =====================================================
// MESSAGE ANNOTATION FOR LANGGRAPH
// =====================================================
// Messages are the core of agent state - they accumulate during conversation

export const messagesAnnotation = {
	// Messages use a reducer that appends new messages
	reducer: (existing: BaseMessage[], update: BaseMessage[]) => [...existing, ...update],
	default: () => [] as BaseMessage[],
};

// =====================================================
// CUSTOM STATE SCHEMA FOR VYBE AGENT
// =====================================================
// This is the short-term memory that persists during a conversation

export const vybeAgentStateSchema = z.object({
	// Message history (required for agents)
	// This accumulates all messages in the conversation
	messages: z.array(z.any()).describe('Conversation message history'),

	// Accumulated data during conversation
	filesRead: z.array(z.string()).default([]).describe('List of files read in this session'),
	filesModified: z.array(z.string()).default([]).describe('List of files modified in this session'),
	toolsUsed: z.array(z.string()).default([]).describe('List of tools used in this session'),

	// User preferences learned during session
	userPreferences: z.record(z.string(), z.string()).default({}).describe('User preferences discovered during session'),

	// Current task tracking
	currentTask: z.string().optional().describe('Current task being worked on'),
	taskProgress: z.number().default(0).describe('Progress percentage 0-100'),

	// Errors encountered for context
	errors: z.array(z.object({
		tool: z.string(),
		message: z.string(),
		timestamp: z.number().optional(),
	})).default([]).describe('Errors encountered during execution'),

	// Research/exploration context
	researchContext: z.object({
		queriesExecuted: z.array(z.string()).default([]),
		relevantPaths: z.array(z.string()).default([]),
		insights: z.array(z.string()).default([]),
	}).default({
		queriesExecuted: [],
		relevantPaths: [],
		insights: [],
	}).describe('Accumulated research context'),
});

export type VybeAgentState = z.infer<typeof vybeAgentStateSchema>;

// =====================================================
// STATE REDUCERS
// =====================================================
// Custom reducers for state updates

export const stateReducers = {
	// Messages always append
	messages: (existing: BaseMessage[], update: BaseMessage[]): BaseMessage[] => {
		return [...existing, ...update];
	},

	// Files read accumulate (deduplicated)
	filesRead: (existing: string[], update: string[]): string[] => {
		return [...new Set([...existing, ...update])];
	},

	// Files modified accumulate (deduplicated)
	filesModified: (existing: string[], update: string[]): string[] => {
		return [...new Set([...existing, ...update])];
	},

	// Tools used accumulate
	toolsUsed: (existing: string[], update: string[]): string[] => {
		return [...existing, ...update];
	},

	// Errors accumulate
	errors: (existing: Array<{ tool: string; message: string }>, update: Array<{ tool: string; message: string }>): Array<{ tool: string; message: string }> => {
		return [...existing, ...update];
	},

	// Research context merges
	researchContext: (
		existing: VybeAgentState['researchContext'],
		update: Partial<VybeAgentState['researchContext']>
	): VybeAgentState['researchContext'] => {
		return {
			queriesExecuted: [...new Set([...(existing.queriesExecuted || []), ...(update.queriesExecuted || [])])],
			relevantPaths: [...new Set([...(existing.relevantPaths || []), ...(update.relevantPaths || [])])],
			insights: [...(existing.insights || []), ...(update.insights || [])],
		};
	},
};

// =====================================================
// STATE HELPERS
// =====================================================

/**
 * Create initial state for a new conversation
 */
export function createInitialState(): VybeAgentState {
	return {
		messages: [],
		filesRead: [],
		filesModified: [],
		toolsUsed: [],
		userPreferences: {},
		currentTask: undefined,
		taskProgress: 0,
		errors: [],
		researchContext: {
			queriesExecuted: [],
			relevantPaths: [],
			insights: [],
		},
	};
}

/**
 * Update state with a tool result
 */
export function updateStateWithToolResult(
	state: VybeAgentState,
	toolName: string,
	success: boolean,
	details?: { filePath?: string; error?: string }
): Partial<VybeAgentState> {
	const updates: Partial<VybeAgentState> = {
		toolsUsed: [...state.toolsUsed, toolName],
	};

	if (details?.filePath) {
		if (toolName === 'read_file') {
			updates.filesRead = [...state.filesRead, details.filePath];
		} else if (toolName === 'edit_file') {
			updates.filesModified = [...state.filesModified, details.filePath];
		}
	}

	if (!success && details?.error) {
		updates.errors = [...state.errors, { tool: toolName, message: details.error }];
	}

	return updates;
}

/**
 * Get a summary of the current state
 */
export function getStateSummary(state: VybeAgentState): string {
	const parts: string[] = [];

	if (state.currentTask) {
		parts.push(`Current task: ${state.currentTask} (${state.taskProgress}% complete)`);
	}

	if (state.filesRead.length > 0) {
		parts.push(`Files read: ${state.filesRead.length}`);
	}

	if (state.filesModified.length > 0) {
		parts.push(`Files modified: ${state.filesModified.join(', ')}`);
	}

	if (state.errors.length > 0) {
		parts.push(`Errors: ${state.errors.length}`);
	}

	return parts.join(' | ');
}





