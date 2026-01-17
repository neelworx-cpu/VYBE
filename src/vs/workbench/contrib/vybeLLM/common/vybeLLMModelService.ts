/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Model Service
 * Aggregates models from frontier cloud providers and provides unified model list
 *
 * Supported providers: Gemini, OpenAI, Anthropic, Azure (via LangChain)
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
// Provider names for all supported LLM providers (frontier cloud models only)
export type VybeProviderName = 'gemini' | 'openai' | 'anthropic' | 'azure';

// Storage key for enabled models
const ENABLED_MODELS_STORAGE_KEY = 'vybe.llm.enabledModels';

// ============================================================================
// STATIC CLOUD MODELS - Curated list of cloud models
// LangGraph calls providers directly via @langchain/* packages
// ============================================================================
const STATIC_CLOUD_MODELS: Array<{
	id: string;
	label: string;
	provider: VybeProviderName;
	providerLabel: string;
	description: string;
	hasThinking: boolean;
}> = [
		// Gemini Models - via @langchain/google-genai
		// Gemini 2.5 (dynamic reasoning)
		{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', providerLabel: 'Gemini', description: 'Powerful, medium cost, heavy tasks.', hasThinking: true },
		{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', providerLabel: 'Gemini', description: 'Fast, low cost, simple tasks.', hasThinking: false },
		// Gemini 3 Pro variants
		{ id: 'gemini-3-pro-preview-high', label: 'Gemini 3 Pro High', provider: 'gemini', providerLabel: 'Gemini', description: "Google's latest flagship model, great for daily use.", hasThinking: true },
		{ id: 'gemini-3-pro-preview-low', label: 'Gemini 3 Pro Low', provider: 'gemini', providerLabel: 'Gemini', description: "Google's latest flagship model, great for daily use.", hasThinking: true },
		// Gemini 3 Flash variants
		{ id: 'gemini-3-flash-preview-high', label: 'Gemini 3 Flash High', provider: 'gemini', providerLabel: 'Gemini', description: "Google's latest flagship model, great for daily use.", hasThinking: true },
		{ id: 'gemini-3-flash-preview-medium', label: 'Gemini 3 Flash Medium', provider: 'gemini', providerLabel: 'Gemini', description: "Google's latest flagship model, great for daily use.", hasThinking: true },
		{ id: 'gemini-3-flash-preview-low', label: 'Gemini 3 Flash Low', provider: 'gemini', providerLabel: 'Gemini', description: "Google's latest flagship model, great for daily use.", hasThinking: true },

		// Azure OpenAI Models (via @langchain/openai AzureChatOpenAI)
		{ id: 'azure/gpt-5.2', label: 'GPT-5.2 (Azure)', provider: 'azure', providerLabel: 'Azure OpenAI', description: 'Latest GPT-5.2 model', hasThinking: false },
		{ id: 'azure/gpt-5.1', label: 'GPT-5.1 (Azure)', provider: 'azure', providerLabel: 'Azure OpenAI', description: 'GPT-5.1 model', hasThinking: false },

		// OpenAI Direct API Models (via @langchain/openai ChatOpenAI)
		// GPT 5.2 variants (supports xhigh)
		{ id: 'openai/gpt-5.2-xhigh', label: 'GPT 5.2 XHigh', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		{ id: 'openai/gpt-5.2-high', label: 'GPT 5.2 High', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		{ id: 'openai/gpt-5.2-medium', label: 'GPT 5.2 Medium', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		{ id: 'openai/gpt-5.2-low', label: 'GPT 5.2 Low', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's latest flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		// GPT 5.1 variants (no xhigh)
		{ id: 'openai/gpt-5.1-high', label: 'GPT 5.1 High', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		{ id: 'openai/gpt-5.1-medium', label: 'GPT 5.1 Medium', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		{ id: 'openai/gpt-5.1-low', label: 'GPT 5.1 Low', provider: 'openai', providerLabel: 'OpenAI', description: "OpenAI's flagship model. Good for planning, debugging, coding and more.", hasThinking: true },
		// Legacy models (keep for compatibility)
		{ id: 'openai/o3', label: 'o3', provider: 'openai', providerLabel: 'OpenAI', description: 'Advanced reasoning model', hasThinking: true },
		{ id: 'openai/o3-mini', label: 'o3-mini', provider: 'openai', providerLabel: 'OpenAI', description: 'Fast reasoning model', hasThinking: true },
		{ id: 'openai/codex-5.1-max', label: 'Codex 5.1 Max', provider: 'openai', providerLabel: 'OpenAI', description: 'Maximum capability code model', hasThinking: false },
		{ id: 'openai/codex-5.1', label: 'Codex 5.1', provider: 'openai', providerLabel: 'OpenAI', description: 'Advanced code generation', hasThinking: false },
		{ id: 'openai/codex-5.1-mini', label: 'Codex 5.1 Mini', provider: 'openai', providerLabel: 'OpenAI', description: 'Fast code model', hasThinking: false },

		// Anthropic Claude 4.5 Models (via @langchain/anthropic ChatAnthropic)
		// Opus 4.5 - Regular (high effort, no thinking)
		{ id: 'anthropic/claude-opus-4.5', label: 'Opus 4.5', provider: 'anthropic', providerLabel: 'Anthropic', description: "Anthropic's smartest model, great for difficult tasks (high effort)", hasThinking: false },
		// Opus 4.5 - Thinking (high effort with extended thinking)
		{ id: 'anthropic/claude-opus-4.5-thinking', label: 'Opus 4.5 (Thinking)', provider: 'anthropic', providerLabel: 'Anthropic', description: "Anthropic's smartest model with extended thinking (high effort)", hasThinking: true },
		// Sonnet 4.5 - Regular (high effort, no thinking)
		{ id: 'anthropic/claude-sonnet-4.5', label: 'Sonnet 4.5', provider: 'anthropic', providerLabel: 'Anthropic', description: "Anthropic's latest model, great for daily use (high effort)", hasThinking: false },
		// Sonnet 4.5 - Thinking (high effort with extended thinking)
		{ id: 'anthropic/claude-sonnet-4.5-thinking', label: 'Sonnet 4.5 (Thinking)', provider: 'anthropic', providerLabel: 'Anthropic', description: "Anthropic's latest model with extended thinking (high effort)", hasThinking: true },
		// Haiku 4.5 - Regular (high effort, no thinking)
		{ id: 'anthropic/claude-haiku-4.5', label: 'Haiku 4.5', provider: 'anthropic', providerLabel: 'Anthropic', description: "Anthropic's lightest model, cheaper and faster (high effort)", hasThinking: false },
		// Haiku 4.5 - Thinking (high effort with extended thinking)
		{ id: 'anthropic/claude-haiku-4.5-thinking', label: 'Haiku 4.5 (Thinking)', provider: 'anthropic', providerLabel: 'Anthropic', description: "Anthropic's lightest model with extended thinking (high effort)", hasThinking: true },
	];

export interface VybeModel {
	id: string; // Format: "provider:modelName" (e.g., "gemini-2.5-pro", "openai/gpt-5.2")
	label: string; // Display name (e.g., "Gemini 2.5 Pro", "GPT-5.2")
	provider: VybeProviderName;
	providerLabel: string; // "Gemini", "OpenAI", "Anthropic", "Azure"
	isLocal: boolean; // Always false for frontier cloud models
	hasThinking?: boolean; // For reasoning support
	description?: string;
	enabled: boolean; // Can be enabled/disabled in settings
}

export const IVybeLLMModelService = createDecorator<IVybeLLMModelService>('vybeLLMModelService');

export interface IVybeLLMModelService {
	readonly _serviceBrand: undefined;
	getAllModels(): Promise<VybeModel[]>;
	getEnabledModels(): Promise<VybeModel[]>;
	getModelsByProvider(provider: VybeProviderName): Promise<VybeModel[]>;
	setModelEnabled(modelId: string, enabled: boolean): void;
	refreshModels(): Promise<void>;
	onDidModelsChange: Event<void>;
}

export class VybeLLMModelService extends Disposable implements IVybeLLMModelService {
	readonly _serviceBrand: undefined;

	private readonly _onDidModelsChange = this._register(new Emitter<void>());
	readonly onDidModelsChange: Event<void> = this._onDidModelsChange.event;

	private modelsCache: VybeModel[] = [];
	private enabledModels: Set<string> = new Set();
	private isLoading = false;
	private lastRefreshTime: number = 0;
	private readonly CACHE_TTL_MS = 60000; // 1 minute cache

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.loadEnabledModels();
	}

	/**
	 * Load enabled models from storage
	 */
	private loadEnabledModels(): void {
		try {
			const stored = this.storageService.get(ENABLED_MODELS_STORAGE_KEY, StorageScope.APPLICATION);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) {
					this.enabledModels = new Set(parsed);
					this.logService.debug(`[VybeLLMModelService] Loaded ${this.enabledModels.size} enabled models from storage`);
				}
			}
		} catch (error) {
			this.logService.error('[VybeLLMModelService] Failed to load enabled models:', error);
		}
	}

	/**
	 * Save enabled models to storage
	 */
	private saveEnabledModels(): void {
		try {
			const enabled = Array.from(this.enabledModels);
			this.storageService.store(ENABLED_MODELS_STORAGE_KEY, JSON.stringify(enabled), StorageScope.APPLICATION, StorageTarget.USER);
			this.logService.debug(`[VybeLLMModelService] Saved ${enabled.length} enabled models to storage`);
		} catch (error) {
			this.logService.error('[VybeLLMModelService] Failed to save enabled models:', error);
		}
	}

	/**
	 * Set a model as enabled/disabled
	 */
	setModelEnabled(modelId: string, enabled: boolean): void {
		if (enabled) {
			this.enabledModels.add(modelId);
		} else {
			this.enabledModels.delete(modelId);
		}
		this.saveEnabledModels();

		// Update cache
		const model = this.modelsCache.find(m => m.id === modelId);
		if (model) {
			model.enabled = enabled;
		}

		this._onDidModelsChange.fire();
	}

	/**
	 * Get only enabled models (for dropdown)
	 */
	async getEnabledModels(): Promise<VybeModel[]> {
		const allModels = await this.getAllModels();
		return allModels.filter(m => m.enabled);
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

	async getModelsByProvider(provider: VybeProviderName): Promise<VybeModel[]> {
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

		// Fetch frontier cloud models only (GPT, Claude, Gemini)
		const cloudModels = await this.fetchCloudModels();
		allModels.push(...cloudModels);

		// Apply enabled state from storage
		// All models are cloud models, enabled by default
		for (const model of allModels) {
			if (this.enabledModels.size === 0) {
				// First run: enable all by default
				model.enabled = true;
				this.enabledModels.add(model.id);
			} else if (!this.enabledModels.has(model.id)) {
				// New models: auto-enable them so they appear in dropdown
				model.enabled = true;
				this.enabledModels.add(model.id);
			} else {
				model.enabled = this.enabledModels.has(model.id);
			}
		}

		// Save initial enabled state if it was empty
		if (this.enabledModels.size > 0 && !this.storageService.get(ENABLED_MODELS_STORAGE_KEY, StorageScope.APPLICATION)) {
			this.saveEnabledModels();
		}

		this.modelsCache = allModels;
		this.lastRefreshTime = Date.now();
		this.isLoading = false;

		this.logService.info(`[VybeLLMModelService] Model refresh complete: ${allModels.length} frontier cloud models`);

		this._onDidModelsChange.fire();
	}

	/**
	 * Get cloud models from static curated list
	 */
	private async fetchCloudModels(): Promise<VybeModel[]> {
		this.logService.debug(`[VybeLLMModelService] Using ${STATIC_CLOUD_MODELS.length} static cloud models`);

		return STATIC_CLOUD_MODELS.map(m => ({
			id: m.id,
			label: m.label,
			provider: m.provider,
			providerLabel: m.providerLabel,
			isLocal: false,
			hasThinking: m.hasThinking,
			description: m.description,
			enabled: true,
		}));
	}
}

