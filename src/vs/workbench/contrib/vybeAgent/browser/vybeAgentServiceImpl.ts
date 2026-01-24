/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Agent Service Implementation
 *
 * Main service that orchestrates agent functionality.
 * Uses LangGraph for sequential tool execution and human-in-the-loop.
 */

import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITerminalService, ITerminalGroupService } from '../../terminal/browser/terminal.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IVoyageEmbeddingService } from '../../../services/indexing/common/voyageEmbeddingService.js';
import { IPineconeVectorStore } from '../../../services/indexing/common/pineconeVectorStore.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IVybeAgentService } from '../common/vybeAgentService.js';
import {
	createToolCallEvent,
	createToolResultEvent,
	createAssistantDeltaEvent,
	createThinkingDeltaEvent,
	createAgentPhaseEvent,
	createTaskCompleteEvent,
	createErrorEvent,
	type VybeAgentEvent,
	type IVybeAgentEventEmitter
} from '../common/vybeAgentEvents.js';
import type { SolveTaskParams, AgentTaskState } from '../common/vybeAgentTypes.js';
// Tool registry - needed for browser-side tool execution via IPC
import { VybeToolRegistry, getToolRegistry } from './tools/vybeToolRegistry.js';
import { createReadFileTool } from './tools/vybeReadFileTool.js';
// write_file tool removed - use edit_file for all file operations
import { createListDirTool } from './tools/vybeListDirTool.js';
import { createGrepTool } from './tools/vybeGrepTool.js';
import { createTerminalTool } from './tools/vybeTerminalTool.js';
import { createEditFileTool } from './tools/vybeEditFileTool.js';
import { createCodebaseSearchTool } from './tools/vybeCodebaseSearchTool.js';
import { createDeleteFileTool } from './tools/vybeDeleteFileTool.js';

// LangGraph Client - Uses IPC to communicate with main process
// LangChain packages are loaded in main process, not browser
import {
	VybeLangGraphClient,
	getLangGraphClient,
} from './langgraph/vybeLangGraphClient.js';

// ============================================================================
// Event Emitter Implementation
// ============================================================================

class AgentEventEmitter implements IVybeAgentEventEmitter {
	private readonly _onEvent = new Emitter<VybeAgentEvent>();
	readonly onEvent = this._onEvent.event;

	emit(event: VybeAgentEvent): void {
		try {
			this._onEvent.fire(event);
		} catch (error) {
			console.error('[AgentEventEmitter] Error firing event:', error);
		}
	}

	emitToolCall(taskId: string, toolCall: { id: string; name: string; arguments: Record<string, unknown> }): void {
		this.emit(createToolCallEvent(taskId, toolCall));
	}

	emitToolResult(taskId: string, result: { tool_id: string; tool_name: string; result: unknown; error?: string }): void {
		this.emit(createToolResultEvent(taskId, result));
	}

	emitAssistantDelta(taskId: string, content: string): void {
		this.emit(createAssistantDeltaEvent(taskId, content));
	}

	emitThinkingDelta(taskId: string, content: string): void {
		this.emit(createThinkingDeltaEvent(taskId, content));
	}

	emitPhase(taskId: string, phase: 'planning' | 'acting' | 'reflecting' | 'finalizing', visibility?: 'user' | 'debug'): void {
		this.emit(createAgentPhaseEvent(taskId, phase, visibility));
	}

	emitTaskComplete(taskId: string, status: 'success' | 'failed' | 'cancelled', summary?: string): void {
		this.emit(createTaskCompleteEvent(taskId, status, summary));
	}

	emitError(taskId: string, error: string, code?: string, recoverable?: boolean): void {
		this.emit(createErrorEvent(taskId, error, code, recoverable));
	}

	dispose(): void {
		this._onEvent.dispose();
	}
}

// ============================================================================
// Agent Service Implementation
// ============================================================================

export class VybeAgentServiceImpl extends Disposable implements IVybeAgentService {
	declare readonly _serviceBrand: undefined;

	// Tool registry - executes tools in browser process when requested by LangGraph
	private readonly toolRegistry: VybeToolRegistry;
	private readonly eventEmitter: AgentEventEmitter;

	// LangGraph client - communicates with main process via IPC
	private readonly langGraphClient: VybeLangGraphClient;
	private langGraphEnabled: boolean = false; // Will be set based on availability check

	private readonly _onDidEmitEvent = this._register(new Emitter<VybeAgentEvent>());

	// Track listeners directly to ensure delivery
	private readonly directListeners = new Set<(event: VybeAgentEvent) => void>();

