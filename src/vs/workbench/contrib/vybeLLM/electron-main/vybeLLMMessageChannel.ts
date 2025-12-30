/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Message Channel
 * IPC channel for LLM communication between browser and main process
 * Matches Void's implementation: void/src/vs/workbench/contrib/void/electron-main/sendLLMMessageChannel.ts
 */

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import {
	EventOnTextParams,
	EventOnErrorParams,
	EventOnFinalMessageParams,
	MainSendChatParams,
	AbortRef,
	SendChatParams,
	MainAbortParams,
	ModelListParams,
	EventModelListOnSuccessParams,
	EventModelListOnErrorParams,
	OllamaModelResponse,
	OpenaiCompatibleModelResponse,
	MainModelListParams,
} from '../common/vybeLLMMessageTypes.js';
import { sendLLMMessage } from './llmMessage/sendLLMMessage.js';
import { sendLLMMessageToProviderImplementation } from './llmMessage/sendLLMMessage.impl.js';

export class VybeLLMMessageChannel implements IServerChannel {
	// sendChat emitters
	private readonly llmMessageEmitters = {
		onText: new Emitter<EventOnTextParams>(),
		onFinalMessage: new Emitter<EventOnFinalMessageParams>(),
		onError: new Emitter<EventOnErrorParams>(),
	};

	// aborters for above
	private readonly _infoOfRunningRequest: Record<string, { waitForSend: Promise<void> | undefined; abortRef: AbortRef }> = {};

	// list emitters
	private readonly listEmitters = {
		ollama: {
			success: new Emitter<EventModelListOnSuccessParams<OllamaModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<OllamaModelResponse>>(),
		},
		openaiCompat: {
			success: new Emitter<EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<OpenaiCompatibleModelResponse>>(),
		},
	} satisfies {
		[providerName in 'ollama' | 'openaiCompat']: {
			success: Emitter<EventModelListOnSuccessParams<any>>;
			error: Emitter<EventModelListOnErrorParams<any>>;
		}
	};

	constructor() { }

	// browser uses this to listen for changes
	listen(_: unknown, event: string): Event<any> {
		// text
		if (event === 'onText_sendLLMMessage') return this.llmMessageEmitters.onText.event;
		else if (event === 'onFinalMessage_sendLLMMessage') return this.llmMessageEmitters.onFinalMessage.event;
		else if (event === 'onError_sendLLMMessage') return this.llmMessageEmitters.onError.event;
		// list
		else if (event === 'onSuccess_list_ollama') return this.listEmitters.ollama.success.event;
		else if (event === 'onError_list_ollama') return this.listEmitters.ollama.error.event;
		else if (event === 'onSuccess_list_openAICompatible') return this.listEmitters.openaiCompat.success.event;
		else if (event === 'onError_list_openAICompatible') return this.listEmitters.openaiCompat.error.event;

		else throw new Error(`Event not found: ${event}`);
	}

	// browser uses this to call
	async call(_: unknown, command: string, params: any): Promise<any> {
		try {
			if (command === 'sendLLMMessage') {
				this._callSendLLMMessage(params);
			}
			else if (command === 'abort') {
				await this._callAbort(params);
			}
			else if (command === 'ollamaList') {
				this._callOllamaList(params);
			}
			else if (command === 'openAICompatibleList') {
				this._callOpenAICompatibleList(params);
			}
			else {
				throw new Error(`Vybe LLM: command "${command}" not recognized.`);
			}
		}
		catch (e) {
			// Error already handled by onError callback
		}
	}

	// the only place sendLLMMessage is actually called
	private _callSendLLMMessage(params: MainSendChatParams) {
		const { requestId } = params;

		if (!(requestId in this._infoOfRunningRequest))
			this._infoOfRunningRequest[requestId] = { waitForSend: undefined, abortRef: { current: null } };

		const mainThreadParams: SendChatParams = {
			...params,
			onText: (p) => {
				this.llmMessageEmitters.onText.fire({ requestId, ...p });
			},
			onFinalMessage: (p) => {
				this.llmMessageEmitters.onFinalMessage.fire({ requestId, ...p });
			},
			onError: (p) => {
				this.llmMessageEmitters.onError.fire({ requestId, ...p });
			},
			abortRef: this._infoOfRunningRequest[requestId].abortRef,
		};
		const p = sendLLMMessage(mainThreadParams);
		this._infoOfRunningRequest[requestId].waitForSend = p;
	}

	private async _callAbort(params: MainAbortParams) {
		const { requestId } = params;
		if (!(requestId in this._infoOfRunningRequest)) return;
		const { waitForSend, abortRef } = this._infoOfRunningRequest[requestId];
		await waitForSend; // wait for the send to finish so we know abortRef was set
		abortRef?.current?.();
		delete this._infoOfRunningRequest[requestId];
	}

	_callOllamaList = (params: MainModelListParams<OllamaModelResponse>) => {
		const { requestId } = params;
		const emitters = this.listEmitters.ollama;
		const mainThreadParams: ModelListParams<OllamaModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		};
		sendLLMMessageToProviderImplementation.ollama.list(mainThreadParams);
	};

	_callOpenAICompatibleList = (params: MainModelListParams<OpenaiCompatibleModelResponse>) => {
		const { requestId, providerName } = params;
		const emitters = this.listEmitters.openaiCompat;
		const mainThreadParams: ModelListParams<OpenaiCompatibleModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		};
		if (providerName === 'vLLM' || providerName === 'lmStudio') {
			const impl = sendLLMMessageToProviderImplementation[providerName as 'vLLM' | 'lmStudio'];
			impl.list(mainThreadParams);
		}
	};
}

