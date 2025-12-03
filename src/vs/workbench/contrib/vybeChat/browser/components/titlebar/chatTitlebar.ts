/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, addDisposableListener, getWindow } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { HistoryDropdown, ChatHistoryItem } from './historyDropdown.js';

export interface ChatTab {
	id: string;
	title: string;
	isActive: boolean;
}

export class ChatTitlebar extends Disposable {
	private readonly _onNewChat = this._register(new Emitter<void>());
	readonly onNewChat = this._onNewChat.event;

	private readonly _onHistoryClick = this._register(new Emitter<void>());
	readonly onHistoryClick = this._onHistoryClick.event;

	private readonly _onSettingsClick = this._register(new Emitter<void>());
	readonly onSettingsClick = this._onSettingsClick.event;

	private readonly _onFullscreenClick = this._register(new Emitter<void>());
	readonly onFullscreenClick = this._onFullscreenClick.event;

	private readonly _onTabClick = this._register(new Emitter<string>());
	readonly onTabClick = this._onTabClick.event;

	private readonly _onTabRemove = this._register(new Emitter<string>());
	readonly onTabRemove = this._onTabRemove.event;

	private container: HTMLElement;
	private tabsContainer: HTMLElement | null = null;
	private currentTabs: ChatTab[] = [];
	private historyButton: HTMLElement | null = null;
	private historyDropdown: HistoryDropdown | null = null;

	constructor(parent: HTMLElement) {
		super();
		// Don't create a new container - use the existing one!
		this.container = parent;
		this.render();
		this.setupThemeListener();
	}

	private setupThemeListener(): void {
		// Listen for theme changes on the workbench element
		const targetWindow = getWindow(this.container);
		const workbench = targetWindow.document.querySelector('.monaco-workbench') as HTMLElement | null;
		if (workbench) {
			const observer = new MutationObserver(() => {
				// Re-render tabs when theme changes
				this.updateTabs(this.currentTabs);
			});
			observer.observe(workbench, {
				attributes: true,
				attributeFilter: ['class']
			});
			this._register({ dispose: () => observer.disconnect() });
		}
	}

