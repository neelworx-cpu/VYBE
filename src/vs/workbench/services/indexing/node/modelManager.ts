/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative } from '../../../../base/common/platform.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IModelManager, ModelHandle, ModelInstallState, ModelStatus } from '../common/embeddingRuntime.js';
// eslint-disable-next-line local/code-import-patterns
import { createRequire } from 'module';

type FsModule = typeof import('fs');
type PathModule = typeof import('path');
type HttpsModule = typeof import('https');

// Create nodeRequire at module load time (only works in Node/ESM contexts)
// This file is in node/ directory and should only be loaded in Node contexts
let nodeRequire: NodeRequire | undefined;
try {
	if (typeof import.meta !== 'undefined' && typeof import.meta.url !== 'undefined') {
		nodeRequire = createRequire(import.meta.url);
	} else if (typeof require === 'function') {
		nodeRequire = require;
	}
} catch (err) {
	// Silently fail - will be handled in getNodeDeps
}

function getNodeDeps(): { fs: FsModule; path: PathModule; https: HttpsModule } | undefined {
	if (!isNative || !nodeRequire) {
		return undefined;
	}
	try {
		const fs = nodeRequire('fs') as FsModule;
		const path = nodeRequire('path') as PathModule;
		const https = nodeRequire('https') as HttpsModule;
		return { fs, path, https };
	} catch {
		return undefined;
	}
}

async function extractZip(zipPath: string, targetPath: string, options: {}, token: CancellationToken): Promise<void> {
	// Dynamically import zip extraction only in Node context to avoid bundling fs in browser
	if (!isNative) {
		throw new Error('Zip extraction requires a native Node environment');
	}
	// Use dynamic import to avoid top-level fs import being bundled
	const zipModule = await import('../../../../base/node/zip.js');
	return zipModule.extract(zipPath, targetPath, options, token);
}

/**
 * Minimal {@link IModelManager} implementation that treats the local model as
 * pre-installed under the user data path.
 *
 * On macOS Code - OSS Dev, this typically resolves to:
 *   ~/Library/Application Support/code-oss-dev/vybe/models/<model-id>
 *
 * This matches the user-provided location for the CodeRank Embed model.
 */
export class ModelManager implements IModelManager {
	private readonly modelId: string;
	private readonly modelVersion: string;
	private readonly downloadUrl: string;
	private readonly userDataPath: string;
	private readonly logService: ILogService;

	private status: ModelStatus;

	constructor(modelId: string, modelVersion: string, userDataPath: string, logService: ILogService) {
		this.modelId = modelId;
		this.modelVersion = modelVersion;
		// For now we target a single GitHub release asset that contains the
		// model and its metadata. The direct download URL follows the
		// standard GitHub pattern:
		//   https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>
		// See: https://github.com/neelworx-cpu/VYBE/releases/tag/v1.0.0
		this.downloadUrl = 'https://github.com/neelworx-cpu/VYBE/releases/download/v1.0.0/model.zip';
		this.userDataPath = userDataPath;
		this.logService = logService;
		this.status = {
			modelId,
			modelVersion,
			state: ModelInstallState.Checking,
			progress: 0
		};

		// Perform an initial synchronous check so early callers see a useful
		// status even before any embedding work happens.
		this.status = this.computeStatus();

		// Automatically start downloading the model if it doesn't exist
		// This runs in the background and doesn't block initialization
		// Only runs if we're in a Node environment (extension host)
		const deps = getNodeDeps();
		if (deps) {
			this.logService.info('[ModelManager] Node environment detected, will attempt automatic model download', {
				modelId: this.modelId,
				userDataPath: this.userDataPath
			});
			this.ensureModel().catch(err => {
				this.logService.warn('[ModelManager] Background model download failed', {
					error: err instanceof Error ? err.message : String(err)
				});
			});
		} else {
			this.logService.warn('[ModelManager] Not in Node environment, automatic model download skipped', {
				isNative,
				hasRequire: typeof require === 'function',
				modelId: this.modelId
			});
		}
	}

	/**
	 * Ensures the model is downloaded if it doesn't exist.
	 * This is called automatically on initialization and can be called manually.
	 */
	async ensureModel(token?: CancellationToken): Promise<void> {
		const deps = getNodeDeps();
		if (!deps) {
			this.logService.warn('[ModelManager] ensureModel skipped - not in Node environment', {
				isNative: isNative,
				hasRequire: typeof require === 'function'
			});
			return; // Can't download without Node deps
		}

		const status = this.computeStatus();
		if (status.state === ModelInstallState.Ready) {
			return;
		}

		this.logService.info('[ModelManager] Model not found, starting automatic download', {
			modelId: this.modelId,
			modelVersion: this.modelVersion,
			userDataPath: this.userDataPath
		});

		try {
			await this.getOrInstallModel(token ?? CancellationToken.None);
			this.logService.info('[ModelManager] Automatic model download completed successfully');
		} catch (err) {
			this.logService.warn('[ModelManager] Automatic model download failed', {
				error: err instanceof Error ? err.message : String(err)
			});
			// Don't throw - this is a background operation
		}
	}

