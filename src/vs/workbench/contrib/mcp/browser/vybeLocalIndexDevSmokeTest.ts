/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { timeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CONFIG_ENABLE_LOCAL_EMBEDDINGS, CONFIG_ENABLE_LOCAL_INDEXING, CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH } from '../../../services/indexing/common/indexingConfiguration.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolResult } from '../../chat/common/languageModelToolsService.js';

/**
 * Dev-only smoke test runner for vybe-local-index MCP tools.
 * Runs automatically only when `vybe.localIndexing.devSmokeTest` is true.
 * No UI surface; logs to DevTools/console via ILogService.
 */
export class VybeLocalIndexDevSmokeTest extends Disposable {
	private readonly enabled: boolean;
	private readonly workspaceId: string | undefined;
	private readonly dbUri: URI | undefined;
	private storeInert: boolean | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super();
		this.enabled = !!this.configurationService.getValue<boolean>('vybe.localIndexing.devSmokeTest');
		const workspace = this.workspaceContextService.getWorkspace();
		// Prefer first folder path as workspaceId (matches parseWorkspaceId expectations)
		const primaryFolder = workspace.folders[0]?.uri;
		const workspaceUri = primaryFolder ?? workspace.configuration ?? workspace.folders[0]?.uri;
		this.workspaceId = workspaceUri?.fsPath ?? workspaceUri?.toString() ?? workspace.id;
		this.dbUri = this.workspaceId
			? URI.joinPath(this.environmentService.workspaceStorageHome, this.workspaceId, 'vybe-index.db')
			: undefined;

