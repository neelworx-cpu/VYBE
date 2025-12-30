/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Message Service
 * Browser/renderer service for LLM communication
 * Matches Void's implementation: void/src/vs/workbench/contrib/void/common/sendLLMMessageService.ts
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import {
	VybeSendChatParams,
	EventOnTextParams,
	EventOnFinalMessageParams,
	EventOnErrorParams,
	MainSendChatParams,
	MainAbortParams,
	EventModelListOnSuccessParams,
	EventModelListOnErrorParams,
	MainModelListParams,
	OllamaModelResponse,
	OpenaiCompatibleModelResponse,
	VybeLLMProviderName,
	VybeLLMProviderSettings,
	defaultVybeLLMProviderSettings,
} from './vybeLLMMessageTypes.js';

export const IVybeLLMMessageService = createDecorator<IVybeLLMMessageService>('vybeLLMMessageService');

export interface IVybeLLMMessageService {
	readonly _serviceBrand: undefined;
	sendChat(params: VybeSendChatParams): string | null; // returns requestId
	abort(requestId: string): void;
	listModels(providerName: VybeLLMProviderName): Promise<OllamaModelResponse[] | OpenaiCompatibleModelResponse[]>;
}

const VYBE_LLM_SETTINGS_STORAGE_KEY = 'vybe.llm.providers';

export class VybeLLMMessageService extends Disposable implements IVybeLLMMessageService {
	readonly _serviceBrand: undefined;
	private readonly channel: IChannel;

	// sendChat hooks
	private readonly llmMessageHooks = {
		onText: {} as { [eventId: string]: ((params: EventOnTextParams) => void) },
		onFinalMessage: {} as { [eventId: string]: ((params: EventOnFinalMessageParams) => void) },
		onError: {} as { [eventId: string]: ((params: EventOnErrorParams) => void) },
		onAbort: {} as { [eventId: string]: (() => void) },
	};

	// list hooks
	private readonly listHooks = {
		ollama: {
			success: {} as { [eventId: string]: ((params: EventModelListOnSuccessParams<OllamaModelResponse>) => void) },
			error: {} as { [eventId: string]: ((params: EventModelListOnErrorParams<OllamaModelResponse>) => void) },
		},
		openAICompat: {
			success: {} as { [eventId: string]: ((params: EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>) => void) },
			error: {} as { [eventId: string]: ((params: EventModelListOnErrorParams<OpenaiCompatibleModelResponse>) => void) },
		},
	} satisfies {
		[providerName in 'ollama' | 'openAICompat']: {
			success: { [eventId: string]: ((params: EventModelListOnSuccessParams<any>) => void) };
			error: { [eventId: string]: ((params: EventModelListOnErrorParams<any>) => void) };
		}
	};

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.channel = this.mainProcessService.getChannel('vybe-channel-llmMessage');

		// Set up event listeners
		this._register((this.channel.listen('onText_sendLLMMessage') satisfies Event<EventOnTextParams>)(e => {
			this.llmMessageHooks.onText[e.requestId]?.(e);
		}));
		this._register((this.channel.listen('onFinalMessage_sendLLMMessage') satisfies Event<EventOnFinalMessageParams>)(e => {
			this.llmMessageHooks.onFinalMessage[e.requestId]?.(e);
			this._clearChannelHooks(e.requestId);
		}));
		this._register((this.channel.listen('onError_sendLLMMessage') satisfies Event<EventOnErrorParams>)(e => {
			this.llmMessageHooks.onError[e.requestId]?.(e);
			this._clearChannelHooks(e.requestId);
		}));