	getStatus(): ModelStatus {
		return this.status;
	}

	async getOrInstallModel(token: CancellationToken): Promise<ModelHandle> {
		this.logService.info('[ModelManager] getOrInstallModel called', {
			modelId: this.modelId,
			modelVersion: this.modelVersion,
			userDataPath: this.userDataPath,
			downloadUrl: this.downloadUrl
		});

		const deps = getNodeDeps();
		if (!deps) {
			const error = 'Local embeddings require a native Node environment';
			this.logService.error('[ModelManager] Node dependencies unavailable', {
				modelId: this.modelId,
				error
			});
			this.status = {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				state: ModelInstallState.Error,
				progress: 0,
				message: error
			};
			throw new Error(error);
		}

		this.logService.info('[ModelManager] Node dependencies available, checking model status', {
			modelId: this.modelId,
			modelBasePath: this.getModelBasePath(deps.path),
			modelOnnxPath: this.getModelOnnxPath(deps.path)
		});

		// Fast path: already installed and valid.
		const existingStatus = this.computeStatus();
		this.logService.info('[ModelManager] Model status check result', {
			modelId: this.modelId,
			state: existingStatus.state,
			progress: existingStatus.progress,
			message: existingStatus.message
		});

		if (existingStatus.state === ModelInstallState.Ready) {
			this.status = existingStatus;
			this.logService.info('[ModelManager] Model already installed, returning handle', {
				modelId: this.modelId,
				modelPath: this.getModelOnnxPath(deps.path)
			});
			return {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				modelPath: this.getModelOnnxPath(deps.path)
			};
		}

		// Slow path: download and extract model.zip into
		//   <userDataPath>/vybe/models/<model-id>/<version>/
		this.status = {
			modelId: this.modelId,
			modelVersion: this.modelVersion,
			state: ModelInstallState.Downloading,
			progress: 0,
			message: `Downloading model from ${this.downloadUrl}`
		};

		this.logService.info('[ModelManager] Starting model download', {
			modelId: this.modelId,
			version: this.modelVersion,
			url: this.downloadUrl,
			zipPath: this.getModelZipPath(deps.path)
		});

		const zipPath = this.getModelZipPath(deps.path);

		// Use a nested token so we can cancel our own operations without
		// affecting callers, while still respecting their cancellation.
		const cts = new CancellationTokenSource(token);
		try {
			await deps.fs.promises.mkdir(this.getModelBasePath(deps.path), { recursive: true });
			await this.downloadZip(deps.https, deps.fs, zipPath, cts.token);

			this.logService.info('[ModelManager] Model download completed', {
				modelId: this.modelId,
				zipPath
			});

			// Extract the zip file to the version folder
			this.status = {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				state: ModelInstallState.Extracting,
				progress: 50,
				message: 'Extracting model files...'
			};

			this.logService.info('[ModelManager] Starting model extraction', {
				modelId: this.modelId,
				zipPath,
				targetPath: this.getModelVersionRootPath(deps.path)
			});

			const versionRootPath = this.getModelVersionRootPath(deps.path);
			await deps.fs.promises.mkdir(versionRootPath, { recursive: true });

			// Extract zip - files may be in a nested 'model/' folder
			// Extract everything first, then post-process to move files from model/ to target
			await extractZip(zipPath, versionRootPath, {}, cts.token);

			this.logService.info('[ModelManager] Model extraction completed, checking for nested structure', {
				modelId: this.modelId,
				targetPath: versionRootPath
			});

			// Post-process: If files were extracted to a 'model/' subfolder, move them up
			const modelSubfolder = deps.path.join(versionRootPath, 'model');
			const hasModelSubfolder = deps.fs.existsSync(modelSubfolder);
			if (hasModelSubfolder) {
				this.logService.info('[ModelManager] Found nested model/ folder, moving files to target directory', {
					modelSubfolder,
					targetPath: versionRootPath
				});

				// Move all files from model/ subfolder to versionRootPath
				const entries = await deps.fs.promises.readdir(modelSubfolder, { withFileTypes: true });
				for (const entry of entries) {
					const sourcePath = deps.path.join(modelSubfolder, entry.name);
					const targetPath = deps.path.join(versionRootPath, entry.name);

					if (entry.isDirectory()) {
						// Move directory recursively
						await deps.fs.promises.rename(sourcePath, targetPath);
					} else {
						// Move file
						await deps.fs.promises.rename(sourcePath, targetPath);
					}
				}

				// Remove the now-empty model/ folder
				try {
					await deps.fs.promises.rmdir(modelSubfolder);
				} catch {
					// Ignore if not empty or other errors
				}

				this.logService.info('[ModelManager] Files moved from model/ subfolder to target directory');
			}

			// Clean up the zip file after extraction
			try {
				await deps.fs.promises.unlink(zipPath);
			} catch {
				// Ignore cleanup errors
			}

			// Clean up __MACOSX folder if it was extracted
			const macosxPath = deps.path.join(versionRootPath, '__MACOSX');
			try {
				if (deps.fs.existsSync(macosxPath)) {
					await deps.fs.promises.rm(macosxPath, { recursive: true, force: true });
					this.logService.info('[ModelManager] Removed __MACOSX folder');
				}
			} catch {
				// Ignore cleanup errors
			}

			// Verify presence of ONNX model
			const onnxPath = this.getModelOnnxPath(deps.path);
			const hasOnnx = deps.fs.existsSync(onnxPath);
			if (!hasOnnx) {
				this.status = {
					modelId: this.modelId,
					modelVersion: this.modelVersion,
					state: ModelInstallState.Error,
					progress: 0,
					message: 'model.onnx not found after extraction'
				};
				throw new Error(this.status.message);
			}

			this.status = {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				state: ModelInstallState.Ready,
				progress: 100
			};

			return {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				modelPath: onnxPath
			};
		} finally {
			cts.dispose();
		}
	}

