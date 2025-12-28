/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { autorun } from '../../../../base/common/observable.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResultTextPart, ToolDataSource, ToolProgress } from '../../chat/common/languageModelToolsService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IMcpService } from './mcpTypes.js';
import { VybeMcpRouter } from './vybeMcpRouter.js';
import { GetContextForMcpRequest, ListIndexStatusRequest, RefreshIndexRequest, SearchHybridRequest, disabledContextResponse, disabledRefreshResponse, disabledSearchResponse, disabledStatusResponse } from './vybeMcpTools.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CONFIG_ENABLE_LOCAL_INDEXING } from '../../../services/indexing/common/indexingConfiguration.js';
import { IVybeLLMMessageService } from '../../../contrib/vybeLLM/common/vybeLLMMessageService.js';
import { IVybeLLMModelService } from '../../../contrib/vybeLLM/common/vybeLLMModelService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { handleVybeSendLLMMessage, handleVybeListModels, handleVybeAbortLLMRequest } from '../../../contrib/vybeLLM/browser/tools/vybeLLMMCPTool.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IVybeDiffService } from '../../../contrib/vybeChat/common/vybeDiffService.js';
import { IVybeEditService } from '../../../contrib/vybeChat/common/vybeEditService.js';
import {
	handleVybeReadFile,
	handleVybeListFiles,
	handleVybeGetFileInfo,
	handleVybeComputeDiff,
	handleVybeGetDiffAreas
} from '../browser/tools/vybeReadOnlyToolHandlers.js';
import {
	handleVybeCreateEditTransaction,
	handleVybeAcceptDiff,
	handleVybeRejectDiff,
	handleVybeAcceptFile,
	handleVybeRejectFile
} from '../browser/tools/vybeMutationToolHandlers.js';
import { IVybeMcpToolApprovalService } from './vybeMcpToolApprovalService.js';
import { isNative } from '../../../../base/common/platform.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';

class VybeLocalMcpServer {
	private router: VybeMcpRouter | undefined;
	private activated = false;

	constructor(
		private readonly instantiationService: IInstantiationService,
		private readonly configurationService: IConfigurationService,
	) { }

	ensureRouter(): VybeMcpRouter | undefined {
		if (!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING)) {
			return undefined;
		}
		if (!this.router) {
			this.router = this.instantiationService.createInstance(VybeMcpRouter);
			this.activated = true;
		}
		return this.router;
	}

	isActivated(): boolean {
		return this.activated;
	}
}

