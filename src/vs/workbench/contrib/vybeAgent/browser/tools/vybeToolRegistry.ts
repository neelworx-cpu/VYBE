/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Tool Registry
 *
 * Central registry for all agent tools. Tools are registered at startup
 * and can be queried for their definitions and executed.
 */

import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import type { ToolDefinition, JSONSchema } from '../../common/vybeAgentTypes.js';
import type { IVybeAgentEventEmitter } from '../../common/vybeAgentEvents.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Context provided to tool execution
 */
export interface ToolContext {
	/** Workspace root URI */
	workspaceRoot: URI;
	/** Cancellation token for aborting */
	cancellationToken: CancellationToken;
	/** Event emitter for tool events */
	eventEmitter: IVybeAgentEventEmitter;
	/** Task ID for event correlation */
	taskId: string;
}

/**
 * Result of tool execution
 */
export interface ToolExecutionResult {
	/** The result data (JSON-serializable) */
	result: unknown;
	/** Error message if execution failed */
	error?: string;
	/** Execution time in milliseconds */
	executionTimeMs: number;
}

/**
 * Tool capability requirements
 */
export type ToolCapability = 'fileSystem' | 'terminal' | 'search' | 'editor' | 'git' | 'network';

/**
 * Tool definition interface
 */
export interface VybeTool {
	/** Unique tool name */
	name: string;
	/** Human-readable description */
	description: string;
	/** JSON Schema for parameters */
	parameters: JSONSchema;
	/** Required capabilities (for permission checking) */
	requiredCapabilities?: ToolCapability[];
	/** Whether this tool can run in parallel with others */
	parallelizable?: boolean;
	/** Whether results can be cached */
	cacheable?: boolean;
	/** Cache TTL in milliseconds (if cacheable) */
	cacheTtlMs?: number;
	/** Execute the tool */
	execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}

// ============================================================================
// Tool Registry
// ============================================================================

export class VybeToolRegistry {
	private tools = new Map<string, VybeTool>();

	/**
	 * Register a tool
	 */
	register(tool: VybeTool): void {
		if (this.tools.has(tool.name)) {
			console.warn(`[VybeToolRegistry] Tool already registered: ${tool.name}`);
		}
		this.tools.set(tool.name, tool);
	}

	/**
	 * Unregister a tool
	 */
	unregister(name: string): boolean {
		return this.tools.delete(name);
	}

	/**
	 * Get a tool by name
	 */
	getTool(name: string): VybeTool | undefined {
		return this.tools.get(name);
	}

	/**
	 * Check if a tool exists
	 */
	hasTool(name: string): boolean {
		return this.tools.has(name);
	}

	/**
	 * Get all registered tools
	 */
	getAllTools(): VybeTool[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Get tool names
	 */
	getToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	/**
	 * Get tools that can run in parallel
	 */
	getParallelizableTools(): VybeTool[] {
		return this.getAllTools().filter(t => t.parallelizable === true);
	}

	/**
	 * Get tools that have cacheable results
	 */
	getCacheableTools(): VybeTool[] {
		return this.getAllTools().filter(t => t.cacheable === true);
	}

	/**
	 * Get tools by capability requirement
	 */
	getToolsByCapability(capability: ToolCapability): VybeTool[] {
		return this.getAllTools().filter(t =>
			t.requiredCapabilities?.includes(capability)
		);
	}

	/**
	 * Convert all tools to LLM tool definitions
	 */
	getToolDefinitions(): ToolDefinition[] {
		return this.getAllTools().map(tool => ({
			type: 'function' as const,
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			},
		}));
	}

	/**
	 * Convert specific tools to LLM tool definitions
	 */
	getToolDefinitionsFor(names: string[]): ToolDefinition[] {
		return names
			.map(name => this.getTool(name))
			.filter((tool): tool is VybeTool => tool !== undefined)
			.map(tool => ({
				type: 'function' as const,
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters,
				},
			}));
	}

	/**
	 * Execute a tool
	 */
	async execute(
		name: string,
		args: Record<string, unknown>,
		context: ToolContext
	): Promise<ToolExecutionResult> {
		const startTime = Date.now();
		const tool = this.getTool(name);

		if (!tool) {
			return {
				result: null,
				error: `Tool not found: ${name}`,
				executionTimeMs: Date.now() - startTime,
			};
		}

		try {
			const result = await tool.execute(args, context);
			return {
				result,
				executionTimeMs: Date.now() - startTime,
			};
		} catch (error) {
			return {
				result: null,
				error: error instanceof Error ? error.message : String(error),
				executionTimeMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Check if a tool call should use cache
	 */
	shouldCache(name: string): boolean {
		const tool = this.getTool(name);
		return tool?.cacheable === true;
	}

	/**
	 * Get cache TTL for a tool
	 */
	getCacheTtl(name: string): number {
		const tool = this.getTool(name);
		return tool?.cacheTtlMs ?? 60000; // Default 1 minute
	}
}

// ============================================================================
// Singleton
// ============================================================================

let instance: VybeToolRegistry | null = null;

export function getToolRegistry(): VybeToolRegistry {
	if (!instance) {
		instance = new VybeToolRegistry();
	}
	return instance;
}

/**
 * Register all core tools
 * Called during contribution initialization
 */
export function registerCoreTools(registry: VybeToolRegistry): void {
	// Tools are registered by individual tool modules
	// This function is called from the contribution to trigger registration
	console.log('[VybeToolRegistry] Core tools registration initialized');
}






