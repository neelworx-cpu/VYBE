/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative } from '../../../../base/common/platform.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILocalEmbeddingRuntime, ModelHandle } from '../common/embeddingRuntime.js';
import { ILogService } from '../../../../platform/log/common/log.js';

// We intentionally avoid a static TypeScript import for the ONNX runtime so
// that the workbench can load even when the native module is not present.
// The concrete shape is not important for our usage.
type OrtModule = any;
type FsModule = typeof import('fs');
type PathModule = typeof import('path');

interface TokenizerConfig {
	vocab?: Record<string, number>;
	merges?: string[];
	model_type?: string;
	max_length?: number;
	pad_token?: string;
	unk_token?: string;
	cls_token?: string;
	sep_token?: string;
}

interface ModelConfig {
	max_position_embeddings?: number;
	hidden_size?: number;
	vocab_size?: number;
	model_type?: string;
}

function getNodeDeps(): { ort: OrtModule; fs: FsModule; path: PathModule } | undefined {
	if (!isNative || typeof require !== 'function') {
		return undefined;
	}
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const ort = require('onnxruntime-node') as OrtModule;
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs') as FsModule;
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require('path') as PathModule;
		return { ort, fs, path };
	} catch {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const ort = require('onnxruntime-web') as OrtModule;
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const fs = require('fs') as FsModule;
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const path = require('path') as PathModule;
			return { ort, fs, path };
		} catch {
			return undefined;
		}
	}
}

/**
 * ONNX-based embedding runtime for the CodeRank Embed model.
 *
 * This implementation loads the ONNX model and uses a tokenizer to convert
 * text inputs into the format expected by the model. When the ONNX runtime,
 * model files, or tokenizer configuration cannot be loaded, callers should
 * fall back to the hash-based {@link LocalHashEmbeddingRuntime}.
 */
export class LocalOnnxEmbeddingRuntime implements ILocalEmbeddingRuntime {
	private _sessionPromise: Promise<any> | undefined;
	private _tokenizerConfig: TokenizerConfig | undefined;
	private _modelConfig: ModelConfig | undefined;
	private _vocab: Map<string, number> | undefined;
	private _maxLength: number = 512;
	private _padTokenId: number = 0;
	private _unkTokenId: number = 1;
	private _clsTokenId: number = 101;
	private _sepTokenId: number = 102;
	private logService?: ILogService;

	constructor(logService?: ILogService) {
		this.logService = logService;
	}

	private async getSession(handle: ModelHandle, _token: CancellationToken): Promise<any> {
		if (this._sessionPromise) {
			return this._sessionPromise;
		}
		const deps = getNodeDeps();
		if (!deps) {
			throw new Error('ONNX runtime is not available in this environment');
		}

		const { ort, fs, path } = deps;
		// `InferenceSession.create` is the common entrypoint for both
		// `onnxruntime-node` and `onnxruntime-web` in Node mode.
		this._sessionPromise = ort.InferenceSession.create(handle.modelPath);
		const session = await this._sessionPromise;
		const outputs: string[] | undefined = session.outputNames;
		if (!outputs || !outputs.length) {
			throw new Error('ONNX model has no outputs');
		}

		// Load tokenizer and model config from the model directory
		try {
			await this.loadTokenizerConfig(path.dirname(handle.modelPath), fs, path);
		} catch (err) {
			this.logService?.warn('[LocalOnnxEmbeddingRuntime] Failed to load tokenizer config, using defaults', err instanceof Error ? err.message : String(err));
		}

		return session;
	}

	private async loadTokenizerConfig(modelDir: string, fs: FsModule, path: PathModule): Promise<void> {
		try {
			const tokenizerPath = path.join(modelDir, 'tokenizer.json');
			const configPath = path.join(modelDir, 'config.json');

			// Load tokenizer.json if available
			if (fs.existsSync(tokenizerPath)) {
				const tokenizerContent = fs.readFileSync(tokenizerPath, 'utf8');
				this._tokenizerConfig = JSON.parse(tokenizerContent) as TokenizerConfig;
			}

			// Load config.json if available
			if (fs.existsSync(configPath)) {
				const configContent = fs.readFileSync(configPath, 'utf8');
				this._modelConfig = JSON.parse(configContent) as ModelConfig;
			}

			// Extract vocabulary if available
			if (this._tokenizerConfig?.vocab) {
				this._vocab = new Map(Object.entries(this._tokenizerConfig.vocab));
			}

			// Set max length from config or use default
			this._maxLength = this._tokenizerConfig?.max_length ?? this._modelConfig?.max_position_embeddings ?? 512;

			// Extract special token IDs from vocab
			if (this._vocab) {
				this._padTokenId = this._vocab.get(this._tokenizerConfig?.pad_token ?? '[PAD]') ?? 0;
				this._unkTokenId = this._vocab.get(this._tokenizerConfig?.unk_token ?? '[UNK]') ?? 1;
				this._clsTokenId = this._vocab.get(this._tokenizerConfig?.cls_token ?? '[CLS]') ?? 101;
				this._sepTokenId = this._vocab.get(this._tokenizerConfig?.sep_token ?? '[SEP]') ?? 102;
			}
		} catch (err) {
			this.logService?.trace('[LocalOnnxEmbeddingRuntime] Error loading tokenizer config', err instanceof Error ? err.message : String(err));
			// Continue with defaults
		}
	}

