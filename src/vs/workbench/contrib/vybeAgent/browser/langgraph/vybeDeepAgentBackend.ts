/*---------------------------------------------------------------------------------------------
 *  VYBE - Deep Agent Backends
 *  Pluggable filesystem backends for deep agent tools
 *  Routes different paths to different storage backends
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

// =====================================================
// BACKEND INTERFACE
// =====================================================

export interface VybeBackend {
	name: string;

	// File operations
	readFile(filePath: string): Promise<string>;
	writeFile(filePath: string, content: string): Promise<void>;
	exists(filePath: string): Promise<boolean>;
	delete(filePath: string): Promise<void>;

	// Directory operations
	listDir(dirPath: string): Promise<string[]>;
	mkdir(dirPath: string): Promise<void>;

	// Search operations
	glob(pattern: string): Promise<string[]>;
	grep(pattern: string, filePath?: string): Promise<string>;
}

// =====================================================
// DISK BACKEND
// =====================================================
// Reads/writes to the actual filesystem

export class DiskBackend implements VybeBackend {
	name = 'disk';
	private root: string;

	constructor(options: { root: string }) {
		this.root = options.root.replace('~', process.env.HOME || '');
	}

	private resolvePath(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}
		return path.join(this.root, filePath);
	}

	async readFile(filePath: string): Promise<string> {
		const fullPath = this.resolvePath(filePath);
		return fs.promises.readFile(fullPath, 'utf-8');
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const fullPath = this.resolvePath(filePath);
		await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
		await fs.promises.writeFile(fullPath, content, 'utf-8');
	}

	async exists(filePath: string): Promise<boolean> {
		const fullPath = this.resolvePath(filePath);
		try {
			await fs.promises.access(fullPath);
			return true;
		} catch {
			return false;
		}
	}

	async delete(filePath: string): Promise<void> {
		const fullPath = this.resolvePath(filePath);
		await fs.promises.unlink(fullPath);
	}

	async listDir(dirPath: string): Promise<string[]> {
		const fullPath = this.resolvePath(dirPath);
		const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
		return entries.map(e => e.isDirectory() ? `${e.name}/` : e.name);
	}

	async mkdir(dirPath: string): Promise<void> {
		const fullPath = this.resolvePath(dirPath);
		await fs.promises.mkdir(fullPath, { recursive: true });
	}

	async glob(pattern: string): Promise<string[]> {
		// Simple glob implementation
		const results: string[] = [];
		const walk = async (dir: string) => {
			const entries = await fs.promises.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				const relativePath = path.relative(this.root, fullPath);

				if (entry.isDirectory()) {
					// Skip node_modules and .git
					if (entry.name !== 'node_modules' && entry.name !== '.git') {
						await walk(fullPath);
					}
				} else if (this.matchGlob(relativePath, pattern)) {
					results.push(relativePath);
				}
			}
		};

		await walk(this.root);
		return results;
	}

	async grep(pattern: string, filePath?: string): Promise<string> {
		const files = filePath ? [filePath] : await this.glob('**/*');
		const regex = new RegExp(pattern, 'g');
		const results: string[] = [];

		for (const file of files) {
			try {
				const content = await this.readFile(file);
				const lines = content.split('\n');

				lines.forEach((line, index) => {
					if (regex.test(line)) {
						results.push(`${file}:${index + 1}:${line}`);
					}
					regex.lastIndex = 0; // Reset for global regex
				});
			} catch {
				// Skip unreadable files
			}
		}

		return results.join('\n');
	}

	private matchGlob(filePath: string, pattern: string): boolean {
		const regex = new RegExp(
			'^' +
			pattern
				.replace(/\*\*/g, '.*')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '.') +
			'$'
		);
		return regex.test(filePath);
	}
}

// =====================================================
// STATE BACKEND
// =====================================================
// Ephemeral in-memory storage for the current run

export class StateBackend implements VybeBackend {
	name = 'state';
	private storage = new Map<string, string>();

	async readFile(filePath: string): Promise<string> {
		const content = this.storage.get(filePath);
		if (content === undefined) {
			throw new Error(`File not found: ${filePath}`);
		}
		return content;
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		this.storage.set(filePath, content);
	}

	async exists(filePath: string): Promise<boolean> {
		return this.storage.has(filePath);
	}

	async delete(filePath: string): Promise<void> {
		this.storage.delete(filePath);
	}

	async listDir(dirPath: string): Promise<string[]> {
		const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
		const results = new Set<string>();

		for (const key of this.storage.keys()) {
			if (key.startsWith(prefix)) {
				const rest = key.slice(prefix.length);
				const firstPart = rest.split('/')[0];
				results.add(rest.includes('/') ? `${firstPart}/` : firstPart);
			}
		}

		return Array.from(results);
	}

	async mkdir(_dirPath: string): Promise<void> {
		// No-op for state backend
	}

	async glob(pattern: string): Promise<string[]> {
		const regex = new RegExp(
			'^' +
			pattern
				.replace(/\*\*/g, '.*')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '.') +
			'$'
		);

		return Array.from(this.storage.keys()).filter(key => regex.test(key));
	}

	async grep(pattern: string, filePath?: string): Promise<string> {
		const files = filePath ? [filePath] : Array.from(this.storage.keys());
		const regex = new RegExp(pattern, 'g');
		const results: string[] = [];

		for (const file of files) {
			const content = this.storage.get(file);
			if (!content) continue;

			const lines = content.split('\n');
			lines.forEach((line, index) => {
				if (regex.test(line)) {
					results.push(`${file}:${index + 1}:${line}`);
				}
				regex.lastIndex = 0;
			});
		}

		return results.join('\n');
	}

	clear(): void {
		this.storage.clear();
	}
}

