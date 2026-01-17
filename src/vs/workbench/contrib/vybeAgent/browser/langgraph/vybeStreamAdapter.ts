/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Stream Adapter for LangGraph to VYBE Events
// Maps LangGraph stream events to existing VybeAgentEvent types
// Reference: https://docs.langchain.com/oss/javascript/langchain/agents#streaming

// Note: BaseMessage and AIMessage types from @langchain/core/messages
// We use inline types to avoid import restrictions

interface BaseMessage {
	content: string | unknown;
	role?: string;
	id?: string;
}

interface AIMessage extends BaseMessage {
	tool_calls?: Array<{
		id?: string;
		name: string;
		args: unknown;
	}>;
	additional_kwargs?: {
		thinking?: string;
	};
}

// =====================================================
// VYBE AGENT EVENT TYPES
// =====================================================
// These match the existing VYBE streaming event types

export type VybeAgentEventType =
	| 'text.delta'
	| 'text.complete'
	| 'thinking.delta'
	| 'thinking.complete'
	| 'tool.start'
	| 'tool.complete'
	| 'tool.interrupt'
	| 'tool.error'
	| 'message.start'
	| 'message.complete'
	| 'custom';

export interface VybeAgentEvent {
	type: VybeAgentEventType;
	data: unknown;
	timestamp?: number;
}

export interface TextDeltaEvent extends VybeAgentEvent {
	type: 'text.delta';
	data: {
		content: string;
		messageId?: string;
	};
}

export interface TextCompleteEvent extends VybeAgentEvent {
	type: 'text.complete';
	data: {
		content: string;
		messageId?: string;
	};
}

export interface ThinkingDeltaEvent extends VybeAgentEvent {
	type: 'thinking.delta';
	data: {
		content: string;
		messageId?: string;
	};
}

export interface ThinkingCompleteEvent extends VybeAgentEvent {
	type: 'thinking.complete';
	data: {
		content: string;
		duration?: number;
		messageId?: string;
	};
}

export interface ToolStartEvent extends VybeAgentEvent {
	type: 'tool.start';
	data: {
		toolName: string;
		toolCallId: string;
		args: unknown;
	};
}

export interface ToolCompleteEvent extends VybeAgentEvent {
	type: 'tool.complete';
	data: {
		toolName: string;
		toolCallId: string;
		result: unknown;
		success: boolean;
	};
}

export interface ToolInterruptEvent extends VybeAgentEvent {
	type: 'tool.interrupt';
	data: {
		toolName: string;
		toolCallId: string;
		args: unknown;
		allowedDecisions: string[];
		description: string;
	};
}

export interface ToolErrorEvent extends VybeAgentEvent {
	type: 'tool.error';
	data: {
		toolName: string;
		toolCallId: string;
		error: string;
	};
}

// =====================================================
// LANGGRAPH STREAM CHUNK TYPES
// =====================================================

export interface LangGraphStreamChunk {
	// Interrupt event
	__interrupt__?: {
		tool: string;
		toolCallId: string;
		args: unknown;
		allowedDecisions: string[];
		description: string;
	};

	// Messages update
	messages?: BaseMessage[];

	// State updates
	updates?: {
		tool_calls?: Array<{
			id: string;
			name: string;
			args: unknown;
		}>;
		tool_results?: Array<{
			id: string;
			name: string;
			result: unknown;
			success: boolean;
		}>;
	};

	// Custom events
	custom?: {
		type: string;
		data: unknown;
	};
}

// =====================================================
// STREAM ADAPTER
// =====================================================

/**
 * Adapts LangGraph stream chunks to VYBE agent events
 */
export async function* adaptLangGraphStream(
	stream: AsyncIterable<LangGraphStreamChunk>
): AsyncGenerator<VybeAgentEvent> {
	for await (const chunk of stream) {
		const events = convertChunkToEvents(chunk);
		for (const event of events) {
			yield event;
		}
	}
}

/**
 * Converts a single LangGraph chunk to VYBE events
 */
