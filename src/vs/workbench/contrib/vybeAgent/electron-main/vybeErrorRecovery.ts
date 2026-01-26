/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Error Recovery Module
 *
 * Handles error classification, incomplete thread detection, resume/retry functionality,
 * and crash recovery for durable execution.
 *
 * Extracted from vybeLangGraphService.ts to manage file size and improve maintainability.
 */

import type { LangGraphEvent } from './vybeLangGraphService.js';
import { listUserThreads, parseThreadId } from '../common/vybeCheckpointer.js';

// ============================================================================
// Types
// ============================================================================

export interface IncompleteThread {
	threadId: string;
	taskId: string;
	lastCheckpointId: string;
	lastMessage: string;
	timestamp: Date;
}

export interface ErrorClassification {
	errorType: 'network' | 'timeout' | 'bad_request' | 'crash' | 'unknown';
	recoverable: boolean;
	canResume: boolean;
	canRetry: boolean;
	message: string;
}

type EventHandler = (event: LangGraphEvent) => void;

// ============================================================================
// VybeErrorRecovery Class
// ============================================================================

export class VybeErrorRecovery {
	constructor(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private checkpointer: any,
		private getUserId: () => string,
		private getUserScopedThreadId: (userId: string, taskId: string) => string
	) {}

	/**
	 * Detect incomplete threads for a user.
	 * Threads are incomplete if state.next.length > 0.
	 */
	async detectIncompleteThreads(userId: string): Promise<IncompleteThread[]> {
		if (!this.checkpointer) {
			console.warn('[VybeErrorRecovery] No checkpointer available, cannot detect incomplete threads');
			return [];
		}

		try {
			const threads = await listUserThreads(userId);
			const incomplete: IncompleteThread[] = [];

			for (const thread of threads) {
				try {
					// Create a minimal agent instance to check state
					// We need to get the taskId from threadId to create the agent
					const parsed = parseThreadId(thread.threadId);
					if (!parsed || !parsed.taskId) {
						console.warn(`[VybeErrorRecovery] Could not parse threadId: ${thread.threadId}`);
						continue;
					}

					// For now, we'll check the checkpoint directly
					// In a full implementation, we'd create an agent and call getState()
					// But that requires model/tools which we don't have here
					// Instead, we'll use a simpler approach: check if thread has recent checkpoint
					// and assume it's incomplete if it's recent (within last hour)
					const now = new Date();
					const lastUpdated = thread.lastUpdated;
					const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

					// If updated within last hour, consider it potentially incomplete
					// This is a heuristic - full implementation would use agent.getState()
					if (hoursSinceUpdate < 1) {
						incomplete.push({
							threadId: thread.threadId,
							taskId: parsed.taskId,
							lastCheckpointId: thread.lastCheckpointId,
							lastMessage: thread.preview || 'No message preview',
							timestamp: lastUpdated,
						});
					}
				} catch (error) {
					console.error(`[VybeErrorRecovery] Error checking thread ${thread.threadId}:`, error);
					// Continue with other threads
				}
			}

			return incomplete;
		} catch (error) {
			console.error('[VybeErrorRecovery] Failed to detect incomplete threads:', error);
			return [];
		}
	}

	/**
	 * Recover interrupted tasks on startup.
	 * Detects incomplete threads and emits recovery events to UI.
	 */
	async recoverInterruptedTasks(userId: string, eventHandler: EventHandler): Promise<void> {
		try {
			const incomplete = await this.detectIncompleteThreads(userId);

			if (incomplete.length > 0) {
				console.log(`[VybeErrorRecovery] Found ${incomplete.length} incomplete task(s)`);

				// Emit recovery event for each incomplete task
				for (const task of incomplete) {
					eventHandler({
						type: 'recovery.incomplete_tasks',
						payload: {
							tasks: incomplete.map(t => ({
								taskId: t.taskId,
								threadId: t.threadId,
								lastMessage: t.lastMessage,
								timestamp: t.timestamp.getTime(),
							})),
						},
						timestamp: Date.now(),
						task_id: task.taskId,
					});
				}
			}
		} catch (error) {
			console.error('[VybeErrorRecovery] Failed to recover interrupted tasks:', error);
		}
	}

