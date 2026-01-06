/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Provider Implementations
 * Provider-specific implementations for local LLM providers
 * Matches Void's implementation: void/src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts
 */

import OpenAI, { ClientOptions } from 'openai';
import { Ollama } from 'ollama';
import {
	VybeLLMChatMessage,
	OnText,
	OnFinalMessage,
	OnError,
	RawToolCallObj,
	RawToolParamsObj,
	ModelListParams,
	OllamaModelResponse,
	OpenaiCompatibleModelResponse,
} from '../../common/vybeLLMMessageTypes.js';
import type { VybeLLMProviderName, VybeLLMProviderSettings } from '../../common/vybeLLMMessageTypes.js';
import { defaultVybeLLMProviderSettings } from '../../common/vybeLLMProviderSettings.js';

// Internal params for provider implementations
type SendChatParams_Internal = {
	messages: VybeLLMChatMessage[];
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	settingsOfProvider: VybeLLMProviderSettings;
	modelName: string;
	options?: {
		temperature?: number;
		maxTokens?: number;
	};
	_setAborter: (fn: () => void) => void;
	providerName: VybeLLMProviderName;
};

type ListParams_Internal_Ollama = {
	settingsOfProvider: VybeLLMProviderSettings;
	providerName: 'ollama';
	onSuccess: (param: { models: OllamaModelResponse[] }) => void;
	onError: (param: { error: string }) => void;
};

type ListParams_Internal_OpenAI = {
	settingsOfProvider: VybeLLMProviderSettings;
	providerName: 'lmStudio';
	onSuccess: (param: { models: OpenaiCompatibleModelResponse[] }) => void;
	onError: (param: { error: string }) => void;
};

// ------------ OPENAI-COMPATIBLE ------------

const newOpenAICompatibleSDK = async ({ settingsOfProvider, providerName }: { settingsOfProvider: VybeLLMProviderSettings; providerName: VybeLLMProviderName }) => {
	const commonPayloadOpts: ClientOptions = {
		dangerouslyAllowBrowser: true,
	};

	if (providerName === 'ollama') {
		const thisConfig = settingsOfProvider[providerName];
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts });
	}
	else if (providerName === 'lmStudio') {
		const thisConfig = settingsOfProvider[providerName];
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts });
	}
	else throw new Error(`Vybe providerName was invalid: ${providerName}.`);
};

// Convert LLM tool call to our tool format
const rawToolCallObjOfParamsStr = (name: string, toolParamsStr: string, id: string, index: number = 0): RawToolCallObj | null => {
	let input: unknown;
	try { input = JSON.parse(toolParamsStr); }
	catch (e) { return null; }

	if (input === null) return null;
	if (typeof input !== 'object') return null;

	const rawParams: RawToolParamsObj = input as Record<string, string | undefined>;
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true, index };
};

const invalidApiKeyMessage = (providerName: VybeLLMProviderName) => `Invalid ${providerName} API key.`;

const _sendOpenAICompatibleChat = async ({ messages, onText, onFinalMessage, onError, settingsOfProvider, modelName, options, _setAborter, providerName }: SendChatParams_Internal) => {
	const openai: OpenAI = await newOpenAICompatibleSDK({ providerName, settingsOfProvider });

	const openAIOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: modelName,
		messages: messages as any,
		stream: true,
		temperature: options?.temperature,
		max_tokens: options?.maxTokens,
		// NOTE: tools and tool_choice removed - they were only used for rendering tools (emit_markdown, etc.)
		// Real action tools (file ops, terminal, etc.) are handled separately via MCP tools
	};

	let fullReasoningSoFar = '';
	let fullTextSoFar = '';
	let toolName = '';
	let toolId = '';
	let toolParamsStr = '';

	// Track multiple tool calls by index (for action tools only - file ops, terminal, etc.)
	// Tool arguments must be complete, valid JSON - no partial parsing
	const toolCalls = new Map<number, { name: string; params: string; id: string }>();

	openai.chat.completions
		.create(openAIOptions)
		.then(async (response: any) => {
			_setAborter(() => response.controller.abort());
			// when receive text
			for await (const chunk of response) {
				const choice = chunk.choices[0];
				const deltaToolCalls = choice?.delta?.tool_calls ?? [];
				const deltaContent = choice?.delta?.content ?? '';

				// message
				const newText = deltaContent;
				fullTextSoFar += newText;

				// tool call - handle multiple tool calls by index
				// Accumulate tool call parameters (they arrive incrementally during streaming)
				for (const tool of deltaToolCalls) {
					const index = tool.index ?? 0;

					if (!toolCalls.has(index)) {
						toolCalls.set(index, { name: '', params: '', id: '' });
					}

					const toolCall = toolCalls.get(index)!;
					toolCall.name += tool.function?.name ?? '';
					toolCall.params += tool.function?.arguments ?? '';
					toolCall.id += tool.id ?? '';
				}

				// Build toolCalls array for onText callback
				// Only include tool calls with complete, valid JSON arguments
				const toolCallsArray: RawToolCallObj[] = [];
				for (const [index, tc] of toolCalls) {
					if (tc.name && tc.params) {
						// Try to parse params - only include if valid JSON
						try {
							const parsed = JSON.parse(tc.params);
							if (typeof parsed === 'object' && parsed !== null) {
								toolCallsArray.push({
									name: tc.name,
									rawParams: parsed as RawToolParamsObj,
									doneParams: Object.keys(parsed),
									id: tc.id,
									isDone: false, // Will be set to true on final message
									index
								});
							}
						} catch {
							// Params incomplete or invalid - skip for now, will be parsed on final message
							// NO partial parsing, NO regex extraction
						}
					}
				}

				// For backward compatibility, also set toolCall (first tool call)
				const firstToolCall = toolCallsArray.length > 0 ? toolCallsArray[0] : undefined;

				// call onText
				onText({
					fullText: fullTextSoFar,
					fullReasoning: fullReasoningSoFar,
					delta: newText,
					toolCall: firstToolCall, // Backward compatibility
					toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined, // NEW: Multiple tool calls
				});
			}
			// on final - parse all tool calls
			// Only parse tool calls with complete, valid JSON arguments
			const finalToolCalls: RawToolCallObj[] = [];
			for (const [index, tc] of toolCalls) {
				if (tc.name && tc.params) {
					const parsed = rawToolCallObjOfParamsStr(tc.name, tc.params, tc.id, index);
					if (parsed) {
						finalToolCalls.push({ ...parsed, isDone: true });
					}
					// If parsing fails, tool call is invalid - skip it (no partial parsing, no regex)
				}
			}

			// Also handle legacy single tool call for backward compatibility
			if (toolName && toolParamsStr && finalToolCalls.length === 0) {
				const legacyToolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId, 0);
				if (legacyToolCall) {
					finalToolCalls.push({ ...legacyToolCall, isDone: true });
				}
			}

			if (!fullTextSoFar && !fullReasoningSoFar && finalToolCalls.length === 0) {
				onError({ message: 'Vybe: Response from model was empty.', fullError: null });
			}
			else {
				const toolCallObj = finalToolCalls.length > 0 ? {
					toolCall: finalToolCalls[0], // Backward compatibility
					toolCalls: finalToolCalls // NEW: All tool calls
				} : {};
				onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning: null, ...toolCallObj });
			}
		})
		// when error/fail - this catches errors of both .create() and .then(for await)
		.catch((error: unknown) => {
			if (error instanceof OpenAI.APIError) {
				if (error.status === 401) {
					onError({ message: invalidApiKeyMessage(providerName), fullError: error });
				} else {
					onError({ message: error + '', fullError: error });
				}
			}
			else {
				onError({ message: error + '', fullError: error instanceof Error ? error : null });
			}
		});
};

