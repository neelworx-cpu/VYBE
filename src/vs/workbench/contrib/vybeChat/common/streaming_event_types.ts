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
  | StreamingErrorEvent;

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

