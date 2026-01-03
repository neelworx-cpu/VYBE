/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVybeLLMMessageService } from '../../common/vybeLLMMessageService.js';
import { IVybeLLMModelService } from '../../common/vybeLLMModelService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

/**
 * Parse model_id to extract provider and model name
 * Format: "provider:modelName" (e.g., "ollama:kimi-k2-thinking:cloud")
 *
 * If modelId is not provided or invalid, throws an error (no fallback to non-existent models)
 */
function parseModelId(modelId?: string): { providerName: 'ollama' | 'lmStudio'; modelName: string } {
	if (!modelId) {
		throw new Error('model_id is required but was not provided. Please select a model in the UI.');
	}

	// Parse format: "provider:modelName" or "provider:modelName:variant"
	const parts = modelId.split(':');
	if (parts.length >= 2) {
		const provider = parts[0] as 'ollama' | 'lmStudio';
		const modelName = parts.slice(1).join(':'); // Handle models with colons in name

		if (provider === 'ollama' || provider === 'lmStudio') {
			return {
				providerName: provider,
				modelName: modelName
			};
		}
	}

	// Invalid format
	throw new Error(`Invalid model_id format: "${modelId}". Expected format: "provider:modelName" (e.g., "ollama:kimi-k2-thinking:cloud")`);
}

/**
 * Handle vybe.send_llm_message MCP tool call
 * IDE resolves provider/model defaults
 */
export async function handleVybeSendLLMMessage(
	llmService: IVybeLLMMessageService,
	storageService: IStorageService,
	args: {
		messages: Array<{ role: string; content: string }>;
		options?: { temperature?: number; maxTokens?: number };
		stream?: boolean;
		task_id?: string; // Task ID for real-time event emission
		model_id?: string; // Selected model ID (format: "provider:modelName")
	},
	token: CancellationToken
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	// Debug: Log received args
	console.log(`[vybeLLMMCPTool] Received args:`, {
		messagesCount: args.messages?.length || 0,
		task_id: args.task_id || 'none',
		model_id: args.model_id || 'none',
		stream: args.stream
	});

	// Parse model_id to get provider and model name
	let providerName: 'ollama' | 'lmStudio';
	let modelName: string;
	try {
		const parsed = parseModelId(args.model_id);
		providerName = parsed.providerName;
		modelName = parsed.modelName;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[vybeLLMMCPTool] Failed to parse model_id:`, errorMessage);
		console.error(`[vybeLLMMCPTool] model_id value:`, args.model_id);
		return Promise.reject(new Error(`Model selection error: ${errorMessage}. Please select a model in the UI.`));
	}

	return new Promise((resolve, reject) => {
		const chunks: Array<{ type: 'text'; text: string }> = [];
		let fullContent = '';
		const startTime = Date.now();
		const taskId = args.task_id;

		// Check cancellation
		if (token.isCancellationRequested) {
			reject(new Error('Request cancelled'));
			return;
		}

		console.log(`[vybeLLMMCPTool] Starting LLM call with provider: ${providerName}, model: ${modelName}, task_id: ${taskId || 'none'}`);

		const requestId = llmService.sendChat({
			messages: args.messages as any,
			providerName,
			modelName,
			onText: ({ fullText, delta }: {
				fullText: string;
				delta?: string;
			}) => {
				fullContent = fullText;
				// Collect text chunks for return value
				if (delta) {
					chunks.push({ type: 'text', text: delta });
				}
			},
			onFinalMessage: ({ fullText }: { fullText: string }) => {
				fullContent = fullText;
				// Return all chunks
				resolve({
					content: chunks.length > 0 ? chunks : [{ type: 'text', text: fullContent }]
				});
			},
			onError: ({ message }: { message: string }) => {
				const duration = Date.now() - startTime;
				console.error(`[vybeLLMMCPTool] LLM call failed after ${duration}ms:`, message);
				reject(new Error(message));
			},
			onAbort: () => {
				const duration = Date.now() - startTime;
				console.warn(`[vybeLLMMCPTool] LLM call aborted after ${duration}ms`);
				reject(new Error('Request aborted'));
			},
			options: args.options
		});

		// Handle cancellation
		token.onCancellationRequested(() => {
			if (requestId) {
				llmService.abort(requestId);
			}
			reject(new Error('Request cancelled'));
		});
	});
}

/**
 * Handle vybe.list_models MCP tool call
 */
export async function handleVybeListModels(
	modelService: IVybeLLMModelService,
	args: { providerName?: 'ollama' | 'lmStudio' },
	token: CancellationToken
): Promise<{ content: Array<{ type: 'text'; data: { models: Array<{ id: string; label: string; provider: string }> } }> }> {
	if (token.isCancellationRequested) {
		throw new Error('Request cancelled');
	}

	const allModels = await modelService.getAllModels();

	let filtered = allModels;
	if (args.providerName) {
		filtered = allModels.filter((m: { provider: string }) => m.provider === args.providerName);
	}

	return {
		content: [{
			type: 'text',
			data: {
				models: filtered.map((m: { id: string; label: string; provider: string }) => ({
					id: m.id,
					label: m.label,
					provider: m.provider
				}))
			}
		}]
	};
}

/**
 * Handle vybe.abort_llm_request MCP tool call
 */
export async function handleVybeAbortLLMRequest(
	llmService: IVybeLLMMessageService,
	args: { requestId: string },
	token: CancellationToken
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (token.isCancellationRequested) {
		throw new Error('Request cancelled');
	}

	try {
		llmService.abort(args.requestId);
		return {
			content: [{
				type: 'text',
				text: JSON.stringify({ success: true, message: 'Request aborted' })
			}]
		};
	} catch (error) {
		return {
			content: [{
				type: 'text',
				text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) })
			}]
		};
	}
}