function convertChunkToEvents(chunk: LangGraphStreamChunk): VybeAgentEvent[] {
	const events: VybeAgentEvent[] = [];
	const timestamp = Date.now();

	// Handle interrupts (HITL)
	if (chunk.__interrupt__) {
		const interruptEvent: ToolInterruptEvent = {
			type: 'tool.interrupt',
			data: {
				toolName: chunk.__interrupt__.tool,
				toolCallId: chunk.__interrupt__.toolCallId,
				args: chunk.__interrupt__.args,
				allowedDecisions: chunk.__interrupt__.allowedDecisions,
				description: chunk.__interrupt__.description,
			},
			timestamp,
		};
		events.push(interruptEvent);
	}

	// Handle message updates (token streaming)
	if (chunk.messages) {
		for (const message of chunk.messages) {
			// Check if this is an AI/assistant message
			const msgRole = (message as BaseMessage).role;
			if (msgRole === 'assistant' || msgRole === 'ai') {
				const content = typeof message.content === 'string'
					? message.content
					: JSON.stringify(message.content);

				// Check if this is thinking content
				const aiMessage = message as AIMessage;
				if (aiMessage.additional_kwargs?.thinking) {
					const thinkingEvent: ThinkingDeltaEvent = {
						type: 'thinking.delta',
						data: {
							content: String(aiMessage.additional_kwargs.thinking),
							messageId: aiMessage.id,
						},
						timestamp,
					};
					events.push(thinkingEvent);
				}

				// Regular text content
				if (content) {
					const textEvent: TextDeltaEvent = {
						type: 'text.delta',
						data: {
							content,
							messageId: aiMessage.id,
						},
						timestamp,
					};
					events.push(textEvent);
				}

				// Tool calls
				if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
					for (const toolCall of aiMessage.tool_calls) {
						const toolStartEvent: ToolStartEvent = {
							type: 'tool.start',
							data: {
								toolName: toolCall.name,
								toolCallId: toolCall.id || 'unknown',
								args: toolCall.args,
							},
							timestamp,
						};
						events.push(toolStartEvent);
					}
				}
			}
		}
	}

	// Handle state updates
	if (chunk.updates) {
		// Tool calls starting
		if (chunk.updates.tool_calls) {
			for (const toolCall of chunk.updates.tool_calls) {
				const toolStartEvent: ToolStartEvent = {
					type: 'tool.start',
					data: {
						toolName: toolCall.name,
						toolCallId: toolCall.id,
						args: toolCall.args,
					},
					timestamp,
				};
				events.push(toolStartEvent);
			}
		}

		// Tool results
		if (chunk.updates.tool_results) {
			for (const result of chunk.updates.tool_results) {
				const toolCompleteEvent: ToolCompleteEvent = {
					type: 'tool.complete',
					data: {
						toolName: result.name,
						toolCallId: result.id,
						result: result.result,
						success: result.success,
					},
					timestamp,
				};
				events.push(toolCompleteEvent);
			}
		}
	}

	// Handle custom events
	if (chunk.custom) {
		events.push({
			type: 'custom',
			data: chunk.custom,
			timestamp,
		});
	}

	return events;
}

// =====================================================
// STREAM MODE CONFIGURATIONS
// =====================================================

/**
 * Available LangGraph stream modes
 */
export const STREAM_MODES = {
	// State deltas only (tool calls, results)
	UPDATES: 'updates' as const,

	// LLM tokens + metadata (for streaming text)
	MESSAGES: 'messages' as const,

	// User-defined events (progress indicators)
	CUSTOM: 'custom' as const,

	// Full state values at each step
	VALUES: 'values' as const,
};

export type StreamMode = typeof STREAM_MODES[keyof typeof STREAM_MODES];

/**
 * Recommended stream mode combinations for different use cases
 */
export const STREAM_MODE_PRESETS = {
	// Full streaming experience - text tokens + tool events
	FULL: [STREAM_MODES.MESSAGES, STREAM_MODES.UPDATES] as StreamMode[],

	// Minimal - just state updates
	MINIMAL: [STREAM_MODES.UPDATES] as StreamMode[],

	// Debug - everything including custom events
	DEBUG: [STREAM_MODES.VALUES, STREAM_MODES.MESSAGES, STREAM_MODES.UPDATES, STREAM_MODES.CUSTOM] as StreamMode[],
};

// =====================================================
// STREAM UTILITIES
// =====================================================

/**
 * Create a streaming response handler
 */
export function createStreamHandler(
	onEvent: (event: VybeAgentEvent) => void,
	onComplete?: () => void,
	onError?: (error: Error) => void
) {
	return async (stream: AsyncIterable<LangGraphStreamChunk>) => {
		try {
			for await (const event of adaptLangGraphStream(stream)) {
				onEvent(event);
			}
			onComplete?.();
		} catch (error) {
			onError?.(error instanceof Error ? error : new Error(String(error)));
		}
	};
}

/**
 * Buffer events for batch processing
 */
export class EventBuffer {
	private events: VybeAgentEvent[] = [];
	private flushTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private onFlush: (events: VybeAgentEvent[]) => void,
		private bufferMs: number = 50
	) { }

	add(event: VybeAgentEvent): void {
		this.events.push(event);

		if (!this.flushTimeout) {
			this.flushTimeout = setTimeout(() => this.flush(), this.bufferMs);
		}
	}

	flush(): void {
		if (this.flushTimeout) {
			clearTimeout(this.flushTimeout);
			this.flushTimeout = null;
		}

		if (this.events.length > 0) {
			this.onFlush([...this.events]);
			this.events = [];
		}
	}
}

