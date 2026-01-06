/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Model Service
 * Aggregates models from ALL providers (local + cloud) and provides unified model list
 *
 * Local providers: Ollama, LM Studio (fetched directly)
 * Cloud providers: Gemini, OpenRouter (fetched via MCP server)
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IVybeLLMMessageService } from './vybeLLMMessageService.js';
import type { VybeLLMProviderName, OllamaModelResponse, OpenaiCompatibleModelResponse } from './vybeLLMMessageTypes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isNative } from '../../../../base/common/platform.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';

// Extended provider names to include cloud providers
export type VybeProviderName = VybeLLMProviderName | 'gemini' | 'openrouter' | 'openai' | 'anthropic';

// Storage key for enabled models
const ENABLED_MODELS_STORAGE_KEY = 'vybe.llm.enabledModels';

export interface VybeModel {
	id: string; // Format: "provider:modelName" (e.g., "ollama:llama2", "gemini-2.0-flash")
	label: string; // Display name (e.g., "Llama 2", "Gemini 2.0 Flash")
	provider: VybeProviderName;
	providerLabel: string; // "Ollama", "Gemini", "OpenRouter"
	isLocal: boolean;
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
	private apiKeyCache: Map<string, { key: string; timestamp: number }> = new Map();
	private readonly API_KEY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes - cache API keys much longer
	private apiKeyFetchInProgress: Map<string, Promise<void>> = new Map(); // Prevent concurrent fetches
	private lastRefreshTime: number = 0;
	private readonly CACHE_TTL_MS = 60000; // 1 minute cache

