/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Agent Events
 *
 * Event types that match the existing streaming_event_types.ts format.
 * This ensures UI compatibility - the existing StreamingEventHandler
 * will work without modification.
 */

import type { AgentPhase, ToolCall, ToolResult } from './vybeAgentTypes.js';

// ============================================================================
// Base Event Interface
// ============================================================================

/**
 * Base interface for all agent events
 */
export interface VybeAgentEventBase {
	/** Event type discriminator */
	type: string;
	/** Task ID this event belongs to */
	task_id: string;
	/** Timestamp of the event */
	timestamp?: number;
}

// ============================================================================
// Tool Events
// ============================================================================

/**
 * Emitted when a tool call is initiated
 * Uses payload wrapper for streaming_event_handler compatibility
 */
export interface ToolCallEvent extends VybeAgentEventBase {
	type: 'tool.call';
	payload: {
		tool_id: string;
		tool_name: string;
		arguments: Record<string, unknown>;
	};
}

/**
 * Emitted when a tool call completes
 * Uses payload wrapper for streaming_event_handler compatibility
 */
export interface ToolResultEvent extends VybeAgentEventBase {
	type: 'tool.result';
	payload: {
		tool_id: string;
		tool_name: string;
		result?: unknown;
		error?: string;
		execution_time_ms?: number;
	};
}

// ============================================================================
// Content Events
// ============================================================================

/**
 * Emitted for streaming assistant content deltas
 * Uses payload wrapper for streaming_event_handler compatibility
 * Uses 'text' to match existing streaming_event_types.ts format
 */
export interface AssistantDeltaEvent extends VybeAgentEventBase {
	type: 'assistant.delta';
	payload: {
		text: string;
	};
}

/**
 * Emitted for streaming thinking/reasoning deltas
 * Uses payload wrapper for streaming_event_handler compatibility
 * Uses 'delta' to match existing streaming_event_types.ts format
 */
export interface ThinkingDeltaEvent extends VybeAgentEventBase {
	type: 'thinking.delta';
	payload: {
		delta: string;
	};
}

/**
 * Emitted when the assistant's message is complete
 * Uses payload wrapper for streaming_event_handler compatibility
 */
export interface MessageCompleteEvent extends VybeAgentEventBase {
	type: 'message.complete';
	payload: {
		full_text?: string;
		thinking?: string;
		tool_calls?: ToolCall[];
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
		};
	};
}

// ============================================================================
// Task Events
// ============================================================================

/**
 * Emitted when the entire task is complete
 * Uses payload wrapper for streaming_event_handler compatibility
 */
export interface TaskCompleteEvent extends VybeAgentEventBase {
	type: 'task_complete';
	payload: {
		status: 'success' | 'failed' | 'cancelled';
		summary?: string;
	};
}

/**
 * Emitted when the agent changes phase
 * Uses payload wrapper for streaming_event_handler compatibility
 */
export interface AgentPhaseEvent extends VybeAgentEventBase {
	type: 'agent.phase';
	payload: {
		phase: AgentPhase;
		label?: string;
		visibility?: 'user' | 'debug' | 'dev';
	};
}

// ============================================================================
// Error Events
// ============================================================================

/**
 * Emitted when an error occurs
 * Uses payload wrapper for streaming_event_handler compatibility
 */
export interface ErrorEvent extends VybeAgentEventBase {
	type: 'error';
	payload: {
		message: string; // Changed from 'error' to 'message' to match StreamingErrorEvent
		code?: string;
		recoverable?: boolean;
		errorType?: 'network' | 'timeout' | 'bad_request' | 'crash' | 'unknown';
		canResume?: boolean;
		canRetry?: boolean;
		threadId?: string;
		originalMessage?: string;
	};
}

// ============================================================================
// TODO Events (LangChain Deep Agents TodoListMiddleware)
// ============================================================================

/**
 * Todo item structure
 */
export interface TodoItem {
	id: string;
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
	order?: number;
}

/**
 * Emitted when the agent creates or updates todos
 */
export interface TodoUpdateEvent extends VybeAgentEventBase {
	type: 'todo.update';
	payload: {
		todos: TodoItem[];
		toolCallId: string;
	};
}

/**
 * Emitted when the agent starts work on a todo
 */
export interface TodoItemStartedEvent extends VybeAgentEventBase {
	type: 'todo.item.started';
	payload: {
		todoId: string;
		todoText: string;
		toolCallId?: string;
	};
}

/**
 * Emitted when the agent completes a todo
 */