export class VybeMcpToolContribution extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.vybe.mcp.tools';

	constructor(
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IMcpService _mcpService: IMcpService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IVybeLLMMessageService private readonly llmService: IVybeLLMMessageService,
		@IVybeLLMModelService private readonly modelService: IVybeLLMModelService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IVybeDiffService private readonly diffService: IVybeDiffService,
		@IVybeEditService private readonly editService: IVybeEditService,
		@IVybeMcpToolApprovalService private readonly approvalService: IVybeMcpToolApprovalService,
	) {
		super();

		// Initialize stdio tool host and launcher (Phase 1)
		// Use void to fire and forget (async initialization)
		void this.initializeStdioToolHost();

		const previous = this._register(new DisposableStore());

		const localServer = new VybeLocalMcpServer(this.instantiationService, this.configurationService);

		this._register(autorun(reader => {
			previous.clear();

			const source: ToolDataSource = ToolDataSource.Internal;

			type ToolDef = { id: string; displayName: string; description: string; icon: ThemeIcon; handler: (params: unknown, token: CancellationToken) => Promise<unknown> };
			const tools: ToolDef[] = [
				{
					id: 'vybe.get_context_for_mcp',
					displayName: 'VYBE: Get Context',
					description: 'Returns local index context bundle (gated).',
					icon: Codicon.database,
					handler: async (params, token) => {
						const router = localServer.ensureRouter();
						if (!router) {
							return disabledContextResponse();
						}
						return router.handleGetContext(params as GetContextForMcpRequest, token);
					}
				},
				{
					id: 'vybe.search_hybrid',
					displayName: 'VYBE: Hybrid Search',
					description: 'Performs hybrid lexical/graph/semantic search (gated).',
					icon: Codicon.search,
					handler: async (params, token) => {
						const router = localServer.ensureRouter();
						if (!router) {
							return disabledSearchResponse();
						}
						return router.handleSearchHybrid(params as SearchHybridRequest, token);
					}
				},
				{
					id: 'vybe.list_index_status',
					displayName: 'VYBE: List Index Status',
					description: 'Reports local index status (gated).',
					icon: Codicon.info,
					handler: async (params, _token) => {
						const router = localServer.ensureRouter();
						if (!router) {
							return disabledStatusResponse((params as ListIndexStatusRequest)?.workspaceId ?? '');
						}
						return router.handleListIndexStatus(params as ListIndexStatusRequest);
					}
				},
				{
					id: 'vybe.refresh_index',
					displayName: 'VYBE: Refresh Index',
					description: 'Requests index refresh (gated).',
					icon: Codicon.sync,
					handler: async (params, token) => {
						const router = localServer.ensureRouter();
						if (!router) {
							return disabledRefreshResponse();
						}
						return router.handleRefreshIndex(params as RefreshIndexRequest, token);
					}
				},
				{
					id: 'vybe.send_llm_message',
					displayName: 'VYBE: Send LLM Message',
					description: 'Send LLM message via IDE\'s LLM transport (Ollama, LM Studio). IDE resolves provider/model defaults.',
					icon: Codicon.commentDiscussion,
					handler: async (params, token) => {
						return handleVybeSendLLMMessage(
							this.llmService,
							this.storageService,
							params as {
								messages: Array<{ role: string; content: string }>;
								options?: { temperature?: number; maxTokens?: number };
								stream?: boolean;
							},
							token
						);
					}
				},
				{
					id: 'vybe.list_models',
					displayName: 'VYBE: List Models',
					description: 'List available models from IDE\'s LLM providers (Ollama, LM Studio).',
					icon: Codicon.database,
					handler: async (params, token) => {
						return handleVybeListModels(
							this.modelService,
							params as { providerName?: 'ollama' | 'vLLM' | 'lmStudio' },
							token
						);
					}
				},
			];

			const toolSet = this.toolsService.createToolSet(
				source,
				'vybe-local-index',
				'vybe-local-index',
				{
					icon: Codicon.database,
					description: `${this.productService.nameShort}: Local Index`
				}
			);
			previous.add(toolSet);

			class VybeToolImpl implements IToolImpl {
				constructor(private readonly handler: (params: unknown, token: CancellationToken) => Promise<unknown>) { }
				async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken) {
					const result = await this.handler(invocation.parameters ?? {}, token);
					const payload = { type: 'text', text: JSON.stringify(result) };
					const part: IToolResultTextPart = { kind: 'text', value: JSON.stringify(payload) };
					return { content: [part] };
				}
				async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
					return undefined;
				}
			}

			for (const t of tools) {
				const toolData: IToolData = {
					id: t.id,
					source,
					icon: t.icon,
					displayName: t.displayName,
					userDescription: t.description,
					modelDescription: t.description,
					inputSchema: {
						type: 'object'
					} satisfies IJSONSchema,
					canBeReferencedInPrompt: true,
					alwaysDisplayInputOutput: true,
					canRequestPreApproval: true,
					canRequestPostApproval: false,
					runsInWorkspace: true,
					tags: ['mcp', 'vybe']
				};

				const impl = new VybeToolImpl(t.handler);
				previous.add(this.toolsService.registerTool(toolData, impl));
				previous.add(toolSet.addTool(toolData));
			}

			this.toolsService.flushToolUpdates();
		}));
	}

	/**
	 * Initialize stdio tool host and MCP launcher (Phase 1)
	 * Only runs in Electron (not web), and only if MCP path is configured
	 */
	private async initializeStdioToolHost(): Promise<void> {
		// Only initialize in native/Electron environment (not web)
		// Process spawning must happen in main process, not browser
		// TODO: Move process spawning to main process via IPC channel
		try {
			// Check if we're in native environment (Electron, not web)
			if (!isNative) {
				// Web environment - skip stdio tool host initialization
				console.log('[VYBE MCP] Skipping stdio tool host: not in native environment');
				return;
			}

			// Get environment variable from main process via IPC
			// Main process has access to process.env, renderer does not
			let mcpCommand: string | undefined;

			try {
				// Use ipcRenderer.invoke to call the validatedIpcMain.handle handler
				if (isNative && ipcRenderer) {
					const result = await ipcRenderer.invoke('vscode:getVybeMcpCommand') as string | undefined;
					mcpCommand = result;
				}
			} catch (error) {
				console.warn('[VYBE MCP] Failed to get MCP command from main process:', error);
			}

			// Fallback: try renderer process.env (might work in some Electron setups)
			if (!mcpCommand && typeof process !== 'undefined' && process.env) {
				mcpCommand = process.env.VYBE_MCP_COMMAND;
			}

			// Debug logging
			console.log('[VYBE MCP] Checking for VYBE_MCP_COMMAND:', mcpCommand ? `FOUND: ${mcpCommand}` : 'NOT FOUND');

			// Skip if no MCP command configured
			if (!mcpCommand) {
				// Don't initialize if MCP command is not explicitly configured
				// This prevents errors when MCP is not set up
				console.log('[VYBE MCP] Skipping stdio tool host: VYBE_MCP_COMMAND not set');
				console.log('[VYBE MCP] Note: Set VYBE_MCP_COMMAND environment variable before starting the IDE');
				return;
			}

			console.log('[VYBE MCP] Initializing stdio tool host with command:', mcpCommand);

			// NOTE: Process spawning MUST happen in main process, not renderer.
			// The renderer process cannot access Node.js require() or child_process.
			// For Phase 1, we skip initialization and document this limitation.
			// TODO: Move process spawning to main process via IPC channel.
			// The main process should:
			// 1. Spawn MCP subprocess
			// 2. Create stdio tool host in main process
			// 3. Expose tool calls via IPC channel to renderer
			// 4. Renderer calls tools via IPC, main process executes them

			// Request main process to spawn MCP process
			// Main process will handle spawning and return success/failure
			try {
				const result = await ipcRenderer.invoke('vscode:spawnVybeMcp', {
					mcpCommand
					// cwd is optional and not needed for Phase 1
				}) as { success: boolean; error?: string };

				if (result.success) {
					console.log('[VYBE MCP] MCP process spawned successfully by main process');

					// Set up IPC listener for tool execution requests from main process
					this.setupToolExecutionListener();
				} else {
					console.error('[VYBE MCP] Failed to spawn MCP process:', result.error);
				}
			} catch (error) {
				console.error('[VYBE MCP] Failed to request MCP spawn from main process:', error);
			}

			/* DISABLED: Process spawning from renderer (not possible)
			try {
				// This code cannot work - require() is not available in renderer
				if (typeof require !== 'function') {
					throw new Error('require() not available in this context');
				}
				const module = require('../node/vybeMcpLauncher.js');
				const { VybeMcpLauncher } = module;

				// Create logger for stdio tool host
				// Use logs directory from environment service
				const logsPath = this.environmentService.logsHome;
				const loggerUri = URI.joinPath(logsPath, 'mcp-stdio.log');
				const logger = this.loggerService.createLogger(loggerUri, { name: 'VYBE MCP Stdio' });

				// Create tool handler bridge
				const bridge = new VybeToolHandlerBridge(
					this.llmService,
					this.modelService,
					this.storageService
				);

				// Create launcher options (matching VybeMcpLauncherOptions interface)
				// Type is inferred from the constructor - no explicit type needed
				// Get environment variables - try multiple sources
				const currentEnv: Record<string, string> = {};
				if (typeof process !== 'undefined' && process.env) {
					Object.assign(currentEnv, process.env);
				}
				if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) {
					Object.assign(currentEnv, (globalThis as any).process.env);
				}

				const launcherOptions = {
					mcpExecutablePath: mcpCommand,
					cwd: currentEnv.VYBE_MCP_CWD,
					env: {
						...currentEnv,
						VYBE_IDE_STDIO: '1' // Signal to MCP that it should connect via stdio
					},
					logger
				};

				const launcher = new VybeMcpLauncher(launcherOptions);
				this._register(launcher);

				// Launch MCP process and register tools
				launcher.launch().then((toolHost: VybeStdioToolHost) => {
					// Register tools from bridge
					const toolDefinitions = bridge.createToolDefinitions();
					for (const tool of toolDefinitions) {
						toolHost.registerTool(tool);
						logger.info(`Registered stdio tool: ${tool.name}`);
					}
					logger.info('VYBE stdio tool host initialized');
				}).catch((error: unknown) => {
					// Log error but don't throw - this is optional functionality
					logger.error(`Failed to initialize stdio tool host: ${error instanceof Error ? error.message : String(error)}`);
					console.error('[VYBE MCP] Failed to launch MCP process:', error);
				});
			} catch (importError) {
				console.error('[VYBE MCP] Failed to load VybeMcpLauncher:', importError);
			}
			*/
		} catch (error) {
			// Log initialization errors for debugging
			console.error('[VYBE MCP] Error during stdio tool host initialization:', error);
		}
	}

	/**
	 * Set up IPC listener for tool execution requests from main process
	 */
	private setupToolExecutionListener(): void {
		if (!isNative || !ipcRenderer) {
			return;
		}

		// Listen for tool execution requests from main process
		ipcRenderer.on('vscode:vybeMcpToolRequest', async (event, ...args: unknown[]) => {
			const request = args[0] as { requestId: string; toolName: string; params: unknown };
			try {
				let result: unknown;
				// Use CancellationToken.None for Phase 1 (no cancellation support yet)
				const token = CancellationToken.None;

				switch (request.toolName) {
					case 'vybe.send_llm_message':
						result = await handleVybeSendLLMMessage(
							this.llmService,
							this.storageService,
							request.params as any,
							token
						);
						break;

					case 'vybe.list_models':
						result = await handleVybeListModels(
							this.modelService,
							request.params as any,
							token
						);
						break;

					case 'vybe.abort_llm_request':
						result = await handleVybeAbortLLMRequest(
							this.llmService,
							request.params as any,
							token
						);
						break;

					case 'vybe.read_file':
						result = await handleVybeReadFile(
							this.fileService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.list_files':
						result = await handleVybeListFiles(
							this.fileService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.get_file_info':
						result = await handleVybeGetFileInfo(
							this.fileService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.compute_diff':
						result = await handleVybeComputeDiff(
							this.diffService,
							request.params as any,
							token
						);
						break;

					case 'vybe.get_diff_areas':
						result = await handleVybeGetDiffAreas(
							this.editService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.create_edit_transaction':
						result = await handleVybeCreateEditTransaction(
							this.editService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.accept_diff':
						result = await handleVybeAcceptDiff(
							this.editService,
							this.approvalService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.reject_diff':
						result = await handleVybeRejectDiff(
							this.editService,
							this.approvalService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.accept_file':
						result = await handleVybeAcceptFile(
							this.editService,
							this.approvalService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					case 'vybe.reject_file':
						result = await handleVybeRejectFile(
							this.editService,
							this.approvalService,
							this.workspaceService,
							request.params as any,
							token
						);
						break;

					default:
						throw new Error(`Unknown tool: ${request.toolName}`);
				}

				// Send response back to main process
				ipcRenderer.send('vscode:vybeMcpToolResponse', request.requestId, {
					success: true,
					result
				});
			} catch (error) {
				// Send error response
				ipcRenderer.send('vscode:vybeMcpToolResponse', request.requestId, {
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		});
	}
}

