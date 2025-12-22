/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isNative } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAiEmbeddingVectorProvider, IAiEmbeddingVectorService } from '../../aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { CONFIG_EMBEDDING_MODEL } from '../common/indexingConfiguration.js';
import { ModelHandle } from '../common/embeddingRuntime.js';
import { LocalHashEmbeddingRuntime } from './localEmbeddingRuntime.js';
import { LocalOnnxEmbeddingRuntime } from './localOnnxEmbeddingRuntime.js';

/**
 * Wires a local embedding provider into {@link IAiEmbeddingVectorService}.
 *
 * Today this uses the hash-based {@link LocalHashEmbeddingRuntime} as a
 * deterministic, fully local fallback while still flowing through the
 * embedding service abstraction. The {@link ModelManager} is consulted to
 * keep model status in sync with the VYBE Settings UI and to prepare for a
 * future ONNX-backed runtime.
 */
export class LocalEmbeddingRuntimeContribution extends Disposable {
	private static _registered = false;

	constructor(
		@IAiEmbeddingVectorService private readonly embeddingVectorService: IAiEmbeddingVectorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		// Ensure we only register a single local provider per process to avoid
		// duplicate work and confusing enablement state.
		if (!LocalEmbeddingRuntimeContribution._registered) {
			LocalEmbeddingRuntimeContribution._registered = true;
			this.registerProvider();
		} else {
			this.logService.trace('[LocalEmbeddingRuntimeContribution] provider already registered; skipping duplicate registration');
		}
	}

	private async createModelManager(modelId: string): Promise<{ modelManager: any; onnxRuntime: LocalOnnxEmbeddingRuntime }> {
		// Dynamic import to avoid loading ModelManager in browser
		const modelManagerModule = await import('./modelManager.js');
		const ModelManagerClass = modelManagerModule.ModelManager;
		const nativeEnv = this.environmentService as INativeEnvironmentService;
		const userDataPath = nativeEnv.userDataPath;

		const modelManager = new ModelManagerClass(modelId, '1.0.0', userDataPath, this.logService);
		const onnxRuntime = new LocalOnnxEmbeddingRuntime(this.logService);
		return { modelManager, onnxRuntime };
	}

	private registerProvider(): void {
		let modelId = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || 'coderank-embed';
		// Backwards-compat: accept the original HuggingFace identifier and map
		// it to the on-disk model folder name.
		if (modelId === 'nomic-ai/CodeRankEmbed') {
			modelId = 'coderank-embed';
		}


		// Only create ModelManager in Node environment (extension host)
		// In browser/renderer, only use hash runtime
		// Initialize ModelManager lazily (async) to avoid blocking constructor
		let modelManagerPromise: Promise<{ modelManager: any; onnxRuntime: LocalOnnxEmbeddingRuntime } | undefined> | undefined;
		if (isNative) {
			modelManagerPromise = this.createModelManager(modelId).catch(err => {
				// This is expected in browser/renderer context - ModelManager is only created in extension host
				// The actual embeddings happen in ExtHostIndexing, not here
				this.logService.trace('[LocalEmbeddingRuntimeContribution] ModelManager creation skipped (expected in browser context)', {
					error: err instanceof Error ? err.message : String(err)
				});
				return undefined;
			});
		} else {
			this.logService.trace('[LocalEmbeddingRuntimeContribution] Browser context detected, ModelManager will be created in extension host');
		}

		const hashRuntime = new LocalHashEmbeddingRuntime();

		const provider: IAiEmbeddingVectorProvider = {
			provideAiEmbeddingVector: async (strings: string[], token: CancellationToken): Promise<number[][]> => {
				// Reload model identifier on each call in case the configuration
				// changed during the session.
				let effectiveModelId = this.configurationService.getValue<string>(CONFIG_EMBEDDING_MODEL) || modelId;
				if (effectiveModelId === 'nomic-ai/CodeRankEmbed') {
					effectiveModelId = 'coderank-embed';
				}

				// Always use "auto" behavior: try ONNX first, fallback to hash
				// This removes the need for a UI setting while maintaining flexibility
				let handle: ModelHandle | undefined;

				// Wait for ModelManager initialization if it's still in progress
				let modelManager: any;
				let onnxRuntime: LocalOnnxEmbeddingRuntime | undefined;
				if (modelManagerPromise) {
					const result = await modelManagerPromise;
					if (result) {
						modelManager = result.modelManager;
						onnxRuntime = result.onnxRuntime;
					}
				}

				// Always attempt ONNX first (with hash fallback) - only if ModelManager is available
				if (modelManager && onnxRuntime) {
					try {
						const modelHandle = await modelManager.getOrInstallModel(token);
						handle = modelHandle;

						try {
							await onnxRuntime.warmup(modelHandle, token);
							return await onnxRuntime.embed(modelHandle, strings, token);
						} catch (err) {
							this.logService.warn('[LocalEmbeddingRuntimeContribution] ONNX runtime failed, falling back to hash runtime', {
								error: err instanceof Error ? err.message : String(err),
								stringsCount: strings.length
							});
							// Fall through to hash runtime below.
						}
					} catch (err) {
						this.logService.error('[LocalEmbeddingRuntimeContribution] getOrInstallModel failed, falling back to hash runtime', {
							error: err instanceof Error ? err.message : String(err),
							errorStack: err instanceof Error ? err.stack : undefined,
							effectiveModelId,
							stringsCount: strings.length
						});
					}
				}

				// Fallback to hash runtime if ONNX failed or wasn't attempted

				const hashHandle: ModelHandle = {
					modelId: effectiveModelId,
					modelVersion: '1.0.0',
					// We do not need an on-disk path for the hash runtime, but
					// threading through the ONNX path (when known) can be
					// useful for future diagnostics.
					modelPath: handle?.modelPath ?? ''
				};
				return hashRuntime.embed(hashHandle, strings, token);
			}
		};

		const disposable = this.embeddingVectorService.registerAiEmbeddingVectorProvider(modelId, provider);
		this._register(disposable);
	}
}
