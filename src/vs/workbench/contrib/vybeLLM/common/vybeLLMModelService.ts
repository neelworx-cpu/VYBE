/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Model Service
 * Aggregates models from all local LLM providers and provides unified model list
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IVybeLLMMessageService } from './vybeLLMMessageService.js';
import type { VybeLLMProviderName, OllamaModelResponse, OpenaiCompatibleModelResponse } from './vybeLLMMessageTypes.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface VybeModel {
	id: string; // Format: "provider:modelName" (e.g., "ollama:llama2")
	label: string; // Display name (e.g., "Llama 2")
	provider: VybeLLMProviderName;
	providerLabel: string; // "Ollama", "vLLM", "LM Studio"
	isLocal: boolean;
	hasThinking?: boolean; // For future reasoning support
}

export const IVybeLLMModelService = createDecorator<IVybeLLMModelService>('vybeLLMModelService');

export interface IVybeLLMModelService {
	readonly _serviceBrand: undefined;
	getAllModels(): Promise<VybeModel[]>;
	getModelsByProvider(provider: VybeLLMProviderName): Promise<VybeModel[]>;
	refreshModels(): Promise<void>;
	onDidModelsChange: Event<void>;
}

export class VybeLLMModelService extends Disposable implements IVybeLLMModelService {
	readonly _serviceBrand: undefined;

	private readonly _onDidModelsChange = this._register(new Emitter<void>());
	readonly onDidModelsChange: Event<void> = this._onDidModelsChange.event;

	private modelsCache: VybeModel[] = [];
	private isLoading = false;
	private lastRefreshTime: number = 0;
	private readonly CACHE_TTL_MS = 60000; // 1 minute cache

	constructor(
		@IVybeLLMMessageService private readonly llmService: IVybeLLMMessageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async getAllModels(): Promise<VybeModel[]> {
		// Return cached models if fresh
		const now = Date.now();
		if (this.modelsCache.length > 0 && (now - this.lastRefreshTime) < this.CACHE_TTL_MS && !this.isLoading) {
			this.logService.debug(`[VybeLLMModelService] Returning ${this.modelsCache.length} cached models`);
			return this.modelsCache;
		}

		// Refresh if cache is stale or empty
		this.logService.debug(`[VybeLLMModelService] Cache stale or empty, refreshing models...`);
		await this.refreshModels();
		this.logService.debug(`[VybeLLMModelService] Refresh complete, found ${this.modelsCache.length} models`);
		return this.modelsCache;
	}

	async getModelsByProvider(provider: VybeLLMProviderName): Promise<VybeModel[]> {
		const allModels = await this.getAllModels();
		return allModels.filter(model => model.provider === provider);
	}

	async refreshModels(force: boolean = false): Promise<void> {
		if (this.isLoading && !force) {
			return; // Already refreshing
		}

		if (force) {
			this.logService.info(`[VybeLLMModelService] Force refreshing models (clearing cache)...`);
			this.modelsCache = [];
			this.lastRefreshTime = 0;
		}

		this.isLoading = true;
		const allModels: VybeModel[] = [];

		// Fetch from each provider in parallel
		const providers: VybeLLMProviderName[] = ['ollama', 'lmStudio'];
		const fetchPromises = providers.map(async (provider) => {
			try {
				this.logService.debug(`[VybeLLMModelService] Fetching models from ${provider}...`);
				const models = await this.llmService.listModels(provider);
				this.logService.debug(`[VybeLLMModelService] Found ${models.length} models from ${provider}`);
				const vybeModels = models.map(model => this.convertToVybeModel(model, provider));
				allModels.push(...vybeModels);
			} catch (error) {
				// Log error at debug level (less noisy - provider might not be running)
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logService.debug(`[VybeLLMModelService] Failed to fetch models from ${provider}: ${errorMessage}`);
				// Provider offline or error - skip silently
				// Models from this provider just won't appear
			}
		});

		await Promise.allSettled(fetchPromises);

		this.modelsCache = allModels;
		this.lastRefreshTime = Date.now();
		this.isLoading = false;
		this.logService.info(`[VybeLLMModelService] Model refresh complete: ${allModels.length} total models (${allModels.filter(m => m.provider === 'ollama').length} from Ollama)`);
		this._onDidModelsChange.fire();
	}

	private convertToVybeModel(
		model: OllamaModelResponse | OpenaiCompatibleModelResponse,
		provider: VybeLLMProviderName
	): VybeModel {
		if ('name' in model) {
			// Ollama model - strip tag (e.g., "llama2:latest" -> "llama2")
			const modelName = model.name;
			const baseName = modelName.split(':')[0]; // Remove tag part
			return {
				id: `ollama:${modelName}`, // Keep full name with tag for ID (needed for API calls)
				label: baseName, // Show just base name in UI
				provider: 'ollama',
				providerLabel: 'Ollama',
				isLocal: true,
			};
		} else {
			// OpenAI-compatible model (LM Studio)
			const providerLabel = 'LM Studio';
			return {
				id: `${provider.toLowerCase()}:${model.id}`,
				label: model.id,
				provider,
				providerLabel,
				isLocal: true,
			};
		}
	}
}