	/**
	 * Classify an error to determine recovery strategy.
	 */
	classifyError(error: Error | unknown): ErrorClassification {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : '';
		const lowerMessage = errorMessage.toLowerCase();
		const lowerStack = (errorStack || '').toLowerCase();

		// Network errors
		if (
			lowerMessage.includes('fetch failed') ||
			lowerMessage.includes('econnrefused') ||
			lowerMessage.includes('etimedout') ||
			lowerMessage.includes('enotfound') ||
			lowerMessage.includes('ehostunreach') ||
			lowerMessage.includes('getaddrinfo') ||
			lowerMessage.includes('network') ||
			lowerMessage.includes('connection') ||
			lowerStack.includes('fetch failed') ||
			lowerStack.includes('econnrefused') ||
			lowerStack.includes('enotfound') ||
			lowerStack.includes('ehostunreach') ||
			lowerStack.includes('getaddrinfo')
		) {
			return {
				errorType: 'network',
				recoverable: true,
				canResume: true,
				canRetry: true,
				message: errorMessage,
			};
		}

		// API timeouts
		if (
			lowerMessage.includes('timeout') ||
			lowerMessage.includes('timed out') ||
			lowerMessage.includes('408') ||
			lowerMessage.includes('504') ||
			lowerStack.includes('timeout')
		) {
			return {
				errorType: 'timeout',
				recoverable: true,
				canResume: true,
				canRetry: true,
				message: errorMessage,
			};
		}

		// Bad requests (400, 401, 403)
		if (
			lowerMessage.includes('400') ||
			lowerMessage.includes('401') ||
			lowerMessage.includes('403') ||
			lowerMessage.includes('unauthorized') ||
			lowerMessage.includes('forbidden') ||
			lowerMessage.includes('bad request')
		) {
			return {
				errorType: 'bad_request',
				recoverable: false,
				canResume: false,
				canRetry: true,
				message: errorMessage,
			};
		}

		// Crashes (uncaught exceptions, process termination)
		if (
			lowerMessage.includes('crash') ||
			lowerMessage.includes('uncaught') ||
			lowerMessage.includes('process') ||
			lowerStack.includes('uncaught')
		) {
			return {
				errorType: 'crash',
				recoverable: true,
				canResume: true,
				canRetry: true,
				message: errorMessage,
			};
		}

		// Unknown errors - default to recoverable if we have a checkpointer
		return {
			errorType: 'unknown',
			recoverable: !!this.checkpointer,
			canResume: !!this.checkpointer,
			canRetry: true,
			message: errorMessage,
		};
	}

	/**
	 * Check if a task can be resumed by verifying its state.
	 * Returns true if state.next.length > 0, indicating incomplete execution.
	 */
	async canResumeTask(taskId: string, agent: any): Promise<boolean> {
		if (!this.checkpointer || !agent) {
			return false;
		}

		try {
			const userId = this.getUserId();
			const threadId = this.getUserScopedThreadId(userId, taskId);
			const config = {
				configurable: {
					thread_id: threadId,
				},
			};

			const state = await agent.getState(config);
			return state.next && state.next.length > 0;
		} catch (error) {
			console.error('[VybeErrorRecovery] Failed to check if task can resume:', error);
			return false;
		}
	}

	/**
	 * Clear checkpoint for a task (used before retry).
	 */
	async clearTaskCheckpoint(taskId: string): Promise<void> {
		if (!this.checkpointer) {
			return;
		}

		try {
			const userId = this.getUserId();
			const threadId = this.getUserScopedThreadId(userId, taskId);
			await this.checkpointer.deleteThread(threadId);
			console.log(`[VybeErrorRecovery] Cleared checkpoint for thread: ${threadId}`);
		} catch (error) {
			console.warn(`[VybeErrorRecovery] Failed to clear checkpoint for task ${taskId}:`, error);
			// Don't throw - retry can proceed without clearing
		}
	}
}
