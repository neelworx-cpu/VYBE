/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * StreamingEventHandler - Centralized event handler for normalized MCP streaming events
 *
 * Phase 7: Manages streaming state per task_id and routes events to MessagePage rendering methods.
 * - No semantic interpretation
 * - Deterministic rendering
 * - Backwards compatible with legacy events
 */

import type {
	StreamingEvent,
	AssistantDeltaEvent,
	AssistantThinkingDeltaEvent,
	AssistantBlockStartEvent,
	AssistantBlockDeltaEvent,
	AssistantBlockEndEvent,
	ToolCallEvent,
	ToolResultEvent,
	AssistantFinalEvent,
	AgentPhaseEvent,
	StreamingErrorEvent
} from '../common/streaming_event_types.js';
import type { MessagePage } from './components/chatArea/messagePage.js';

/**
 * Legacy event types that should be ignored (replaced by normalized events)
 */
const LEGACY_EVENT_TYPES = new Set([
	'agent_thought',
	'partial_output',
	'codeblock_delta',
	'codeblock',
	'task_complete',
	'task_failed'
]);

/**
 * StreamingEventHandler - Routes normalized streaming events to MessagePage
 */
export class StreamingEventHandler {
	private messagePage: MessagePage;
	private activeBlocks: Map<string, { language: string; content: string }> = new Map();
	private accumulatedText: string = '';
	private toolCalls: Map<string, { tool_name: string; arguments: Record<string, unknown> }> = new Map();
	private isFinalized: boolean = false;
	private onContentUpdate?: () => void;

	constructor(messagePage: MessagePage, onContentUpdate?: () => void) {
		this.messagePage = messagePage;
		this.onContentUpdate = onContentUpdate;
	}

	/**
	 * Handle a streaming event
	 */
	handleEvent(event: StreamingEvent): void {
		// Check if event is finalized
		if (this.isFinalized) {
			console.debug('[StreamingEventHandler] Ignoring event after finalization:', event.type);
			return;
		}

		// Check for legacy events
		if (LEGACY_EVENT_TYPES.has(event.type)) {
			console.debug('[StreamingEventHandler] Ignoring legacy event:', event.type);
			return;
		}

		// Route to appropriate handler
		try {
			switch (event.type) {
				case 'assistant.delta':
					this.handleAssistantDelta(event);
					break;
				case 'assistant.thinking.delta':
					this.handleThinkingDelta(event);
					break;
				case 'assistant.block.start':
					this.handleBlockStart(event);
					break;
				case 'assistant.block.delta':
					this.handleBlockDelta(event);
					break;
				case 'assistant.block.end':
					this.handleBlockEnd(event);
					break;
				case 'agent.phase':
					this.handleAgentPhase(event);
					break;
				case 'tool.call':
					this.handleToolCall(event);
					break;
				case 'tool.result':
					this.handleToolResult(event);
					break;
				case 'assistant.final':
					this.handleFinal(event);
					break;
				case 'error':
					this.handleError(event);
					break;
				default:
					console.debug('[StreamingEventHandler] Unknown event type:', (event as any).type);
			}
		} catch (error) {
			console.error('[StreamingEventHandler] Error handling event:', error, event);
		}
	}