	async clearModel(): Promise<void> {
		// We currently treat models as pre-installed; clearModel just forces a
		// re-check on the next getStatus/getOrInstallModel call.
		this.status = {
			modelId: this.modelId,
			modelVersion: this.modelVersion,
			state: ModelInstallState.Checking,
			progress: 0
		};
	}

	/**
	 * Fixes nested structure where files are in model/ subfolder instead of directly in version folder
	 */
	private async fixNestedStructure(deps: { fs: FsModule; path: PathModule }): Promise<void> {
		const versionRootPath = this.getModelVersionRootPath(deps.path);
		const modelSubfolder = deps.path.join(versionRootPath, 'model');

		if (!deps.fs.existsSync(modelSubfolder)) {
			return; // Nothing to fix
		}

		this.logService.info('[ModelManager] Fixing nested model structure', {
			modelSubfolder,
			targetPath: versionRootPath
		});

		// Move all files from model/ subfolder to versionRootPath
		const entries = await deps.fs.promises.readdir(modelSubfolder, { withFileTypes: true });
		for (const entry of entries) {
			const sourcePath = deps.path.join(modelSubfolder, entry.name);
			const targetPath = deps.path.join(versionRootPath, entry.name);

			// Skip if target already exists
			if (deps.fs.existsSync(targetPath)) {
				continue;
			}

			if (entry.isDirectory()) {
				// Move directory recursively
				await deps.fs.promises.rename(sourcePath, targetPath);
			} else {
				// Move file
				await deps.fs.promises.rename(sourcePath, targetPath);
			}
		}

		// Remove the now-empty model/ folder
		try {
			await deps.fs.promises.rmdir(modelSubfolder);
		} catch {
			// Ignore if not empty or other errors
		}

		// Remove __MACOSX folder if it exists
		const macosxPath = deps.path.join(versionRootPath, '__MACOSX');
		try {
			if (deps.fs.existsSync(macosxPath)) {
				await deps.fs.promises.rm(macosxPath, { recursive: true, force: true });
			}
		} catch {
			// Ignore cleanup errors
		}

		this.logService.info('[ModelManager] Nested structure fixed successfully');
	}

	private getModelBasePath(path: PathModule): string {
		return path.join(this.userDataPath, 'vybe', 'models', this.modelId);
	}

	private getModelVersionRootPath(path: PathModule): string {
		return path.join(this.getModelBasePath(path), this.modelVersion);
	}

	private getModelZipPath(path: PathModule): string {
		return path.join(this.getModelBasePath(path), `${this.modelVersion}.zip`);
	}

	private getModelOnnxPath(path: PathModule): string {
		return path.join(this.getModelVersionRootPath(path), 'model.onnx');
	}

