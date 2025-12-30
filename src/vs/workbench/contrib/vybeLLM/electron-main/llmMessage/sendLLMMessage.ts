/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Message Orchestrator
 * Main process orchestrator for LLM requests
 * Matches Void's implementation: void/src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.ts
 */

import {
	SendChatParams,
	OnText,
	OnFinalMessage,
	OnError,
} from '../../common/vybeLLMMessageTypes.js';
import { sendLLMMessageToProviderImplementation } from './sendLLMMessage.impl.js';

export const sendLLMMessage = async ({
	messages,
	onText: onText_,
	onFinalMessage: onFinalMessage_,
	onError: onError_,
	abortRef: abortRef_,
	providerName,
	modelName,
	options,
	settingsOfProvider,
}: SendChatParams) => {
	let _aborter: (() => void) | null = null;
	let _setAborter = (fn: () => void) => { _aborter = fn; };
	let _didAbort = false;

	const onText: OnText = (params) => {
		if (_didAbort) return;
		onText_(params);
	};

	const onFinalMessage: OnFinalMessage = (params) => {
		if (_didAbort) return;
		onFinalMessage_(params);
	};

	const onError: OnError = ({ message: errorMessage, fullError }) => {
		if (_didAbort) return;

		// handle failed to fetch errors, which give 0 information by design
		if (errorMessage === 'TypeError: fetch failed')
			errorMessage = `Failed to fetch from ${providerName}. This likely means you specified the wrong endpoint in Vybe's settings, or your local model provider like Ollama is powered off.`;

		onError_({ message: errorMessage, fullError });
	};

	// we should NEVER call onAbort internally, only from the outside
	const onAbort = () => {
		try { _aborter?.(); } // aborter sometimes automatically throws an error
		catch (e) { }
		_didAbort = true;
	};
	abortRef_.current = onAbort;

	try {
		const implementation = sendLLMMessageToProviderImplementation[providerName as keyof typeof sendLLMMessageToProviderImplementation];
		if (!implementation) {
			onError({ message: `Error: Provider "${providerName}" not recognized.`, fullError: null });
			return;
		}
		const { sendChat } = implementation;
		await sendChat({
			messages,
			onText,
			onFinalMessage,
			onError,
			settingsOfProvider,
			modelName,
			options,
			_setAborter,
			providerName,
		});
		return;
	}
	catch (error) {
		if (error instanceof Error) { onError({ message: error + '', fullError: error }); }
		else { onError({ message: `Unexpected Error in sendLLMMessage: ${error}`, fullError: error }); }
	}
};

