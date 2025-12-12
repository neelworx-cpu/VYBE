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
	) {
		super();

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
}

