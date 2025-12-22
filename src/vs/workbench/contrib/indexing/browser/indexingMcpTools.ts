/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkspaceContextService, toWorkspaceIdentifier, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelToolsService, CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../chat/common/languageModelToolsService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { getExtHostIndexingProxy } from '../../../api/browser/mainThreadIndexing.js';

// Phase 12: MCP tool data definitions (external contract, no vybe_ prefix)
const GetContextForQueryMcpToolData: IToolData = {
	id: 'get_context_for_query',
	displayName: 'Get Context for Query',
	modelDescription: 'Assembles relevant code context for a query using semantic search and repository intelligence.',
	source: { type: 'external', label: 'VYBE Indexing' },
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'The query string to find relevant context for' },
			maxChars: { type: 'number', description: 'Maximum characters in the assembled context', default: 50000 },
			maxTokens: { type: 'number', description: 'Maximum tokens in the assembled context' }
		},
		required: ['query']
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'mcp']
};

const GetRepoOverviewMcpToolData: IToolData = {
	id: 'get_repo_overview',
	displayName: 'Get Repository Overview',
	modelDescription: 'Returns an overview of the repository structure, file counts, and recent files.',
	source: { type: 'external', label: 'VYBE Indexing' },
	inputSchema: {
		type: 'object',
		properties: {}
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'mcp']
};

const GetActiveFileContextMcpToolData: IToolData = {
	id: 'get_active_file_context',
	displayName: 'Get Active File Context',
	modelDescription: 'Assembles context for the currently active file in the editor.',
	source: { type: 'external', label: 'VYBE Indexing' },
	inputSchema: {
		type: 'object',
		properties: {
			maxChars: { type: 'number', description: 'Maximum characters in the assembled context', default: 50000 }
		}
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'mcp']
};

const GetIndexStatusMcpToolData: IToolData = {
	id: 'get_index_status',
	displayName: 'Get Index Status',
	modelDescription: 'Returns the current status of the codebase index including file counts, embedding progress, and state.',
	source: { type: 'external', label: 'VYBE Indexing' },
	inputSchema: {
		type: 'object',
		properties: {}
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'mcp']
};

// Phase 12: Helper to extract workspaceId
function getWorkspaceId(workspaceIdentifier: IAnyWorkspaceIdentifier): string {
	if (workspaceIdentifier.id) {
		return workspaceIdentifier.id;
	}
	if (isWorkspaceIdentifier(workspaceIdentifier) && workspaceIdentifier.configPath) {
		return workspaceIdentifier.configPath.fsPath;
	}
	if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
		return workspaceIdentifier.uri.fsPath;
	}
	return '';
}

// Phase 12: MCP tool implementations (same as internal, but with MCP names)
class GetContextForQueryMcpTool implements IToolImpl {
	constructor(
		private readonly workspaceContextService: IWorkspaceContextService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: any, token: CancellationToken): Promise<IToolResult> {
		const extHostIndexing = getExtHostIndexingProxy();
		if (!extHostIndexing) {
			throw new Error('ExtHostIndexing proxy not available');
		}

		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);
		const workspaceId = getWorkspaceId(workspaceIdentifier);

		const { query, maxChars, maxTokens } = invocation.parameters as { query: string; maxChars?: number; maxTokens?: number };

		if (!query || typeof query !== 'string') {
			throw new Error('query parameter is required and must be a string');
		}

		const items = await extHostIndexing.$devAssembleContextForQuery(workspaceId, query, { maxChars, maxTokens }, token);

		return {
			content: [{
				kind: 'text',
				value: JSON.stringify({ items }, null, 2)
			}]
		};
	}
}

class GetRepoOverviewMcpTool implements IToolImpl {
	constructor(
		private readonly workspaceContextService: IWorkspaceContextService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: any, token: CancellationToken): Promise<IToolResult> {
		const extHostIndexing = getExtHostIndexingProxy();
		if (!extHostIndexing) {
			throw new Error('ExtHostIndexing proxy not available');
		}

		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);
		const workspaceId = getWorkspaceId(workspaceIdentifier);

		const overview = await extHostIndexing.$devGetRepoOverview(workspaceId, token);

		return {
			content: [{
				kind: 'text',
				value: JSON.stringify(overview, null, 2)
			}]
		};
	}
}

class GetActiveFileContextMcpTool implements IToolImpl {
	constructor(
		private readonly workspaceContextService: IWorkspaceContextService,
		private readonly editorService: IEditorService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: any, token: CancellationToken): Promise<IToolResult> {
		const extHostIndexing = getExtHostIndexingProxy();
		if (!extHostIndexing) {
			throw new Error('ExtHostIndexing proxy not available');
		}

		const activeEditorPane = this.editorService.activeEditorPane;
		if (!activeEditorPane) {
			throw new Error('No active editor');
		}

		const resource = activeEditorPane.input?.resource;
		if (!resource) {
			throw new Error('Active editor has no resource');
		}

		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);
		const workspaceId = getWorkspaceId(workspaceIdentifier);

		const { maxChars } = invocation.parameters as { maxChars?: number };

		// Use the active file URI as the query to get context around it
		const query = resource.fsPath;
		const items = await extHostIndexing.$devAssembleContextForQuery(workspaceId, query, { maxChars }, token);

		return {
			content: [{
				kind: 'text',
				value: JSON.stringify({ items }, null, 2)
			}]
		};
	}
}

class GetIndexStatusMcpTool implements IToolImpl {
	constructor(
		private readonly workspaceContextService: IWorkspaceContextService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: any, token: CancellationToken): Promise<IToolResult> {
		const extHostIndexing = getExtHostIndexingProxy();
		if (!extHostIndexing) {
			throw new Error('ExtHostIndexing proxy not available');
		}

		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);
		const workspaceId = getWorkspaceId(workspaceIdentifier);

		const status = await extHostIndexing.$getStatus(workspaceId);

		return {
			content: [{
				kind: 'text',
				value: JSON.stringify(status, null, 2)
			}]
		};
	}
}

// Phase 12: MCP tools contribution class
export class IndexingMcpToolContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'indexing.mcpTools';

	constructor(
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		// Register all MCP tools
		this._register(this.toolsService.registerTool(
			GetContextForQueryMcpToolData,
			this._instantiationService.createInstance(GetContextForQueryMcpTool)
		));

		this._register(this.toolsService.registerTool(
			GetRepoOverviewMcpToolData,
			this._instantiationService.createInstance(GetRepoOverviewMcpTool)
		));

		this._register(this.toolsService.registerTool(
			GetActiveFileContextMcpToolData,
			this._instantiationService.createInstance(GetActiveFileContextMcpTool)
		));

		this._register(this.toolsService.registerTool(
			GetIndexStatusMcpToolData,
			this._instantiationService.createInstance(GetIndexStatusMcpTool)
		));
	}
}

