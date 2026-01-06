/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IIndexService } from '../../../services/indexing/common/indexService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import * as DOM from '../../../../base/browser/dom.js';
import { addDisposableListener, EventType, IDimension } from '../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderGeneralTab } from './tabs/vybeSettingsGeneralTab.js';
import { renderAgentsTab } from './tabs/vybeSettingsAgentsTab.js';
import { renderTabTab } from './tabs/vybeSettingsTabTab.js';
import { renderModelsTab } from './tabs/vybeSettingsModelsTab.js';
import { renderCloudAgentsTab } from './tabs/vybeSettingsCloudAgentsTab.js';
import { renderToolsMcpTab } from './tabs/vybeSettingsToolsMcpTab.js';
import { renderRulesCommandsTab } from './tabs/vybeSettingsRulesCommandsTab.js';
import { renderIndexingDocsTab } from './tabs/vybeSettingsIndexingDocsTab.js';
import { renderNetworkTab } from './tabs/vybeSettingsNetworkTab.js';
import { renderBetaTab } from './tabs/vybeSettingsBetaTab.js';

export class VybeSettingsEditor extends EditorPane {
	static readonly ID = 'workbench.editor.vybeSettings';

	private containerEl!: HTMLElement;
	private sidebarEl!: HTMLElement;
	private contentEl!: HTMLElement;
	private contentWrapperEl!: HTMLElement;
	private contentScrollable!: DomScrollableElement;
	private tabContentEl!: HTMLElement;
	private tabTitleEl!: HTMLElement;
	private selectedTab: string = 'general';
	private readonly tabDisposables: DisposableStore = new DisposableStore();
	private readonly storageService: IStorageService;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IIndexService private readonly indexService: IIndexService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(VybeSettingsEditor.ID, group, telemetryService, themeService, storageService);
		this.storageService = storageService;
		this._register(this.tabDisposables);
	}

	protected createEditor(parent: HTMLElement): void {
		this.containerEl = DOM.append(parent, DOM.$('.vybe-settings-editor'));
		this.containerEl.style.cssText = 'height: 100%; width: 100%; display: flex; flex-direction: column;';

		// Main layout container
		const layoutMain = DOM.append(this.containerEl, DOM.$('.cursor-settings-layout-main'));
		layoutMain.style.cssText = 'display: flex; height: 100%; min-height: 600px;';

		// Build sidebar
		this.sidebarEl = this.createSidebar(layoutMain);

		// Build content area
		this.contentEl = this.createContentArea(layoutMain);

		this.updateStyles();
	}

	private createSidebar(parent: HTMLElement): HTMLElement {
		const sidebar = DOM.append(parent, DOM.$('.cursor-settings-sidebar'));
		sidebar.style.cssText = `
			width: 175px;
			padding: 16px;
			box-sizing: border-box;
			display: flex;
			flex-direction: column;
			overflow-y: auto;
		`;

		// Sidebar header
		const header = DOM.append(sidebar, DOM.$('.cursor-settings-sidebar-header'));
		header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 16px;';

		const avatar = DOM.append(header, DOM.$('.cursor-settings-sidebar-avatar'));
		avatar.style.cssText = `
			width: 28px;
			height: 28px;
			border-radius: 50%;
			background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		`;

		const avatarInitial = DOM.append(avatar, DOM.$('p.cursor-settings-sidebar-avatar-initial'));
		avatarInitial.textContent = 'n';
		avatarInitial.style.cssText = `
			margin: 0;
			font-size: 12px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.6));
			text-align: center;
		`;

		const headerContent = DOM.append(header, DOM.$('.cursor-settings-sidebar-header-content'));
		headerContent.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;';

		const email = DOM.append(headerContent, DOM.$('p.cursor-settings-sidebar-header-email'));
		email.textContent = 'neel.ravi@particleblack.com';
		email.style.cssText = `
			margin: 0;
			font-size: 12px;
			color: var(--vscode-foreground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`;

		const plan = DOM.append(headerContent, DOM.$('p.cursor-settings-sidebar-header-plan'));
		plan.textContent = 'Pro+ Plan';
		plan.style.cssText = `
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`;

		// Sidebar content
		const sidebarContent = DOM.append(sidebar, DOM.$('.cursor-settings-sidebar-content'));
		sidebarContent.style.cssText = 'display: flex; flex-direction: column; gap: 8px; flex: 1;';

		// Search input
		const searchContainer = DOM.append(sidebarContent, DOM.$('div'));
		const searchInput = DOM.append(searchContainer, DOM.$('input', { type: 'text', placeholder: 'Search settings ⌘F' }));
		searchInput.style.cssText = `
			width: 100%;
			padding: 6px;
			box-sizing: border-box;
			font-size: 12px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-panel-background);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
		`;

		// Navigation cells
		const cellsContainer = DOM.append(sidebarContent, DOM.$('.cursor-settings-sidebar-cells'));
		cellsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 1px;';

		// Navigation items
		type NavItem = { divider: true } | { icon: string; label: string; id: string };
		const navItems: NavItem[] = [
			{ icon: 'codicon-gear', label: 'General', id: 'general' },
			{ icon: 'codicon-agent', label: 'Agents', id: 'agents' },
			{ icon: 'codicon-keyboard-tab', label: 'Tab', id: 'tab' },
			{ icon: 'codicon-symbol-method', label: 'Models', id: 'models' },
			{ divider: true },
			{ icon: 'codicon-cloud', label: 'Cloud Agents', id: 'cloud-agents' },
			{ icon: 'codicon-type-hierarchy-sub', label: 'Tools & MCP', id: 'tools-mcp' },
			{ divider: true },
			{ icon: 'codicon-clippy', label: 'Rules and Commands', id: 'rules-commands' },
			{ icon: 'codicon-server', label: 'Indexing & Docs', id: 'indexing-docs' },
			{ icon: 'codicon-globe', label: 'Network', id: 'network' },
			{ icon: 'codicon-beaker', label: 'Beta', id: 'beta' },
		];

		function isDivider(item: NavItem): item is { divider: true } {
			return 'divider' in item && item.divider === true;
		}

		for (const item of navItems) {
			if (isDivider(item)) {
				const divider = DOM.append(cellsContainer, DOM.$('hr.cursor-settings-sidebar-divider'));
				divider.style.cssText = `
					margin: 8px 0;
					border: none;
					border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.2)));
					width: 100%;
				`;
			} else {
				const cell = DOM.append(cellsContainer, DOM.$('.cursor-settings-sidebar-cell'));
				cell.style.cssText = `
					display: flex;
					align-items: center;
					gap: 6px;
					padding: 4px 6px;
					border-radius: 4px;
					cursor: pointer;
					background-color: ${this.selectedTab === item.id ? 'var(--vscode-activityBar-background)' : 'transparent'};
					transition: background-color 0.2s ease;
				`;
				cell.dataset.tabId = item.id;

				// Add hover effect
				this._register(addDisposableListener(cell, EventType.MOUSE_ENTER, () => {
					if (this.selectedTab !== item.id) {
						cell.style.backgroundColor = 'var(--vscode-activityBar-background)';
					}
				}));

				this._register(addDisposableListener(cell, EventType.MOUSE_LEAVE, () => {
					if (this.selectedTab !== item.id) {
						cell.style.backgroundColor = 'transparent';
					}
				}));

				const icon = DOM.append(cell, DOM.$(`span.codicon.${item.icon}`));
				icon.style.cssText = 'font-size: 16px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));';

				const label = DOM.append(cell, DOM.$('span.cursor-settings-sidebar-cell-label'));
				label.textContent = item.label;
				label.title = item.label;
				label.style.cssText = `
					font-size: 12px;
					color: var(--vscode-foreground);
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				`;

				this._register(addDisposableListener(cell, EventType.CLICK, () => {
					this.selectTab(item.id);
				}));
			}
		}

		// Footer divider
		const footerDivider = DOM.append(sidebarContent, DOM.$('hr.cursor-settings-sidebar-divider'));
		footerDivider.style.cssText = `
			margin: 8px 0;
			border: none;
			border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.2)));
			width: 100%;
		`;

		// Footer
		const footer = DOM.append(sidebarContent, DOM.$('.cursor-settings-sidebar-footer'));
		const footerCell = DOM.append(footer, DOM.$('.cursor-settings-sidebar-cell'));
		footerCell.style.cssText = `
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 4px 6px;
			border-radius: 4px;
			cursor: pointer;
		`;

		const docsIcon = DOM.append(footerCell, DOM.$('span.codicon.codicon-book'));
		docsIcon.style.cssText = 'font-size: 16px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));';

		const docsLabel = DOM.append(footerCell, DOM.$('span.cursor-settings-sidebar-cell-label'));
		docsLabel.textContent = 'Docs';
		docsLabel.title = 'Docs';
		docsLabel.style.cssText = `
			font-size: 12px;
			color: var(--vscode-foreground);
			flex: 1;
		`;

		const externalIcon = DOM.append(footerCell, DOM.$('span.codicon.codicon-link-external'));
		externalIcon.style.cssText = 'font-size: 16px; color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));';

		return sidebar;
	}

	private createContentArea(parent: HTMLElement): HTMLElement {
		// Outer content container (no overflow)
		const content = DOM.append(parent, DOM.$('.cursor-settings-pane-content'));
		content.style.cssText = `
			flex: 1;
			box-sizing: border-box;
			overflow: hidden;
			position: relative;
			display: flex;
			flex-direction: column;
		`;

		// Inner scrollable content wrapper (create standalone first)
		const contentWrapper = DOM.$('.cursor-settings-pane-content-wrapper');
		contentWrapper.style.cssText = `
			padding: 16px;
			box-sizing: border-box;
			position: relative;
		`;
		this.contentWrapperEl = contentWrapper;

		// Tab container
		const tab = DOM.append(contentWrapper, DOM.$('.cursor-settings-tab'));
		tab.style.cssText = 'display: flex; flex-direction: column; gap: 20px; padding: 0;';

		// Tab header
		const tabHeader = DOM.append(tab, DOM.$('.cursor-settings-tab-header'));
		tabHeader.style.cssText = 'padding: 0 8px;';

		const tabTitle = DOM.append(tabHeader, DOM.$('.cursor-settings-tab-title'));
		tabTitle.textContent = 'General';
		tabTitle.style.cssText = `
			font-size: 16px;
			font-weight: 500;
			color: var(--vscode-foreground);
			letter-spacing: -0.32px;
			line-height: 21px;
		`;
		this.tabTitleEl = tabTitle;

		// Tab content
		const tabContent = DOM.append(tab, DOM.$('.cursor-settings-tab-content'));
		tabContent.style.cssText = 'display: flex; flex-direction: column; gap: 30px;';
		this.tabContentEl = tabContent;

		// Render General tab content
		renderGeneralTab(tabContent, this.storageService, this.tabDisposables);

		// Create VS Code native scrollbar - wraps contentWrapper
		this.contentScrollable = this._register(new DomScrollableElement(contentWrapper, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			useShadows: false
		}));

		const scrollableDomNode = this.contentScrollable.getDomNode();
		scrollableDomNode.style.height = '100%';
		scrollableDomNode.style.width = '100%';
		scrollableDomNode.style.position = 'relative';
		scrollableDomNode.style.overflow = 'hidden';

		// Append scrollable element to content (DomScrollableElement already wrapped contentWrapper)
		content.appendChild(scrollableDomNode);

		// Update scroll dimensions after DOM is ready and layout has occurred
		const window = DOM.getWindow(content);
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				this.updateScrollDimensions();
			});
		});

		return content;
	}

	private updateScrollDimensions(): void {
		if (!this.contentScrollable || !this.contentWrapperEl) {
			return;
		}

		const scrollableDomNode = this.contentScrollable.getDomNode();

		// Get viewport dimensions from scrollable container
		const viewportWidth = scrollableDomNode.clientWidth;
		const viewportHeight = scrollableDomNode.clientHeight;

		// Temporarily remove height constraint to measure actual content height
		this.contentWrapperEl.style.height = 'auto';
		this.contentWrapperEl.style.width = `${viewportWidth}px`;

		// Force layout recalculation to get actual content dimensions
		void this.contentWrapperEl.offsetHeight;
		const contentWidth = this.contentWrapperEl.scrollWidth;
		const contentHeight = this.contentWrapperEl.scrollHeight;

		// Now set the wrapper height to viewport height for proper scrolling
		this.contentWrapperEl.style.height = `${viewportHeight}px`;

		// Set scroll dimensions explicitly
		// height = viewport (visible area)
		// scrollHeight = total content height (what can be scrolled)
		this.contentScrollable.setScrollDimensions({
			width: viewportWidth,
			scrollWidth: contentWidth,
			height: viewportHeight,
			scrollHeight: contentHeight
		});

		// Also call scanDomNode to ensure DomScrollableElement reads the correct dimensions
		this.contentScrollable.scanDomNode();
	}

	private selectTab(tabId: string): void {
		this.selectedTab = tabId;

		// Update sidebar selection
		const cells = this.sidebarEl.querySelectorAll('.cursor-settings-sidebar-cell[data-tab-id]');
		cells.forEach(cell => {
			if (DOM.isHTMLElement(cell)) {
				cell.style.backgroundColor = cell.dataset.tabId === tabId ? 'var(--vscode-activityBar-background)' : 'transparent';
			}
		});

		// Update tab title
		if (this.tabTitleEl) {
			const labels: { [key: string]: string } = {
				'general': 'General',
				'agents': 'Agents',
				'tab': 'Tab',
				'models': 'Models',
				'cloud-agents': 'Cloud Agents',
				'tools-mcp': 'Tools & MCP',
				'rules-commands': 'Rules and Commands',
				'indexing-docs': 'Indexing & Docs',
				'network': 'Network',
				'beta': 'Beta'
			};
			this.tabTitleEl.textContent = labels[tabId] || 'General';
		}

		// Clear and re-render tab content
		if (this.tabContentEl) {
			// Dispose previous tab's disposables
			this.tabDisposables.clear();
			DOM.clearNode(this.tabContentEl);

			switch (tabId) {
				case 'general':
					renderGeneralTab(this.tabContentEl, this.storageService, this.tabDisposables);
					break;
				case 'agents':
					renderAgentsTab(this.tabContentEl);
					break;
				case 'tab':
					renderTabTab(this.tabContentEl);
					break;
				case 'models':
					renderModelsTab(this.tabContentEl, this.storageService, this.instantiationService, this.tabDisposables);
					break;
				case 'cloud-agents':
					renderCloudAgentsTab(this.tabContentEl);
					break;
				case 'tools-mcp':
					renderToolsMcpTab(this.tabContentEl);
					break;
				case 'rules-commands':
					renderRulesCommandsTab(this.tabContentEl);
					break;
				case 'indexing-docs':
					renderIndexingDocsTab(this.tabContentEl, this.configurationService, this.workspaceContextService, this.indexService, this.tabDisposables, this.commandService);
					break;
				case 'network':
					renderNetworkTab(this.tabContentEl);
					break;
				case 'beta':
					renderBetaTab(this.tabContentEl);
					break;
				default:
					// For other tabs, just show empty for now
					break;
			}

			// Update scroll dimensions after content changes
			const window = DOM.getWindow(this.contentEl);
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					this.updateScrollDimensions();
				});
			});
		}
	}

	override updateStyles(): void {
		// Theme-aware styling updates can go here
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
	}

	override layout(dimension: IDimension): void {
		if (this.containerEl) {
			this.containerEl.style.width = `${dimension.width}px`;
			this.containerEl.style.height = `${dimension.height}px`;
		}

		// Update scroll dimensions when layout changes
		if (this.contentScrollable && this.containerEl) {
			// Use requestAnimationFrame to ensure DOM has updated
			const window = DOM.getWindow(this.containerEl);
			window.requestAnimationFrame(() => {
				this.updateScrollDimensions();
			});
		}
	}
}
