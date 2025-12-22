/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILocalEmbeddingRuntime, ModelHandle } from '../common/embeddingRuntime.js';

/**
 * A minimal local embedding runtime used as a fallback when no external
 * embedding provider is available.
 *
 * This implementation does **not** use a real ML model yet. Instead, it
 * computes a deterministic, normalized hash-based vector over the input
 * text. This keeps the pipeline fully local and cheap while we iterate on
 * the true ONNX-based runtime.
 */
export class LocalHashEmbeddingRuntime implements ILocalEmbeddingRuntime {
	private static readonly DIMENSION = 256;

	async warmup(_handle: ModelHandle, _token: CancellationToken): Promise<void> {
		// No-op: this runtime has no heavy initialization.
	}

	async embed(_handle: ModelHandle, texts: string[], token: CancellationToken): Promise<number[][]> {
		const dim = LocalHashEmbeddingRuntime.DIMENSION;
		const results: number[][] = [];

		for (const text of texts) {
			if (token.isCancellationRequested) {
				break;
			}

			const vec = new Float32Array(dim);

			// Simple bag-of-characters style hash projection into a fixed
			// dimensional space, followed by L2 normalization.
			for (let i = 0; i < text.length; i++) {
				const code = text.charCodeAt(i);
				const idx = code % dim;
				// Spread characters slightly to reduce collisions.
				vec[idx] += 1 + (code % 13) / 13;
			}

			const norm = this.norm(vec);
			const out: number[] = new Array(dim);
			if (norm > 0) {
				for (let i = 0; i < dim; i++) {
					out[i] = vec[i] / norm;
				}
			} else {
				for (let i = 0; i < dim; i++) {
					out[i] = vec[i];
				}
			}

			results.push(out);
		}

		// If cancellation happened mid-way, pad remaining entries with zeros so
		// callers still receive a vector per requested text.
		while (results.length < texts.length) {
			results.push(new Array(LocalHashEmbeddingRuntime.DIMENSION).fill(0));
		}

		return results;
	}

	private norm(vec: Float32Array): number {
		let sum = 0;
		for (let i = 0; i < vec.length; i++) {
			const v = vec[i];
			sum += v * v;
		}
		return Math.sqrt(sum);
	}
}



