/*---------------------------------------------------------------------------------------------
 *  VYBE - Time Travel and Durable Execution
 *  Checkpoint history navigation and state replay
 *  Reference: LangGraph persistence and time travel documentation
 *--------------------------------------------------------------------------------------------*/

import { MemorySaver } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

// =====================================================
// CHECKPOINT TYPES
// =====================================================

export interface Checkpoint {
	id: string;
	threadId: string;
	timestamp: number;
	parentId?: string;
	metadata: {
		step: number;
		nodeName: string;
		toolCalls?: Array<{
			name: string;
			args: unknown;
		}>;
	};
}

export interface StateSnapshot<T = unknown> {
	checkpoint: Checkpoint;
	state: T;
	next: string[];
}

export interface ExecutionHistory<T = unknown> {
	threadId: string;
	checkpoints: Checkpoint[];
	snapshots: Map<string, StateSnapshot<T>>;
}

// =====================================================
// TIME TRAVEL MANAGER
// =====================================================

export class VybeTimeTravelManager {
	constructor(private readonly _checkpointer: MemorySaver) {
		// Checkpointer stored for potential future use
		void this._checkpointer;
	}

	/**
	 * Get the full execution history for a thread
	 */
	async getHistory(
		agent: CompiledGraph,
		threadId: string
	): Promise<StateSnapshot[]> {
		const history: StateSnapshot[] = [];

		const stateHistory = await agent.getStateHistory({
			configurable: { thread_id: threadId },
		});

		for await (const snapshot of stateHistory) {
			history.push({
				checkpoint: {
					id: snapshot.config?.configurable?.checkpoint_id || '',
					threadId,
					timestamp: Date.now(), // Would come from checkpoint metadata
					parentId: snapshot.parentConfig?.configurable?.checkpoint_id,
					metadata: {
						step: history.length,
						nodeName: snapshot.next?.[0] || 'end',
					},
				},
				state: snapshot.values,
				next: snapshot.next || [],
			});
		}

		return history;
	}

	/**
	 * Get a specific checkpoint's state
	 */
	async getCheckpoint<T>(
		agent: CompiledGraph,
		threadId: string,
		checkpointId: string
	): Promise<StateSnapshot<T> | null> {
		const state = await agent.getState({
			configurable: {
				thread_id: threadId,
				checkpoint_id: checkpointId,
			},
		});

		if (!state) {
			return null;
		}

		return {
			checkpoint: {
				id: checkpointId,
				threadId,
				timestamp: Date.now(),
				metadata: {
					step: 0,
					nodeName: state.next?.[0] || 'end',
				},
			},
			state: state.values as T,
			next: state.next || [],
		};
	}

	/**
	 * Time travel to a specific checkpoint
	 * Optionally modify state before resuming
	 */
	async travelTo<T>(
		agent: CompiledGraph,
		threadId: string,
		checkpointId: string,
		modifiedState?: Partial<T>
	): Promise<T> {
		// If modifying state, update it first
		if (modifiedState) {
			await agent.updateState(
				{
					configurable: {
						thread_id: threadId,
						checkpoint_id: checkpointId,
					},
				},
				modifiedState
			);
		}

		// Resume execution from the checkpoint
		// This creates a fork in the execution history
		const result = await agent.invoke(null, {
			configurable: {
				thread_id: threadId,
				checkpoint_id: checkpointId,
			},
		});

		return result as T;
	}

	/**
	 * Fork execution from a checkpoint with new input
	 */
	async fork<T>(
		agent: CompiledGraph,
		threadId: string,
		checkpointId: string,
		newInput: { messages: BaseMessage[] }
	): Promise<{ newThreadId: string; result: T }> {
		// Create a new thread ID for the fork
		const newThreadId = `${threadId}-fork-${Date.now()}`;

		// Get the state at the checkpoint
		const checkpoint = await this.getCheckpoint(agent, threadId, checkpointId);

		if (!checkpoint) {
			throw new Error(`Checkpoint ${checkpointId} not found`);
		}

		// Start new execution with the forked state
		const mergedInput = Object.assign({}, checkpoint.state as object, newInput);
		const result = await agent.invoke(
			mergedInput,
			{
				configurable: { thread_id: newThreadId },
			}
		);

		return {
			newThreadId,
			result: result as T,
		};
	}

	/**
	 * Compare two checkpoints
	 */
	async compare<T>(
		agent: CompiledGraph,
		threadId: string,
		checkpointId1: string,
		checkpointId2: string
	): Promise<{
		checkpoint1: StateSnapshot<T> | null;
		checkpoint2: StateSnapshot<T> | null;
		differences: string[];
	}> {
		const [cp1, cp2] = await Promise.all([
			this.getCheckpoint<T>(agent, threadId, checkpointId1),
			this.getCheckpoint<T>(agent, threadId, checkpointId2),
		]);

		const differences: string[] = [];

		if (cp1 && cp2) {
			// Compare states
			const state1 = cp1.state as Record<string, unknown>;
			const state2 = cp2.state as Record<string, unknown>;

			const allKeys = new Set([
				...Object.keys(state1),
				...Object.keys(state2),
			]);

			for (const key of allKeys) {
				const val1 = JSON.stringify(state1[key]);
				const val2 = JSON.stringify(state2[key]);

				if (val1 !== val2) {
					differences.push(`${key}: ${val1} -> ${val2}`);
				}
			}
		}

		return {
			checkpoint1: cp1,
			checkpoint2: cp2,
			differences,
		};
	}

