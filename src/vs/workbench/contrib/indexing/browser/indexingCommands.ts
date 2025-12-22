/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IIndexService } from '../../../services/indexing/common/indexService.js';
import { IWorkspaceContextService, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CONFIG_ENABLE_LOCAL_INDEXING } from '../../../services/indexing/common/indexingConfiguration.js';
import { IndexState } from '../../../services/indexing/common/indexService.js';

// Phase 12: Command to pause indexing
class PauseIndexingAction extends Action2 {
	static readonly ID = 'vybe.indexing.pause';

	constructor() {
		super({
			id: PauseIndexingAction.ID,
			title: { value: localize('indexing.pause', 'Pause Indexing'), original: 'Pause Indexing' },
			category: { value: localize('indexing.category', 'Indexing'), original: 'Indexing' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const indexService = accessor.get(IIndexService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const notificationService = accessor.get(INotificationService);
		const dialogService = accessor.get(IDialogService);
		const configurationService = accessor.get(IConfigurationService);

		const indexingEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;
		if (!indexingEnabled) {
			notificationService.info(localize('indexing.notEnabled', 'Indexing is not enabled'));
			return;
		}

		const workspace = workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);

		try {
			const status = await indexService.getStatus(workspaceIdentifier as any);
			if (status.state === IndexState.Ready || status.state === IndexState.Building) {
				const { confirmed } = await dialogService.confirm({
					type: 'warning',
					message: localize('indexing.pause.confirm', 'Pause indexing? Current work will complete, but no new work will start.'),
					primaryButton: localize('indexing.pause', 'Pause')
				});
				if (confirmed) {
					await indexService.pause(workspaceIdentifier as any, 'User requested pause');
					notificationService.info(localize('indexing.paused', 'Indexing paused'));
				}
			} else if (status.paused) {
				notificationService.info(localize('indexing.alreadyPaused', 'Indexing is already paused'));
			} else {
				notificationService.info(localize('indexing.cannotPause', 'Indexing cannot be paused in current state'));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			notificationService.error(localize('indexing.pauseFailed', 'Failed to pause indexing: {0}', message));
		}
	}
}

// Phase 12: Command to resume indexing
class ResumeIndexingAction extends Action2 {
	static readonly ID = 'vybe.indexing.resume';

	constructor() {
		super({
			id: ResumeIndexingAction.ID,
			title: { value: localize('indexing.resume', 'Resume Indexing'), original: 'Resume Indexing' },
			category: { value: localize('indexing.category', 'Indexing'), original: 'Indexing' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const indexService = accessor.get(IIndexService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const notificationService = accessor.get(INotificationService);
		const configurationService = accessor.get(IConfigurationService);

		const indexingEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;
		if (!indexingEnabled) {
			notificationService.info(localize('indexing.notEnabled', 'Indexing is not enabled'));
			return;
		}

		const workspace = workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);

		try {
			await indexService.resume(workspaceIdentifier as any);
			notificationService.info(localize('indexing.resumed', 'Indexing resumed'));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			notificationService.error(localize('indexing.resumeFailed', 'Failed to resume indexing: {0}', message));
		}
	}
}

// Phase 12: Command to rebuild index
class RebuildIndexAction extends Action2 {
	static readonly ID = 'vybe.indexing.rebuild';

	constructor() {
		super({
			id: RebuildIndexAction.ID,
			title: { value: localize('indexing.rebuild', 'Rebuild Index'), original: 'Rebuild Index' },
			category: { value: localize('indexing.category', 'Indexing'), original: 'Indexing' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const indexService = accessor.get(IIndexService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const notificationService = accessor.get(INotificationService);
		const dialogService = accessor.get(IDialogService);
		const configurationService = accessor.get(IConfigurationService);

		const indexingEnabled = configurationService.getValue<boolean>(CONFIG_ENABLE_LOCAL_INDEXING) ?? false;
		if (!indexingEnabled) {
			notificationService.info(localize('indexing.notEnabled', 'Indexing is not enabled'));
			return;
		}

		const workspace = workspaceContextService.getWorkspace();
		const workspaceIdentifier = toWorkspaceIdentifier(workspace);

		try {
			const status = await indexService.getStatus(workspaceIdentifier as any);
			if (status.rebuilding) {
				notificationService.info(localize('indexing.alreadyRebuilding', 'Index is already being rebuilt'));
				return;
			}

			const { confirmed } = await dialogService.confirm({
				type: 'warning',
				message: localize('indexing.rebuild.confirm', 'This will delete all index data and rebuild from scratch. Continue?'),
				primaryButton: localize('indexing.rebuild', 'Rebuild')
			});
			if (confirmed) {
				await indexService.rebuildWorkspaceIndex(workspaceIdentifier as any, 'User requested rebuild');
				notificationService.info(localize('indexing.rebuildStarted', 'Index rebuild started'));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			notificationService.error(localize('indexing.rebuildFailed', 'Failed to rebuild index: {0}', message));
		}
	}
}

// Phase 12: Command to show indexing status
class ShowIndexingStatusAction extends Action2 {
	static readonly ID = 'vybe.indexing.showStatus';

	constructor() {
		super({
			id: ShowIndexingStatusAction.ID,
			title: { value: localize('indexing.showStatus', 'Show Indexing Status'), original: 'Show Indexing Status' },
			category: { value: localize('indexing.category', 'Indexing'), original: 'Indexing' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		// Open VYBE Settings and focus on indexing tab
		await commandService.executeCommand('vybe.openSettingsEditor');
		// The settings editor should open to the indexing tab
	}
}

// Phase 12: Register all commands
export function registerIndexingCommands(): void {
	registerAction2(PauseIndexingAction);
	registerAction2(ResumeIndexingAction);
	registerAction2(RebuildIndexAction);
	registerAction2(ShowIndexingStatusAction);
}