	private tokenize(text: string): number[] {
		// Simple word-level tokenization with BPE-like fallback
		// For production, this should use a proper tokenizer library
		const tokens: number[] = [this._clsTokenId];

		if (this._vocab) {
			// Try to tokenize using vocabulary
			const words = text.toLowerCase().split(/\s+/);
			for (const word of words) {
				const tokenId = this._vocab.get(word);
				if (tokenId !== undefined) {
					tokens.push(tokenId);
				} else {
					// Try character-level fallback for unknown words
					for (const char of word) {
						const charId = this._vocab.get(char);
						if (charId !== undefined) {
							tokens.push(charId);
						} else {
							tokens.push(this._unkTokenId);
						}
					}
				}
			}
		} else {
			// Fallback: simple character-based tokenization
			for (let i = 0; i < text.length; i++) {
				const char = text[i];
				const charCode = char.charCodeAt(0);
				// Map character codes to a reasonable range (0-1000)
				tokens.push((charCode % 1000) + 100);
			}
		}

		tokens.push(this._sepTokenId);

		// Pad or truncate to max_length
		if (tokens.length > this._maxLength) {
			tokens.splice(this._maxLength - 1);
			tokens[this._maxLength - 1] = this._sepTokenId;
		} else {
			while (tokens.length < this._maxLength) {
				tokens.push(this._padTokenId);
			}
		}

		return tokens;
	}

	private createAttentionMask(inputIds: number[]): number[] {
		// Create attention mask: 1 for real tokens, 0 for padding
		return inputIds.map(id => id === this._padTokenId ? 0 : 1);
	}

	async warmup(handle: ModelHandle, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}
		try {
			await this.getSession(handle, token);
		} catch (err) {
			this.logService?.warn('[LocalOnnxEmbeddingRuntime] warmup failed (will retry on embed)', {
				error: err instanceof Error ? err.message : String(err),
				modelPath: handle.modelPath
			});
			// Warmup is best-effort; failures are surfaced on first embed call.
		}
	}

	async embed(handle: ModelHandle, texts: string[], token: CancellationToken): Promise<number[][]> {
		if (!texts.length) {
			return [];
		}

		const deps = getNodeDeps();
		if (!deps) {
			throw new Error('ONNX runtime is not available in this environment');
		}

		const session = await this.getSession(handle, token);
		if (token.isCancellationRequested) {
			return [];
		}

		const results: number[][] = [];

		for (const text of texts) {
			if (token.isCancellationRequested) {
				break;
			}

			try {
				// Tokenize the input text
				const inputIds = this.tokenize(text);
				const attentionMask = this.createAttentionMask(inputIds);

				// Prepare inputs for ONNX model
				// Most transformer models expect input_ids and attention_mask
				const inputs: Record<string, any> = {};

				// Try common input names
				const inputNames = session.inputNames || [];
				if (inputNames.length > 0) {
					// Use the first input name (usually 'input_ids' or 'input')
					const inputName = inputNames[0];
					inputs[inputName] = new Int32Array(inputIds);

					// If there's a second input, it's usually attention_mask
					if (inputNames.length > 1) {
						inputs[inputNames[1]] = new Int32Array(attentionMask);
					}
				} else {
					// Fallback: try common names
					inputs['input_ids'] = new Int32Array(inputIds);
					inputs['attention_mask'] = new Int32Array(attentionMask);
				}

				// Run inference
				const outputs = await session.run(inputs);

				// Extract embeddings from output
				// Usually the first output contains the embeddings
				let embeddings: Float32Array | number[];
				if (outputs && outputs.length > 0) {
					const output = outputs[0];
					if (output instanceof Float32Array) {
						embeddings = output;
					} else if (output.data instanceof Float32Array) {
						embeddings = output.data;
					} else if (Array.isArray(output)) {
						embeddings = output.flat();
					} else {
						// Try to extract from tensor-like object
						embeddings = (output as any).data || Array.from(output as any);
					}
				} else {
					throw new Error('ONNX model returned no outputs');
				}

				// Handle multi-dimensional output (batch_size, seq_len, hidden_size)
				// We typically want the CLS token embedding or mean pooling
				let embedding: number[];
				if (Array.isArray(embeddings) && embeddings.length > 0 && Array.isArray(embeddings[0])) {
					// Multi-dimensional: take first token (CLS) or mean pool
					const firstToken = embeddings[0] as number[];
					embedding = Array.isArray(firstToken) ? firstToken : [firstToken as number];
				} else if (embeddings instanceof Float32Array) {
					// Flatten and take first sequence position (CLS token)
					const dim = embeddings.length / this._maxLength;
					if (dim > 0 && Number.isInteger(dim)) {
						embedding = Array.from(embeddings.slice(0, dim));
					} else {
						embedding = Array.from(embeddings);
					}
				} else {
					embedding = Array.isArray(embeddings) ? embeddings : [embeddings as number];
				}

				// Normalize the embedding vector
				const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
				if (norm > 0) {
					embedding = embedding.map(val => val / norm);
				}

				results.push(embedding);
			} catch (err) {
				this.logService?.warn('[LocalOnnxEmbeddingRuntime] Inference failed for text', {
					error: err instanceof Error ? err.message : String(err),
					textLength: text.length
				});
				// Return zero vector as fallback
				const dim = this._modelConfig?.hidden_size ?? 768;
				results.push(new Array(dim).fill(0));
			}
		}

		// Pad results if cancellation occurred
		while (results.length < texts.length) {
			const dim = this._modelConfig?.hidden_size ?? 768;
			results.push(new Array(dim).fill(0));
		}

		return results;
	}
}



