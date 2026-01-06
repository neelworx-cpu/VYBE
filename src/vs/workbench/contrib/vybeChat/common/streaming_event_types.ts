/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Streaming event types (matches MCP contract)
 * IDE renders events only. No semantic interpretation.
 */

export type StreamingEvent =
  | AssistantDeltaEvent
  | AssistantThinkingDeltaEvent
  | AssistantBlockStartEvent
  | AssistantBlockDeltaEvent
  | AssistantBlockEndEvent
  | ToolCallEvent
  | ToolResultEvent
  | AssistantFinalEvent
  | AgentPhaseEvent
  | StreamingErrorEvent
  | BlockCreateEvent
  | BlockAppendEvent
  | BlockFinalizeEvent
  | MessageCompleteEvent
  // New simplified events (Production Architecture)
  | ThinkingDeltaEvent
  | ContentDeltaEvent
  | NewToolCallEvent
  | NewToolResultEvent
  | NewMessageCompleteEvent;

export interface AssistantDeltaEvent {
  type: 'assistant.delta';
  task_id: string;
  payload: {
    text: string; // Plain text token(s)
  };
}

export interface AssistantThinkingDeltaEvent {
  type: 'assistant.thinking.delta';
  task_id: string;
  payload: {
    text: string; // Thinking content token(s)
  };
}

export interface AssistantBlockStartEvent {
  type: 'assistant.block.start';
  task_id: string;
  payload: {
    block_id: string; // Unique ID for this block
    block_type: 'code' | 'markdown';
    language?: string; // For code blocks
  };
}

export interface AssistantBlockDeltaEvent {
  type: 'assistant.block.delta';
  task_id: string;
  payload: {
    block_id: string;
    text: string; // Content token(s) for this block
  };
}

export interface AssistantBlockEndEvent {
  type: 'assistant.block.end';
  task_id: string;
  payload: {
    block_id: string;
  };
}

export interface ToolCallEvent {
  type: 'tool.call';
  task_id: string;
  payload: {
    tool_id: string;
    tool_name: string;
    arguments: Record<string, unknown>; // Complete, parsed JSON
  };
}

export interface ToolResultEvent {
  type: 'tool.result';
  task_id: string;
  payload: {
    tool_id: string;
    result: unknown;
    error?: string;
  };
}

export interface AssistantFinalEvent {
  type: 'assistant.final';
  task_id: string;
  payload: {
    full_text: string; // Complete, reconciled text
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export interface AgentPhaseEvent {
  type: 'agent.phase';
  task_id: string;
  payload: {
    phase: 'planning' | 'acting' | 'reflecting' | 'finalizing';
    label?: string; // Short UI label, not chain-of-thought
    visibility?: 'dev' | 'debug' | 'user'; // Default: 'debug'
  };
}

export interface StreamingErrorEvent {
  type: 'error';
  task_id: string;
  payload: {
    message: string;
    code?: string;
  };
}

/**
 * Block-based event types (Production architecture)
 * These events represent structured content blocks, not raw markdown.
 */
export interface ContentBlock {
  id: string;
  type: 'text' | 'code' | 'thinking' | 'tool_call' | 'tool_result';
  content: string;
  isStreaming: boolean;
  language?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: 'pending' | 'running' | 'done' | 'error';
}

export interface BlockCreateEvent {
  type: 'block.create';
  task_id: string;
  payload: {
    block: ContentBlock;
  };
}

export interface BlockAppendEvent {
  type: 'block.append';
  task_id: string;
  payload: {
    blockId: string;
    delta: string;
  };
}

export interface BlockFinalizeEvent {
  type: 'block.finalize';
  task_id: string;
  payload: {
    blockId: string;
    content: string;
  };
}

export interface MessageCompleteEvent {
  type: 'message.complete';
  task_id: string;
  payload: {
    messageId: string;
  };
}

// ============================================================================
// New Simplified Events (Production Architecture)
// ============================================================================

/**
 * Thinking delta from Ollama's native thinking field
 */
export interface ThinkingDeltaEvent {
  type: 'thinking.delta';
  task_id: string;
  payload: {
    delta: string;
  };
}

/**
 * Content delta from Ollama's native content field
 */
export interface ContentDeltaEvent {
  type: 'content.delta';
  task_id: string;
  payload: {
    delta: string;
  };
}

/**
 * Tool call with display tool detection
 */
export interface NewToolCallEvent {
  type: 'tool.call';
  task_id: string;
  payload: {
    id: string;
    name: string;
    args: Record<string, unknown>;
    isDisplayTool: boolean;
  };
}

/**
 * Tool result
 */
export interface NewToolResultEvent {
  type: 'tool.result';
  task_id: string;
  payload: {
    id: string;
    result: unknown;
    error?: string;
  };
}

/**
 * New message complete event (empty payload)
 */
export interface NewMessageCompleteEvent {
  type: 'message.complete';
  task_id: string;
  payload: Record<string, never>;
}

/**
 * New error event
 */
export interface NewErrorEvent {
  type: 'error';
  task_id: string;
  payload: {
    message: string;
    code?: string;
  };
}



