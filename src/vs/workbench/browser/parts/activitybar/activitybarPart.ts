/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/activitybarpart.css';
import './media/activityaction.css';
import { localize, localize2 } from '../../../../nls.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Part } from '../../part.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ToggleSidebarPositionAction, ToggleSidebarVisibilityAction } from '../../actions/layoutActions.js';
import { IThemeService, IColorTheme, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from '../../../common/theme.js';
import { activeContrastBorder, contrastBorder, focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { addDisposableListener, append, EventType, isAncestor, $, clearNode } from '../../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { CustomMenubarControl } from '../titlebar/menubarControl.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getMenuBarVisibility, MenuSettings } from '../../../../platform/window/common/window.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { GestureEvent } from '../../../../base/browser/touch.js';
import { IPaneCompositePart } from '../paneCompositePart.js';
import { IPaneCompositeBarOptions, PaneCompositeBar } from '../paneCompositeBar.js';
import { GlobalCompositeBar } from '../globalCompositeBar.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SwitchCompositeViewAction } from '../compositeBarActions.js';

export class ActivitybarPart extends Part {

	// VYBE-PATCH-START: activity-bar-width
	static readonly ACTION_HEIGHT = 38;
	// VYBE-PATCH-END: activity-bar-width

	static readonly pinnedViewContainersKey = 'workbench.activity.pinnedViewlets2';
	static readonly placeholderViewContainersKey = 'workbench.activity.placeholderViewlets';
	static readonly viewContainersWorkspaceStateKey = 'workbench.activity.viewletsWorkspaceState';

	//#region IView

	// VYBE-PATCH-START: activity-bar-width
	readonly minimumWidth: number = 38;
	readonly maximumWidth: number = 38;
	// VYBE-PATCH-END: activity-bar-width
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private readonly compositeBar = this._register(new MutableDisposable<PaneCompositeBar>());
	private content: HTMLElement | undefined;

	constructor(
		private readonly paneCompositePart: IPaneCompositePart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	private createCompositeBar(): PaneCompositeBar {
		return this.instantiationService.createInstance(ActivityBarCompositeBar, {
			partContainerClass: 'activitybar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
			orientation: ActionsOrientation.VERTICAL,
			icon: true,
			// VYBE-PATCH-START: activity-bar-icon-size
			iconSize: 20,
			// VYBE-PATCH-END: activity-bar-icon-size
			activityHoverOptions: {
				position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT,
			},
			preventLoopNavigation: true,
			recomputeSizes: false,
			fillExtraContextMenuActions: (actions, e?: MouseEvent | GestureEvent) => { },
			compositeSize: 52,
			colors: (theme: IColorTheme) => ({
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
				activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
				activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
				activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
			}),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT,
		}, Parts.ACTIVITYBAR_PART, this.paneCompositePart, true);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.content = append(this.element, $('.content'));

		if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			this.show();
		}

		return this.content;
	}

	getPinnedPaneCompositeIds(): string[] {
		return this.compositeBar.value?.getPinnedPaneCompositeIds() ?? [];
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.value?.getVisiblePaneCompositeIds() ?? [];
	}

	getPaneCompositeIds(): string[] {
		return this.compositeBar.value?.getPaneCompositeIds() ?? [];
	}

	focus(): void {
		this.compositeBar.value?.focus();
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
		container.style.backgroundColor = background;

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
		container.classList.toggle('bordered', !!borderColor);
		container.style.borderColor = borderColor ? borderColor : '';
	}

	show(focus?: boolean): void {
		if (!this.content) {
			return;
		}

		if (!this.compositeBar.value) {
			this.compositeBar.value = this.createCompositeBar();
			this.compositeBar.value.create(this.content);

			if (this.dimension) {
				this.layout(this.dimension.width, this.dimension.height);
			}
		}

		if (focus) {
			this.focus();
		}
	}

	hide(): void {
		if (!this.compositeBar.value) {
			return;
		}

		this.compositeBar.clear();

		if (this.content) {
			clearNode(this.content);
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height, 0, 0);

		if (!this.compositeBar.value) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		this.compositeBar.value.layout(width, contentAreaSize.height);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}

export class ActivityBarCompositeBar extends PaneCompositeBar {

	private element: HTMLElement | undefined;

	private readonly menuBar = this._register(new MutableDisposable<CustomMenubarControl>());
	private menuBarContainer: HTMLElement | undefined;
	private compositeBarContainer: HTMLElement | undefined;
	private readonly globalCompositeBar: GlobalCompositeBar | undefined;

	private readonly keyboardNavigationDisposables = this._register(new DisposableStore());
	// VYBE-PATCH-START: activity-bar-separator
	private extensionSeparator: HTMLElement | undefined;
	private readonly _viewDescriptorServiceForSeparator: IViewDescriptorService;
	private readonly _extensionServiceForSeparator: IExtensionService;
	private separatorObserver: MutationObserver | undefined;
	// VYBE-PATCH-END: activity-bar-separator

	constructor(
		options: IPaneCompositeBarOptions,
		part: Parts,
		paneCompositePart: IPaneCompositePart,
		showGlobalActivities: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IViewsService viewService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMenuService private readonly menuService: IMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super({
			...options,
			fillExtraContextMenuActions: (actions, e) => {
				options.fillExtraContextMenuActions(actions, e);
				this.fillContextMenuActions(actions, e);
			}
		}, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, layoutService);

		// VYBE-PATCH-START: activity-bar-separator
		// Store services for use in updateExtensionSeparator (using different names to avoid conflict with parent class)
		this._viewDescriptorServiceForSeparator = viewDescriptorService;
		this._extensionServiceForSeparator = extensionService;
		// VYBE-PATCH-END: activity-bar-separator

		if (showGlobalActivities) {
			this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme: IColorTheme) => this.options.colors(theme), this.options.activityHoverOptions));
		}

		// Register for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
				if (getMenuBarVisibility(this.configurationService) === 'compact') {
					this.installMenubar();
				} else {
					this.uninstallMenubar();
				}
			}
		}));

		// VYBE-PATCH-START: activity-bar-separator
		// Listen to view container changes to update separator position
		this._register(this._viewDescriptorServiceForSeparator.onDidChangeViewContainers(() => {
			setTimeout(() => this.updateExtensionSeparator(), 0);
			setTimeout(() => this.updateExtensionSeparator(), 100);
		}));
		// Also listen to extension service to catch when extensions are registered
		this._register(this._extensionServiceForSeparator.onDidRegisterExtensions(() => {
			setTimeout(() => this.updateExtensionSeparator(), 100);
			setTimeout(() => this.updateExtensionSeparator(), 500);
		}));
		// VYBE-PATCH-END: activity-bar-separator
	}

	private fillContextMenuActions(actions: IAction[], e?: MouseEvent | GestureEvent) {
		// Menu
		const menuBarVisibility = getMenuBarVisibility(this.configurationService);
		if (menuBarVisibility === 'compact' || menuBarVisibility === 'hidden' || menuBarVisibility === 'toggle') {
			actions.unshift(...[toAction({ id: 'toggleMenuVisibility', label: localize('menu', "Menu"), checked: menuBarVisibility === 'compact', run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, menuBarVisibility === 'compact' ? 'toggle' : 'compact') }), new Separator()]);
		}

		if (menuBarVisibility === 'compact' && this.menuBarContainer && e?.target) {
			if (isAncestor(e.target as Node, this.menuBarContainer)) {
				actions.unshift(...[toAction({ id: 'hideCompactMenu', label: localize('hideMenu', "Hide Menu"), run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, 'toggle') }), new Separator()]);
			}
		}

		// Global Composite Bar
		if (this.globalCompositeBar) {
			actions.push(new Separator());
			actions.push(...this.globalCompositeBar.getContextMenuActions());
		}
		actions.push(new Separator());
		actions.push(...this.getActivityBarContextMenuActions());
	}

	private uninstallMenubar() {
		if (this.menuBar.value) {
			this.menuBar.value = undefined;
		}

		if (this.menuBarContainer) {
			this.menuBarContainer.remove();
			this.menuBarContainer = undefined;
		}
	}

	private installMenubar() {
		if (this.menuBar.value) {
			return; // prevent menu bar from installing twice #110720
		}

		this.menuBarContainer = $('.menubar');

		const content = assertReturnsDefined(this.element);
		content.prepend(this.menuBarContainer);

		// Menubar: install a custom menu bar depending on configuration
		this.menuBar.value = this._register(this.instantiationService.createInstance(CustomMenubarControl));
		this.menuBar.value.create(this.menuBarContainer);

	}

	private registerKeyboardNavigationListeners(): void {
		this.keyboardNavigationDisposables.clear();

		// Up/Down or Left/Right arrow on compact menu
		if (this.menuBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.focus();
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.globalCompositeBar?.focus();
				} else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.menuBar.value?.toggleFocus();
				}
			}));
		}

		// Up arrow on global icons
		if (this.globalCompositeBar) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.focus(this.getVisiblePaneCompositeIds().length - 1);
				}
			}));
		}
	}

	override create(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Install menubar if compact
		if (getMenuBarVisibility(this.configurationService) === 'compact') {
			this.installMenubar();
		}

		// View Containers action bar
		this.compositeBarContainer = super.create(this.element);

		// VYBE-PATCH-START: activity-bar-separator
		// Create separator element
		this.extensionSeparator = $('.activitybar-extension-separator');
		// Update separator position after initial render and DOM is ready
		// Use multiple timeouts to ensure DOM is fully rendered
		setTimeout(() => this.updateExtensionSeparator(), 0);
		setTimeout(() => this.updateExtensionSeparator(), 100);
		setTimeout(() => this.updateExtensionSeparator(), 500);
		// Set up MutationObserver to watch for DOM changes in the action bar
		this.setupSeparatorObserver();
		// VYBE-PATCH-END: activity-bar-separator

		// Global action bar
		if (this.globalCompositeBar) {
			this.globalCompositeBar.create(this.element);
		}

		// Keyboard Navigation
		this.registerKeyboardNavigationListeners();

		return this.compositeBarContainer;
	}

	override layout(width: number, height: number): void {
		if (this.menuBarContainer) {
			if (this.options.orientation === ActionsOrientation.VERTICAL) {
				height -= this.menuBarContainer.clientHeight;
			} else {
				width -= this.menuBarContainer.clientWidth;
			}
		}
		if (this.globalCompositeBar) {
			if (this.options.orientation === ActionsOrientation.VERTICAL) {
				height -= (this.globalCompositeBar.size() * ActivitybarPart.ACTION_HEIGHT);
			} else {
				width -= this.globalCompositeBar.element.clientWidth;
			}
		}
		super.layout(width, height);
	}

	getActivityBarContextMenuActions(): IAction[] {
		const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
		const positionActions = getContextMenuActions(activityBarPositionMenu).secondary;
		const actions = [
			new SubmenuAction('workbench.action.panel.position', localize('activity bar position', "Activity Bar Position"), positionActions),
			toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) }),
		];

		if (this.part === Parts.SIDEBAR_PART) {
			actions.push(toAction({ id: ToggleSidebarVisibilityAction.ID, label: ToggleSidebarVisibilityAction.LABEL, run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarVisibilityAction().run(accessor)) }));
		}

		return actions;
	}

	// VYBE-PATCH-START: activity-bar-separator
	private setupSeparatorObserver(): void {
		if (!this.compositeBarContainer) {
			return;
		}

		// Wait for the action bar and actions container to be created
		setTimeout(() => {
			const actionBar = this.compositeBarContainer?.querySelector('.monaco-action-bar');
			if (!actionBar) {
				return;
			}

			const actionsContainer = actionBar.querySelector('.actions-container');
			if (!actionsContainer) {
				return;
			}

			// Set up MutationObserver to watch for changes in the actions container
			this.separatorObserver = new MutationObserver(() => {
				this.updateExtensionSeparator();
			});

			this.separatorObserver.observe(actionsContainer, {
				childList: true,
				subtree: false
			});

			this._register({ dispose: () => this.separatorObserver?.disconnect() });
		}, 100);
	}

	private updateExtensionSeparator(): void {
		if (!this.extensionSeparator || !this.compositeBarContainer) {
			return;
		}

		// Find the action bar and actions container
		const actionBar = this.compositeBarContainer.querySelector('.monaco-action-bar') as HTMLElement;
		if (!actionBar) {
			// Action bar not ready yet, try again later
			return;
		}

		// Action items are inside .actions-container (which is inside .monaco-action-bar)
		const actionsContainer = actionBar.querySelector('.actions-container') as HTMLElement;
		if (!actionsContainer) {
			// Actions container not ready yet, try again later
			return;
		}

		const visibleCompositeIds = this.getPaneCompositeIds();
		if (visibleCompositeIds.length === 0) {
			this.extensionSeparator.style.display = 'none';
			// Remove from DOM if hidden
			if (this.extensionSeparator.parentNode) {
				this.extensionSeparator.parentNode.removeChild(this.extensionSeparator);
			}
			return;
		}

		// Find the first extension item (one with extensionId)
		let firstExtensionIndex = -1;
		for (let i = 0; i < visibleCompositeIds.length; i++) {
			const compositeId = visibleCompositeIds[i];
			const viewContainer = this._viewDescriptorServiceForSeparator.getViewContainerById(compositeId);
			if (viewContainer?.extensionId) {
				firstExtensionIndex = i;
				break;
			}
		}

		// If no extension items or all items are extensions, hide separator
		if (firstExtensionIndex === -1 || firstExtensionIndex === 0) {
			this.extensionSeparator.style.display = 'none';
			this.extensionSeparator.style.visibility = 'hidden';
			// Keep in DOM but hidden (don't remove, just hide)
			return;
		}

		// Show separator and position it before the first extension item
		this.extensionSeparator.style.display = 'block';
		this.extensionSeparator.style.visibility = 'visible';
		this.extensionSeparator.style.opacity = '1';

		// Remove separator from current location if it exists and is in wrong parent
		if (this.extensionSeparator.parentNode && this.extensionSeparator.parentNode !== actionsContainer) {
			this.extensionSeparator.parentNode.removeChild(this.extensionSeparator);
		}

		// Find all action items (they are direct children of actionsContainer, excluding the separator itself)
		const actionItems = Array.from(actionsContainer.children).filter(child => {
			return child.classList.contains('action-item') && child !== this.extensionSeparator;
		}) as HTMLElement[];

		// Ensure we have action items
		if (actionItems.length === 0) {
			// Action items not ready yet, try again later
			return;
		}

		// Find the target item by matching action items to composite IDs
		// Action items should be in the same order as visibleCompositeIds
		// We need to find the action item that corresponds to the first extension composite
		let targetItem: HTMLElement | null = null;

		// Iterate through action items and match them to composite IDs
		// Find the first action item that corresponds to an extension composite
		for (let i = 0; i < Math.min(actionItems.length, visibleCompositeIds.length); i++) {
			const compositeId = visibleCompositeIds[i];
			const viewContainer = this._viewDescriptorServiceForSeparator.getViewContainerById(compositeId);

			// Check if this composite is an extension (has extensionId)
			if (viewContainer?.extensionId) {
				// This is the first extension - the separator should go before this action item
				targetItem = actionItems[i];
				break;
			}
		}

		// Fallback: if we couldn't find by matching, use index-based approach
		if (!targetItem && firstExtensionIndex < actionItems.length) {
			targetItem = actionItems[firstExtensionIndex];
		}

		if (!targetItem) {
			// Couldn't find target item, might be a timing issue - try again later
			setTimeout(() => this.updateExtensionSeparator(), 100);
			return;
		}

		// Only insert if separator is not already in the correct position
		const currentParent = this.extensionSeparator.parentNode;
		const currentNextSibling = this.extensionSeparator.nextSibling;

		// Check if separator is already in the correct position
		const isInCorrectPosition = currentParent === actionsContainer && currentNextSibling === targetItem;

		if (!isInCorrectPosition) {
			// Temporarily disconnect observer to avoid infinite loop
			if (this.separatorObserver) {
				this.separatorObserver.disconnect();
			}

			// Ensure separator is removed from old location if it exists
			if (currentParent) {
				currentParent.removeChild(this.extensionSeparator);
			}

			// Insert before target item in the actions container
			// This will place the separator BEFORE the first extension item
			try {
				actionsContainer.insertBefore(this.extensionSeparator, targetItem);
			} catch (e) {
				// If insertion fails, try again later
				setTimeout(() => this.updateExtensionSeparator(), 100);
				return;
			}

			// Reconnect observer to watch the actions container
			if (actionsContainer) {
				this.separatorObserver = new MutationObserver(() => {
					this.updateExtensionSeparator();
				});
				this.separatorObserver.observe(actionsContainer, {
					childList: true,
					subtree: false
				});
			}
		}
	}
	// VYBE-PATCH-END: activity-bar-separator

}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.default',
			title: {
				...localize2('positionActivityBarDefault', 'Move Activity Bar to Side'),
				mnemonicTitle: localize({ key: 'miDefaultActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Default"),
			},
			shortTitle: localize('default', "Default"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 1
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.DEFAULT);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.top',
			title: {
				...localize2('positionActivityBarTop', 'Move Activity Bar to Top'),
				mnemonicTitle: localize({ key: 'miTopActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Top"),
			},
			shortTitle: localize('top', "Top"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 2
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.TOP);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.bottom',
			title: {
				...localize2('positionActivityBarBottom', 'Move Activity Bar to Bottom'),
				mnemonicTitle: localize({ key: 'miBottomActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Bottom"),
			},
			shortTitle: localize('bottom', "Bottom"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 3
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.BOTTOM);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.hide',
			title: {
				...localize2('hideActivityBar', 'Hide Activity Bar'),
				mnemonicTitle: localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Hidden"),
			},
			shortTitle: localize('hide', "Hidden"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 4
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.HIDDEN);
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	group: '3_workbench_layout_move',
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.ViewContainerTitleContext, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	when: ContextKeyExpr.or(
		ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.Sidebar)),
		ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))
	),
	group: '3_workbench_layout_move',
	order: 1
});

registerAction2(class extends SwitchCompositeViewAction {
	constructor() {
		super({
			id: 'workbench.action.previousSideBarView',
			title: localize2('previousSideBarView', 'Previous Primary Side Bar View'),
			category: Categories.View,
			f1: true
		}, ViewContainerLocation.Sidebar, -1);
	}
});

registerAction2(class extends SwitchCompositeViewAction {
	constructor() {
		super({
			id: 'workbench.action.nextSideBarView',
			title: localize2('nextSideBarView', 'Next Primary Side Bar View'),
			category: Categories.View,
			f1: true
		}, ViewContainerLocation.Sidebar, 1);
	}
});

registerAction2(
	class FocusActivityBarAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.focusActivityBar',
				title: localize2('focusActivityBar', 'Focus Activity Bar'),
				category: Categories.View,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.focusPart(Parts.ACTIVITYBAR_PART);
		}
	});

registerThemingParticipant((theme, collector) => {

	const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
	if (activityBarActiveBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
	}

	const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
	if (activityBarActiveFocusBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
	}

	const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
	if (activityBarActiveBackgroundColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label::before{
				padding: 6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover .action-label::before {
				outline: 1px solid ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label::before {
				outline: 1px dashed ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator::before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});
