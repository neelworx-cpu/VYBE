/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Budget Tier Configuration
 *
 * Defines L1/L2/L3 budget tiers that control agent behavior:
 * - Tool call limits
 * - Turn limits
 * - Runtime caps
 * - Feature flags (planning, subagents)
 */

import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export type AgentLevel = 'L1' | 'L2' | 'L3';

export interface BudgetTier {
	name: AgentLevel;
	maxToolCalls: number;      // Tool call limit per run
	maxTurns: number;          // Model call limit
	maxRuntimeMs: number;      // Runtime cap in milliseconds
	enablePlanning: boolean;   // TodoListMiddleware for task decomposition
	enableSubagents: boolean;  // SubAgentMiddleware for context isolation
	summarizeTrigger: number;  // Token count to trigger summarization
	description: string;       // Human-readable description
}

// ============================================================================
// BUDGET TIERS
// ============================================================================

export const BUDGET_TIERS: Record<AgentLevel, BudgetTier> = {
	L1: {
		name: 'L1',
		maxToolCalls: 10,
		maxTurns: 5,
		maxRuntimeMs: 30_000,        // 30 seconds
		enablePlanning: true,        // write_todos available in all modes
		enableSubagents: false,
		summarizeTrigger: 8000,
		description: 'Quick tasks - read, explain, simple fixes'
	},
	L2: {
		name: 'L2',
		maxToolCalls: 30,
		maxTurns: 15,
		maxRuntimeMs: 120_000,       // 2 minutes
		enablePlanning: true,        // Enable TodoListMiddleware for multi-step tasks
		enableSubagents: false,
		summarizeTrigger: 16000,
		description: 'Standard tasks - features, bug fixes, updates'
	},
	L3: {
		name: 'L3',
		maxToolCalls: 100,
		maxTurns: 50,
		maxRuntimeMs: 600_000,       // 10 minutes
		enablePlanning: true,        // Deep Agents planning via TodoListMiddleware
		enableSubagents: true,       // Allow spawning subagents for context isolation
		summarizeTrigger: 32000,
		description: 'Complex - refactors, migrations, full builds'
	}
};

// ============================================================================
// CONTEXT SCHEMA
// ============================================================================

/**
 * Runtime context schema for agent configuration.
 * Passed via LangGraph's runtime.context
 */
export const VybeContextSchema = z.object({
	level: z.enum(['L1', 'L2', 'L3']).default('L2'),
	workspaceRoot: z.string().optional(),
	activeFile: z.string().optional(),
	projectType: z.string().optional(),
	userId: z.string().optional(),
});

export type VybeContext = z.infer<typeof VybeContextSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the budget tier for a given level
 */
export function getBudgetTier(level: AgentLevel): BudgetTier {
	return BUDGET_TIERS[level];
}

/**
 * Check if a level is valid
 */
export function isValidLevel(level: string): level is AgentLevel {
	return level === 'L1' || level === 'L2' || level === 'L3';
}

/**
 * Get the default level
 */
export function getDefaultLevel(): AgentLevel {
	return 'L2';
}

/**
 * Calculate remaining budget
 */
export function getRemainingBudget(
	level: AgentLevel,
	toolCallCount: number,
	turnCount: number
): { toolCalls: number; turns: number; percentage: number } {
	const tier = BUDGET_TIERS[level];
	const remainingToolCalls = Math.max(0, tier.maxToolCalls - toolCallCount);
	const remainingTurns = Math.max(0, tier.maxTurns - turnCount);

	// Calculate overall percentage remaining (average of both)
	const toolPercentage = remainingToolCalls / tier.maxToolCalls;
	const turnPercentage = remainingTurns / tier.maxTurns;
	const percentage = (toolPercentage + turnPercentage) / 2;

	return {
		toolCalls: remainingToolCalls,
		turns: remainingTurns,
		percentage: Math.round(percentage * 100)
	};
}

/**
 * Check if budget is exhausted
 */
export function isBudgetExhausted(
	level: AgentLevel,
	toolCallCount: number,
	turnCount: number
): boolean {
	const tier = BUDGET_TIERS[level];
	return toolCallCount >= tier.maxToolCalls || turnCount >= tier.maxTurns;
}

/**
 * Suggest tier upgrade based on usage patterns
 */
export function shouldSuggestUpgrade(
	level: AgentLevel,
	toolCallCount: number,
	turnCount: number
): boolean {
	// Don't suggest upgrade if already at L3
	if (level === 'L3') {
		return false;
	}

	const tier = BUDGET_TIERS[level];
	const toolUsage = toolCallCount / tier.maxToolCalls;
	const turnUsage = turnCount / tier.maxTurns;

	// Suggest upgrade if hitting 70% budget early in task (within first 5 turns)
	return (toolUsage > 0.7 || turnUsage > 0.7) && turnCount < 5;
}

/**
 * Get the next tier level
 */
export function getNextLevel(level: AgentLevel): AgentLevel | null {
	switch (level) {
		case 'L1': return 'L2';
		case 'L2': return 'L3';
		case 'L3': return null;
	}
}

