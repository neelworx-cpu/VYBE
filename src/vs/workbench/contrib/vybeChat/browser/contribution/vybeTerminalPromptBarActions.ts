/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { VybeTerminalPromptBarContribution } from './vybeTerminalPromptBar.contribution.js';

registerActiveXtermAction({
	id: 'vybe.terminal.promptBar.start',
	title: { value: 'Open Terminal Prompt Bar', original: 'Open Terminal Prompt Bar' },
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.and(TerminalContextKeys.focusInAny),
		weight: 10000, // Higher weight to override VS Code's terminal chat
	},
	run: (_xterm, _accessor, instance) => {
		const contribution = instance.getContribution<VybeTerminalPromptBarContribution>(VybeTerminalPromptBarContribution.ID);
		if (contribution) {
			contribution.reveal();
		}
	}
});

registerActiveXtermAction({
	id: 'vybe.terminal.promptBar.close',
	title: { value: 'Close Terminal Prompt Bar', original: 'Close Terminal Prompt Bar' },
	keybinding: {
		primary: KeyCode.Escape,
		when: ContextKeyExpr.and(
			TerminalContextKeys.focusInAny,
			ContextKeyExpr.has('terminalPromptBarVisible')
		),
		weight: 10000,
	},
	run: (_xterm, _accessor, instance) => {
		const contribution = instance.getContribution<VybeTerminalPromptBarContribution>(VybeTerminalPromptBarContribution.ID);
		if (contribution) {
			contribution.hide();
		}
	}
});

