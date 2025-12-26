/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IVybeChatSessionsService } from '../contribution/vybeChatSessions.contribution.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getVybeChatViewId } from '../../common/vybeChatConstants.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { HistoryDropdown, ChatHistoryItem } from '../components/titlebar/historyDropdown.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { testEditWidgets } from '../commands/testEditWidgetsCommand.js';
import { simulateAiEdits } from '../commands/simulateAiEditsCommand.js';
import { simulateAiStreamingEdits } from '../commands/simulateAiStreamingEditsCommand.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';

/**
 * Action to create a new chat session
 */
registerAction2(class NewVybeChatAction extends Action2 {
	constructor() {
		super({
			id: 'vybeChat.newChat',
			title: localize2('vybeChat.newChat', "New Chat"),
			icon: Codicon.add,
			f1: false, // Not in command palette for now
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.regex('view', /^workbench\.panel\.vybeChat\.view\.chat\./), // Match any VYBE Chat view
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(IVybeChatSessionsService);
		const viewsService = accessor.get(IViewsService);
		const sessionId = await sessionsService.createSession();
		// Open the new session view
		const viewId = `workbench.panel.vybeChat.view.chat.${sessionId}`;
		await viewsService.openView(viewId, true);
	}
});

/**
 * Action to show chat history
 * SIMPLIFIED: Uses ONE dropdown instance that is reused
 */
registerAction2(class ShowVybeChatHistoryAction extends Action2 {
	// SINGLE dropdown instance - reused for all operations
	private static dropdown: HistoryDropdown | null = null;
	private static disposables: DisposableStore | null = null;

	constructor() {
		super({
			id: 'vybeChat.showHistory',
			title: localize2('vybeChat.showHistory', "Show Chat History"),
			icon: Codicon.history,
			f1: false,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.regex('view', /^workbench\.panel\.vybeChat\.view\.chat\./),
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(IVybeChatSessionsService);
		const viewsService = accessor.get(IViewsService);
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const themeService = accessor.get(IThemeService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// Helper function to find anchor element
		const findAnchorElement = (): HTMLElement | undefined => {
			const auxiliaryBar = document.querySelector('.auxiliarybar-part, .part.auxiliarybar') as HTMLElement;
			let anchorElement: HTMLElement | undefined;

			if (auxiliaryBar) {
				const allActionItems = auxiliaryBar.querySelectorAll('.action-item');
				for (const actionItem of Array.from(allActionItems)) {
					const actionItemEl = actionItem as HTMLElement;
					if (actionItemEl.offsetParent === null) continue;
					const historyIcon = actionItemEl.querySelector('.codicon-history, .codicon.codicon-history');
					if (historyIcon) {
						anchorElement = actionItemEl;
						break;
					}
				}
			}

			if (!anchorElement) {
				// Fallback: search document
				const allHistoryIcons = document.querySelectorAll('.codicon-history, .codicon.codicon-history');
				for (const icon of Array.from(allHistoryIcons)) {
					const actionItem = icon.closest('.action-item') as HTMLElement;
					if (actionItem && actionItem.offsetParent !== null) {
						const rect = actionItem.getBoundingClientRect();
						if (rect.width > 0 && rect.height > 0) {
							anchorElement = actionItem;
							break;
						}
					}
				}
			}

			return anchorElement;
		};

		// Get or create the SINGLE dropdown instance
		if (!ShowVybeChatHistoryAction.dropdown) {
			// Find anchor element (history button)
			const anchorElement = findAnchorElement();

			if (!anchorElement) {
				return;
			}

			// Create SINGLE dropdown instance
			ShowVybeChatHistoryAction.dropdown = new HistoryDropdown(anchorElement, themeService);
			ShowVybeChatHistoryAction.disposables = new DisposableStore();

			// Set up event handlers ONCE
			const dropdown = ShowVybeChatHistoryAction.dropdown;
			const disposables = ShowVybeChatHistoryAction.disposables;

			// Chat selection - just hide dropdown
			disposables.add(dropdown.onChatSelect(async (sessionId) => {
				const viewId = getVybeChatViewId(sessionId);
				await viewsService.openView(viewId, true);
				dropdown.hide();
			}));

			// Chat rename - update in place, don't close dropdown
			disposables.add(dropdown.onChatRename(async ({ id, newTitle }) => {
				if (!newTitle || newTitle.trim() === '') {
					return;
				}

				try {
					// Rename the session - only updates view descriptor, so it's fast
					await sessionsService.renameSession(id, newTitle.trim());

					// Wait briefly for view descriptor updates to propagate
					await new Promise(resolve => setTimeout(resolve, 100));

					// Re-find anchor element in case DOM was rebuilt
					const newAnchor = findAnchorElement();
					if (newAnchor && newAnchor.isConnected) {
						dropdown.updateAnchorElement(newAnchor);
					}

					// Refresh dropdown items in place
					const allSessionIds = sessionsService.getAllSessionIds();
					const refreshedItems: ChatHistoryItem[] = allSessionIds.map(sessionId => {
						const viewId = getVybeChatViewId(sessionId);
						const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
						const title = viewDescriptor?.name?.value || 'New Chat';
						return {
							id: sessionId,
							title: title,
							timestamp: new Date(),
							isCurrent: sessionId === id
						};
					});
					refreshedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
					dropdown.show(refreshedItems);
				} catch (error) {
					// Don't let errors break the dropdown - refresh it anyway
					// Re-find anchor element in case DOM was rebuilt
					const newAnchor = findAnchorElement();
					if (newAnchor && newAnchor.isConnected) {
						dropdown.updateAnchorElement(newAnchor);
					}
					const allSessionIds = sessionsService.getAllSessionIds();
					const refreshedItems: ChatHistoryItem[] = allSessionIds.map(sessionId => {
						const viewId = getVybeChatViewId(sessionId);
						const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
						const title = viewDescriptor?.name?.value || 'New Chat';
						return {
							id: sessionId,
							title: title,
							timestamp: new Date(),
							isCurrent: sessionId === id
						};
					});
					refreshedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
					dropdown.show(refreshedItems);
				}
			}));

			// Chat delete - refresh dropdown
			disposables.add(dropdown.onChatDelete(async (sessionId) => {
				await sessionsService.closeSession(sessionId);
				const allSessionIds = sessionsService.getAllSessionIds();
				if (allSessionIds.length > 0) {
					const refreshedItems: ChatHistoryItem[] = allSessionIds.map(sid => {
						const viewId = getVybeChatViewId(sid);
						const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
						const title = viewDescriptor?.name?.value || 'New Chat';
						return {
							id: sid,
							title: title,
							timestamp: new Date(),
							isCurrent: false
						};
					});
					refreshedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
					dropdown.show(refreshedItems);
				} else {
					dropdown.hide();
				}
			}));

			// Close and dispose dropdown when sidebar closes
			disposables.add(layoutService.onDidChangePartVisibility(() => {
				if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					// Sidebar closed - dispose everything
					dropdown.hide();
					disposables.dispose();
					dropdown.dispose();
					ShowVybeChatHistoryAction.dropdown = null;
					ShowVybeChatHistoryAction.disposables = null;
				}
			}));
		}

		const dropdown = ShowVybeChatHistoryAction.dropdown;
		if (!dropdown) {
			return;
		}

		// Before showing, check if anchor element is still connected
		// If not, try to find a new one and update the dropdown's anchor reference
		const currentAnchor = findAnchorElement();
		if (currentAnchor && currentAnchor.isConnected) {
			// Update dropdown's anchor reference if it changed
			dropdown.updateAnchorElement(currentAnchor);
		} else {
			return;
		}

		// Toggle: if visible, hide it; otherwise show it
		if (dropdown.isVisible) {
			dropdown.hide();
			return;
		}

		// Get current items and show dropdown
		const allSessionIds = sessionsService.getAllSessionIds();

		let currentSessionId: string | undefined;
		for (const sessionId of allSessionIds) {
			const viewId = getVybeChatViewId(sessionId);
			const view = viewsService.getViewWithId(viewId);
			if (view && view.isBodyVisible()) {
				currentSessionId = sessionId;
				break;
			}
		}

		const historyItems: ChatHistoryItem[] = allSessionIds.map(sessionId => {
			const viewId = getVybeChatViewId(sessionId);
			const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
			const title = viewDescriptor?.name?.value || 'New Chat';
			return {
				id: sessionId,
				title: title,
				timestamp: new Date(),
				isCurrent: sessionId === currentSessionId
			};
		});

		historyItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
		dropdown.show(historyItems);
	}
});

/**
 * Action for chat settings
 */
registerAction2(class VybeChatSettingsAction extends Action2 {
	constructor() {
		super({
			id: 'vybeChat.settings',
			title: localize2('vybeChat.settings', "Chat Settings"),
			icon: Codicon.settings,
			f1: false,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.regex('view', /^workbench\.panel\.vybeChat\.view\.chat\./),
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		// Open the central VYBE Settings editor – all configuration for VYBE
		// (including chat behavior, indexing, and models) lives there.
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('vybe.openSettingsEditor');
	}
});

/**
 * Action to close a chat session
 */
registerAction2(class CloseVybeChatAction extends Action2 {
	constructor() {
		super({
			id: 'vybeChat.closeChat',
			title: localize2('vybeChat.closeChat', "Close Chat"),
			icon: Codicon.close,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, sessionId?: string): Promise<void> {
		const sessionsService = accessor.get(IVybeChatSessionsService);
		if (sessionId) {
			await sessionsService.closeSession(sessionId);
		}
	}
});

/**
 * Test command for Phase 4 UI widgets
 * Creates a test edit transaction and computes diffs to trigger widget display
 */
registerAction2(class TestEditWidgetsAction extends Action2 {
	constructor() {
		super({
			id: 'vybe.testEditWidgets',
			title: localize2('vybe.testEditWidgets', "Test Edit Widgets"),
			category: Categories.Developer,
			f1: true, // Available in command palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await testEditWidgets(accessor);
	}
});

/**
 * DEV-ONLY: Simulate AI-style code edits for E2E testing
 * Creates realistic edit transactions with multiple diffs to test Phase 4 UI widgets
 */
registerAction2(class SimulateAiEditsAction extends Action2 {
	constructor() {
		super({
			id: 'vybe.simulateAiEdits',
			title: localize2('vybe.simulateAiEdits', "Simulate AI Edits (E2E Test)"),
			category: Categories.Developer,
			f1: true, // Available in command palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await simulateAiEdits(accessor);
	}
});

/**
 * DEV-ONLY: Simulate streaming AI-style code edits for E2E testing
 * Creates incremental streaming updates to test Phase 4 UI widgets with streaming diffs
 */
registerAction2(class SimulateAiStreamingEditsAction extends Action2 {
	constructor() {
		super({
			id: 'vybe.simulateAiStreamingEdits',
			title: localize2('vybe.simulateAiStreamingEdits', "Simulate Streaming AI Edits (E2E Test)"),
			category: Categories.Developer,
			f1: true, // Available in command palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await simulateAiStreamingEdits(accessor);
	}
});