	private render(): void {
		clearNode(this.container);

		// Left side: Scrollable tabs container (matches design spec structure)
		const compositeBarContainer = append(this.container, $('.composite-bar-container'));
		compositeBarContainer.style.display = 'flex';
		compositeBarContainer.style.alignItems = 'center';
		compositeBarContainer.style.height = '100%';
		compositeBarContainer.style.flex = '1';
		compositeBarContainer.style.minWidth = '0';
		compositeBarContainer.style.overflow = 'hidden';

		const scrollableElement = append(compositeBarContainer, $('.monaco-scrollable-element.composite-bar-scrollable.mac'));
		scrollableElement.setAttribute('role', 'presentation');
		scrollableElement.style.position = 'relative';
		scrollableElement.style.overflow = 'hidden';
		scrollableElement.style.display = 'flex';
		scrollableElement.style.alignItems = 'center';
		scrollableElement.style.height = '100%';
		scrollableElement.style.width = '100%';

		const compositeBar = append(scrollableElement, $('.composite-bar'));
		compositeBar.style.overflow = 'hidden';
		compositeBar.style.overflowX = 'auto';
		compositeBar.style.display = 'flex';
		compositeBar.style.alignItems = 'center';
		compositeBar.style.height = '100%';
		compositeBar.style.scrollbarWidth = 'none'; // Hide scrollbar
		(compositeBar.style as any).msOverflowStyle = 'none'; // Hide scrollbar IE/Edge

		const monacoActionBar = append(compositeBar, $('.monaco-action-bar'));
		monacoActionBar.style.display = 'flex';
		monacoActionBar.style.alignItems = 'center';
		monacoActionBar.style.height = '100%';

		this.tabsContainer = append(monacoActionBar, $('ul.actions-container'));
		this.tabsContainer.setAttribute('role', 'tablist');
		this.tabsContainer.setAttribute('aria-label', 'Active View Switcher');
		this.tabsContainer.style.display = 'flex';
		this.tabsContainer.style.alignItems = 'center';
		this.tabsContainer.style.height = '100%';
		this.tabsContainer.style.margin = '0';
		this.tabsContainer.style.padding = '0';
		this.tabsContainer.style.gap = '1px'; // 1px gap between tabs

		// Middle: Title label (h2)
		const titleLabel = append(this.container, $('.title-label'));
		titleLabel.style.display = 'none'; // Hide for now, not needed with tabs

		const h2 = append(titleLabel, $('h2'));
		h2.setAttribute('custom-hover', 'true');
		h2.setAttribute('draggable', 'true');
		h2.textContent = 'New Chat'; // Will update dynamically based on active tab

		// Right side: Action buttons (New Chat, History, Settings)
		const titleActions = append(this.container, $('.title-actions'));
		titleActions.style.flexShrink = '0'; // Don't shrink buttons
		const toolbar = append(titleActions, $('.monaco-toolbar'));
		const actionBar = append(toolbar, $('.monaco-action-bar'));
		const actionsContainer = append(actionBar, $('ul.actions-container'));
		actionsContainer.setAttribute('role', 'toolbar');
		actionsContainer.setAttribute('aria-label', 'VYBE AI actions');

		// Add New Chat button
		const newChatItem = append(actionsContainer, $('li.action-item.menu-entry'));
		newChatItem.setAttribute('role', 'presentation');
		newChatItem.setAttribute('custom-hover', 'true');
		newChatItem.setAttribute('data-command-id', 'composer.createNewComposerTab');
		const newChatButton = append(newChatItem, $('a.action-label.codicon.codicon-add'));
		newChatButton.setAttribute('role', 'button');
		newChatButton.setAttribute('aria-label', 'New Chat (⌘T)\n[⌥] Replace Chat (⌘N)');
		newChatButton.setAttribute('tabindex', '0');
		this._register(addDisposableListener(newChatButton, 'click', () => this._onNewChat.fire()));
		const newChatBadge = append(newChatItem, $('.badge'));
		newChatBadge.setAttribute('aria-hidden', 'true');
		newChatBadge.style.display = 'none';
		append(newChatBadge, $('.badge-content'));

		// Add History button
		const historyItem = append(actionsContainer, $('li.action-item.menu-entry'));
		historyItem.setAttribute('role', 'presentation');
		historyItem.setAttribute('custom-hover', 'true');
		historyItem.setAttribute('data-command-id', 'composer.showComposerHistory');
		this.historyButton = append(historyItem, $('a.action-label.codicon.codicon-history'));
		this.historyButton.setAttribute('role', 'button');
		this.historyButton.setAttribute('aria-label', 'Show Chat History (⌥⌘\')');
		this._register(addDisposableListener(this.historyButton, 'click', () => this.showHistoryDropdown()));
		const historyBadge = append(historyItem, $('.badge'));
		historyBadge.setAttribute('aria-hidden', 'true');
		historyBadge.style.display = 'none';
		append(historyBadge, $('.badge-content'));

		// Add Settings button (ellipsis)
		const settingsItem = append(actionsContainer, $('li.action-item'));
		settingsItem.setAttribute('role', 'presentation');
		const dropdownDiv = append(settingsItem, $('.monaco-dropdown'));
		const dropdownLabel = append(dropdownDiv, $('.dropdown-label'));
		const settingsButton = append(dropdownLabel, $('a.action-label.codicon.codicon-ellipsis'));
		settingsButton.setAttribute('custom-hover', 'true');
		settingsButton.setAttribute('aria-label', 'Close, Export, Settings and More...');
		this._register(addDisposableListener(settingsButton, 'click', () => this._onSettingsClick.fire()));

		// VYBE: Add our own fullscreen button (instead of using VS Code's global-actions)
		const fullscreenItem = append(actionsContainer, $('li.action-item.menu-entry'));
		fullscreenItem.setAttribute('role', 'presentation');
		fullscreenItem.setAttribute('custom-hover', 'true');
		fullscreenItem.setAttribute('data-command-id', 'workbench.action.toggleMaximizedVybeChat');
		const fullscreenButton = append(fullscreenItem, $('a.action-label.codicon.codicon-screen-full'));
		fullscreenButton.setAttribute('role', 'button');
		fullscreenButton.setAttribute('aria-label', 'Maximize VYBE Chat Size');
		fullscreenButton.setAttribute('tabindex', '0');
		this._register(addDisposableListener(fullscreenButton, 'click', () => this._onFullscreenClick.fire()));

		// Initialize with default tabs
		this.updateTabs([
			{ id: '1', title: 'New Chat', isActive: true }
		]);
	}