	/**
	 * Replay execution from a checkpoint with tracing
	 */
	async replay<T>(
		agent: CompiledGraph,
		threadId: string,
		checkpointId: string,
		onStep?: (step: { node: string; state: T }) => void
	): Promise<T> {
		// Get all checkpoints after the target
		const history = await this.getHistory(agent, threadId);

		const startIndex = history.findIndex(h => h.checkpoint.id === checkpointId);
		if (startIndex === -1) {
			throw new Error(`Checkpoint ${checkpointId} not found`);
		}

		// Trace through each step
		for (let i = startIndex; i < history.length; i++) {
			const snapshot = history[i];
			onStep?.({
				node: snapshot.checkpoint.metadata.nodeName,
				state: snapshot.state as T,
			});
		}

		// Return final state
		return history[history.length - 1]?.state as T;
	}
}

// =====================================================
// DURABLE EXECUTION HELPERS
// =====================================================

/**
 * Create a resumable execution wrapper
 * Automatically saves state and can resume from failures
 */
export function createDurableExecution<TInput, TOutput>(
	agent: CompiledGraph,
	checkpointer: MemorySaver
) {
	return {
		/**
		 * Execute with automatic state persistence
		 */
		async execute(
			input: TInput,
			threadId: string
		): Promise<{ output: TOutput; checkpointId: string }> {
			try {
				const result = await agent.invoke(input, {
					configurable: { thread_id: threadId },
				});

				// Get the final checkpoint ID
				const state = await agent.getState({
					configurable: { thread_id: threadId },
				});

				return {
					output: result as TOutput,
					checkpointId: state?.config?.configurable?.checkpoint_id || '',
				};
			} catch (error) {
				// On failure, we can resume from the last successful checkpoint
				throw new DurableExecutionError(
					error instanceof Error ? error.message : String(error),
					threadId
				);
			}
		},

		/**
		 * Resume execution from the last checkpoint
		 */
		async resume(threadId: string): Promise<TOutput> {
			// Resume from where we left off
			const result = await agent.invoke(null, {
				configurable: { thread_id: threadId },
			});

			return result as TOutput;
		},

		/**
		 * Check if execution is pending (interrupted or failed)
		 */
		async isPending(threadId: string): Promise<boolean> {
			const state = await agent.getState({
				configurable: { thread_id: threadId },
			});

			// If there are next steps, execution is pending
			return (state?.next?.length || 0) > 0;
		},

		/**
		 * Get current execution status
		 */
		async getStatus(threadId: string): Promise<{
			status: 'running' | 'completed' | 'interrupted' | 'failed';
			checkpoint?: string;
			nextNodes?: string[];
		}> {
			const state = await agent.getState({
				configurable: { thread_id: threadId },
			});

			if (!state) {
				return { status: 'completed' };
			}

			const hasNext = (state.next?.length || 0) > 0;
			const checkpointId = state.config?.configurable?.checkpoint_id;

			// Check for interrupt
			const values = state.values as Record<string, unknown>;
			if (values.pendingApproval) {
				return {
					status: 'interrupted',
					checkpoint: checkpointId,
					nextNodes: state.next,
				};
			}

			if (hasNext) {
				return {
					status: 'running',
					checkpoint: checkpointId,
					nextNodes: state.next,
				};
			}

			return {
				status: 'completed',
				checkpoint: checkpointId,
			};
		},
	};
}

/**
 * Error class for durable execution failures
 */
export class DurableExecutionError extends Error {
	constructor(message: string, public threadId: string) {
		super(message);
		this.name = 'DurableExecutionError';
	}
}

// =====================================================
// TYPES
// =====================================================

// Simplified type for compiled graph
interface CompiledGraph {
	invoke: (input: unknown, config?: { configurable?: Record<string, string> }) => Promise<unknown>;
	getState: (config: { configurable: Record<string, string> }) => Promise<{
		values: unknown;
		next?: string[];
		config?: { configurable?: Record<string, string> };
	} | null>;
	getStateHistory: (config: { configurable: Record<string, string> }) => AsyncIterable<{
		values: unknown;
		next?: string[];
		config?: { configurable?: Record<string, string> };
		parentConfig?: { configurable?: Record<string, string> };
	}>;
	updateState: (config: { configurable: Record<string, string> }, state: unknown) => Promise<void>;
}

// =====================================================
// EXPORTS
// =====================================================

export { MemorySaver };

