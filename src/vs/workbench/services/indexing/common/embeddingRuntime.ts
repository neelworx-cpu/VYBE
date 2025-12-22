/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';

/**
 * Lightweight contracts for a local embedding runtime and its model manager.
 *
 * These are pure interfaces with no runtime dependencies so they can be shared
 * across Node / extension-host layers and referenced from diagnostics or
 * higher-level services without pulling in ONNX or HTTP clients.
 */

export interface ModelHandle {
	readonly modelId: string;
	readonly modelVersion: string;
	/**
	 * Absolute path to the primary model artifact (e.g. an ONNX file).
	 */
	readonly modelPath: string;
}

export const enum ModelInstallState {
	NotInstalled = 'notInstalled',
	Checking = 'checking',
	Downloading = 'downloading',
	Extracting = 'extracting',
	Ready = 'ready',
	Error = 'error'
}

export interface ModelStatus {
	readonly modelId: string;
	readonly modelVersion?: string;
	readonly state: ModelInstallState;
	readonly progress?: number; // 0–100 for download / extraction, when known
	readonly message?: string;
}

export interface IModelManager {
	/**
	 * Returns the last known model status without any network or filesystem
	 * side-effects.
	 */
	getStatus(): ModelStatus;

	/**
	 * Ensures that the model is present, verified, and ready to load.
	 * Implementations may download or extract artifacts as needed.
	 */
	getOrInstallModel(token: CancellationToken): Promise<ModelHandle>;

	/**
	 * Clears any on-disk model artifacts and cached state so a clean install
	 * can occur on the next call to {@link getOrInstallModel}.
	 */
	clearModel(): Promise<void>;
}

export interface ILocalEmbeddingRuntime {
	/**
	 * Optional warmup step that implementors can use to prime JIT caches or
	 * allocate reusable buffers. Callers may skip this if they do not care
	 * about first-token latency.
	 */
	warmup(handle: ModelHandle, token: CancellationToken): Promise<void>;

	/**
	 * Computes embedding vectors for the given texts using the provided model.
	 * The returned vectors MUST all have the same dimensionality.
	 */
	embed(handle: ModelHandle, texts: string[], token: CancellationToken): Promise<number[][]>;
}