	// Expose the event with direct listener tracking
	readonly onDidEmitEvent: Event<VybeAgentEvent> = (listener: (e: VybeAgentEvent) => void, thisArgs?: unknown, disposables?: IDisposable[] | DisposableStore) => {
		// Wrap listener to track it
		const wrappedListener = (e: VybeAgentEvent) => {
			if (thisArgs) {
				listener.call(thisArgs, e);
			} else {
				listener(e);
			}
		};

		this.directListeners.add(wrappedListener);

		// Also register with the emitter
		const disposable = this._onDidEmitEvent.event(wrappedListener, thisArgs, disposables);

		// Return a disposable that removes from both
		return {
			dispose: () => {
				this.directListeners.delete(wrappedListener);
				disposable.dispose();
			}
		};
	};

	// Track active LangGraph tasks for cancellation
	private readonly activeTasks = new Set<string>();

	private readonly apiKeys = new Map<string, string>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ISearchService private readonly searchService: ISearchService,
		@IEditorService private readonly editorService: IEditorService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ITerminalGroupService private readonly terminalGroupService: ITerminalGroupService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IVoyageEmbeddingService private readonly voyageService: IVoyageEmbeddingService,
		@IPineconeVectorStore private readonly pineconeStore: IPineconeVectorStore,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// Initialize components
		this.eventEmitter = new AgentEventEmitter();
		this.toolRegistry = getToolRegistry();

		// Initialize LangGraph client (communicates with main process)
		this.langGraphClient = getLangGraphClient();

		// Set up tool executor for LangGraph
		this.langGraphClient.setToolExecutor(async (toolName, args) => {
			const tool = this.toolRegistry.getTool(toolName);
			if (!tool) {
				throw new Error(`Tool not found: ${toolName}`);
			}
			const result = await tool.execute(args, {
				workspaceRoot: this.workspaceService.getWorkspace().folders[0]?.uri || URI.file('/'),
				cancellationToken: CancellationToken.None,
				eventEmitter: this.eventEmitter,
				taskId: 'langgraph',
			});
			return result;
		});

		// Forward LangGraph events to the event emitter
		this._register(this.langGraphClient.onEvent(langEvent => {
			const vybeEvent = VybeLangGraphClient.convertToVybeEvent(langEvent);
			if (vybeEvent) {
				this.eventEmitter.emit(vybeEvent);
			}
		}));

		// Check LangGraph availability asynchronously
		this.initializeLangGraph();

		// Forward events through Event system
		this._register(this.eventEmitter.onEvent(event => {
			// Fire through Event system (this will call all registered listeners)
			try {
				this._onDidEmitEvent.fire(event);
			} catch (error) {
				console.error('[VybeAgentService] Error firing event through emitter:', error, event);
			}
		}));

		// Register tools
		this.registerTools();