	private computeStatus(): ModelStatus {
		const deps = getNodeDeps();
		if (!deps) {
			// Not in Node environment - return checking state instead of error
			// This prevents the UI from showing an error when ModelManager is created in renderer
			return {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				state: ModelInstallState.Checking,
				progress: 0,
				message: 'Checking model availability...'
			};
		}

		try {
			const versionRootPath = this.getModelVersionRootPath(deps.path);
			const onnxPath = this.getModelOnnxPath(deps.path);
			let exists = deps.fs.existsSync(onnxPath);

			// Check if model.onnx is in a nested model/ folder (incorrect extraction)
			if (!exists) {
				const nestedOnnxPath = deps.path.join(versionRootPath, 'model', 'model.onnx');
				const hasNestedModel = deps.fs.existsSync(nestedOnnxPath);
				if (hasNestedModel) {
					// Files are in wrong location - fix it asynchronously (don't block status check)
					this.fixNestedStructure(deps).catch(err => {
						this.logService.warn('[ModelManager] Failed to fix nested structure', {
							error: err instanceof Error ? err.message : String(err)
						});
					});
					// Return checking state while fixing
					return {
						modelId: this.modelId,
						modelVersion: this.modelVersion,
						state: ModelInstallState.Checking,
						progress: 50,
						message: 'Fixing model file structure...'
					};
				}
			}

			if (!exists) {
				return {
					modelId: this.modelId,
					modelVersion: this.modelVersion,
					state: ModelInstallState.Error,
					progress: 0,
					message: `Model files not found at ${versionRootPath}`
				};
			}

			// If the directory exists, consider the model ready. Future
			// versions can inspect manifests or hash files here.
			return {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				state: ModelInstallState.Ready,
				progress: 100
			};
		} catch (err) {
			this.logService.trace('[ModelManager] error while checking model', err instanceof Error ? err.message : String(err));
			return {
				modelId: this.modelId,
				modelVersion: this.modelVersion,
				state: ModelInstallState.Error,
				progress: 0,
				message: 'Failed to inspect local model directory'
			};
		}
	}

	private downloadZip(https: HttpsModule, fs: FsModule, zipPath: string, token: CancellationToken): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (token.isCancellationRequested) {
				return reject(new Error('Model download cancelled'));
			}

			this.logService.info('[ModelManager] Initiating HTTPS download', {
				url: this.downloadUrl,
				destination: zipPath
			});

			const performDownload = (url: string, followRedirects = true): void => {
				const file = fs.createWriteStream(zipPath);
				let downloadedBytes = 0;
				let totalBytes: number | undefined;

				const request = https.get(url, response => {
					this.logService.info('[ModelManager] HTTPS response received', {
						url,
						statusCode: response.statusCode,
						statusMessage: response.statusMessage,
						location: response.headers.location,
						headers: Object.keys(response.headers)
					});

					// Handle redirects (301, 302, 307, 308)
					if (followRedirects && response.statusCode && (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308)) {
						const location = response.headers.location;
						if (location) {
							file.close();
							fs.unlink(zipPath, () => undefined);
							this.logService.info('[ModelManager] Following redirect', {
								from: url,
								to: location,
								statusCode: response.statusCode
							});
							// Recursively follow the redirect
							performDownload(location, true);
							return;
						}
					}

					if (response.statusCode && response.statusCode >= 400) {
						file.close();
						fs.unlink(zipPath, () => undefined);
						const error = new Error(`Model download failed with status code ${response.statusCode}`);
						this.logService.error('[ModelManager] Download failed - HTTP error', {
							url,
							statusCode: response.statusCode,
							statusMessage: response.statusMessage,
							error: error.message,
							zipPath
						});
						reject(error);
						return;
					}

					totalBytes = parseInt(response.headers['content-length'] || '0', 10);
					this.logService.info('[ModelManager] Download started', {
						url,
						totalBytes,
						contentLength: response.headers['content-length'],
						statusCode: response.statusCode,
						zipPath
					});

				let lastProgressLog = 0;
				response.on('data', (chunk: Buffer) => {
					downloadedBytes += chunk.length;
					if (totalBytes && totalBytes > 0) {
						const progress = Math.round((downloadedBytes / totalBytes) * 100);
						this.status = {
							...this.status,
							progress: Math.min(progress, 90) // Cap at 90% until extraction
						};
						// Log progress every 10% or every 1MB, whichever comes first
						if (progress - lastProgressLog >= 10 || downloadedBytes % (1024 * 1024) < chunk.length) {
							this.logService.info('[ModelManager] Download progress', {
								downloadedBytes,
								totalBytes,
								progressPercent: progress,
								zipPath
							});
							lastProgressLog = progress;
						}
					}
				});

				response.pipe(file);

					file.on('finish', () => {
						file.close();
						this.logService.info('[ModelManager] Download completed', {
							url,
							downloadedBytes,
							totalBytes
						});
						resolve();
					});
				});

				request.on('error', err => {
					file.close();
					fs.unlink(zipPath, () => undefined);
					this.logService.error('[ModelManager] Download request error', {
						url,
						error: err instanceof Error ? err.message : String(err),
						errorStack: err instanceof Error ? err.stack : undefined,
						zipPath
					});
					reject(err);
				});

				token.onCancellationRequested(() => {
					request.destroy();
					file.close();
					fs.unlink(zipPath, () => undefined);
					this.logService.warn('[ModelManager] Download cancelled');
					reject(new Error('Model download cancelled'));
				});
			};

			// Start the download
			performDownload(this.downloadUrl);
		});
	}
}


