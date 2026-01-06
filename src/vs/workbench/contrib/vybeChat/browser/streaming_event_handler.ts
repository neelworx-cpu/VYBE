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
	StreamingErrorEvent,
	BlockCreateEvent,
	BlockAppendEvent,
	BlockFinalizeEvent,
	MessageCompleteEvent,
	// New simplified events (Production Architecture)
	ThinkingDeltaEvent,
	ContentDeltaEvent,
	NewToolCallEvent,
	NewToolResultEvent
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
	private toolCalls: Map<string, { tool_name: string; arguments: Record<string, unknown> }> = new Map();
	private isFinalized: boolean = false;
	private onContentUpdate?: () => void;
	private finalizeTimeout: ReturnType<typeof setTimeout> | null = null;
	private finalFullText: string | null = null; // Store the authoritative full_text from assistant.final
	private usingBlockEvents: boolean = false; // Track if we're using the new block-based architecture


	constructor(messagePage: MessagePage, onContentUpdate?: () => void) {
		this.messagePage = messagePage;
		this.onContentUpdate = onContentUpdate;
	}

	/**
	 * Handle a streaming event
	 */
	handleEvent(event: StreamingEvent): void {
		// Debug: Log all incoming events
		if (event.type === 'thinking.delta' || event.type === 'content.delta' || event.type === 'message.complete') {
			console.log('[StreamingEventHandler] Event received:', event.type);
		}

		// Check for legacy events
		if (LEGACY_EVENT_TYPES.has(event.type)) {
			return;
		}

		// Once finalized, ignore all events (including deltas)
		// The full_text from assistant.final is authoritative - late deltas are duplicates/out-of-order
		if (this.isFinalized) {
			console.log('[StreamingEventHandler] Ignoring event after finalization:', event.type);
			return; // Ignore all events after finalization
		}

		// If we've received assistant.final (but not yet finalized), ignore deltas
		// The full_text from assistant.final is authoritative - late deltas are duplicates/out-of-order
		if (this.finalFullText !== null && event.type === 'assistant.delta') {
			return; // Ignore deltas after assistant.final (even before finalization timeout)
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
			case 'tool.call': {
				// Handle both legacy ToolCallEvent and new NewToolCallEvent
				const payload = event.payload as { tool_id?: string; id?: string; isDisplayTool?: boolean };
				if (payload.isDisplayTool !== undefined) {
					// New format with isDisplayTool
					this.handleNewToolCall(event as unknown as NewToolCallEvent);
				} else {
					// Legacy format with tool_id
					this.handleToolCall(event as ToolCallEvent);
				}
				break;
			}
			case 'tool.result': {
				// Handle both legacy ToolResultEvent and new NewToolResultEvent
				const payload = event.payload as { tool_id?: string; id?: string };
				if ('id' in payload && !('tool_id' in payload)) {
					// New format - convert to legacy for handler
					const newEvent = event as unknown as NewToolResultEvent;
					this.handleToolResult({
						type: 'tool.result',
						task_id: event.task_id,
						payload: {
							tool_id: newEvent.payload.id,
							result: newEvent.payload.result,
							error: newEvent.payload.error
						}
					});
				} else {
					// Legacy format
					this.handleToolResult(event as ToolResultEvent);
				}
				break;
			}
				case 'assistant.final':
					this.handleFinal(event);
					break;
				case 'error':
					this.handleError(event);
					break;
				case 'block.create':
					this.handleBlockCreate(event);
					break;
				case 'block.append':
					this.handleBlockAppend(event);
					break;
				case 'block.finalize':
					this.handleBlockFinalize(event);
					break;
			case 'message.complete': {
				// Handle both legacy MessageCompleteEvent and new NewMessageCompleteEvent
				// Both have the same semantics, just different payload shapes
				this.handleMessageComplete(event as MessageCompleteEvent);
				break;
			}
			// New simplified events (Production Architecture)
			case 'thinking.delta':
				this.handleNewThinkingDelta(event as ThinkingDeltaEvent);
				break;
			case 'content.delta':
				this.handleNewContentDelta(event as ContentDeltaEvent);
				break;
			default: {
				// Ignore unknown event types silently (agent_step_start/end are legacy events)
				// Only log if it's a streaming event we should handle
				const eventWithType = event as { type?: string };
				const eventType = eventWithType.type;
				if (eventType && (eventType.startsWith('assistant.') || eventType === 'error')) {
					console.warn('[StreamingEventHandler] Unhandled streaming event:', eventType);
				}
			}
		}
		} catch (error) {
			console.error('[StreamingEventHandler] Error handling event:', error, event);
		}
	}

	/**
	 * Handle assistant.delta - plain text streaming
	 * SIMPLIFIED: Just append delta directly to markdown part (no accumulation, no duplicate detection)
	 * The markdown part's internal dedupe logic will handle duplicates.
	 *
	 * CRITICAL: If we're waiting for finalization (finalizeTimeout is set), cancel it
	 * and reset it - we're still receiving deltas, so we shouldn't finalize yet.
	 * Also, if we're already finalized, we should NOT ignore deltas - they might be late-arriving.
	 */
	private handleAssistantDelta(event: AssistantDeltaEvent): void {
		// If using block events, skip legacy delta handling (block events handle content)
		if (this.usingBlockEvents) {
			return;
		}

		const text = event.payload?.text;
		if (!text || typeof text !== 'string') {
			return;
		}

		// CRITICAL: If we've received assistant.final, ignore all subsequent deltas
		// The full_text from assistant.final is authoritative - late deltas are duplicates/out-of-order
		if (this.finalFullText !== null) {
			console.log('[StreamingEventHandler] Ignoring delta after assistant.final', {
				deltaLength: text.length,
				finalFullTextLength: this.finalFullText.length
			});
			return; // Ignore late-arriving deltas after final
		}

		// If we have a pending finalization timeout, cancel it - we're still receiving deltas
		if (this.finalizeTimeout) {
			clearTimeout(this.finalizeTimeout);
			this.finalizeTimeout = null;
		}

		// Simple: append delta directly to markdown part
		// MessagePage will accumulate and update the markdown part
		this.messagePage.appendText(text);

		// Trigger scroll update (debounced by MessagePage/VybeChatViewPane)
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
	 * Legacy handler - skipped when using new block events
	 */
	private handleBlockStart(event: AssistantBlockStartEvent): void {
		// If using block events, skip legacy block handling
		if (this.usingBlockEvents) {
			return;
		}

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
	 * Legacy handler - skipped when using new block events
	 */
	private handleBlockDelta(event: AssistantBlockDeltaEvent): void {
		// If using block events, skip legacy block handling
		if (this.usingBlockEvents) {
			return;
		}

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
	 * Legacy handler - skipped when using new block events
	 */
	private handleBlockEnd(event: AssistantBlockEndEvent): void {
		// If using block events, skip legacy block handling
		if (this.usingBlockEvents) {
			return;
		}

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
	 * Handle agent.phase - update agent phase status or process Content Parts
	 */
	private handleAgentPhase(event: AgentPhaseEvent): void {
		const phase = event.payload.phase;
		const label = event.payload.label;
		const visibility = event.payload.visibility || 'debug';
		// context is not part of the standard AgentPhaseEvent type, but may be present in runtime
		const context = (event.payload as Record<string, unknown>).context as Record<string, unknown> | undefined;

		// When a new subtask starts, reset finalization state
		if (label === 'subtask.start') {
			this.isFinalized = false;
			this.finalFullText = null; // Reset final text for new subtask
		}

		// Phase 6: Handle Content Part events
		if (label === 'content_part' && context) {
			const partData = (context.data || context) as Record<string, unknown>;
			const kind = (context.kind || partData.kind) as string | undefined;
			const partId = (context.part_id || partData.id) as string | undefined;

			if (!kind || !partId) {
				console.warn('[StreamingEventHandler] Content Part event missing kind or id:', event);
				return;
			}

			// Extract Content Part data and add to message page
			// Type assertion needed since contentData is constructed dynamically from runtime context
			// that may not match the exact type structure
			const contentData = {
				kind: kind,
				id: partId,
				...partData,
				isStreaming: context.is_streaming ?? partData.isStreaming ?? false
			};

			// Add or update Content Part
			// Double assertion through unknown needed because contentData is constructed from runtime data
			this.messagePage.addContentPart(contentData as unknown as Parameters<typeof this.messagePage.addContentPart>[0]);

			// Trigger scroll update
			if (this.onContentUpdate) {
				this.onContentUpdate();
			}

			return;
		}

		// Only display if visibility is not 'dev'
		if (visibility === 'dev') {
			return;
		}

		// Update phase in message page (for non-Content Part events)
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
	 * SIMPLIFIED: Use full_text as authoritative source, replace accumulated content
	 * This ensures completeness regardless of delta issues
	 */
	private handleFinal(event: AssistantFinalEvent): void {
		// If using block events, skip content setting (block events already handled content)
		// Just mark as finalized
		if (this.usingBlockEvents) {
			this.isFinalized = true;
			this.messagePage.finalize();
			if (this.onContentUpdate) {
				this.onContentUpdate();
			}
			return;
		}

		const fullText = event.payload?.full_text || '';

		// CRITICAL: Ignore duplicate/older final events
		// If we're already finalized, ignore subsequent final events
		// If the new fullText is shorter than what we have, it's an older/duplicate event - ignore it
		if (this.isFinalized) {
			return;
		}

		// Get current accumulated content length to compare
		const currentAccumulated = this.messagePage.getAccumulatedMarkdown?.() || '';

		// CRITICAL: If we already have a final full_text, only accept longer ones
		// This prevents older/shorter final events from overwriting correct content
		if (this.finalFullText !== null) {
			if (fullText.length <= this.finalFullText.length) {
				return; // Ignore shorter/duplicate final events
			}
		}

		// Also check against accumulated content
		if (fullText.length < currentAccumulated.length) {
			return; // Ignore shorter/older final events
		}

		// Store the authoritative final full_text
		this.finalFullText = fullText;

		// Clear any existing timeout
		if (this.finalizeTimeout) {
			clearTimeout(this.finalizeTimeout);
		}

		// CRITICAL: Use full_text as the authoritative complete content
		// Only replace if full_text is different from accumulated content
		// This prevents unnecessary re-renders that cause code block flicker
		if (fullText && fullText.length > 0) {
			// DIAGNOSTIC: Log final content to debug vanishing content
			const hasCodeBlocks = fullText.includes('```');
			const accumulatedHasCodeBlocks = currentAccumulated.includes('```');
			console.log('[StreamingEventHandler] handleFinal - content check', {
				fullTextLength: fullText.length,
				accumulatedLength: currentAccumulated.length,
				fullTextHasCodeBlocks: hasCodeBlocks,
				accumulatedHasCodeBlocks: accumulatedHasCodeBlocks,
				preview: fullText.substring(0, 200)
			});

			// Check if we need to update (full_text might match what we already have)
			// Only call setMarkdownContent if the content actually changed
			// This prevents re-rendering code blocks unnecessarily
			this.messagePage.setMarkdownContentIfChanged(fullText);
		} else {
			console.warn('[StreamingEventHandler] handleFinal - empty fullText!', {
				fullTextLength: fullText?.length || 0,
				accumulatedLength: currentAccumulated.length
			});
		}

		// Debounce finalization: wait 200ms to allow late-arriving deltas
		// Since we use full_text as authoritative source, late deltas don't affect correctness
		// but we debounce to allow real-time streaming updates to complete
		this.finalizeTimeout = setTimeout(() => {
			if (!this.isFinalized) {
				// Finalize (markdown part has complete content from full_text)
				this.messagePage.finalize();

				// Mark as finalized
				this.isFinalized = true;

				// Trigger final scroll update
				if (this.onContentUpdate) {
					this.onContentUpdate();
				}
			}
			this.finalizeTimeout = null;
		}, 200); // 200ms debounce (sufficient since full_text is authoritative)
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
	 * Handle block.create - new block created
	 * Production architecture: Server tells us exactly what block to create
	 */
	private handleBlockCreate(event: BlockCreateEvent): void {
		// Mark that we're using block events - ignore legacy events
		this.usingBlockEvents = true;
		const block = event.payload.block;
		console.log('[StreamingEventHandler] block.create', { id: block.id, type: block.type, contentLength: block.content.length });
		this.messagePage.createBlock(block);
	}

	/**
	 * Handle block.append - append delta to existing block
	 * Production architecture: Server tells us which block to update
	 */
	private handleBlockAppend(event: BlockAppendEvent): void {
		// Don't log every append - too noisy
		this.messagePage.appendToBlock(event.payload.blockId, event.payload.delta);
	}

	/**
	 * Handle block.finalize - block is complete
	 * Production architecture: Server tells us block is done
	 */
	private handleBlockFinalize(event: BlockFinalizeEvent): void {
		console.log('[StreamingEventHandler] block.finalize', { blockId: event.payload.blockId, contentLength: event.payload.content.length });
		this.messagePage.finalizeBlock(event.payload.blockId, event.payload.content);
	}

	/**
	 * Handle message.complete - entire message is done
	 * Production architecture: Server signals completion
	 */
	private handleMessageComplete(event: MessageCompleteEvent): void {
		console.log('[StreamingEventHandler] message.complete received');
		this.messagePage.setComplete();
		this.isFinalized = true; // Mark as finalized to prevent further event processing
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	// =========================================================================
	// New Simplified Event Handlers (Production Architecture)
	// =========================================================================

	/**
	 * Handle thinking.delta - Ollama's native thinking field
	 * Renders in a collapsible thinking section
	 */
	private handleNewThinkingDelta(event: ThinkingDeltaEvent): void {
		const delta = event.payload?.delta;
		if (!delta || typeof delta !== 'string') {
			console.warn('[StreamingEventHandler] thinking.delta: invalid delta', event.payload);
			return;
		}

		// Append to thinking part
		this.messagePage.appendThinkingChunk(delta);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle content.delta - Ollama's native content field
	 * Renders as plain markdown (no code block extraction)
	 */
	private handleNewContentDelta(event: ContentDeltaEvent): void {
		const delta = event.payload?.delta;
		console.log('[StreamingEventHandler] content.delta received:', { hasPayload: !!event.payload, delta: delta?.substring(0, 50) });
		if (!delta || typeof delta !== 'string') {
			console.warn('[StreamingEventHandler] content.delta: invalid delta', event.payload);
			return;
		}

		// When first content.delta arrives, finalize thinking (if we have any)
		// This transitions thinking from "Thinking" → "Thought for Xs"
		if (!this.usingBlockEvents) {
			this.messagePage.finalizeThinking();
		}

		// Mark that we're using the new architecture (content has started)
		this.usingBlockEvents = true;

		// Append to markdown part (no parsing, just render)
		this.messagePage.appendText(delta);

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle new tool.call format with display tool detection
	 * Display tools render UI components directly, action tools show tool cards
	 */
	private handleNewToolCall(event: NewToolCallEvent): void {
		const { id, name, args, isDisplayTool } = event.payload;

		if (isDisplayTool) {
			// Display tools render UI directly
			switch (name) {
				case 'show_code':
					this.handleShowCode(id, args as { language: string; code: string; filename?: string; description?: string });
					break;
				case 'show_markdown':
					this.handleShowMarkdown(id, args as { content: string });
					break;
				case 'show_thinking':
					this.handleShowThinking(id, args as { content: string; title?: string });
					break;
				default:
					console.warn('[StreamingEventHandler] Unknown display tool:', name);
			}
		} else {
			// Action tools show tool card
			this.toolCalls.set(id, { tool_name: name, arguments: args });
			this.messagePage.addToolCall(id, name, args);
		}

		// Trigger scroll update
		if (this.onContentUpdate) {
			this.onContentUpdate();
		}
	}

	/**
	 * Handle show_code display tool - render code block
	 */
	private handleShowCode(toolId: string, args: { language: string; code: string; filename?: string; description?: string }): void {
		// Create a code block directly (no parsing needed)
		this.messagePage.addCodeBlockFromTool(toolId, args.language, args.code, args.filename, args.description);
	}

	/**
	 * Handle show_markdown display tool - render markdown block
	 */
	private handleShowMarkdown(toolId: string, args: { content: string }): void {
		// Append markdown content
		this.messagePage.appendText(args.content);
	}

	/**
	 * Handle show_thinking display tool - render thinking section
	 */
	private handleShowThinking(toolId: string, args: { content: string; title?: string }): void {
		// Add to thinking section
		this.messagePage.appendThinkingChunk(args.content);
	}

	/**
	 * Dispose handler and cleanup state
	 */
	dispose(): void {
		if (this.finalizeTimeout) {
			clearTimeout(this.finalizeTimeout);
			this.finalizeTimeout = null;
		}
		this.activeBlocks.clear();
		this.finalFullText = null; // Reset on dispose
		this.toolCalls.clear();
		this.isFinalized = false;
		this.usingBlockEvents = false;
	}
}