// =====================================================
// STORE BACKEND
// =====================================================
// Cross-conversation persistence using LangGraph store

export class StoreBackend implements VybeBackend {
	name = 'store';
	private store: Map<string, string>;
	private namespace: string;

	constructor(options?: { namespace?: string }) {
		this.store = new Map();
		this.namespace = options?.namespace || 'vybe_store';
	}

	private getKey(filePath: string): string {
		return `${this.namespace}:${filePath}`;
	}

	async readFile(filePath: string): Promise<string> {
		const content = this.store.get(this.getKey(filePath));
		if (content === undefined) {
			throw new Error(`File not found in store: ${filePath}`);
		}
		return content;
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		this.store.set(this.getKey(filePath), content);
	}

	async exists(filePath: string): Promise<boolean> {
		return this.store.has(this.getKey(filePath));
	}

	async delete(filePath: string): Promise<void> {
		this.store.delete(this.getKey(filePath));
	}

	async listDir(dirPath: string): Promise<string[]> {
		const prefix = this.getKey(dirPath.endsWith('/') ? dirPath : `${dirPath}/`);
		const results = new Set<string>();

		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) {
				const rest = key.slice(prefix.length);
				const firstPart = rest.split('/')[0];
				results.add(rest.includes('/') ? `${firstPart}/` : firstPart);
			}
		}

		return Array.from(results);
	}

	async mkdir(_dirPath: string): Promise<void> {
		// No-op for store backend
	}

	async glob(pattern: string): Promise<string[]> {
		const regex = new RegExp(
			'^' + this.namespace + ':' +
			pattern
				.replace(/\*\*/g, '.*')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '.') +
			'$'
		);

		return Array.from(this.store.keys())
			.filter(key => regex.test(key))
			.map(key => key.slice(this.namespace.length + 1));
	}

	async grep(pattern: string, filePath?: string): Promise<string> {
		const files = filePath ? [filePath] : await this.glob('**/*');
		const regex = new RegExp(pattern, 'g');
		const results: string[] = [];

		for (const file of files) {
			try {
				const content = await this.readFile(file);
				const lines = content.split('\n');

				lines.forEach((line, index) => {
					if (regex.test(line)) {
						results.push(`${file}:${index + 1}:${line}`);
					}
					regex.lastIndex = 0;
				});
			} catch {
				// Skip unreadable files
			}
		}

		return results.join('\n');
	}
}

// =====================================================
// COMPOSITE BACKEND
// =====================================================
// Routes different paths to different backends

export interface CompositeRoute {
	pattern: string;
	backend: VybeBackend;
}

export class CompositeBackend implements VybeBackend {
	name = 'composite';
	private routes: CompositeRoute[];
	private defaultBackend: VybeBackend;

	constructor(options: {
		routes: Record<string, VybeBackend>;
		default?: VybeBackend;
	}) {
		this.routes = Object.entries(options.routes).map(([pattern, backend]) => ({
			pattern,
			backend,
		}));
		this.defaultBackend = options.default || new StateBackend();
	}

	private getBackend(filePath: string): VybeBackend {
		for (const route of this.routes) {
			if (filePath.startsWith(route.pattern)) {
				return route.backend;
			}
		}
		return this.defaultBackend;
	}

	private stripPrefix(filePath: string): string {
		for (const route of this.routes) {
			if (filePath.startsWith(route.pattern)) {
				return filePath.slice(route.pattern.length);
			}
		}
		return filePath;
	}

	async readFile(filePath: string): Promise<string> {
		return this.getBackend(filePath).readFile(this.stripPrefix(filePath));
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		return this.getBackend(filePath).writeFile(this.stripPrefix(filePath), content);
	}

	async exists(filePath: string): Promise<boolean> {
		return this.getBackend(filePath).exists(this.stripPrefix(filePath));
	}

	async delete(filePath: string): Promise<void> {
		return this.getBackend(filePath).delete(this.stripPrefix(filePath));
	}

	async listDir(dirPath: string): Promise<string[]> {
		return this.getBackend(dirPath).listDir(this.stripPrefix(dirPath));
	}

	async mkdir(dirPath: string): Promise<void> {
		return this.getBackend(dirPath).mkdir(this.stripPrefix(dirPath));
	}

	async glob(pattern: string): Promise<string[]> {
		// Search all backends and combine results
		const allResults: string[] = [];

		for (const route of this.routes) {
			const results = await route.backend.glob(pattern);
			allResults.push(...results.map(r => `${route.pattern}${r}`));
		}

		const defaultResults = await this.defaultBackend.glob(pattern);
		allResults.push(...defaultResults);

		return allResults;
	}

	async grep(pattern: string, filePath?: string): Promise<string> {
		if (filePath) {
			return this.getBackend(filePath).grep(pattern, this.stripPrefix(filePath));
		}

		// Search all backends
		const allResults: string[] = [];

		for (const route of this.routes) {
			const results = await route.backend.grep(pattern);
			if (results) {
				allResults.push(results);
			}
		}

		const defaultResults = await this.defaultBackend.grep(pattern);
		if (defaultResults) {
			allResults.push(defaultResults);
		}

		return allResults.join('\n');
	}
}

// =====================================================
// CREATE VYBE BACKEND
// =====================================================

/**
 * Create the standard VYBE backend configuration
 */
export function createVybeBackend(workspaceRoot: string): CompositeBackend {
	return new CompositeBackend({
		routes: {
			'/memories/': new DiskBackend({ root: '~/.vybe/memories' }),
			'/workspace/': new DiskBackend({ root: workspaceRoot }),
			'/state/': new StateBackend(),
			'/store/': new StoreBackend(),
		},
		default: new DiskBackend({ root: workspaceRoot }),
	});
}