		// Fire-and-forget only when explicitly enabled and workspace is present.
		if (this.enabled && this.workspaceId) {
			this.run().catch(err => this.logService.error('[vybe dev smoke test] failed', err));
		} else if (this.enabled && !this.workspaceId) {
			this.logService.warn('[vybe dev smoke test] enabled but no workspaceId found; skipping');
		}
	}

	private getFlags() {
		const localIndex = !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING);
		const semantic = localIndex && !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_SEMANTIC_SEARCH);
		const embeddings = localIndex && !!this.configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_EMBEDDINGS);
		return { localIndex, semantic, embeddings };
	}

	private async invoke(toolId: string, parameters: Record<string, any>): Promise<IToolResult | undefined> {
		const tool = this.toolsService.getTool(toolId);
		if (!tool) {
			this.logService.warn('[vybe dev smoke test] tool not found', toolId);
			return undefined;
		}
		const callId = generateUuid();
		const countTokens: CountTokensCallback = async () => 0;
		// Invoke without chat session context to avoid session validation
		return this.toolsService.invokeTool({ callId, toolId: tool.id, parameters, context: undefined }, countTokens, CancellationToken.None);
	}

	private parseToolJson(result: IToolResult | undefined): any | undefined {
		if (!result?.content?.length) { return undefined; }
		const text = result.content.find(p => (p as any).kind === 'text') as { value?: string } | undefined;
		if (!text?.value) { return undefined; }
		try {
			const outer = JSON.parse(text.value);
			if (outer && typeof outer === 'object' && typeof outer.text === 'string') {
				return JSON.parse(outer.text);
			}
			return outer;
		} catch {
			return undefined;
		}
	}

	private async ensureDbNotCreated(): Promise<boolean> {
		if (!this.dbUri) { return true; }
		const exists = await this.fileService.exists(this.dbUri);
		return !exists;
	}

	private logMetadata(label: string, payload: any) {
		if (!payload || typeof payload !== 'object') {
			this.logService.info(label, { kind: 'empty' });
			return;
		}
		this.logService.info(label, {
			state: payload.state,
			indexedFiles: payload.indexedFiles ?? payload.totalFiles,
			totalFiles: payload.totalFiles,
			embeddingModel: payload.embeddingModel ?? payload.engineMetadata?.embeddingModel,
			snippetCount: Array.isArray(payload.snippets) ? payload.snippets.length : undefined,
			symbolCount: Array.isArray(payload.symbols) ? payload.symbols.length : undefined,
			resultCount: Array.isArray(payload.results) ? payload.results.length : undefined,
		});
	}

	private async runDisabledPath(): Promise<void> {
		const { localIndex } = this.getFlags();
		if (localIndex) {
			this.logService.info('[vybe dev smoke test] skip disabled-path (flags are ON)');
			return;
		}
		const calls = await Promise.all([
			this.invoke('vybe.list_index_status', { workspaceId: this.workspaceId ?? '' }),
			this.invoke('vybe.refresh_index', { workspaceId: this.workspaceId ?? '', mode: 'full' }),
			this.invoke('vybe.search_hybrid', { workspaceId: this.workspaceId ?? '', query: 'navigation header', maxResults: 5 }),
			this.invoke('vybe.get_context_for_mcp', { workspaceId: this.workspaceId ?? '', queryText: 'navigation header', maxSnippets: 5 }),
		]);
		const parsed = calls.map(c => this.parseToolJson(c));
		this.logMetadata('[vybe dev smoke test] disabled status', parsed[0]);
		this.logMetadata('[vybe dev smoke test] disabled refresh', parsed[1]);
		this.logMetadata('[vybe dev smoke test] disabled search', parsed[2]);
		this.logMetadata('[vybe dev smoke test] disabled context', parsed[3]);

		const dbIntact = await this.ensureDbNotCreated();
		this.logService.info('[vybe dev smoke test] db untouched (disabled path)', { untouched: dbIntact });
	}

	private async pollStatusUntilIndexed(timeoutMs: number): Promise<any | undefined> {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const status = this.parseToolJson(await this.invoke('vybe.list_index_status', { workspaceId: this.workspaceId ?? '' }));
			if (status?.indexedFiles && status.indexedFiles > 0) {
				return status;
			}
			// If we reached ready but have zero files, stop polling to avoid spamming logs.
			if (status?.state === 'ready' && (status.totalFiles === 0 || status.indexedFiles === 0)) {
				if (!this.storeInert) {
					this.logService.warn('[vybe dev smoke test] store appears inert; ready but zero files');
					this.storeInert = true;
				}
				return status;
			}
			this.logMetadata('[vybe dev smoke test] poll status', status);
			await timeout(1000);
		}
		return undefined;
	}

	private async runEnabledPath(): Promise<void> {
		const { localIndex, semantic, embeddings } = this.getFlags();
		if (!localIndex) {
			this.logService.info('[vybe dev smoke test] skip enabled-path (flags are OFF)');
			return;
		}

		this.logService.info('[vybe dev smoke test] enabled flags', { localIndex, semantic, embeddings, workspaceId: this.workspaceId });

		const refreshResult = this.parseToolJson(await this.invoke('vybe.refresh_index', { workspaceId: this.workspaceId ?? '', mode: 'full' }));
		this.logMetadata('[vybe dev smoke test] refresh result', refreshResult);

		const status = await this.pollStatusUntilIndexed(120000);
		this.logMetadata('[vybe dev smoke test] status after index', status ?? { state: 'timeout' });

		const search = this.parseToolJson(await this.invoke('vybe.search_hybrid', { workspaceId: this.workspaceId ?? '', query: 'navigation header', maxResults: 5 }));
		this.logMetadata('[vybe dev smoke test] search', search);

		const context = this.parseToolJson(await this.invoke('vybe.get_context_for_mcp', { workspaceId: this.workspaceId ?? '', queryText: 'navigation header', maxSnippets: 5 }));
		this.logMetadata('[vybe dev smoke test] context', context);
	}

	private async run(): Promise<void> {
		try {
			await this.runDisabledPath();
			await this.runEnabledPath();
		} catch (err) {
			this.logService.error('[vybe dev smoke test] unexpected error', err);
		}
	}
}