export interface TodoItemCompletedEvent extends VybeAgentEventBase {
	type: 'todo.item.completed';
	payload: {
		todoId: string;
		todoText: string;
		toolCallId?: string;
	};
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all possible agent events
 * This matches the StreamingEvent type from streaming_event_types.ts
 */
export type VybeAgentEvent =
	| ToolCallEvent
	| ToolResultEvent
	| AssistantDeltaEvent
	| ThinkingDeltaEvent
	| MessageCompleteEvent
	| TaskCompleteEvent
	| AgentPhaseEvent
	| ErrorEvent
	| TodoUpdateEvent
	| TodoItemStartedEvent
	| TodoItemCompletedEvent;

// ============================================================================
// Event Emitter Interface
// ============================================================================

/**
 * Interface for emitting agent events
 */
export interface IVybeAgentEventEmitter {
	/**
	 * Emit an agent event
	 */
	emit(event: VybeAgentEvent): void;

	/**
	 * Emit a tool call event
	 */
	emitToolCall(taskId: string, toolCall: ToolCall): void;

	/**
	 * Emit a tool result event
	 */
	emitToolResult(taskId: string, result: ToolResult): void;

	/**
	 * Emit an assistant content delta
	 */
	emitAssistantDelta(taskId: string, content: string): void;

	/**
	 * Emit a thinking content delta
	 */
	emitThinkingDelta(taskId: string, content: string): void;

	/**
	 * Emit a phase change
	 */
	emitPhase(taskId: string, phase: AgentPhase, visibility?: 'user' | 'debug'): void;

	/**
	 * Emit task completion
	 */
	emitTaskComplete(taskId: string, status: 'success' | 'failed' | 'cancelled', summary?: string): void;

	/**
	 * Emit an error
	 */
	emitError(taskId: string, error: string, code?: string, recoverable?: boolean): void;
}

// ============================================================================
// Event Factory Functions
// ============================================================================

/**
 * Create a tool.call event with payload wrapper
 */
export function createToolCallEvent(taskId: string, toolCall: ToolCall): ToolCallEvent {
	return {
		type: 'tool.call',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			tool_id: toolCall.id,
			tool_name: toolCall.name,
			arguments: toolCall.arguments
		}
	};
}

/**
 * Create a tool.result event with payload wrapper
 */
export function createToolResultEvent(taskId: string, result: ToolResult): ToolResultEvent {
	return {
		type: 'tool.result',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			tool_id: result.tool_id,
			tool_name: result.tool_name,
			result: result.result,
			error: result.error,
			execution_time_ms: result.execution_time_ms
		}
	};
}

/**
 * Create an assistant.delta event with payload wrapper
 */
export function createAssistantDeltaEvent(taskId: string, content: string): AssistantDeltaEvent {
	return {
		type: 'assistant.delta',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			text: content
		}
	};
}

/**
 * Create a thinking.delta event with payload wrapper
 */
export function createThinkingDeltaEvent(taskId: string, content: string): ThinkingDeltaEvent {
	return {
		type: 'thinking.delta',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			delta: content
		}
	};
}

/**
 * Create an agent.phase event with payload wrapper
 */
export function createAgentPhaseEvent(taskId: string, phase: AgentPhase, visibility: 'user' | 'debug' = 'user', label?: string): AgentPhaseEvent {
	return {
		type: 'agent.phase',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			phase,
			label,
			visibility
		}
	};
}

/**
 * Create a task_complete event with payload wrapper
 */
export function createTaskCompleteEvent(taskId: string, status: 'success' | 'failed' | 'cancelled', summary?: string): TaskCompleteEvent {
	return {
		type: 'task_complete',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			status,
			summary
		}
	};
}

/**
 * Create an error event with payload wrapper
 */
export function createErrorEvent(taskId: string, error: string, code?: string, recoverable?: boolean): ErrorEvent {
	return {
		type: 'error',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			message: error, // Changed from 'error' to 'message' to match StreamingErrorEvent
			code,
			recoverable
		}
	};
}

/**
 * Create a message.complete event with payload wrapper
 */
export function createMessageCompleteEvent(
	taskId: string,
	fullText?: string,
	thinking?: string,
	toolCalls?: ToolCall[],
	usage?: { input_tokens?: number; output_tokens?: number }
): MessageCompleteEvent {
	return {
		type: 'message.complete',
		task_id: taskId,
		timestamp: Date.now(),
		payload: {
			full_text: fullText,
			thinking,
			tool_calls: toolCalls,
			usage
		}
	};
}

