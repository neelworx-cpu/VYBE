/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Dev Commands
 * Dev-only commands for testing LLM integration
 */

import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IVybeLLMMessageService } from '../../common/vybeLLMMessageService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import type { VybeLLMProviderName } from '../../common/vybeLLMMessageTypes.js';

/**
 * Command to list models from a configured provider
 */
registerAction2(class VybeLLMListModelsAction extends Action2 {
	constructor() {
		super({
			id: 'vybe.llm.pingOrListModels',
			title: localize2('vybe.llm.pingOrListModels', 'List LLM Models'),
			f1: true, // Show in command palette
			category: Categories.Developer,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const llmService = accessor.get(IVybeLLMMessageService);
		const logService = accessor.get(ILogService);

		// Try Ollama first (most common local provider)
		const providerName: VybeLLMProviderName = 'ollama';
		logService.info(`[Vybe LLM] Listing models from ${providerName}...`);

		try {
			const models = await llmService.listModels(providerName);
			logService.info(`[Vybe LLM] Found ${models.length} models:`);
			models.forEach((model) => {
				if ('name' in model) {
					logService.info(`  - ${model.name}`);
				} else {
					logService.info(`  - ${model.id}`);
				}
			});
		} catch (error) {
			logService.error(`[Vybe LLM] Error listing models: ${error}`);
		}
	}
});

/**
 * Command to test streaming a response
 */
registerAction2(class VybeLLMStreamTestAction extends Action2 {
	constructor() {
		super({
			id: 'vybe.llm.streamTest',
			title: localize2('vybe.llm.streamTest', 'Test LLM Streaming'),
			f1: true, // Show in command palette
			category: Categories.Developer,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const llmService = accessor.get(IVybeLLMMessageService);
		const logService = accessor.get(ILogService);

		const providerName: VybeLLMProviderName = 'ollama';
		const modelName = 'llama2'; // Default test model

		logService.info(`[Vybe LLM] Testing stream from ${providerName}/${modelName}...`);

		let requestId: string | null = null;

		try {
			requestId = llmService.sendChat({
				messages: [
					{ role: 'user', content: 'Say "Hello, Vybe!" in exactly 5 words.' },
				],
				providerName,
				modelName,
				onText: (params) => {
					logService.info(`[Vybe LLM] Stream delta: "${params.delta || ''}"`);
				},
				onFinalMessage: async (params) => {
					logService.info(`[Vybe LLM] Final message: "${params.fullText}"`);
					if (params.fullReasoning) {
						logService.info(`[Vybe LLM] Reasoning: "${params.fullReasoning}"`);
					}
					if (params.toolCall) {
						logService.info(`[Vybe LLM] Tool call detected: ${params.toolCall.name}`);
					}
				},
				onError: (error) => {
					logService.error(`[Vybe LLM] Error: ${error.message}`);
				},
				onAbort: () => {
					logService.info(`[Vybe LLM] Aborted`);
				},
			});

			if (!requestId) {
				logService.error(`[Vybe LLM] Failed to start request`);
				return;
			}

			// Auto-abort after 10 seconds for testing
			setTimeout(() => {
				if (requestId) {
					logService.info(`[Vybe LLM] Auto-aborting after 10s...`);
					llmService.abort(requestId);
				}
			}, 10000);
		} catch (error) {
			logService.error(`[Vybe LLM] Error in stream test: ${error}`);
		}
	}
});

