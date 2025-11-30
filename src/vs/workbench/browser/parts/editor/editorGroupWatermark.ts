/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, h, addDisposableListener } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { coalesce, shuffle } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
// VYBE-PATCH-START: branding
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { isRecentFolder, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { splitRecentLabel } from '../../../../base/common/labels.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWindowOpenable } from '../../../../platform/window/common/window.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
// VYBE-PATCH-END: branding

interface WatermarkEntry {
	readonly id: string;
	readonly text: string;
	readonly when?: {
		native?: ContextKeyExpression;
		web?: ContextKeyExpression;
	};
}

const showChatContextKey = ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupDisabled', false));

const openChat: WatermarkEntry = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: showChatContextKey, web: showChatContextKey } };
const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const gotoFile: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
const openFile: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
const openFolder: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
const openFileOrFolder: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFile: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const openSettings: WatermarkEntry = { text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings' };

const baseEntries: WatermarkEntry[] = [
	openChat,
	showCommands,
];

const emptyWindowEntries: WatermarkEntry[] = coalesce([
	...baseEntries,
	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
	openRecent,
	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
]);

const workspaceEntries: WatermarkEntry[] = [
	...baseEntries,
];

const otherEntries: WatermarkEntry[] = [
	gotoFile,
	findInFiles,
	startDebugging,
	toggleTerminal,
	openSettings,
];

export class EditorGroupWatermark extends Disposable {

	private static readonly CACHED_WHEN = 'editorGroupWatermark.whenConditions';
	private static readonly SETTINGS_KEY = 'workbench.tips.enabled';
	private static readonly MINIMUM_ENTRIES = 3;

	private readonly cachedWhen: { [when: string]: boolean };

	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly keybindingLabels = this._register(new DisposableStore());
	private readonly watermarkContainer: HTMLElement;

	private enabled = false;
	private workbenchState: WorkbenchState;
	private isVybe = false;

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		// VYBE-PATCH-START: branding
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService private readonly hostService: IHostService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService
		// VYBE-PATCH-END: branding
	) {
		super();

		// VYBE-PATCH-START: branding
		this.isVybe = this.productService.nameShort === 'VYBE';
		// VYBE-PATCH-END: branding

		this.cachedWhen = this.storageService.getObject(EditorGroupWatermark.CACHED_WHEN, StorageScope.PROFILE, Object.create(null));
		this.workbenchState = this.contextService.getWorkbenchState();

		// VYBE-PATCH-START: branding
		const watermarkClass = this.isVybe ? '.editor-group-watermark.vybe-watermark' : '.editor-group-watermark';
		// VYBE-PATCH-END: branding
		const elements = h(watermarkClass, [
			h('.watermark-container@watermarkContainer', [
				h('.letterpress'),
				h('.shortcuts@shortcuts'),
			])
		]);

		append(container, elements.root);
		this.shortcuts = elements.shortcuts;
		this.watermarkContainer = elements.watermarkContainer;

		this.registerListeners();

		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(EditorGroupWatermark.SETTINGS_KEY) &&
				this.enabled !== this.configurationService.getValue<boolean>(EditorGroupWatermark.SETTINGS_KEY)
			) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState !== workbenchState) {
				this.workbenchState = workbenchState;
				this.render();
			}
		}));

		this._register(this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				const entries = [...emptyWindowEntries, ...workspaceEntries, ...otherEntries];
				for (const entry of entries) {
					const when = isWeb ? entry.when?.web : entry.when?.native;
					if (when) {
						this.cachedWhen[entry.id] = this.contextKeyService.contextMatchesRules(when);
					}
				}

				this.storageService.store(EditorGroupWatermark.CACHED_WHEN, JSON.stringify(this.cachedWhen), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}));
	}

	private render(): void {
		// VYBE-PATCH-START: branding
		if (this.isVybe) {
			this.renderVybeWatermark();
			return;
		}
		// VYBE-PATCH-END: branding

		this.enabled = this.configurationService.getValue<boolean>(EditorGroupWatermark.SETTINGS_KEY);

		clearNode(this.shortcuts);
		this.transientDisposables.clear();

		if (!this.enabled) {
			return;
		}

		const entries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? workspaceEntries : emptyWindowEntries);
		if (entries.length < EditorGroupWatermark.MINIMUM_ENTRIES) {
			const additionalEntries = this.filterEntries(otherEntries);
			shuffle(additionalEntries);
			entries.push(...additionalEntries.slice(0, EditorGroupWatermark.MINIMUM_ENTRIES - entries.length));
		}

		const box = append(this.shortcuts, $('.watermark-box'));

		const update = () => {
			clearNode(box);
			this.keybindingLabels.clear();

			for (const entry of entries) {
				const keys = this.keybindingService.lookupKeybinding(entry.id);
				if (!keys) {
					continue;
				}

				const dl = append(box, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = entry.text;

				const dd = append(dl, $('dd'));

				const label = this.keybindingLabels.add(new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles }));
				label.set(keys);
			}
		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	// VYBE-PATCH-START: branding
	private async renderVybeWatermark(): Promise<void> {
		clearNode(this.watermarkContainer);
		this.transientDisposables.clear();
		this.watermarkContainer.classList.add('vybe-watermark');

		// VYBE-PATCH-START: branding
		// Inject style element with maximum specificity to override any conflicting CSS
		// Use multiple high-specificity selectors to override color-mix() rules
		const styleId = 'vybe-button-styles';
		let styleElement = document.getElementById(styleId) as HTMLStyleElement;
		if (!styleElement) {
			styleElement = document.createElement('style');
			styleElement.id = styleId;
			document.head.appendChild(styleElement);
		}
		const updateStyles = () => {
			const themeType = this.themeService.getColorTheme().type;
			const isDark = themeType === ColorScheme.DARK || themeType === ColorScheme.HIGH_CONTRAST_DARK;
			const bgColor = isDark ? '#202124' : '#f3f4f5';
			const hoverColor = isDark ? '#2a2b2e' : '#e5e8ea';
			styleElement.textContent = `
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .vybe-button[data-vybe-button="true"],
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .cursor-button.vybe-button[data-vybe-button="true"],
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .cursor-button-secondary.vybe-button[data-vybe-button="true"],
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .cursor-button-secondary-clickable.vybe-button[data-vybe-button="true"],
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .empty-screen-button.vybe-button[data-vybe-button="true"] {
					background-color: ${bgColor} !important;
					background: ${bgColor} !important;
					border: none !important;
					border-top: none !important;
					border-right: none !important;
					border-bottom: none !important;
					border-left: none !important;
					border-width: 0 !important;
					border-style: none !important;
				}
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .vybe-button[data-vybe-button="true"]:hover,
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .cursor-button.vybe-button[data-vybe-button="true"]:hover,
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .cursor-button-secondary.vybe-button[data-vybe-button="true"]:hover,
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .cursor-button-secondary-clickable.vybe-button[data-vybe-button="true"]:hover,
				.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark .empty-screen-button.vybe-button[data-vybe-button="true"]:hover {
					background-color: ${hoverColor} !important;
					background: ${hoverColor} !important;
				}
			`;
		};
		updateStyles();
		this.transientDisposables.add(this.themeService.onDidColorThemeChange(() => {
			updateStyles();
		}));
		// VYBE-PATCH-END: branding

		// Only show buttons and recent projects when workspace is empty
		const isEmpty = this.workbenchState === WorkbenchState.EMPTY;

		// Create VYBE logo - bigger when workspace is open, smaller when empty
		const logoUri = FileAccess.asBrowserUri('vs/workbench/browser/parts/editor/media/vybe-logo.svg');
		const logoSize = isEmpty ? '120px' : '480px'; // 4x larger when workspace is open
		const logo = $('.vybe-logo', {
			style: `background-image: url('${logoUri}'); background-size: contain; background-repeat: no-repeat; background-position: center; width: ${logoSize}; height: ${logoSize};`
		});

		if (isEmpty) {
			// Create buttons container
			const buttonsContainer = $('.vybe-buttons', {
				style: 'display: grid; grid-template-columns: repeat(3, minmax(0px, 1fr)); gap: 12px; justify-content: center; width: 100%; max-width: calc(420px - 0.8rem); margin-bottom: 24px;'
			});

		// Create buttons
		const openProjectBtn = this.createVybeButton('folder', 'Open project', () => {
			this.commandService.executeCommand('workbench.action.files.openFolder');
		});
		const cloneRepoBtn = this.createVybeButton('cloud-download', 'Clone repo', () => {
			this.commandService.executeCommand('git.clone');
		});
		const connectSSHBtn = this.createVybeButton('terminal', 'Connect via SSH', () => {
			this.commandService.executeCommand('workbench.action.remote.showMenu');
		});

		append(buttonsContainer, openProjectBtn);
		append(buttonsContainer, cloneRepoBtn);
		append(buttonsContainer, connectSSHBtn);

		// Create recent projects section
		const recentSection = $('.vybe-recent', {
			style: 'width: 100%; max-width: 420px;'
		});

		const recentHeader = $('.vybe-recent-header', {
			style: 'display: flex; align-items: center; justify-content: space-between; padding: 0.2rem 0.4rem; font-size: 0.65rem; line-height: 1.2; margin-bottom: 0.15rem; opacity: 0.9; gap: 0.5rem; color: var(--vscode-foreground);'
		});
		const recentHeaderText = $('span', {
			style: 'font-weight: 400; margin-right: 0.25rem; opacity: 0.6;'
		});
		recentHeaderText.textContent = 'Recent projects';
		append(recentHeader, recentHeaderText);

		const recentList = $('.vybe-recent-list', {
			style: 'display: flex; flex-direction: column; gap: 0.15rem;'
		});

		// Load recent workspaces
		try {
			const recentlyOpened = await this.workspacesService.getRecentlyOpened();
			const currentWorkspace = this.contextService.getWorkspace();

			for (const recent of recentlyOpened.workspaces.slice(0, 5)) {
				if (isRecentFolder(recent)) {
					if (currentWorkspace.folders.some(f => f.uri.toString() === recent.folderUri.toString())) {
						continue; // Skip current workspace
					}
					const fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: Verbosity.LONG });
					const item = this.createRecentItem(
						{ folderUri: recent.folderUri },
						fullPath,
						recent.remoteAuthority
					);
					append(recentList, item);
				} else if (isRecentWorkspace(recent)) {
					if (this.contextService.isCurrentWorkspace(recent.workspace)) {
						continue; // Skip current workspace
					}
					const fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
					const item = this.createRecentItem(
						{ workspaceUri: recent.workspace.configPath },
						fullPath,
						recent.remoteAuthority
					);
					append(recentList, item);
				}
			}
		} catch (error) {
			// Ignore errors loading recent workspaces
		}

			append(recentSection, recentHeader);
			append(recentSection, recentList);

			// Assemble the watermark with buttons and recent projects
			append(this.watermarkContainer, logo);
			append(this.watermarkContainer, buttonsContainer);
			append(this.watermarkContainer, recentSection);
		} else {
			// Workspace is open - only show logo
			append(this.watermarkContainer, logo);
		}
	}

	private createVybeButton(icon: string, label: string, onClick: () => void): HTMLElement {
		// VYBE-PATCH-START: branding
		// Theme variables (button.secondaryBackground, button.secondaryHoverBackground, quickInput.background)
		// are now set correctly in our themes, so VS Code's color-mix() will naturally use our colors.
		// We just need to remove conflicting classes and ensure no border.
		const button = $('.vybe-button', {
			'data-vybe-button': 'true',
			style: `user-select: none; flex-shrink: 0; padding: 10px 12px; border-radius: 6px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 6px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 0 1px var(--vscode-widget-shadow); transition: background-color 0.2s ease; border: none !important;`
		});

		// Remove cursor-button classes that VS Code adds (these trigger unwanted styling)
		const removeCursorButtonClasses = () => {
			button.classList.remove('cursor-button', 'cursor-button-secondary', 'cursor-button-secondary-clickable', 'empty-screen-button');
		};
		removeCursorButtonClasses();

		// Watch for classes being re-added and remove them
		const observer = new MutationObserver(() => {
			if (button.classList.contains('cursor-button') || button.classList.contains('cursor-button-secondary')) {
				removeCursorButtonClasses();
			}
		});
		observer.observe(button, {
			attributes: true,
			attributeFilter: ['class']
		});
		this.transientDisposables.add({ dispose: () => observer.disconnect() });
		// VYBE-PATCH-END: branding

		const iconEl = $('.codicon', {
			class: `codicon codicon-${icon}`,
			style: 'font-size: 16px; color: var(--vscode-foreground);'
		});

		const labelEl = $('div', {
			style: 'font-size: 12px; color: var(--vscode-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
		});
		labelEl.textContent = label;

		append(button, iconEl);
		append(button, labelEl);

		this.transientDisposables.add(addDisposableListener(button, 'click', onClick));

		return button;
	}

	private createRecentItem(windowOpenable: IWindowOpenable, fullPath: string, remoteAuthority?: string): HTMLElement {
		const item = $('.vybe-recent-item', {
			style: 'display: flex; outline: none; align-items: center; padding: 0.2rem 0.4rem; border-radius: 0.25rem; cursor: pointer; justify-content: center; min-width: 0px; line-height: 1.2;'
		});

		// Split the full path into name and parent path (like welcome page does)
		const { name, parentPath } = splitRecentLabel(fullPath);

		const nameEl = $('div', {
			style: 'flex-grow: 1; flex-shrink: 1; min-width: 0px; font-size: 0.75rem; color: var(--vscode-foreground); opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
		});
		nameEl.textContent = name;
		nameEl.title = fullPath;

		const pathEl = $('div', {
			style: 'font-size: 0.65rem; color: var(--vscode-foreground); opacity: 0.6; margin-left: 12px; flex-shrink: 0; direction: rtl; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%;'
		});
		const pathSpan = $('span', {
			style: 'direction: ltr; unicode-bidi: embed;'
		});
		pathSpan.textContent = parentPath;
		pathSpan.title = fullPath;
		append(pathEl, pathSpan);

		append(item, nameEl);
		append(item, pathEl);

		this.transientDisposables.add(addDisposableListener(item, 'click', (e) => {
			// VYBE-PATCH-START: branding
			// Open workspace/folder directly using hostService (same as welcome page)
			this.hostService.openWindow([windowOpenable], {
				forceNewWindow: e.ctrlKey || e.metaKey,
				remoteAuthority: remoteAuthority || null
			});
			e.preventDefault();
			e.stopPropagation();
			// VYBE-PATCH-END: branding
		}));

		return item;
	}
	// VYBE-PATCH-END: branding

	private filterEntries(entries: WatermarkEntry[]): WatermarkEntry[] {
		const filteredEntries = entries
			.filter(entry => {
				if (this.cachedWhen[entry.id]) {
					return true; // cached from previous session
				}

				const contextKey = isWeb ? entry.when?.web : entry.when?.native;
				return !contextKey /* works without context */ || this.contextKeyService.contextMatchesRules(contextKey);
			})
			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

		return filteredEntries;
	}
}
