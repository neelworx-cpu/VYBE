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
	providerName: 'vLLM' | 'lmStudio';
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
	else if (providerName === 'vLLM') {
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
const rawToolCallObjOfParamsStr = (name: string, toolParamsStr: string, id: string): RawToolCallObj | null => {
	let input: unknown;
	try { input = JSON.parse(toolParamsStr); }
	catch (e) { return null; }

	if (input === null) return null;
	if (typeof input !== 'object') return null;

	const rawParams: RawToolParamsObj = input as Record<string, string | undefined>;
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true };
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
	};

	let fullReasoningSoFar = '';
	let fullTextSoFar = '';
	let toolName = '';
	let toolId = '';
	let toolParamsStr = '';

	openai.chat.completions
		.create(openAIOptions)
		.then(async (response: any) => {
			_setAborter(() => response.controller.abort());
			// when receive text
			for await (const chunk of response) {
				// message
				const newText = chunk.choices[0]?.delta?.content ?? '';
				fullTextSoFar += newText;

				// tool call
				for (const tool of chunk.choices[0]?.delta?.tool_calls ?? []) {
					const index = tool.index;
					if (index !== 0) continue;

					toolName += tool.function?.name ?? '';
					toolParamsStr += tool.function?.arguments ?? '';
					toolId += tool.id ?? '';
				}

				// call onText
				onText({
					fullText: fullTextSoFar,
					fullReasoning: fullReasoningSoFar,
					delta: newText,
					toolCall: !toolName ? undefined : { name: toolName, rawParams: {}, isDone: false, doneParams: [], id: toolId },
				});
			}
			// on final
			if (!fullTextSoFar && !fullReasoningSoFar && !toolName) {
				onError({ message: 'Vybe: Response from model was empty.', fullError: null });
			}
			else {
				const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId);
				const toolCallObj = toolCall ? { toolCall } : {};
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
	vLLM: {
		sendChat: (params: SendChatParams_Internal) => _sendOpenAICompatibleChat(params),
		list: (params: ModelListParams<OpenaiCompatibleModelResponse>) => _openaiCompatibleList({ ...params, providerName: 'vLLM' }),
	},
	lmStudio: {
		sendChat: (params: SendChatParams_Internal) => _sendOpenAICompatibleChat(params),
		list: (params: ModelListParams<OpenaiCompatibleModelResponse>) => _openaiCompatibleList({ ...params, providerName: 'lmStudio' }),
	},
};

