/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVybeLLMMessageService } from '../../common/vybeLLMMessageService.js';
import { IVybeLLMModelService } from '../../common/vybeLLMModelService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

// PRODUCTION ARCHITECTURE: IPC streaming events removed
// The MCP server now owns all LLM communication and emits events directly.
// This tool is kept for non-chat IDE features (inline completions, quick actions)
// but no longer emits streaming events to the chat UI.

/**
 * Parse model_id to extract provider and model name
 * Formats:
 * - Local: "provider:modelName" (e.g., "ollama:kimi-k2-thinking")
 * - Cloud: "modelName" (e.g., "gemini-2.0-flash") - no prefix
 *
 * If modelId is not provided or invalid, throws an error (no fallback to non-existent models)
 */
function parseModelId(modelId?: string): { providerName: 'ollama' | 'lmStudio'; modelName: string } {
	if (!modelId) {
		throw new Error('model_id is required but was not provided. Please select a model in the UI.');
	}

	// Check if it's a cloud model (no provider prefix)
	// Cloud models: gemini-*, anthropic/claude-*, etc.
	if (!modelId.includes(':')) {
		// Cloud model - should be handled by MCP server's agent loop, not this local LLM tool
		// This tool (vybe.send_llm_message) only handles local models
		throw new Error(`Cloud model "${modelId}" cannot be used with local LLM service. Cloud models must be used via MCP agent loop (solve_task).`);
	}

	// Parse format: "provider:modelName" or "provider:modelName:tag"
	const parts = modelId.split(':');
	if (parts.length >= 2) {
		const provider = parts[0] as 'ollama' | 'lmStudio';
		// Join all parts after provider (handles models with colons in name like "ollama:model:tag")
		const modelName = parts.slice(1).join(':');

		if (provider === 'ollama' || provider === 'lmStudio') {
			return {
				providerName: provider,
				modelName: modelName
			};
		}
	}

	// Invalid format
	throw new Error(`Invalid model_id format: "${modelId}". Expected format: "provider:modelName" for local models (e.g., "ollama:kimi-k2-thinking"). Cloud models should use MCP agent loop.`);
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
		let lastFullText = ''; // Track previous fullText to calculate delta
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
				// ARCHITECTURAL FIX: Trust the delta provided by the LLM service
				// The LLM service (sendLLMMessage.impl.ts) ALWAYS provides delta correctly
				// Only calculate delta if it's truly missing (should never happen in normal flow)
				let textDelta = delta;
				if (!textDelta || textDelta.length === 0) {
					// Fallback: Calculate delta only if fullText extends lastFullText
					// This handles edge cases (retries, errors) where delta might be missing
					if (fullText && fullText.startsWith(lastFullText)) {
						textDelta = fullText.substring(lastFullText.length);
					} else {
						// fullText doesn't extend lastFullText - this is a reset/retry
						// Use fullText as delta (it's a replacement, not an append)
						textDelta = fullText;
						lastFullText = ''; // Reset tracking
					}
					lastFullText = fullText;
				} else {
					// Delta is provided - update lastFullText for consistency
					lastFullText = fullText;
				}

				fullContent = fullText;

				// Emit delta event if we have new content
				// CRITICAL: Only emit if textDelta has content (prevents empty/duplicate events)
				if (textDelta && textDelta.length > 0) {
					chunks.push({ type: 'text', text: textDelta });

					// PRODUCTION ARCHITECTURE: IPC streaming events removed
					// The MCP server now calls Ollama directly and emits events through
					// the proper stdout → IDE Main → IPC → Renderer channel.
					// This prevents the dual-path duplication issue.
				}
			},
			onFinalMessage: ({ fullText }: { fullText: string }) => {
				fullContent = fullText;

				// PRODUCTION ARCHITECTURE: IPC streaming events removed
				// The MCP server emits message.complete through the proper channel.
				// This tool just returns the result to the caller (for non-chat features).

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