	/**
	 * Handle assistant.delta - plain text streaming
	 */
	private handleAssistantDelta(event: AssistantDeltaEvent): void {
		const text = event.payload.text;
		if (!text) {
			return;
		}

		// Accumulate text
		this.accumulatedText += text;

		// Append to message page
		this.messagePage.appendText(text);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle assistant.thinking.delta - thinking content streaming
	 */
	private handleThinkingDelta(event: AssistantThinkingDeltaEvent): void {
		const text = event.payload.text;
		if (!text) {
			return;
		}

		// Append thinking chunk (do NOT accumulate to accumulatedText)
		this.messagePage.appendThinkingChunk(text);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle assistant.block.start - start a new code block
	 */
	private handleBlockStart(event: AssistantBlockStartEvent): void {
		const blockId = event.payload.block_id;
		const language = event.payload.language || 'plaintext';

		// Create entry in activeBlocks Map
		this.activeBlocks.set(blockId, { language, content: '' });

		// Start code block in message page
		this.messagePage.startCodeBlock(blockId, language);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle assistant.block.delta - append text to existing code block
	 */
	private handleBlockDelta(event: AssistantBlockDeltaEvent): void {
		const blockId = event.payload.block_id;
		const text = event.payload.text;

		if (!text) {
			return;
		}

		// Verify block exists
		const block = this.activeBlocks.get(blockId);
		if (!block) {
			console.warn('[StreamingEventHandler] Block delta for unknown block_id:', blockId);
			return;
		}

		// Append to block's content
		block.content += text;

		// Append to message page
		this.messagePage.appendCodeBlock(blockId, text);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle assistant.block.end - finalize a code block
	 */
	private handleBlockEnd(event: AssistantBlockEndEvent): void {
		const blockId = event.payload.block_id;

		// Verify block exists
		const block = this.activeBlocks.get(blockId);
		if (!block) {
			console.warn('[StreamingEventHandler] Block end for unknown block_id:', blockId);
			return;
		}

		// End code block in message page
		this.messagePage.endCodeBlock(blockId);

		// Remove from activeBlocks Map
		this.activeBlocks.delete(blockId);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle agent.phase - update agent phase status
	 */
	private handleAgentPhase(event: AgentPhaseEvent): void {
		const phase = event.payload.phase;
		const label = event.payload.label;
		const visibility = event.payload.visibility || 'debug';

		// Only display if visibility is not 'dev'
		if (visibility === 'dev') {
			return;
		}

		// Update phase in message page
		this.messagePage.updatePhase(phase, label);
	}

	/**
	 * Handle tool.call - add a tool call card
	 */
	private handleToolCall(event: ToolCallEvent): void {
		const toolId = event.payload.tool_id;
		const toolName = event.payload.tool_name;
		const arguments_ = event.payload.arguments;

		// Store in toolCalls Map
		this.toolCalls.set(toolId, { tool_name: toolName, arguments: arguments_ });

		// Add tool call to message page
		this.messagePage.addToolCall(toolId, toolName, arguments_);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle tool.result - update tool call with result
	 */
	private handleToolResult(event: ToolResultEvent): void {
		const toolId = event.payload.tool_id;
		const result = event.payload.result;
		const error = event.payload.error;

		// Verify tool call exists
		if (!this.toolCalls.has(toolId)) {
			console.warn('[StreamingEventHandler] Tool result for unknown tool_id:', toolId);
			return;
		}

		// Update tool result in message page
		this.messagePage.updateToolResult(toolId, result, error);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle assistant.final - finalize message
	 */
	private handleFinal(event: AssistantFinalEvent): void {
		// Set finalized flag
		this.isFinalized = true;

		// Verify accumulated text matches full_text (log warning if mismatch, but don't fail)
		const fullText = event.payload.full_text;
		if (this.accumulatedText !== fullText) {
			console.warn('[StreamingEventHandler] Accumulated text mismatch:', {
				accumulated: this.accumulatedText.length,
				expected: fullText.length,
				diff: Math.abs(this.accumulatedText.length - fullText.length)
			});
		}

		// Finalize message page
		this.messagePage.finalize();

		// Cleanup: clear activeBlocks, toolCalls, reset state
		this.activeBlocks.clear();
		this.toolCalls.clear();

		// Trigger final scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle error - display error and finalize
	 */
	private handleError(event: StreamingErrorEvent): void {
		// Set finalized flag
		this.isFinalized = true;

		// Finalize any open blocks
		for (const blockId of this.activeBlocks.keys()) {
			this.messagePage.endCodeBlock(blockId);
		}

		// Show error in message page
		this.messagePage.showError(event.payload.message, event.payload.code);

		// Cleanup state
		this.activeBlocks.clear();
		this.toolCalls.clear();
	}

	/**
	 * Dispose handler and cleanup state
	 */
	dispose(): void {
		this.activeBlocks.clear();
		this.toolCalls.clear();
		this.isFinalized = false;
		this.accumulatedText = '';
	}
}

