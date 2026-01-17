/*---------------------------------------------------------------------------------------------
 *  VYBE - LangChain Module Loader
 *  Lazy-loads LangChain packages since they're ES modules and VS Code uses AMD
 *  This service loads modules on-demand and caches them
 *--------------------------------------------------------------------------------------------*/

// =====================================================
// LAZY LOADER FOR LANGCHAIN MODULES
// =====================================================
// Since LangChain packages are ES modules and VS Code uses AMD,
// we need to load them dynamically at runtime

class LangChainLoader {
	private static cache = new Map<string, Promise<any>>();

	/**
	 * Load a LangChain module dynamically
	 * Uses Node.js require() in Node context, or dynamic import in browser
	 */
	private static async loadModule<T>(moduleName: string): Promise<T> {
		if (this.cache.has(moduleName)) {
			return this.cache.get(moduleName)!;
		}

		const loadPromise = (async () => {
			try {
				// In Node.js context (main process), use require
				if (typeof require !== 'undefined') {
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					return require(moduleName) as T;
				}
				// In browser context, try dynamic import
				if (typeof window !== 'undefined') {
					const module = await import(moduleName);
					return module as T;
				}
				throw new Error(`Cannot load module ${moduleName} - neither require nor import available`);
			} catch (error) {
				console.error(`[LangChainLoader] Failed to load ${moduleName}:`, error);
				throw error;
			}
		})();

		this.cache.set(moduleName, loadPromise);
		return loadPromise;
	}

	/**
	 * Load @langchain/langgraph
	 */
	static async loadLangGraph(): Promise<typeof import('@langchain/langgraph')> {
		return this.loadModule('@langchain/langgraph');
	}

	/**
	 * Load @langchain/core
	 */
	static async loadLangChainCore(): Promise<typeof import('@langchain/core/messages')> {
		return this.loadModule('@langchain/core');
	}

	/**
	 * Load @langchain/openai
	 */
	static async loadOpenAI(): Promise<typeof import('@langchain/openai')> {
		return this.loadModule('@langchain/openai');
	}

	/**
	 * Load @langchain/anthropic
	 */
	static async loadAnthropic(): Promise<typeof import('@langchain/anthropic')> {
		return this.loadModule('@langchain/anthropic');
	}

	/**
	 * Load @langchain/google-genai
	 */
	static async loadGoogleGenAI(): Promise<typeof import('@langchain/google-genai')> {
		return this.loadModule('@langchain/google-genai');
	}

	/**
	 * Load @langchain/ollama
	 */
	static async loadOllama(): Promise<typeof import('@langchain/ollama')> {
		return this.loadModule('@langchain/ollama');
	}

	/**
	 * Load zod
	 */
	static async loadZod(): Promise<typeof import('zod')> {
		return this.loadModule('zod');
	}
}

export default LangChainLoader;





