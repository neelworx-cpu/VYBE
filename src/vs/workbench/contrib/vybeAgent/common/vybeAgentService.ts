/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Agent Service Interface
 *
 * The main entry point for agent functionality.
 * This service replaces VybeChatMcpExecutionService.
 */

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { VybeAgentEvent } from './vybeAgentEvents.js';
import type { SolveTaskParams, AgentTaskState } from './vybeAgentTypes.js';

export const IVybeAgentService = createDecorator<IVybeAgentService>('vybeAgentService');

export interface IVybeAgentService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Task Execution
	// ========================================================================

	/**
	 * Execute an agent task
	 *
	 * @param params Task parameters including goal, mode, model, etc.
	 * @returns The task ID for tracking events
	 */
	solveTask(params: SolveTaskParams): Promise<string>;

	/**
	 * Cancel a running task
	 *
	 * @param taskId The task to cancel
	 */
	cancelTask(taskId: string): Promise<void>;

	/**
	 * Get the current state of a task
	 *
	 * @param taskId The task to query
	 * @returns The task state, or undefined if not found
	 */
	getTaskState(taskId: string): AgentTaskState | undefined;

	// ========================================================================
	// Events
	// ========================================================================

	/**
	 * Event fired when the agent emits any event.
	 * Events match the format expected by StreamingEventHandler.
	 */
	readonly onDidEmitEvent: Event<VybeAgentEvent>;

	// ========================================================================
	// Model Management
	// ========================================================================

	/**
	 * Set API key for a provider
	 *
	 * @param provider Provider name
	 * @param apiKey The API key
	 */
	setApiKey(provider: string, apiKey: string): Promise<void>;

	/**
	 * Check if a provider has an API key configured
	 *
	 * @param provider Provider name
	 * @returns Whether the provider is configured
	 */
	hasApiKey(provider: string): boolean;

	// ========================================================================
	// Human-in-the-Loop (LangGraph Integration)
	// ========================================================================

	/**
	 * Resume a paused task after user approval (HITL)
	 * Called when user clicks Run/Skip in the terminal permission dialog
	 *
	 * @param taskId The task that is paused
	 * @param decision User's decision to approve or reject
	 */
	resumeWithApproval?(taskId: string, decision: 'approve' | 'reject'): Promise<void>;

	// ========================================================================
	// Error Recovery (Durable Execution)
	// ========================================================================

	/**
	 * Resume a task from its last checkpoint after an error.
	 *
	 * @param taskId The task to resume
	 * @param modelId Optional model ID (uses task's original model if not provided)
	 * @param reasoningLevel Optional reasoning level (uses task's original level if not provided)
	 */
	resumeTask?(taskId: string, modelId?: string, reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh'): Promise<void>;

	/**
	 * Retry a task from scratch after an error.
	 * Clears old checkpoint and starts new task with original message.
	 *
	 * @param taskId The task to retry
	 * @param goal The original goal/message
	 * @param modelId Optional model ID (uses task's original model if not provided)
	 * @param level Optional level (uses task's original level if not provided)
	 * @param reasoningLevel Optional reasoning level (uses task's original level if not provided)
	 */
	retryTask?(taskId: string, goal: string, modelId?: string, level?: 'L1' | 'L2' | 'L3', reasoningLevel?: 'low' | 'medium' | 'high' | 'xhigh'): Promise<void>;

	/**
	 * Get incomplete tasks for recovery on startup.
	 *
	 * @returns Array of incomplete task information
	 */
	getIncompleteTasks?(): Promise<Array<{
		taskId: string;
		threadId: string;
		lastMessage: string;
		timestamp: number;
	}>>;
}


