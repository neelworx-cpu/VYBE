/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Message Types
 * Type definitions for LLM message service
 * Matches Void's implementation: void/src/vs/workbench/contrib/void/common/sendLLMMessageTypes.ts
 */

// Import and re-export types from provider settings for convenience
import type { VybeLLMProviderName as _VybeLLMProviderName, VybeLLMProviderSettings as _VybeLLMProviderSettings } from './vybeLLMProviderSettings.js';
import { defaultVybeLLMProviderSettings } from './vybeLLMProviderSettings.js';

export type VybeLLMProviderName = _VybeLLMProviderName;
export type VybeLLMProviderSettings = _VybeLLMProviderSettings;
export { defaultVybeLLMProviderSettings };

export const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return error + '';
};

// OpenAI-compatible chat message format
export type VybeLLMChatMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_call_id?: string; // For tool messages
} | {
	role: 'assistant';
	content: string;
	tool_calls?: { type: 'function'; id: string; function: { name: string; arguments: string } }[];
};

// Tool call types
export type VybeToolCall = {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
};

export type RawToolParamsObj = {
	[paramName: string]: string | undefined;
};

export type RawToolCallObj = {
	name: string;
	rawParams: RawToolParamsObj | string; // Can be string during streaming
	paramDelta?: string; // NEW: Just the new characters this chunk (for streaming)
	doneParams: string[];
	id: string;
	isDone: boolean;
	index: number; // NEW: Track tool call index
};

// Callback types
export type OnText = (p: { fullText: string; fullReasoning: string; delta?: string; toolCall?: RawToolCallObj; toolCalls?: RawToolCallObj[] }) => void;
export type OnFinalMessage = (p: { fullText: string; fullReasoning: string; toolCall?: RawToolCallObj; toolCalls?: RawToolCallObj[]; anthropicReasoning: null; usage?: { inputTokens?: number; outputTokens?: number } }) => void;
export type OnError = (p: { message: string; fullError: Error | null }) => void;
export type OnAbort = () => void;
export type AbortRef = { current: (() => void) | null };

// Service-level params (browser side)
export type VybeSendChatParams = {
	messages: VybeLLMChatMessage[];
	providerName: VybeLLMProviderName;
	modelName: string;
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	onAbort: OnAbort;
	options?: {
		temperature?: number;
		maxTokens?: number;
	};
};

// Main process params (stripped of functions)
export type MainSendChatParams = Omit<VybeSendChatParams, 'onText' | 'onFinalMessage' | 'onError' | 'onAbort'> & {
	requestId: string;
	settingsOfProvider: VybeLLMProviderSettings;
};

// Internal params for main process (with callbacks)
export type SendChatParams = {
	messages: VybeLLMChatMessage[];
	providerName: VybeLLMProviderName;
	modelName: string;
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	abortRef: AbortRef;
	options?: {
		temperature?: number;
		maxTokens?: number;
	};
	settingsOfProvider: VybeLLMProviderSettings;
};

export type MainAbortParams = { requestId: string };

// Event params (with requestId)
export type EventOnTextParams = Parameters<OnText>[0] & { requestId: string };
export type EventOnFinalMessageParams = Parameters<OnFinalMessage>[0] & { requestId: string };
export type EventOnErrorParams = Parameters<OnError>[0] & { requestId: string };

// Model listing types
export interface OllamaModelDetails {
	parent_model: string;
	format: string;
	family: string;
	families: string[];
	parameter_size: string;
	quantization_level: string;
}

export type OllamaModelResponse = {
	name: string;
	modified_at: Date;
	size: number;
	digest: string;
	details: OllamaModelDetails;
	expires_at: Date;
	size_vram: number;
};

export type OpenaiCompatibleModelResponse = {
	id: string;
	created: number;
	object: 'model';
	owned_by: string;
};

export type VybeModel = OllamaModelResponse | OpenaiCompatibleModelResponse;

// Model list params
export type ModelListParams<ModelResponse> = {
	providerName: VybeLLMProviderName;
	settingsOfProvider: VybeLLMProviderSettings;
	onSuccess: (param: { models: ModelResponse[] }) => void;
	onError: (param: { error: string }) => void;
};

export type ServiceModelListParams<ModelResponse> = {
	providerName: VybeLLMProviderName;
	onSuccess: (param: { models: ModelResponse[] }) => void;
	onError: (param: { error: string }) => void;
};

export type MainModelListParams<ModelResponse> = Omit<ModelListParams<ModelResponse>, 'onSuccess' | 'onError'> & {
	requestId: string;
};

export type EventModelListOnSuccessParams<ModelResponse> = Parameters<ModelListParams<ModelResponse>['onSuccess']>[0] & { requestId: string };
export type EventModelListOnErrorParams<ModelResponse> = Parameters<ModelListParams<ModelResponse>['onError']>[0] & { requestId: string };