		this.logService.info('[VybeAgentService] Service initialized with LangGraph support');
	}

	/**
	 * Initialize LangGraph by checking main process availability.
	 * Uses longer delays to handle startup race conditions where the main
	 * process may not have registered handlers yet.
	 */
	private async initializeLangGraph(): Promise<void> {
		try {
			// Wait a bit before first check to give main process time to register handlers
			await new Promise(resolve => setTimeout(resolve, 1000));
			const status = await this.langGraphClient.getStatus(5, 1000);
			this.langGraphEnabled = status.available && status.initialized;
			if (this.langGraphEnabled) {
				this.logService.info('[VybeAgentService] LangGraph enabled (running in main process)');
			} else {
				this.logService.info('[VybeAgentService] LangGraph not available, using legacy agent loop');
			}
		} catch (error) {
			this.logService.warn('[VybeAgentService] Failed to check LangGraph status:', error);
			this.langGraphEnabled = false;
		}
	}

	/**
	 * Register all core tools
	 */
	private registerTools(): void {
		this.toolRegistry.register(createReadFileTool(this.fileService, this.workspaceService));
		// write_file tool removed - use edit_file for all file operations (create, overwrite, edit)
		this.toolRegistry.register(createListDirTool(this.fileService, this.workspaceService));
		this.toolRegistry.register(createGrepTool(this.searchService, this.workspaceService));
		this.toolRegistry.register(createTerminalTool(this.terminalService, this.terminalGroupService, this.workspaceService, this.storageService));
		this.toolRegistry.register(createEditFileTool(
			this.editorService,
			this.textFileService,
			this.fileService,
			this.workspaceService
		));
		this.toolRegistry.register(createCodebaseSearchTool(
			this.voyageService,
			this.pineconeStore,
			this.configurationService,
			this.workspaceService
		));
		this.toolRegistry.register(createDeleteFileTool(
			this.fileService,
			this.workspaceService
		));

		this.logService.info(`[VybeAgentService] Registered ${this.toolRegistry.getToolNames().length} tools`);
	}

	/**
	 * Execute an agent task using LangGraph
	 * LangGraph runs in main process for sequential tool execution and HITL
	 */
	async solveTask(params: SolveTaskParams): Promise<string> {
		const taskId = params.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		// Get workspace root
		const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder open');
		}

		const workspaceRoot = workspaceFolder.uri;

		// Removed noisy log: task start
		return this.solveTaskWithLangGraph(params, taskId, workspaceRoot.fsPath);
	}

	/**
	 * Execute task using LangGraph agent via IPC
	 * Provides sequential tool calling and human-in-the-loop
	 */
	private async solveTaskWithLangGraph(
		params: SolveTaskParams,
		taskId: string,
		workspaceRoot: string
	): Promise<string> {
		// Track active task
		this.activeTasks.add(taskId);

		// Emit task start
		this.eventEmitter.emitPhase(taskId, 'planning');

		// Get active file if available
		const activeFile = this.editorService.activeEditor?.resource?.fsPath;

		// Start task via IPC
		try {
			await this.langGraphClient.startTask({
				taskId,
				goal: params.goal,
				model: params.modelId, // Pass selected model to LangGraph
				level: params.agentLevel || 'L2', // Pass budget tier (L1/L2/L3)
				reasoningLevel: params.reasoningLevel || 'medium', // Pass reasoning level (defaults to medium)
				context: {
					workspaceRoot,
					activeFile,
					projectType: this.detectProjectType(workspaceRoot),
				},
			});

			return taskId;
		} catch (error) {
			this.activeTasks.delete(taskId);
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[VybeAgentService] LangGraph task failed: ${errorMessage}`);
			this.eventEmitter.emitError(taskId, errorMessage, 'LANGGRAPH_ERROR', false);
			throw error;
		}
	}

	/**
	 * Detect project type from workspace.
	 */
	private detectProjectType(workspaceRoot: string): string {
		// Simple detection based on common files
		// In a real implementation, this would check for package.json, Cargo.toml, etc.
		return 'typescript'; // Default for now
	}

	/**
	 * Resume a paused task after user approval (HITL)
	 * Called when user clicks Run/Approve in the terminal permission dialog
	 */
	async resumeWithApproval(taskId: string, decision: 'approve' | 'reject'): Promise<void> {
		this.logService.info(`[VybeAgentService] Resuming task ${taskId} with decision: ${decision}`);

		try {
			// Resume via LangGraph client (IPC to main process)
			await this.langGraphClient.resumeWithApproval(taskId, decision);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[VybeAgentService] Resume error: ${errorMessage}`);
			this.eventEmitter.emitError(taskId, errorMessage, 'RESUME_ERROR', false);
		}
	}

	/**
	 * Cancel a running task
	 */
	async cancelTask(taskId: string): Promise<void> {
		if (!this.activeTasks.has(taskId)) {
			this.logService.warn(`[VybeAgentService] Task not found: ${taskId}`);
			return;
		}

		try {
			await this.langGraphClient.cancelTask(taskId);
			this.activeTasks.delete(taskId);
			this.logService.info(`[VybeAgentService] Task cancelled: ${taskId}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[VybeAgentService] Cancel error: ${errorMessage}`);
		}
	}

	/**
	 * Get task state - returns if task is active
	 * Note: Full state is managed in main process LangGraph
	 */
	getTaskState(taskId: string): AgentTaskState | undefined {
		// State is managed in main process - just return if task exists
		if (!this.activeTasks.has(taskId)) {
			return undefined;
		}
		// Return minimal state indicating task is running
		// The actual state is in the main process LangGraph service
		return undefined;
	}

	/**
	 * Set API key for a provider
	 * Stored locally and forwarded to main process via IPC
	 */
	async setApiKey(provider: string, apiKey: string): Promise<void> {
		this.apiKeys.set(provider, apiKey);

		// Forward to main process via IPC (the ipcRenderer.invoke is in the client)
		// API keys are handled via the existing vscode:vybeSetApiKey channel
		const { ipcRenderer } = await import('../../../../base/parts/sandbox/electron-browser/globals.js');
		if (ipcRenderer) {
			try {
				await ipcRenderer.invoke('vscode:vybeSetApiKey', provider, apiKey);
				this.logService.info(`[VybeAgentService] API key set for: ${provider}`);
			} catch (error) {
				this.logService.warn(`[VybeAgentService] Failed to set API key: ${error}`);
			}
		}
	}

	/**
	 * Check if provider has API key
	 */
	hasApiKey(provider: string): boolean {
		return this.apiKeys.has(provider);
	}

	override dispose(): void {
		// Cancel all active tasks
		for (const taskId of this.activeTasks) {
			this.langGraphClient.cancelTask(taskId).catch(() => { /* ignore */ });
			this.logService.info(`[VybeAgentService] Cancelled task on dispose: ${taskId}`);
		}
		this.activeTasks.clear();

		this.eventEmitter.dispose();
		super.dispose();
	}
}

