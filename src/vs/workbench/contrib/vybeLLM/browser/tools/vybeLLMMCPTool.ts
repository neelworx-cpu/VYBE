/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVybeLLMMessageService } from '../../common/vybeLLMMessageService.js';
import { IVybeLLMModelService } from '../../common/vybeLLMModelService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

const VYBE_LLM_SETTINGS_STORAGE_KEY = 'vybe.llm.settings';

/**
 * IDE resolves provider/model defaults from settings
 */
function getDefaultProviderAndModel(
    storageService: IStorageService
): { providerName: 'ollama' | 'vLLM' | 'lmStudio'; modelName: string } {
    // Read from storage or use defaults
    const stored = storageService.get(VYBE_LLM_SETTINGS_STORAGE_KEY, StorageScope.APPLICATION);
    if (stored) {
        try {
            // Use first available provider with first model
            // For now, default to Ollama with llama3.1
            return {
                providerName: 'ollama',
                modelName: 'llama3.1' // Default model
            };
        } catch {
            // Fall through to defaults
        }
    }

    // Defaults
    return {
        providerName: 'ollama',
        modelName: 'llama3.1'
    };
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
        // No provider/model in args - IDE resolves
        options?: { temperature?: number; maxTokens?: number };
        stream?: boolean;
    },
    token: CancellationToken
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    // IDE resolves defaults
    const { providerName, modelName } = getDefaultProviderAndModel(storageService);

    return new Promise((resolve, reject) => {
        const chunks: Array<{ type: 'text'; text: string }> = [];
        let fullContent = '';
        const startTime = Date.now();

        // Check cancellation
        if (token.isCancellationRequested) {
            reject(new Error('Request cancelled'));
            return;
        }

        console.log(`[vybeLLMMCPTool] Starting LLM call with provider: ${providerName}, model: ${modelName}`);

        const requestId = llmService.sendChat({
            messages: args.messages as any,
            providerName,
            modelName,
            onText: ({ fullText, delta }: { fullText: string; delta?: string }) => {
                fullContent = fullText;
                // Emit streaming chunks
                if (delta) {
                    chunks.push({ type: 'text', text: delta });
                }
            },
            onFinalMessage: ({ fullText }: { fullText: string }) => {
                const duration = Date.now() - startTime;
                console.log(`[vybeLLMMCPTool] LLM call completed in ${duration}ms, content length: ${fullText.length}`);
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
    args: { providerName?: 'ollama' | 'vLLM' | 'lmStudio' },
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