// ------------ OLLAMA ------------

const newOllamaSDK = ({ endpoint }: { endpoint: string }) => {
	if (!endpoint) throw new Error(`Ollama Endpoint was empty (please enter ${defaultVybeLLMProviderSettings.ollama.endpoint} in Vybe if you want the default url).`);
	const ollama = new Ollama({ host: endpoint });
	return ollama;
};

const ollamaList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider }: ListParams_Internal_Ollama) => {
	const onSuccess = ({ models }: { models: OllamaModelResponse[] }) => {
		onSuccess_({ models });
	};
	const onError = ({ error }: { error: string }) => {
		onError_({ error });
	};
	try {
		const thisConfig = settingsOfProvider.ollama;
		const endpoint = thisConfig.endpoint || defaultVybeLLMProviderSettings.ollama.endpoint;
		console.log(`[Ollama] Attempting to list models from endpoint: ${endpoint}`);
		const ollama = newOllamaSDK({ endpoint });
		ollama.list()
			.then((response: any) => {
				const { models } = response;
				console.log(`[Ollama] Successfully listed ${models?.length || 0} models from ${endpoint}`);
				onSuccess({ models });
			})
			.catch((error: unknown) => {
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.error(`[Ollama] Failed to list models from ${endpoint}:`, errorMsg);
				// Provide more helpful error message
				if (errorMsg.includes('fetch failed') || errorMsg.includes('ECONNREFUSED')) {
					onError({ error: `Cannot connect to Ollama at ${endpoint}. Make sure Ollama is running (try: ollama serve)` });
				} else {
					onError({ error: errorMsg });
				}
			});
	}
	catch (error: unknown) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.error(`[Ollama] Error initializing Ollama client:`, errorMsg);
		onError({ error: errorMsg });
	}
};

// ------------ OPENAI-COMPATIBLE LIST ------------

const _openaiCompatibleList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider, providerName }: ListParams_Internal_OpenAI) => {
	const onSuccess = ({ models }: { models: OpenaiCompatibleModelResponse[] }) => {
		onSuccess_({ models });
	};
	const onError = ({ error }: { error: string }) => {
		onError_({ error });
	};
	try {
		const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider });
		openai.models.list()
			.then(async (response: any) => {
				const models: OpenaiCompatibleModelResponse[] = [];
				models.push(...response.data);
				while (response.hasNextPage()) {
					models.push(...(await response.getNextPage()).data);
				}
				onSuccess({ models });
			})
			.catch((error: unknown) => {
				onError({ error: error + '' });
			});
	}
	catch (error: unknown) {
		onError({ error: error + '' });
	}
};

// ------------ PROVIDER REGISTRY ------------

export const sendLLMMessageToProviderImplementation = {
	ollama: {
		sendChat: (params: SendChatParams_Internal) => _sendOpenAICompatibleChat(params),
		list: (params: ModelListParams<OllamaModelResponse>) => ollamaList({ ...params, providerName: 'ollama' }),
	},
	lmStudio: {
		sendChat: (params: SendChatParams_Internal) => _sendOpenAICompatibleChat(params),
		list: (params: ModelListParams<OpenaiCompatibleModelResponse>) => _openaiCompatibleList({ ...params, providerName: 'lmStudio' }),
	},
};

