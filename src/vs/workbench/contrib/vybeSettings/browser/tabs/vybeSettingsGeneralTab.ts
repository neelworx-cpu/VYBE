/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { createSection, createCell, createButton } from '../vybeSettingsComponents.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { STORAGE_KEY_ENABLE_DIFF_DECORATIONS } from '../../../../contrib/vybeChat/browser/contribution/vybeDiffDecorations.contribution.js';

export function renderGeneralTab(
	parent: HTMLElement,
	storageService: IStorageService,
	disposables: DisposableStore
): void {
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

	// AI Edits section
	const aiEditsSection = createSection(parent, 'AI Edits');
	const aiEditsSectionList = aiEditsSection.querySelector('.cursor-settings-section-list') as HTMLElement;
	const aiEditsSubSection = DOM.append(aiEditsSectionList, DOM.$('.cursor-settings-sub-section'));

	// Get current value from storage (default: false)
	const diffDecorationsEnabled = storageService.getBoolean(STORAGE_KEY_ENABLE_DIFF_DECORATIONS, StorageScope.APPLICATION, false);
	const diffDecorationsCell = createCell(aiEditsSubSection, {
		label: 'Enable Diff Decorations',
		description: 'Show visual highlights for AI-generated code edits. When enabled, pending diffs will be highlighted in the editor with color-coded line highlights and gutter markers.',
		action: { type: 'switch', checked: diffDecorationsEnabled }
	});

	// Wire up toggle
	const diffDecorationsSwitch = diffDecorationsCell.querySelector('.solid-switch') as HTMLElement;
	if (diffDecorationsSwitch) {
		const updateToggleVisual = (checked: boolean) => {
			const bgFill = diffDecorationsSwitch.querySelector('.solid-switch-bg-fill') as HTMLElement;
			const knob = diffDecorationsSwitch.querySelector('.solid-switch-knob') as HTMLElement;
			if (bgFill && knob) {
				diffDecorationsSwitch.style.background = checked ? 'rgb(85, 165, 131)' : 'rgba(128, 128, 128, 0.3)';
				bgFill.style.opacity = checked ? '1' : '0';
				bgFill.style.width = checked ? '100%' : '0%';
				knob.style.left = checked ? 'calc(100% - 16px)' : '2px';
				diffDecorationsSwitch.setAttribute('data-checked', String(checked));
			}
		};

		disposables.add(addDisposableListener(diffDecorationsSwitch, EventType.CLICK, (e) => {
			e.stopPropagation();
			const current = storageService.getBoolean(STORAGE_KEY_ENABLE_DIFF_DECORATIONS, StorageScope.APPLICATION, false);
			const newValue = !current;
			updateToggleVisual(newValue);
			storageService.store(STORAGE_KEY_ENABLE_DIFF_DECORATIONS, newValue, StorageScope.APPLICATION, StorageTarget.USER);
		}));
	}

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