		// List event listeners
		this._register((this.channel.listen('onSuccess_list_ollama') satisfies Event<EventModelListOnSuccessParams<OllamaModelResponse>>)(e => {
			this.listHooks.ollama.success[e.requestId]?.(e);
		}));
		this._register((this.channel.listen('onError_list_ollama') satisfies Event<EventModelListOnErrorParams<OllamaModelResponse>>)(e => {
			this.listHooks.ollama.error[e.requestId]?.(e);
		}));
		this._register((this.channel.listen('onSuccess_list_openAICompatible') satisfies Event<EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>>)(e => {
			this.listHooks.openAICompat.success[e.requestId]?.(e);
		}));
		this._register((this.channel.listen('onError_list_openAICompatible') satisfies Event<EventModelListOnErrorParams<OpenaiCompatibleModelResponse>>)(e => {
			this.listHooks.openAICompat.error[e.requestId]?.(e);
		}));
	}

	private _getProviderSettings(): VybeLLMProviderSettings {
		const stored = this.storageService.get(VYBE_LLM_SETTINGS_STORAGE_KEY, StorageScope.APPLICATION);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<VybeLLMProviderSettings>;
				return {
					ollama: { ...defaultVybeLLMProviderSettings.ollama, ...parsed.ollama },
					vLLM: { ...defaultVybeLLMProviderSettings.vLLM, ...parsed.vLLM },
					lmStudio: { ...defaultVybeLLMProviderSettings.lmStudio, ...parsed.lmStudio },
				} as VybeLLMProviderSettings;
			} catch {
				// Fall through to defaults
			}
		}
		return defaultVybeLLMProviderSettings as VybeLLMProviderSettings;
	}

	sendChat(params: VybeSendChatParams): string | null {
		const { onText, onFinalMessage, onError, onAbort, ...proxyParams } = params;

		if (params.messages.length === 0) {
			const message = 'No messages detected.';
			onError({ message, fullError: null });
			return null;
		}

		const settingsOfProvider = this._getProviderSettings();

		const requestId = generateUuid();
		this.llmMessageHooks.onText[requestId] = onText;
		this.llmMessageHooks.onFinalMessage[requestId] = onFinalMessage;
		this.llmMessageHooks.onError[requestId] = onError;
		this.llmMessageHooks.onAbort[requestId] = onAbort;

		this.channel.call('sendLLMMessage', {
			...proxyParams,
			requestId,
			settingsOfProvider,
		} satisfies MainSendChatParams);

		return requestId;
	}

	abort(requestId: string): void {
		this.llmMessageHooks.onAbort[requestId]?.();
		this.channel.call('abort', { requestId } satisfies MainAbortParams);
		this._clearChannelHooks(requestId);
	}

	listModels(providerName: VybeLLMProviderName): Promise<OllamaModelResponse[] | OpenaiCompatibleModelResponse[]> {
		return new Promise((resolve, reject) => {
			const settingsOfProvider = this._getProviderSettings();
			const requestId = generateUuid();

			if (providerName === 'ollama') {
				this.listHooks.ollama.success[requestId] = (e) => {
					resolve(e.models as OllamaModelResponse[]);
					this._clearListHooks(requestId);
				};
				this.listHooks.ollama.error[requestId] = (e) => {
					reject(new Error(e.error));
					this._clearListHooks(requestId);
				};

				this.channel.call('ollamaList', {
					settingsOfProvider,
					providerName: 'ollama',
					requestId,
				} satisfies MainModelListParams<OllamaModelResponse>);
			} else {
				// vLLM or lmStudio - use OpenAI-compatible
				this.listHooks.openAICompat.success[requestId] = (e) => {
					resolve(e.models as OpenaiCompatibleModelResponse[]);
					this._clearListHooks(requestId);
				};
				this.listHooks.openAICompat.error[requestId] = (e) => {
					reject(new Error(e.error));
					this._clearListHooks(requestId);
				};

				this.channel.call('openAICompatibleList', {
					settingsOfProvider,
					providerName,
					requestId,
				} satisfies MainModelListParams<OpenaiCompatibleModelResponse>);
			}
		});
	}

	private _clearChannelHooks(requestId: string): void {
		delete this.llmMessageHooks.onText[requestId];
		delete this.llmMessageHooks.onFinalMessage[requestId];
		delete this.llmMessageHooks.onError[requestId];
		delete this.llmMessageHooks.onAbort[requestId];
		this._clearListHooks(requestId);
	}

	private _clearListHooks(requestId: string): void {
		delete this.listHooks.ollama.success[requestId];
		delete this.listHooks.ollama.error[requestId];
		delete this.listHooks.openAICompat.success[requestId];
		delete this.listHooks.openAICompat.error[requestId];
	}
}

