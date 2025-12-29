/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Tool Handler Bridge
 *
 * Bridges stdio tool invocations to IDE services.
 * Maps `vybe.*` tool calls to appropriate IDE service methods.
 */

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IVybeLLMMessageService } from '../../../contrib/vybeLLM/common/vybeLLMMessageService.js';
import { IVybeLLMModelService } from '../../../contrib/vybeLLM/common/vybeLLMModelService.js';
import { VybeToolDefinition } from './vybeStdioToolHost.js';
import { handleVybeSendLLMMessage, handleVybeListModels, handleVybeAbortLLMRequest } from '../../../contrib/vybeLLM/browser/tools/vybeLLMMCPTool.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';

/**
 * Creates tool definitions that bridge to IDE services
 */
export class VybeToolHandlerBridge {
	constructor(
		private readonly llmService: IVybeLLMMessageService,
		private readonly modelService: IVybeLLMModelService,
		private readonly storageService: IStorageService
	) { }

	/**
	 * Create all tool definitions for stdio tool host
	 */
	public createToolDefinitions(): VybeToolDefinition[] {
		return [
			this.createSendLLMMessageTool(),
			this.createListModelsTool(),
			this.createAbortLLMRequestTool()
		];
	}

	/**
	 * Create vybe.send_llm_message tool
	 */
	private createSendLLMMessageTool(): VybeToolDefinition {
		return {
			name: 'vybe.send_llm_message',
			description: 'Send LLM message via IDE\'s LLM transport (Ollama, LM Studio). IDE resolves provider/model defaults.',
			inputSchema: {
				type: 'object',
				properties: {
					messages: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								role: { type: 'string' },
								content: { type: 'string' }
							},
							required: ['role', 'content']
						}
					},
					options: {
						type: 'object',
						properties: {
							temperature: { type: 'number' },
							maxTokens: { type: 'number' }
						}
					},
					stream: { type: 'boolean' }
				},
				required: ['messages']
			} as IJSONSchema,
			handler: async (params: unknown, token: CancellationToken) => {
				const args = params as {
					messages: Array<{ role: string; content: string }>;
					options?: { temperature?: number; maxTokens?: number };
					stream?: boolean;
				};
				return handleVybeSendLLMMessage(this.llmService, this.storageService, args, token);
			}
		};
	}

	/**
	 * Create vybe.list_models tool
	 */
	private createListModelsTool(): VybeToolDefinition {
		return {
			name: 'vybe.list_models',
			description: 'List available models from IDE\'s LLM providers (Ollama, LM Studio).',
			inputSchema: {
				type: 'object',
				properties: {
					providerName: {
						type: 'string',
						enum: ['ollama', 'vLLM', 'lmStudio']
					}
				}
			} as IJSONSchema,
			handler: async (params: unknown, token: CancellationToken) => {
				const args = params as { providerName?: 'ollama' | 'vLLM' | 'lmStudio' };
				return handleVybeListModels(this.modelService, args, token);
			}
		};
	}

	/**
	 * Create vybe.abort_llm_request tool
	 */
	private createAbortLLMRequestTool(): VybeToolDefinition {
		return {
			name: 'vybe.abort_llm_request',
			description: 'Abort an in-flight LLM request.',
			inputSchema: {
				type: 'object',
				properties: {
					requestId: {
						type: 'string',
						description: 'The request ID of the LLM request to abort'
					}
				},
				required: ['requestId']
			} as IJSONSchema,
			handler: async (params: unknown, token: CancellationToken) => {
				if (token.isCancellationRequested) {
					throw new Error('Request cancelled');
				}

				const args = params as { requestId: string };
				return handleVybeAbortLLMRequest(this.llmService, args, token);
			}
		};
	}
}

