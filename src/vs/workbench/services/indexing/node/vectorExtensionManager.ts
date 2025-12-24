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

	/**
	 * Gets the expected path where users can manually place the sqlite-vector extension.
	 * This allows users to download and place the file manually if automatic download fails.
	 */
	getManualPlacementPath(): string {
		const deps = getNodeDeps();
		if (!deps) {
			return 'unknown';
		}

		const platform = process.platform;
		const arch = process.arch;
		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
		const binaryName = `vector0.${extName}`;
		const baseDir = deps.path.join(this.userDataPath, 'extensions', 'sqlite-vector', this.version);

		if (platform === 'win32') {
			// For Windows, prefer x64 subdirectory
			if (arch === 'x64') {
				return deps.path.join(baseDir, 'x64', binaryName);
			} else if (arch === 'ia32') {
				return deps.path.join(baseDir, 'x86', binaryName);
			}
			// Default to x64 for other architectures
			return deps.path.join(baseDir, 'x64', binaryName);
		}

		// For other platforms, use root directory
		return deps.path.join(baseDir, binaryName);
	}

	/**
	 * Gets download URL and instructions for manual download.
	 */
	getManualDownloadInfo(): { url: string; instructions: string; expectedPath: string } {
		const platform = process.platform;
		const arch = process.arch;
		const version = this.version;

		// Map process.arch to GitHub release naming
		let archName: string;
		if (arch === 'x64') {
			archName = 'x86_64';
		} else if (arch === 'arm64') {
			archName = 'arm64';
		} else if (arch === 'ia32') {
			archName = 'x86_64'; // Use 64-bit for 32-bit systems
		} else {
			archName = arch;
		}

		let archiveName: string;
		let url: string;

		if (platform === 'darwin') {
			archiveName = `vector-macos-${archName}-${version}.tar.gz`;
			url = `https://github.com/sqliteai/sqlite-vector/releases/download/${version}/${archiveName}`;
		} else if (platform === 'linux') {
			archiveName = `vector-linux-${archName}-${version}.tar.gz`;
			url = `https://github.com/sqliteai/sqlite-vector/releases/download/${version}/${archiveName}`;
		} else if (platform === 'win32') {
			if (arch === 'x64' || arch === 'ia32') {
				archiveName = `vector-windows-x86_64-${version}.tar.gz`;
			} else {
				archiveName = `vector-windows-i686-${version}.tar.gz`;
			}
			url = `https://github.com/sqliteai/sqlite-vector/releases/download/${version}/${archiveName}`;
		} else {
			url = `https://github.com/sqliteai/sqlite-vector/releases/tag/${version}`;
		}

		const expectedPath = this.getManualPlacementPath();

		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
		const deps = getNodeDeps();
		const dirname = deps?.path.dirname(expectedPath) || 'the directory';
		const instructions = platform === 'win32'
			? `1. Download: ${url}\n2. Extract the archive (use 7-Zip or Windows built-in support)\n3. Find vector0.dll inside the extracted folder\n4. Create directory if needed: ${dirname}\n5. Place vector0.dll at: ${expectedPath}\n6. Restart the application`
			: `1. Download: ${url}\n2. Extract the archive\n3. Find vector0.${extName} inside the extracted folder\n4. Place it at: ${expectedPath}\n5. Make it executable: chmod +x ${expectedPath}\n6. Restart the application`;

		return { url, instructions, expectedPath };
	}

	/**
	 * Checks if a manually placed file exists at the expected location.
	 */
	hasManualPlacement(): boolean {
		const deps = getNodeDeps();
		if (!deps) {
			return false;
		}

		const manualPath = this.getManualPlacementPath();
		return deps.fs.existsSync(manualPath);
	}

	getExtensionPath(): string | undefined {
		const deps = getNodeDeps();
		if (!deps) {
			return undefined;
		}

		// FIRST: Check manual placement path (highest priority)
		const manualPath = this.getManualPlacementPath();
		if (deps.fs.existsSync(manualPath)) {
			this.logService.info('[VectorExtensionManager] Found manually placed extension', { path: manualPath });
			return manualPath;
		}

		const platform = process.platform;
		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
		// The binary is named vector0.dylib, vector0.so, or vector0.dll
		const binaryName = `vector0.${extName}`;
		const baseDir = deps.path.join(this.userDataPath, 'extensions', 'sqlite-vector', this.version);

		// For Windows, check both x64 and x86 subdirectories, and root
		if (platform === 'win32') {
			// Check x64 (64-bit) first
			const x64Path = deps.path.join(baseDir, 'x64', binaryName);
			if (deps.fs.existsSync(x64Path)) {
				return x64Path;
			}
			// Check x86 (32-bit)
			const x86Path = deps.path.join(baseDir, 'x86', binaryName);
			if (deps.fs.existsSync(x86Path)) {
				return x86Path;
			}
			// Check root (backward compatibility)
			const rootPath = deps.path.join(baseDir, binaryName);
			if (deps.fs.existsSync(rootPath)) {
				return rootPath;
			}
		} else {
			// For other platforms, check root
			const extensionPath = deps.path.join(baseDir, binaryName);
			if (deps.fs.existsSync(extensionPath)) {
				return extensionPath;
			}
		}

		return undefined;
	}

	async ensureExtension(deps: { fs: FsModule; path: PathModule; https: HttpsModule }, token?: CancellationToken): Promise<string | undefined> {
		const extensionPath = this.getExtensionPath();
		if (extensionPath) {
			if (typeof console !== 'undefined' && console.log) {
				console.log('[VectorExtensionManager] ✅ Extension already exists, skipping download', { path: extensionPath });
			}
			this.logService.info('[VectorExtensionManager] Extension already exists, skipping download', { path: extensionPath });
			this.status = { state: 'ready', progress: 100 };
			return extensionPath;
		}

		// ADD: Log that download is needed
		if (typeof console !== 'undefined' && console.log) {
			console.log('[VectorExtensionManager] 🔽 Extension NOT FOUND, will download...', {
				userDataPath: this.userDataPath,
				expectedPath: this.getExtensionPath()
			});
		}

		// ADD: Ensure userDataPath exists before attempting download
		if (!deps.fs.existsSync(this.userDataPath)) {
			this.logService.info('[VectorExtensionManager] Creating userDataPath', { userDataPath: this.userDataPath });
			try {
				await deps.fs.promises.mkdir(this.userDataPath, { recursive: true });
			} catch (err) {
				this.logService.error('[VectorExtensionManager] Failed to create userDataPath', {
					userDataPath: this.userDataPath,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}

		// Download the extension
		const platform = process.platform;
		const arch = process.arch;
		const extName = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';

		// sqlite-vector releases are packaged in archives, not direct binaries
		// For macOS: vector-macos-arm64-0.9.52.tar.gz or vector-macos-x86_64-0.9.52.tar.gz
		// For Linux: vector-linux-x86_64-0.9.52.tar.gz or vector-linux-arm64-0.9.52.tar.gz
		// For Windows: vector-windows-x86_64-0.9.52.tar.gz
		// ADD: Map process.arch to GitHub release naming convention
		// process.arch values: 'arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', 'x32', 'x64'
		// GitHub release uses: 'x86_64' (for x64/ia32), 'arm64' (for arm64)
		let archName: string;
		if (arch === 'x64') {
			archName = 'x86_64';
		} else if (arch === 'arm64') {
			archName = 'arm64';
		} else if (arch === 'ia32') {
			// 32-bit architecture not supported by sqlite-vector, use 64-bit instead
			archName = 'x86_64';
			this.logService.info('[VectorExtensionManager] 32-bit architecture detected, using 64-bit binary', {
				arch,
				mappedTo: archName
			});
		} else {
			// For other architectures (including 'x32' if it exists), try to use the arch name as-is, but log a warning
			archName = arch;
			this.logService.warn('[VectorExtensionManager] Unsupported architecture, may not have matching release', {
				arch,
				platform
			});
		}

		let archiveName: string;
		if (platform === 'darwin') {
			archiveName = `vector-macos-${archName}-${this.version}.tar.gz`;
		} else if (platform === 'linux') {
			archiveName = `vector-linux-${archName}-${this.version}.tar.gz`;
		} else if (platform === 'win32') {
			// For Windows, download both 32-bit and 64-bit packages
			return await this.downloadWindowsPackages(deps, token);
		} else {
			throw new Error(`Unsupported platform: ${platform}`);
		}

		this.logService.info('[VectorExtensionManager] Architecture mapping', {
			processArch: arch,
			mappedArch: archName,
			archiveName
		});

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

			// Make executable on Unix systems (platform is 'darwin' or 'linux' at this point since Windows returns early)
			try {
				await deps.fs.promises.chmod(targetPath, 0o755);
			} catch {
				// Ignore chmod errors
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

	/**
	 * Downloads both 32-bit and 64-bit Windows packages
	 */
	private async downloadWindowsPackages(deps: { fs: FsModule; path: PathModule; https: HttpsModule }, token?: CancellationToken): Promise<string | undefined> {
		const targetDir = deps.path.join(this.userDataPath, 'extensions', 'sqlite-vector', this.version);
		const binaryName = 'vector0.dll';

		// Download 64-bit package (x86_64)
		const archive64Name = `vector-windows-x86_64-${this.version}.tar.gz`;
		const downloadUrl64 = `https://github.com/sqliteai/sqlite-vector/releases/download/${this.version}/${archive64Name}`;
		const archive64Path = deps.path.join(targetDir, archive64Name);
		const targetPath64 = deps.path.join(targetDir, 'x64', binaryName);

		// Download 32-bit package (i686) - if available
		const archive32Name = `vector-windows-i686-${this.version}.tar.gz`;
		const downloadUrl32 = `https://github.com/sqliteai/sqlite-vector/releases/download/${this.version}/${archive32Name}`;
		const archive32Path = deps.path.join(targetDir, archive32Name);
		const targetPath32 = deps.path.join(targetDir, 'x86', binaryName);

		this.logService.info('[VectorExtensionManager] Starting Windows package downloads (32-bit and 64-bit)', {
			archive64Name,
			archive32Name,
			targetDir
		});

		this.status = {
			state: 'downloading',
			progress: 0,
			message: `Downloading sqlite-vector extension (64-bit)...`
		};

		try {
			// Create target directory
			await deps.fs.promises.mkdir(targetDir, { recursive: true });

			// Download and extract 64-bit package
			try {
				this.logService.info('[VectorExtensionManager] Downloading 64-bit package', { downloadUrl64 });
				await this.downloadBinary(deps.https, deps.fs, downloadUrl64, archive64Path, token);
				this.logService.info('[VectorExtensionManager] 64-bit archive downloaded, extracting...', { archive64Path });

				// Create x64 subdirectory
				const x64Dir = deps.path.join(targetDir, 'x64');
				await deps.fs.promises.mkdir(x64Dir, { recursive: true });

				// Extract to x64 subdirectory
				await this.extractArchive(deps.fs, deps.path, archive64Path, x64Dir, binaryName, token);

				// Clean up archive
				try {
					await deps.fs.promises.unlink(archive64Path);
				} catch {
					// Ignore cleanup errors
				}

				this.logService.info('[VectorExtensionManager] 64-bit package downloaded and extracted successfully', { path: targetPath64 });
			} catch (e64) {
				const message64 = e64 instanceof Error ? e64.message : String(e64);
				this.logService.error('[VectorExtensionManager] 64-bit package download failed', { error: message64 });
				// Continue to try 32-bit even if 64-bit fails
			}

			// Download and extract 32-bit package (if available)
			this.status = {
				state: 'downloading',
				progress: 50,
				message: `Downloading sqlite-vector extension (32-bit)...`
			};

			try {
				this.logService.info('[VectorExtensionManager] Downloading 32-bit package', { downloadUrl32 });
				await this.downloadBinary(deps.https, deps.fs, downloadUrl32, archive32Path, token);
				this.logService.info('[VectorExtensionManager] 32-bit archive downloaded, extracting...', { archive32Path });

				// Create x86 subdirectory
				const x86Dir = deps.path.join(targetDir, 'x86');
				await deps.fs.promises.mkdir(x86Dir, { recursive: true });

				// Extract to x86 subdirectory
				await this.extractArchive(deps.fs, deps.path, archive32Path, x86Dir, binaryName, token);

				// Clean up archive
				try {
					await deps.fs.promises.unlink(archive32Path);
				} catch {
					// Ignore cleanup errors
				}

				this.logService.info('[VectorExtensionManager] 32-bit package downloaded and extracted successfully', { path: targetPath32 });
			} catch (e32) {
				const message32 = e32 instanceof Error ? e32.message : String(e32);
				// 32-bit package might not exist, which is okay
				this.logService.warn('[VectorExtensionManager] 32-bit package download failed (may not be available)', { error: message32 });
			}

			// Return the 64-bit path if it exists, otherwise try 32-bit
			if (deps.fs.existsSync(targetPath64)) {
				this.status = { state: 'ready', progress: 100 };
				// Also create a symlink/copy at the root for backward compatibility
				const rootPath = deps.path.join(targetDir, binaryName);
				try {
					if (!deps.fs.existsSync(rootPath)) {
						await deps.fs.promises.copyFile(targetPath64, rootPath);
						this.logService.info('[VectorExtensionManager] Created root-level copy for backward compatibility', { rootPath });
					}
				} catch {
					// Ignore copy errors
				}
				return targetPath64;
			} else if (deps.fs.existsSync(targetPath32)) {
				this.status = { state: 'ready', progress: 100 };
				return targetPath32;
			} else {
				throw new Error('Neither 64-bit nor 32-bit package was successfully downloaded');
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.status = {
				state: 'error',
				progress: 0,
				message: `Download failed: ${message}`
			};
			this.logService.error('[VectorExtensionManager] Windows package download failed', { error: message });
			return undefined;
		}
	}
}

