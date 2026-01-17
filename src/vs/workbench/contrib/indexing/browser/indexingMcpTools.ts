/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelToolsService, CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../chat/common/languageModelToolsService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

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

// Phase 12: MCP tool implementations (same as internal, but with MCP names)
// NOTE: These tools relied on local indexing RPC methods that have been removed.
// Cloud indexing is now the only method. These tools are stubbed to return appropriate errors.

class GetContextForQueryMcpTool implements IToolImpl {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_workspaceContextService: IWorkspaceContextService) { }

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: unknown, _token: CancellationToken): Promise<IToolResult> {
		// This tool relied on $devAssembleContextForQuery which was part of local indexing
		// Use the codebase_search tool instead for cloud-based semantic search
		return {
			content: [{
				kind: 'text',
				value: JSON.stringify({
					error: 'This tool is not available with cloud indexing. Use codebase_search tool instead.',
					suggestion: 'Use the codebase_search tool for semantic code search with cloud indexing.'
				}, null, 2)
			}]
		};
	}
}

class GetRepoOverviewMcpTool implements IToolImpl {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_workspaceContextService: IWorkspaceContextService) { }

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: unknown, _token: CancellationToken): Promise<IToolResult> {
		// This tool relied on $devGetRepoOverview which was part of local indexing
		return {
			content: [{
				kind: 'text',
				value: JSON.stringify({
					error: 'This tool is not available with cloud indexing.',
					suggestion: 'Use file listing and codebase_search tools to explore the repository.'
				}, null, 2)
			}]
		};
	}
}

class GetActiveFileContextMcpTool implements IToolImpl {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_workspaceContextService: IWorkspaceContextService, _editorService: IEditorService) { }

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: unknown, _token: CancellationToken): Promise<IToolResult> {
		// This tool relied on $devAssembleContextForQuery which was part of local indexing
		return {
			content: [{
				kind: 'text',
				value: JSON.stringify({
					error: 'This tool is not available with cloud indexing.',
					suggestion: 'Use the read_file tool to read the active file content directly.'
				}, null, 2)
			}]
		};
	}
}

class GetIndexStatusMcpTool implements IToolImpl {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_workspaceContextService: IWorkspaceContextService) { }

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: unknown, _token: CancellationToken): Promise<IToolResult> {
		// This tool relied on $getStatus which was part of local indexing
		// For cloud indexing status, check the Settings > Indexing & Docs tab
		return {
			content: [{
				kind: 'text',
				value: JSON.stringify({
					error: 'This tool is not available with cloud indexing.',
					suggestion: 'Check the Settings > Indexing & Docs tab for indexing status.'
				}, null, 2)
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