	updateTabs(tabs: ChatTab[]): void {
		if (!this.tabsContainer) {
			return;
		}

		// Store current tabs for theme change re-rendering
		this.currentTabs = tabs;

		clearNode(this.tabsContainer);

		// Detect theme - same approach as mockup
		let isDarkTheme = false;
		const targetWindow = getWindow(this.container);
		const workbench = targetWindow.document.querySelector('.monaco-workbench') as HTMLElement | null;
		if (workbench) {
			isDarkTheme =
				workbench.classList.contains('vs-dark') ||
				workbench.classList.contains('hc-black');
		}

		// Theme-aware colors for tabs - MATCH REFERENCE
		// Active tab background - SOLID, matches VYBE theme colors
		const activeBg = isDarkTheme
			? '#222427' // VYBE Dark: activity bar, status bar, title bar
			: '#eceff2'; // VYBE Light: activity bar, status bar, title bar
		// Inactive tab background - matches panel background
		const inactiveBg = isDarkTheme
			? '#1a1b1d' // VYBE Dark: panel background
			: '#ffffff'; // VYBE Light: panel background

		for (const tab of tabs) {
			// Create tab item matching design spec structure exactly
			const tabItem = append(this.tabsContainer, $('li.action-item.composite-bar-action-tab'));
			tabItem.setAttribute('role', 'tab');
			tabItem.setAttribute('draggable', 'true');
			tabItem.setAttribute('aria-label', tab.title);
			tabItem.setAttribute('aria-expanded', tab.isActive ? 'true' : 'false');
			tabItem.setAttribute('aria-selected', tab.isActive ? 'true' : 'false');
			tabItem.style.setProperty('--insert-border-color', 'rgba(228, 228, 228, 0.92)');

			// Set padding, height, and border-radius inline - MATCH REFERENCE EXACTLY
			tabItem.style.padding = '4px 6px'; // 4px top/bottom, 6px left/right
			tabItem.style.height = '22px'; // EXACT height from reference
			tabItem.style.borderRadius = '4px';
			tabItem.style.margin = '0'; // No margin, use gap instead
			tabItem.style.boxSizing = 'border-box';
			tabItem.style.display = 'flex';
			tabItem.style.alignItems = 'center';

			if (tab.isActive) {
				tabItem.classList.add('checked');
				tabItem.classList.add('is-truncated');
			}

			// Status indicator
			append(tabItem, $('.status-indicator'));

			// Tab label container
			const labelContainer = append(tabItem, $('.composite-bar-action-tab-label'));
			labelContainer.style.display = 'flex';
			labelContainer.style.alignItems = 'center';
			labelContainer.style.flex = '1 1 auto';
			labelContainer.style.minWidth = '0px';
			labelContainer.style.gap = '4px';

			// Hidden terminal icon (for consistency with design spec)
			const terminalIcon = append(labelContainer, $('.codicon.codicon-terminal'));
			terminalIcon.style.display = 'none';
			terminalIcon.style.fontSize = '11px';
			terminalIcon.style.color = 'var(--cursor-icon-primary)';
			terminalIcon.style.flexShrink = '0';
			terminalIcon.style.alignSelf = 'center';

			// Hidden worktree indicator (for consistency with design spec)
			const worktreeIcon = append(labelContainer, $('.codicon.codicon-git-branch.worktree-indicator'));
			worktreeIcon.style.display = 'none';
			worktreeIcon.style.fontSize = '11px';
			worktreeIcon.style.color = 'var(--vscode-foreground)';
			worktreeIcon.style.opacity = '0.7';
			worktreeIcon.style.flexShrink = '0';
			worktreeIcon.style.alignSelf = 'center';
			worktreeIcon.style.marginInlineEnd = '-2px';

			// Action label (chat title) - Minimal inline styles like reference app
			const actionLabel = append(labelContainer, $('a.action-label'));
			actionLabel.textContent = tab.title;
			actionLabel.setAttribute('aria-label', tab.title);

			// Only essential inline styles (like reference app)
			actionLabel.style.flex = '1 1 auto';
			actionLabel.style.minWidth = '0px';

			// BLOCK any hover background on the label
			actionLabel.style.backgroundColor = 'transparent';
			actionLabel.style.background = 'none';

			// Color: inactive tabs are faded (0.55), active tabs are bright (0.92)
			if (tab.isActive) {
				actionLabel.style.color = isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.92)';
				actionLabel.style.borderBottomColor = isDarkTheme ? 'rgba(228, 228, 228, 0)' : 'rgba(51, 51, 51, 0)';
			} else {
				actionLabel.style.color = isDarkTheme ? 'rgba(228, 228, 228, 0.55)' : 'rgba(51, 51, 51, 0.55)';
			}

			// Add hover listener to label to FORCE background to stay transparent
			this._register(addDisposableListener(actionLabel, 'mouseenter', (e) => {
				actionLabel.style.backgroundColor = 'transparent';
				actionLabel.style.background = 'none';
			}));

			this._register(addDisposableListener(actionLabel, 'mouseleave', (e) => {
				actionLabel.style.backgroundColor = 'transparent';
				actionLabel.style.background = 'none';
			}));

			// Badge (hidden by default)
			const badge = append(tabItem, $('.badge'));
			badge.setAttribute('aria-hidden', 'true');
			badge.setAttribute('aria-label', tab.title);
			badge.style.display = 'none';
			const badgeContent = append(badge, $('.badge-content'));
			badgeContent.style.color = 'rgb(20, 20, 20)';
			badgeContent.style.backgroundColor = 'rgb(136, 192, 208)';

			// Close button (shows on hover) - with its own background box
			const closeButton = append(tabItem, $('.codicon.codicon-close.remove-button'));
			closeButton.style.position = 'absolute';
			closeButton.style.right = '0px';
			closeButton.style.top = '50%';
			closeButton.style.transform = 'translateY(-50%)';
			closeButton.style.cursor = 'pointer';
			closeButton.style.zIndex = '2';
			closeButton.style.opacity = '0';
			closeButton.style.pointerEvents = 'none';
			// X button gets its own background box - 25% narrower width, same height
			closeButton.style.width = '16.5px'; // 75% of 22px (reduced by 25%)
			closeButton.style.height = '22px'; // Same as tab height
			closeButton.style.borderRadius = '4px';
			closeButton.style.display = 'flex';
			closeButton.style.alignItems = 'center';
			closeButton.style.justifyContent = 'center';
			closeButton.style.backgroundColor = 'transparent';

			this._register(addDisposableListener(closeButton, 'click', (e) => {
				e.stopPropagation();
				this._onTabRemove.fire(tab.id);
			}));

			// Active indicator
			append(tabItem, $('.active-item-indicator'));

			// Set background for tabs - active uses activeBg, inactive uses inactiveBg
			if (tab.isActive) {
				tabItem.style.backgroundColor = activeBg;
			} else {
				// Inactive tabs use panel background color
				tabItem.style.backgroundColor = inactiveBg;
			}

			// Tab click handler
			this._register(addDisposableListener(tabItem, 'click', () => {
				if (!tab.isActive) {
					this._onTabClick.fire(tab.id);
				}
			}));

			// Tab hover: Show close button with SOLID background, change text color (NO tab background)
			this._register(addDisposableListener(tabItem, 'mouseenter', () => {
				// FORCE tab background to stay the same - prevent CSS hover
				if (tab.isActive) {
					tabItem.style.backgroundColor = activeBg;
				} else {
					tabItem.style.backgroundColor = inactiveBg;
				}

				// Only change text color for INACTIVE tabs
				if (!tab.isActive) {
					actionLabel.style.color = isDarkTheme ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.92)';
				}

				// Show close button with background matching the tab's background
				closeButton.style.opacity = '1';
				closeButton.style.pointerEvents = 'auto';
				// Use activeBg for active tabs, inactiveBg for inactive tabs
				closeButton.style.backgroundColor = tab.isActive ? activeBg : inactiveBg;
			}));

