/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Chat Title Bar Actions
 * Actions for the title bar: fullscreen button and separator
 */

import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { AuxiliaryBarMaximizedContext } from '../../../../common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

// VYBE: Maximize VYBE Chat Action
class MaximizeVybeChatAction extends Action2 {
	static readonly ID = 'workbench.action.maximizeVybeChat';

	constructor() {
		super({
			id: MaximizeVybeChatAction.ID,
			title: localize2('maximizeVybeChat', 'Maximize VYBE Chat'),
			tooltip: localize2('maximizeVybeChatTooltip', "Maximize VYBE Chat Size"),
			category: Categories.View,
			f1: true,
			precondition: AuxiliaryBarMaximizedContext.negate(),
			icon: Codicon.screenFull,
			menu: {
				id: MenuId.AuxiliaryBarTitle,
				group: 'navigation',
				order: 1, // Before close button (order: 2)
				when: AuxiliaryBarMaximizedContext.negate()
			}
		});
	}

	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setAuxiliaryBarMaximized(true);
	}
}

// VYBE: Restore VYBE Chat Action
class RestoreVybeChatAction extends Action2 {
	static readonly ID = 'workbench.action.restoreVybeChat';

	constructor() {
		super({
			id: RestoreVybeChatAction.ID,
			title: localize2('restoreVybeChat', 'Restore VYBE Chat'),
			tooltip: localize2('restoreVybeChatTooltip', "Restore VYBE Chat Size"),
			category: Categories.View,
			f1: true,
			precondition: AuxiliaryBarMaximizedContext,
			toggled: AuxiliaryBarMaximizedContext,
			icon: Codicon.screenFull,
			menu: {
				id: MenuId.AuxiliaryBarTitle,
				group: 'navigation',
				order: 1, // Before close button (order: 2)
				when: AuxiliaryBarMaximizedContext
			}
		});
	}

	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setAuxiliaryBarMaximized(false);
	}
}

// VYBE: Toggle Maximized VYBE Chat Action
class ToggleMaximizedVybeChatAction extends Action2 {
	static readonly ID = 'workbench.action.toggleMaximizedVybeChat';

	constructor() {
		super({
			id: ToggleMaximizedVybeChatAction.ID,
			title: localize2('toggleMaximizedVybeChat', 'Toggle Maximized VYBE Chat'),
			f1: true,
			category: Categories.View
		});
	}

	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.toggleMaximizedAuxiliaryBar();
	}
}

export function registerVybeChatTitleActions(): void {
	registerAction2(MaximizeVybeChatAction);
	registerAction2(RestoreVybeChatAction);
	registerAction2(ToggleMaximizedVybeChatAction);

	// VYBE: Note - The separator in title-actions appears automatically
	// when there are menu items in different groups. The fullscreen button
	// in global-actions (MenuId.AuxiliaryBarTitle) will appear automatically
	// since VYBE Chat is in the auxiliary bar location.
}

