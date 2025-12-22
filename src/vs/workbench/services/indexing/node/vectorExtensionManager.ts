/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative } from '../../../../base/common/platform.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
// eslint-disable-next-line local/code-import-patterns
import { createRequire } from 'module';

type FsModule = typeof import('fs');
type PathModule = typeof import('path');
type HttpsModule = typeof import('https');

// Create nodeRequire at module load time (only works in Node/ESM contexts)
let nodeRequire: NodeRequire | undefined;
try {
	if (typeof import.meta !== 'undefined' && typeof import.meta.url !== 'undefined') {
		nodeRequire = createRequire(import.meta.url);
	} else if (typeof require === 'function') {
		nodeRequire = require;
	}
} catch (err) {
	// Ignore - will fail gracefully
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

export type VectorExtensionStatus = {
	state: 'checking' | 'downloading' | 'ready' | 'error';
	progress: number;
	message?: string;
};

/**
 * Manages download and installation of sqlite-vector extension.
 * Platform + architecture aware binary selection.
 */
export class VectorExtensionManager {
	private readonly version: string = '0.9.52'; // Version-pinned
	private readonly userDataPath: string;
	private readonly logService: ILogService;
	private status: VectorExtensionStatus;

	constructor(userDataPath: string, logService: ILogService) {
		this.userDataPath = userDataPath;
		this.logService = logService;
		this.status = {
			state: 'checking',
			progress: 0
		};

		// Check if extension exists
		const deps = getNodeDeps();
		if (deps) {
			const extPath = this.getExtensionPath();
			if (extPath) {
				this.logService.info('[VectorExtensionManager] Extension already exists', { path: extPath });
				this.status = { state: 'ready', progress: 100 };
			} else {
				const expectedPath = this.getExpectedPath(deps);
				this.logService.info('[VectorExtensionManager] Extension not found, will download when needed', {
					userDataPath,
					expectedPath
				});
			}
		}
	}

	private getExpectedPath(deps?: { path: PathModule }): string {
		const pathDeps = deps || getNodeDeps();
		if (!pathDeps) {
			return 'unknown';
		}
		const platform = process.platform;
		const arch = process.arch;
		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
		const binaryName = `vector-${platform}-${arch}.${extName}`;
		return pathDeps.path.join(this.userDataPath, 'extensions', 'sqlite-vector', this.version, binaryName);
	}

	getStatus(): VectorExtensionStatus {
		return this.status;
	}

	getExtensionPath(): string | undefined {
		const deps = getNodeDeps();
		if (!deps) {
			return undefined;
		}

		const platform = process.platform;
		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
		// The binary is named vector0.dylib, vector0.so, or vector0.dll
		const binaryName = `vector0.${extName}`;
		const extensionPath = deps.path.join(this.userDataPath, 'extensions', 'sqlite-vector', this.version, binaryName);

		if (deps.fs.existsSync(extensionPath)) {
			return extensionPath;
		}

		return undefined;
	}

	async ensureExtension(deps: { fs: FsModule; path: PathModule; https: HttpsModule }, token?: CancellationToken): Promise<string | undefined> {
		const extensionPath = this.getExtensionPath();
		if (extensionPath) {
			this.logService.info('[VectorExtensionManager] Extension already exists, skipping download', { path: extensionPath });
			this.status = { state: 'ready', progress: 100 };
			return extensionPath;
		}

		// Download the extension
		const platform = process.platform;
		const arch = process.arch;
		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';

		// sqlite-vector releases are packaged in archives, not direct binaries
		// For macOS: vector-macos-arm64-0.9.52.tar.gz or vector-macos-x86_64-0.9.52.tar.gz
		// For Linux: vector-linux-x86_64-0.9.52.tar.gz or vector-linux-arm64-0.9.52.tar.gz
		// For Windows: vector-windows-x86_64-0.9.52.tar.gz
		let archiveName: string;
		if (platform === 'darwin') {
			archiveName = `vector-macos-${arch}-${this.version}.tar.gz`;
		} else if (platform === 'linux') {
			archiveName = `vector-linux-${arch}-${this.version}.tar.gz`;
		} else if (platform === 'win32') {
			archiveName = `vector-windows-${arch}-${this.version}.tar.gz`;
		} else {
			throw new Error(`Unsupported platform: ${platform}`);
		}

		// GitHub release URL pattern: https://github.com/sqliteai/sqlite-vector/releases/download/0.9.52/vector-macos-arm64-0.9.52.tar.gz
		const downloadUrl = `https://github.com/sqliteai/sqlite-vector/releases/download/${this.version}/${archiveName}`;

		const targetDir = deps.path.join(this.userDataPath, 'extensions', 'sqlite-vector', this.version);
		const archivePath = deps.path.join(targetDir, archiveName);
		// The binary inside the archive is typically named 'vector0.dylib', 'vector0.so', or 'vector0.dll'
		const binaryName = `vector0.${extName}`;
		const targetPath = deps.path.join(targetDir, binaryName);

		this.logService.info('[VectorExtensionManager] Starting extension download', {
			platform,
			arch,
			archiveName,
			binaryName,
			downloadUrl,
			archivePath,
			targetPath
		});

		this.status = {
			state: 'downloading',
			progress: 0,
			message: `Downloading sqlite-vector extension...`
		};

		try {
			this.logService.info('[VectorExtensionManager] Creating target directory', { targetDir });
			await deps.fs.promises.mkdir(targetDir, { recursive: true });
			this.logService.info('[VectorExtensionManager] Target directory created, starting archive download', { archivePath });

			// Download archive file
			await this.downloadBinary(deps.https, deps.fs, downloadUrl, archivePath, token);
			this.logService.info('[VectorExtensionManager] Archive downloaded, extracting...', { archivePath });

			// Extract archive - use tar extraction (tar.gz format)
			await this.extractArchive(deps.fs, deps.path, archivePath, targetDir, binaryName, token);

			// Clean up archive file
			try {
				await deps.fs.promises.unlink(archivePath);
			} catch {
				// Ignore cleanup errors
			}

			// Make executable on Unix systems
			if (platform !== 'win32') {
				try {
					await deps.fs.promises.chmod(targetPath, 0o755);
				} catch {
					// Ignore chmod errors
				}
			}

			this.status = { state: 'ready', progress: 100 };
			this.logService.info('[VectorExtensionManager] Extension downloaded and extracted successfully', { path: targetPath });
			return targetPath;
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.status = {
				state: 'error',
				progress: 0,
				message: `Download failed: ${message}`
			};
			this.logService.error('[VectorExtensionManager] Extension download failed', { error: message });
			return undefined;
		}
	}

	private downloadBinary(https: HttpsModule, fs: FsModule, url: string, targetPath: string, token?: CancellationToken): Promise<void> {
		return new Promise((resolve, reject) => {
			if (token?.isCancellationRequested) {
				reject(new Error('Download cancelled'));
				return;
			}

			const file = fs.createWriteStream(targetPath);
			let downloadedBytes = 0;
			let totalBytes = 0;

			const request = https.get(url, (response) => {
				// Handle redirects
				if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
					const location = response.headers.location;
					if (location) {
						file.close();
						fs.unlinkSync(targetPath); // Remove partial file
						this.downloadBinary(https, fs, location, targetPath, token).then(resolve, reject);
						return;
					}
				}

				if (response.statusCode !== 200) {
					file.close();
					fs.unlinkSync(targetPath);
					reject(new Error(`Download failed with status ${response.statusCode}`));
					return;
				}

				totalBytes = parseInt(response.headers['content-length'] || '0', 10);

				response.on('data', (chunk: Buffer) => {
					if (token?.isCancellationRequested) {
						file.close();
						fs.unlinkSync(targetPath);
						reject(new Error('Download cancelled'));
						return;
					}

					downloadedBytes += chunk.length;
					const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
					this.status = {
						state: 'downloading',
						progress,
						message: `Downloading sqlite-vector... ${progress}%`
					};
				});

				response.on('end', () => {
					file.end();
					resolve();
				});

				response.pipe(file);
			});

			request.on('error', (err) => {
				file.close();
				if (fs.existsSync(targetPath)) {
					fs.unlinkSync(targetPath);
				}
				reject(err);
			});

			if (token) {
				token.onCancellationRequested(() => {
					request.destroy();
					file.close();
					if (fs.existsSync(targetPath)) {
						fs.unlinkSync(targetPath);
					}
					reject(new Error('Download cancelled'));
				});
			}
		});
	}

	private async extractArchive(fs: FsModule, path: PathModule, archivePath: string, targetDir: string, binaryName: string, token?: CancellationToken): Promise<void> {
		// Use child_process to run tar command (most reliable for tar.gz)
		if (!nodeRequire) {
			throw new Error('tar extraction requires Node.js');
		}
		const { exec } = nodeRequire('child_process') as typeof import('child_process');

		return new Promise((resolve, reject) => {
			// Extract tar.gz to target directory
			const extractCmd = `tar -xzf "${archivePath}" -C "${targetDir}"`;
			this.logService.info('[VectorExtensionManager] Extracting archive', { command: extractCmd });
			exec(extractCmd, (err, stdout, stderr) => {
				if (err) {
					this.logService.error('[VectorExtensionManager] tar extraction failed', { error: err.message, stderr });
					reject(new Error(`tar extraction failed: ${err.message}`));
				} else {
					// Find the binary file in the extracted directory
					this.findAndMoveBinary(fs, path, targetDir, binaryName).then(resolve, reject);
				}
			});
		});
	}

	private async findAndMoveBinary(fs: FsModule, path: PathModule, targetDir: string, binaryName: string): Promise<void> {
		// The archive may contain the binary in a subdirectory or directly
		// Look for vector0.dylib, vector0.so, or vector0.dll
		const ext = binaryName.split('.').pop();
		const possibleNames = [
			binaryName, // vector0.dylib
			`vector.${ext}`, // vector.dylib
			'vector0.dylib',
			'vector0.so',
			'vector0.dll'
		];

		// First check directly in targetDir
		for (const name of possibleNames) {
			const possiblePath = path.join(targetDir, name);
			if (fs.existsSync(possiblePath)) {
				// Found it - move to expected location if needed
				const targetPath = path.join(targetDir, binaryName);
				if (possiblePath !== targetPath) {
					await fs.promises.rename(possiblePath, targetPath);
					this.logService.info('[VectorExtensionManager] Found and moved binary', { from: possiblePath, to: targetPath });
				}
				return;
			}
		}

		// Also check subdirectories (archive might have a top-level folder)
		const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const subDir = path.join(targetDir, entry.name);
				for (const name of possibleNames) {
					const possiblePath = path.join(subDir, name);
					if (fs.existsSync(possiblePath)) {
						const targetPath = path.join(targetDir, binaryName);
						await fs.promises.rename(possiblePath, targetPath);
						this.logService.info('[VectorExtensionManager] Found binary in subdirectory and moved', { from: possiblePath, to: targetPath });
						// Clean up empty subdirectory
						try {
							await fs.promises.rmdir(subDir);
						} catch {
							// Ignore cleanup errors
						}
						return;
					}
				}
			}
		}

		throw new Error(`Binary file not found in archive. Expected: ${binaryName}. Searched in: ${targetDir}`);
	}
}