			this._register(addDisposableListener(tabItem, 'mouseleave', () => {
				// FORCE tab background to stay the same
				if (tab.isActive) {
					tabItem.style.backgroundColor = activeBg;
				} else {
					tabItem.style.backgroundColor = inactiveBg;
				}

				// Restore text color for INACTIVE tabs only
				if (!tab.isActive) {
					actionLabel.style.color = isDarkTheme ? 'rgba(228, 228, 228, 0.55)' : 'rgba(51, 51, 51, 0.55)';
				}

				// Hide close button and its background
				closeButton.style.opacity = '0';
				closeButton.style.pointerEvents = 'none';
				closeButton.style.backgroundColor = 'transparent';
			}));
		}
	}

	private showHistoryDropdown(): void {
		if (!this.historyButton) {
			return;
		}

		// Close existing dropdown if open
		if (this.historyDropdown) {
			this.historyDropdown.hide();
			this.historyDropdown.dispose();
			this.historyDropdown = null;
			return;
		}

		// Create and show dropdown (theme service is optional, will use DOM fallback)
		this.historyDropdown = this._register(new HistoryDropdown(this.historyButton, null as any));

		// Mock data for now - will be replaced with real data
		// EXPANDED for scrollbar testing - many items to trigger 400px max height
		const mockItems: ChatHistoryItem[] = [
			{ id: '1', title: 'Develop production version of auxiliary panel', timestamp: new Date(), isCurrent: true },
			{ id: '2', title: 'New Chat', timestamp: new Date(Date.now() - 16 * 60 * 1000), isCurrent: false },
			{ id: '3', title: 'Proceed with the next steps', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), isCurrent: false },
			{ id: '4', title: 'Fix scrollbar styling in composer', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), isCurrent: false },
			{ id: '5', title: 'Implement dynamic placeholders', timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000), isCurrent: false },
			{ id: '6', title: 'Add agent mode dropdown', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), isCurrent: false },
			{ id: '7', title: 'Create model selector component', timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000), isCurrent: false },
			{ id: '8', title: 'Revert docview and commit terminal changes', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '9', title: 'Update toggle switches design', timestamp: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '10', title: 'Fix dropdown color issues', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '11', title: 'Implement history search', timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '12', title: 'Add rename functionality', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '13', title: 'Create delete confirmation', timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '14', title: 'Dynamic layout for VYBE IDE mode', timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '15', title: 'Clone Trae\'s solo mode for Vybe', timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '16', title: 'Implement time-based grouping', timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '17', title: 'Add hover effects to items', timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '18', title: 'Create section dividers', timestamp: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '19', title: 'Fix theme color variables', timestamp: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '20', title: 'Just saying hi', timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '21', title: 'Backend infrastructure for AI IDE', timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '22', title: 'Setup VS Code extension API', timestamp: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '23', title: 'Integrate with chat service', timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '24', title: 'Build message renderer', timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '25', title: 'Add markdown support', timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '26', title: 'Implement code highlighting', timestamp: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '27', title: 'Create context menu actions', timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '28', title: 'Add keyboard shortcuts', timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '29', title: 'Setup testing framework', timestamp: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '30', title: 'Write unit tests', timestamp: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '31', title: 'Initial project setup', timestamp: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), isCurrent: false },
			{ id: '32', title: 'Research AI IDE patterns', timestamp: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), isCurrent: false },
		];

		this.historyDropdown.show(mockItems);

		// Listen for events
		this._register(this.historyDropdown.onChatSelect(id => {
			this._onTabClick.fire(id);
		}));

		this._register(this.historyDropdown.onChatRename(event => {
			// TODO: Update chat title in backend/state
			// For now, just log it
		}));

		this._register(this.historyDropdown.onChatDelete(id => {
			// TODO: Delete chat from backend/state
			// For now, just log it
		}));
	}
}

