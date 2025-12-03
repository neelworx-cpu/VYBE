/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../../common/contributions.js';
import { IVybeChatSessionsService } from './vybeChatSessions.contribution.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { VYBE_CHAT_DEFAULT_SESSION_ID, getVybeChatViewId, getVybeChatViewContainerId } from '../../common/vybeChatConstants.js';

/**
 * Workbench contribution that ensures a default "New Chat" tab always exists
 * This tab persists and cannot be closed (or if closed, a new one is immediately created)
 */
class VybeChatInitializationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.vybeChatInitialization';

	constructor(
		@IVybeChatSessionsService private readonly vybeChatSessionsService: IVybeChatSessionsService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		// Wait for workbench to be restored before initializing
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			this.initializeDefaultChat();
		});
	}

	private async initializeDefaultChat(): Promise<void> {
		// Default container is now statically registered, so we just need to ensure the view is opened
		const defaultViewId = getVybeChatViewId(VYBE_CHAT_DEFAULT_SESSION_ID);
		const defaultContainerId = getVybeChatViewContainerId(VYBE_CHAT_DEFAULT_SESSION_ID);
		const existingView = this.viewsService.getViewWithId(defaultViewId);

		if (!existingView) {
			// Register the default session in the service (uses statically registered container)
			await this.vybeChatSessionsService.createDefaultSession();

			// Open the view container and the default view
			// The container is already registered statically, so this will just open it
			await this.viewsService.openViewContainer(defaultContainerId, true);
			await this.viewsService.openView(defaultViewId, true);
		}
	}
}

// Register the contribution to run after workbench is restored
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	VybeChatInitializationContribution,
	LifecyclePhase.Restored
);

