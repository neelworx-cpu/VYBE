/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createSection, createCell, createButton } from '../vybeSettingsComponents.js';

export function renderGeneralTab(parent: HTMLElement): void {
	// Account section
	const accountSection = createSection(parent, null);
	const accountSectionList = accountSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const accountSubSection = DOM.append(accountSectionList, DOM.$('.cursor-settings-sub-section'));

	// Manage Account cell
	createCell(accountSubSection, {
		label: 'Manage Account',
		description: 'Manage your account and billing',
		action: { type: 'button', label: 'Open', icon: 'codicon-link-external', variant: 'tertiary' }
	});

	// Upgrade cell
	createCell(accountSubSection, {
		label: 'Upgrade to Ultra',
		description: 'Get maximum value with 20x usage limits and early access to advanced features.',
		action: { type: 'button', label: 'Upgrade', icon: 'codicon-arrow-circle-up', variant: 'primary' },
		hasDivider: true
	});

	// Preferences section
	const prefsSection = createSection(parent, 'Preferences');
	const prefsSectionList = prefsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const prefsSubSection = DOM.append(prefsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Default Layout cell (simplified - no layout cards for now)
	createCell(prefsSubSection, {
		label: 'Default Layout',
		description: 'Modify your default layout to focus Agent or the editor',
		action: null
	});

	// Editor Settings cell
	createCell(prefsSubSection, {
		label: 'Editor Settings',
		description: 'Configure font, formatting, minimap and more',
		action: { type: 'button', label: 'Open', variant: 'tertiary' },
		hasDivider: true
	});

	// Keyboard Shortcuts cell
	createCell(prefsSubSection, {
		label: 'Keyboard Shortcuts',
		description: 'Configure keyboard shortcuts',
		action: { type: 'button', label: 'Open', variant: 'tertiary' },
		hasDivider: true
	});

	// Import Settings cell
	createCell(prefsSubSection, {
		label: 'Import Settings from VS Code',
		description: 'Import settings, extensions, and keybindings from VS Code',
		action: { type: 'button', label: 'Import', variant: 'tertiary' },
		hasDivider: true
	});

	// Reset Dialogs subsection
	const resetSubSection = DOM.append(prefsSectionList, DOM.$('.cursor-settings-sub-section'));
	createCell(resetSubSection, {
		label: 'Reset "Don\'t Ask Again" Dialogs',
		description: 'See warnings and tips that you\'ve hidden',
		action: { type: 'button', label: 'Show', variant: 'tertiary' }
	});

	// Notifications section
	const notifSection = createSection(parent, 'Notifications');
	const notifSectionList = notifSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const notifSubSection = DOM.append(notifSectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(notifSubSection, {
		label: 'System Notifications',
		description: 'Show system notifications when Agent completes or needs attention',
		action: { type: 'switch', checked: true }
	});

	createCell(notifSubSection, {
		label: 'Menu Bar Icon',
		description: 'Show Cursor in menu bar',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	createCell(notifSubSection, {
		label: 'Completion Sound',
		description: 'Play a sound when Agent finishes responding',
		action: { type: 'switch', checked: true },
		hasDivider: true
	});

	// Privacy section
	const privacySection = createSection(parent, 'Privacy');
	const privacySectionList = privacySection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const privacySubSection = DOM.append(privacySectionList, DOM.$('.cursor-settings-sub-section'));

	createCell(privacySubSection, {
		label: 'Privacy Mode',
		labelIcon: 'codicon-lock',
		description: 'Your code data will not be trained on or used to improve the product. Code may be stored to provide features such as Background Agent.',
		action: { type: 'dropdown', label: 'Privacy Mode' }
	});

	// Footer actions
	const footerActions = DOM.append(parent, DOM.$('.cursor-settings-tab-footer-actions'));
	footerActions.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 0 8px;';

	const logoutButton = createButton('Log Out', 'tertiary');
	footerActions.appendChild(logoutButton);
}




