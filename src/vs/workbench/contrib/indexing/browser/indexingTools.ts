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

// Phase 12: Internal tool data definitions
const GetContextForQueryToolData: IToolData = {
	id: 'vybe_get_context_for_query',
	displayName: 'Get Context for Query',
	modelDescription: 'Assembles relevant code context for a query using semantic search and repository intelligence.',
	source: { type: 'internal', label: 'VYBE' },
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
	tags: ['indexing', 'rag', 'internal']
};

const GetRepoOverviewToolData: IToolData = {
	id: 'vybe_get_repo_overview',
	displayName: 'Get Repository Overview',
	modelDescription: 'Returns an overview of the repository structure, file counts, and recent files.',
	source: { type: 'internal', label: 'VYBE' },
	inputSchema: {
		type: 'object',
		properties: {}
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'internal']
};

const GetActiveFileContextToolData: IToolData = {
	id: 'vybe_get_active_file_context',
	displayName: 'Get Active File Context',
	modelDescription: 'Assembles context for the currently active file in the editor.',
	source: { type: 'internal', label: 'VYBE' },
	inputSchema: {
		type: 'object',
		properties: {
			maxChars: { type: 'number', description: 'Maximum characters in the assembled context', default: 50000 }
		}
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'internal']
};

const GetIndexStatusToolData: IToolData = {
	id: 'vybe_get_index_status',
	displayName: 'Get Index Status',
	modelDescription: 'Returns the current status of the codebase index including file counts, embedding progress, and state.',
	source: { type: 'internal', label: 'VYBE' },
	inputSchema: {
		type: 'object',
		properties: {}
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	tags: ['indexing', 'rag', 'internal']
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

// Phase 12: Tool implementations
class GetContextForQueryTool implements IToolImpl {
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

class GetRepoOverviewTool implements IToolImpl {
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

class GetActiveFileContextTool implements IToolImpl {
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

class GetIndexStatusTool implements IToolImpl {
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

// Phase 12: Contribution class
export class IndexingToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'indexing.tools';

	constructor(
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		// Register all tools
		this._register(this.toolsService.registerTool(
			GetContextForQueryToolData,
			this._instantiationService.createInstance(GetContextForQueryTool)
		));

		this._register(this.toolsService.registerTool(
			GetRepoOverviewToolData,
			this._instantiationService.createInstance(GetRepoOverviewTool)
		));

		this._register(this.toolsService.registerTool(
			GetActiveFileContextToolData,
			this._instantiationService.createInstance(GetActiveFileContextTool)
		));

		this._register(this.toolsService.registerTool(
			GetIndexStatusToolData,
			this._instantiationService.createInstance(GetIndexStatusTool)
		));
	}
}