	constructor(
		@IVybeLLMMessageService private readonly llmService: IVybeLLMMessageService,
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

		// Fetch from LOCAL providers in parallel (Ollama, LM Studio)
		const localProviders: VybeLLMProviderName[] = ['ollama', 'lmStudio'];
		const localFetchPromises = localProviders.map(async (provider) => {
			try {
				this.logService.debug(`[VybeLLMModelService] Fetching models from ${provider}...`);
				const models = await this.llmService.listModels(provider);
				this.logService.debug(`[VybeLLMModelService] Found ${models.length} models from ${provider}`);
				const vybeModels = models.map(model => this.convertLocalModelToVybeModel(model, provider));
				allModels.push(...vybeModels);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logService.debug(`[VybeLLMModelService] Failed to fetch models from ${provider}: ${errorMessage}`);
			}
		});

		// Fetch from CLOUD providers via MCP server
		const cloudFetchPromise = this.fetchCloudModels();

		// Wait for all fetches
		await Promise.allSettled([...localFetchPromises, cloudFetchPromise.then(models => allModels.push(...models))]);

		// Apply enabled state from storage
		for (const model of allModels) {
			// If no enabled models stored yet, enable all by default
			if (this.enabledModels.size === 0) {
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

		const localCount = allModels.filter(m => m.isLocal).length;
		const cloudCount = allModels.filter(m => !m.isLocal).length;
		this.logService.info(`[VybeLLMModelService] Model refresh complete: ${allModels.length} total (${localCount} local, ${cloudCount} cloud)`);

		this._onDidModelsChange.fire();
	}

	/**
	 * Fetch cloud models from MCP server (Gemini, OpenRouter, etc.)
	 */
	private async fetchCloudModels(): Promise<VybeModel[]> {
		try {
			// Try to fetch from MCP server via IPC
			// This requires the MCP server to be running with the list_models tool
			if (!isNative || !ipcRenderer) {
				this.logService.debug('[VybeLLMModelService] Not in native Electron environment, skipping MCP tool call');
				return [];
			}

			// Step 1: Fetch Gemini API key from Supabase Edge Function and set it in MCP
			await this.ensureApiKeysSet();

			this.logService.debug('[VybeLLMModelService] Calling MCP tool: list_models');

			const result = await ipcRenderer.invoke('vscode:vybeMcpCallTool', {
				toolName: 'list_models',
				params: { provider: 'all', refresh: false }
			}) as { models?: any[]; providers?: any[]; totalCount?: number };

			this.logService.debug(`[VybeLLMModelService] MCP tool result:`, {
				hasModels: !!result?.models,
				modelCount: result?.models?.length || 0,
				totalCount: result?.totalCount
			});

			if (result && result.models && Array.isArray(result.models)) {
				const cloudModels = result.models
					.filter((m: any) => m.provider !== 'ollama' && m.provider !== 'lmStudio') // Local models already fetched
					.map((m: any) => this.convertCloudModelToVybeModel(m));

				this.logService.info(`[VybeLLMModelService] Fetched ${cloudModels.length} cloud models from MCP`);
				return cloudModels;
			} else {
				this.logService.warn('[VybeLLMModelService] MCP tool returned invalid result:', result);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[VybeLLMModelService] Failed to fetch cloud models from MCP: ${errorMessage}`);
			if (error instanceof Error && error.stack) {
				this.logService.error(error.stack);
			}
		}

		// Fallback: return empty (cloud models not available)
		return [];
	}

	/**
	 * Ensure API keys are set in MCP process by fetching from Supabase Edge Function
	 * Uses caching and prevents concurrent fetches to avoid rate limiting
	 */
	private async ensureApiKeysSet(): Promise<void> {
		if (!isNative || !ipcRenderer) {
			return;
		}

		const provider = 'gemini';
		const now = Date.now();

		// Check cache first - if valid, use it immediately
		const cached = this.apiKeyCache.get(provider);
		if (cached && (now - cached.timestamp) < this.API_KEY_CACHE_TTL_MS) {
			this.logService.debug('[VybeLLMModelService] Using cached API key for Gemini');
			// Still set it in MCP (in case MCP restarted), but don't fetch from Edge Function
			try {
				await ipcRenderer.invoke('vscode:vybeMcpCallTool', {
					toolName: 'set_api_key',
					params: {
						provider: 'gemini',
						api_key: cached.key,
					},
				});
			} catch (error) {
				// If setting fails, clear cache (but don't refetch immediately to avoid rate limits)
				this.logService.debug('[VybeLLMModelService] Failed to set cached key');
			}
			return;
		}

		// Check if a fetch is already in progress - wait for it instead of starting a new one
		const existingFetch = this.apiKeyFetchInProgress.get(provider);
		if (existingFetch) {
			this.logService.debug('[VybeLLMModelService] API key fetch already in progress, waiting...');
			try {
				await existingFetch;
				// After waiting, check cache again (the other fetch might have populated it)
				const newCached = this.apiKeyCache.get(provider);
				if (newCached) {
					this.logService.debug('[VybeLLMModelService] Using API key from concurrent fetch');
					return;
				}
			} catch (error) {
				// If the other fetch failed, we'll try our own
				this.logService.debug('[VybeLLMModelService] Concurrent fetch failed, will try our own');
			}
		}

		// Create a promise for this fetch and store it to prevent concurrent fetches
		const fetchPromise = (async () => {
			try {
				// Fetch Gemini API key from Supabase Edge Function via main process (no CORS restrictions)
				this.logService.debug('[VybeLLMModelService] Fetching Gemini API key from Edge Function via main process');

				const result = await ipcRenderer.invoke('vscode:vybeFetchApiKey', {
					provider: 'gemini'
				}) as { apiKey?: string; error?: string };

			// Handle 429 rate limit errors
			if (result?.error && result.error.includes('429')) {
				this.logService.warn('[VybeLLMModelService] Rate limited (429) when fetching API key. Using cached key if available.');
				// If we have a cached key, use it even if expired
				if (cached) {
					this.logService.debug('[VybeLLMModelService] Using expired cached key due to rate limit');
					try {
						await ipcRenderer.invoke('vscode:vybeMcpCallTool', {
							toolName: 'set_api_key',
							params: {
								provider: 'gemini',
								api_key: cached.key,
							},
						});
					} catch (error) {
						// Ignore errors when setting expired cached key
					}
				}
				return;
			}

			if (!result?.apiKey) {
				this.logService.warn(`[VybeLLMModelService] No API key returned from Edge Function`);
				// If we have a cached key, use it
				if (cached) {
					this.logService.debug('[VybeLLMModelService] Using expired cached key as fallback');
					try {
						await ipcRenderer.invoke('vscode:vybeMcpCallTool', {
							toolName: 'set_api_key',
							params: {
								provider: 'gemini',
								api_key: cached.key,
							},
						});
					} catch (error) {
						// Ignore errors
					}
				}
				return;
			}

			const apiKey = result.apiKey;

			// Cache the API key
			this.apiKeyCache.set(provider, { key: apiKey, timestamp: now });

			// Set the API key in MCP process via set_api_key command
			this.logService.debug('[VybeLLMModelService] Setting Gemini API key in MCP process');

			await ipcRenderer.invoke('vscode:vybeMcpCallTool', {
				toolName: 'set_api_key',
				params: {
					provider: 'gemini',
					api_key: apiKey,
				},
			});

				this.logService.info('[VybeLLMModelService] Gemini API key set in MCP process');
			} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;

			// Check if it's a 429 error
			if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
				this.logService.warn(`[VybeLLMModelService] Rate limited (429) when fetching API key: ${errorMessage}`);
				// Use cached key if available
				if (cached) {
					this.logService.debug('[VybeLLMModelService] Using cached key due to rate limit error');
					try {
						await ipcRenderer.invoke('vscode:vybeMcpCallTool', {
							toolName: 'set_api_key',
							params: {
								provider: 'gemini',
								api_key: cached.key,
							},
						});
					} catch (error) {
						// Ignore errors
					}
				}
			} else {
				this.logService.warn(`[VybeLLMModelService] Failed to set API keys: ${errorMessage}`);
				if (errorStack) {
					this.logService.warn(`[VybeLLMModelService] Error stack: ${errorStack}`);
				}
			}
				// Don't throw - continue even if API key fetch fails (models might still work if key was set before)
			} finally {
				// Remove from in-progress map
				this.apiKeyFetchInProgress.delete(provider);
			}
		})();

		// Store the promise to prevent concurrent fetches
		this.apiKeyFetchInProgress.set(provider, fetchPromise);

		// Wait for the fetch to complete
		await fetchPromise;
	}

	/**
	 * Convert cloud model response to VybeModel
	 */
	private convertCloudModelToVybeModel(model: {
		id: string;
		displayName?: string;
		provider: string;
		description?: string;
		supportsReasoning?: boolean;
	}): VybeModel {
		const providerLabels: Record<string, string> = {
			gemini: 'Gemini',
			openrouter: 'OpenRouter',
			openai: 'OpenAI',
			anthropic: 'Anthropic',
		};

		return {
			id: model.id,
			label: model.displayName || model.id,
			provider: model.provider as VybeProviderName,
			providerLabel: providerLabels[model.provider] || model.provider,
			isLocal: false,
			hasThinking: model.supportsReasoning,
			description: model.description,
			enabled: true,
		};
	}

	/**
	 * Convert local model response to VybeModel
	 */
	private convertLocalModelToVybeModel(
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
				hasThinking: baseName.includes('qwen') || baseName.includes('deepseek'),
				enabled: true, // Will be updated by refreshModels
			};
		} else {
			// OpenAI-compatible model (LM Studio)
			return {
				id: `${provider.toLowerCase()}:${model.id}`,
				label: model.id,
				provider,
				providerLabel: 'LM Studio',
				isLocal: true,
				enabled: true, // Will be updated by refreshModels
			};
		}
	}
}

