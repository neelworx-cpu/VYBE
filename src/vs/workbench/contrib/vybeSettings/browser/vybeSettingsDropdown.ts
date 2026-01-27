/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, getWindow } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { isDarkTheme } from '../../vybeChat/browser/utils/themeUtils.js';

type ToggleState = 'on' | 'off';

interface ToggleRowConfig {
	label: string;
	keybinding?: string;
	icon: string;
	iconOverlay?: string;
	state: ToggleState;
	onToggle?: () => void;
}

export class VybeSettingsDropdown extends Disposable {
	private dropdownElement: HTMLElement | null = null;
	private menuContainer: HTMLElement | null = null;
	private backdrop: HTMLElement | null = null;
	private agentSidebarSubmenu: HTMLElement | null = null;
	private agentSidebarSubmenuVisible: boolean = false;
	private agentSidebarCurrentValue: string = 'Left';
	private agentSidebarChevron: HTMLElement | null = null;
	private agentSidebarCurrentValueSpan: HTMLElement | null = null;
	private toggleStates: Map<string, boolean> = new Map();

	constructor(
		private anchorElement: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
	}

	public show(): void {
		// Remove existing dropdown if any (toggle behavior)
		if (this.dropdownElement) {
			this.hide();
			return;
		}

		this.createDropdown();
	}

	private createDropdown(): void {
		// Detect theme
		const isDark = isDarkTheme(this.themeService, this.anchorElement);

		// Theme colors - use same colors as model dropdown and agent dropdown
		const bgColor = isDark ? '#212427' : '#eceff2';
		const borderColor = isDark ? '#383838' : '#d9d9d9';
		const textColor = isDark ? 'rgba(228, 228, 228, 0.92)' : 'rgba(51, 51, 51, 0.9)';
		const dividerColor = isDark ? '#383838' : '#d9d9d9';

		// Create backdrop
		const window = getWindow(this.anchorElement);
		const body = window.document.body;
		if (!body) {
			return;
		}
		this.backdrop = append(body, $('div'));
		this.backdrop.className = 'agent-layout-quick-menu__backdrop';
		this.backdrop.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: rgba(0, 0, 0, 0);
			z-index: 2550;
			pointer-events: all;
		`;

		// Outer container - context-view wrapper
		this.dropdownElement = append(body, $('div'));
		this.dropdownElement.className = 'context-view monaco-component bottom right';
		this.dropdownElement.style.cssText = `
			position: absolute;
			z-index: 2551;
			width: initial;
		`;

		// Position dropdown - right edge aligned with button
		const rect = this.anchorElement.getBoundingClientRect();
		const dropdownWidth = 244;
		this.dropdownElement.style.top = `${rect.bottom + 3}px`;
		this.dropdownElement.style.left = `${rect.right - dropdownWidth}px`;

		// Main menu container
		this.menuContainer = append(this.dropdownElement, $('div'));
		this.menuContainer.className = 'agent-layout-quick-menu';
		this.menuContainer.style.cssText = `
			box-sizing: border-box;
			display: flex;
			flex-direction: column;
			width: 244px;
			background-color: ${bgColor};
			border: 1px solid ${borderColor};
			border-radius: 6px;
			padding: 2px;
			box-shadow: rgba(255, 255, 255, 0.05) 0px 0px 4px 0px inset, color(srgb 0 0 0 / 0.24) 0px 0px 3px 0px, color(srgb 0 0 0 / 0.12) 0px 16px 24px 0px;
			color: ${textColor};
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 13px;
			line-height: 18.2px;
			user-select: none;
			z-index: 10001;
			position: relative;
		`;

		// Section 1: Toggle Options
		const section1 = append(this.menuContainer, $('div'));
		section1.className = 'agent-layout-quick-menu__section';
		section1.style.cssText = `
			display: flex;
			flex-direction: column;
			width: 238px;
		`;

		// Toggle rows
		const toggleRows: ToggleRowConfig[] = [
			{
				label: 'Sidebar',
				keybinding: '⌘B',
				icon: 'codicon-layout-activitybar-left',
				state: 'off',
			},
			{
				label: 'Panel',
				keybinding: '⌘J',
				icon: 'codicon-layout-statusbar',
				state: 'on',
			},
			{
				label: 'Agent',
				keybinding: '⌥⌘B',
				icon: 'codicon-layout-activitybar-right',
				state: 'off',
			},
		];

		toggleRows.forEach((row) => {
			// Initialize state if not set
			if (!this.toggleStates.has(row.label)) {
				this.toggleStates.set(row.label, row.state === 'on');
			}
			const rowElement = this.createToggleRow(row, isDark, textColor);
			section1.appendChild(rowElement);
		});

		// Divider
		const divider1 = this.createDivider(dividerColor);
		if (this.menuContainer) {
			this.menuContainer.appendChild(divider1);
		}

		// Section 2: Submenu and Additional Options
		if (!this.menuContainer) {
			return;
		}
		const section2 = append(this.menuContainer, $('div'));
		section2.className = 'agent-layout-quick-menu__section';
		section2.style.cssText = `
			display: flex;
			flex-direction: column;
			width: 238px;
		`;

		// Agent Sidebar submenu row
		const agentSidebarRow = this.createSubmenuRow('Agent Sidebar', this.agentSidebarCurrentValue, isDark, textColor);
		section2.appendChild(agentSidebarRow);

		// Divider
		const divider2 = this.createDivider(dividerColor);
		this.menuContainer.appendChild(divider2);

		// Footer Link: VYBE Settings
		const footerLink = this.createFooterLink('VYBE Settings', isDark, textColor);
		this.menuContainer.appendChild(footerLink);

		// Close dropdown when clicking outside
		const closeHandler = (e: MouseEvent) => {
			if (
				!this.dropdownElement?.contains(e.target as Node) &&
				!this.anchorElement.contains(e.target as Node)
			) {
				this.hide();
				getWindow(this.anchorElement).document.removeEventListener('click', closeHandler);
			}
		};

		setTimeout(() => {
			getWindow(this.anchorElement).document.addEventListener('click', closeHandler);
		}, 0);
	}

	private createToggleRow(config: ToggleRowConfig, isDark: boolean, textColor: string): HTMLElement {
		const row = $('div');
		row.className = 'agent-layout-quick-menu__row agent-layout-quick-menu__row--toggle';
		row.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 24px;
			padding: 3px 8px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			width: 238px;
			font-size: 12px;
			line-height: 18px;
		`;

		// Left container
		const leftContainer = append(row, $('div'));
		leftContainer.className = 'agent-layout-quick-menu__row-left';
		leftContainer.style.cssText = `
			display: flex;
			align-items: center;
			height: 18px;
		`;

		// Icon container
		if (config.iconOverlay) {
			const iconContainer = append(leftContainer, $('span'));
			iconContainer.className = 'agent-layout-quick-menu__icon agent-layout-quick-menu__icon--panel';
			const iconColor = isDark ? 'rgba(228, 228, 228, 0.52)' : 'rgba(51, 51, 51, 0.52)';
			iconContainer.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: center;
				width: 16px;
				height: 16px;
				margin-right: 8px;
				position: relative;
				color: ${iconColor};
			`;

			// Icon layer 1
			const iconLayer1 = append(iconContainer, $('span'));
			iconLayer1.className = `codicon ${config.icon} agent-layout-quick-menu__icon-layer`;
			iconLayer1.setAttribute('aria-hidden', 'true');
			iconLayer1.style.cssText = `
				display: block;
				width: 16px;
				height: 16px;
				line-height: 16px;
				font-size: 16px;
				text-align: center;
				pointer-events: none;
				position: relative;
			`;

			// Icon layer 2 (overlay)
			const iconLayer2 = append(iconContainer, $('span'));
			iconLayer2.className = `codicon ${config.iconOverlay} agent-layout-quick-menu__icon-layer agent-layout-quick-menu__icon-layer--overlay`;
			iconLayer2.setAttribute('aria-hidden', 'true');
			iconLayer2.style.cssText = `
				display: block;
				width: 16px;
				height: 16px;
				line-height: 16px;
				font-size: 16px;
				text-align: center;
				pointer-events: none;
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				opacity: 0.4;
			`;
		} else {
			const icon = append(leftContainer, $('span'));
			icon.className = `codicon ${config.icon} agent-layout-quick-menu__icon`;
			const iconColor = isDark ? 'rgba(228, 228, 228, 0.52)' : 'rgba(51, 51, 51, 0.52)';
			icon.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: center;
				width: 16px;
				height: 16px;
				margin-right: 8px;
				color: ${iconColor};
				font-size: 16px;
			`;
		}

		// Label
		const label = append(leftContainer, $('span'));
		label.className = 'agent-layout-quick-menu__label';
		label.textContent = config.label;
		label.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			font-weight: 400;
			line-height: 18px;
			display: block;
			height: 18px;
			font-family: system-ui, -apple-system, "system-ui", sans-serif;
		`;

		// Right container
		const rightContainer = append(row, $('div'));
		rightContainer.className = 'agent-layout-quick-menu__row-right';
		rightContainer.style.cssText = `
			display: flex;
			align-items: center;
			height: 18px;
			column-gap: 8px;
		`;

		// Keybinding
		if (config.keybinding) {
			const keybinding = append(rightContainer, $('span'));
			keybinding.className = 'agent-layout-quick-menu__keybinding';
			keybinding.textContent = config.keybinding;
			keybinding.style.cssText = `
				color: ${textColor};
				font-size: 12px;
				font-weight: 400;
				line-height: 18px;
				opacity: 0.4;
				display: block;
				height: 18px;
			`;
		}

		// Get current state
		let currentState = this.toggleStates.get(config.label) ?? (config.state === 'on');
		
		// Create toggle switch using same implementation as model dropdown
		const { switchContainer, switchOuter, bgFill, knob } = this.createToggleSwitch(currentState);
		rightContainer.appendChild(switchContainer);

		// Hover effect
		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		this._register(addDisposableListener(row, 'mouseenter', () => {
			row.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(row, 'mouseleave', () => {
			row.style.backgroundColor = 'transparent';
		}));

		// Click handler for toggle - update state and visual
		this._register(addDisposableListener(row, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			currentState = !currentState;
			this.toggleStates.set(config.label, currentState);
			this.updateToggleSwitch(switchOuter, bgFill, knob, currentState);
			// TODO: Implement actual functionality (not activating anything for now)
		}));

		return row;
	}

	private createSubmenuRow(label: string, currentValue: string, isDark: boolean, textColor: string): HTMLElement {
		const wrapper = $('div');
		wrapper.style.cssText = `
			display: block;
			width: 238px;
		`;

		const row = append(wrapper, $('div'));
		row.className = 'agent-layout-quick-menu__row agent-layout-quick-menu__row--submenu';
		row.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 24px;
			padding: 3px 8px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			width: 238px;
			font-size: 12px;
			line-height: 18px;
		`;

		// Label
		const labelSpan = append(row, $('span'));
		labelSpan.className = 'agent-layout-quick-menu__label';
		labelSpan.textContent = label;
		labelSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			font-weight: 400;
			line-height: 18px;
			display: block;
			height: 18px;
			font-family: system-ui, -apple-system, "system-ui", sans-serif;
		`;

		// Value wrapper
		const valueWrapper = append(row, $('div'));
		valueWrapper.className = 'agent-layout-quick-menu__submenu-value-wrapper';
		valueWrapper.style.cssText = `
			display: flex;
			align-items: center;
			height: 18px;
			column-gap: 4px;
		`;

		// Current value
		const currentValueSpan = append(valueWrapper, $('span'));
		this.agentSidebarCurrentValueSpan = currentValueSpan;
		currentValueSpan.className = 'agent-layout-quick-menu__submenu-current-value';
		currentValueSpan.textContent = currentValue;
		const currentValueColor = isDark ? 'rgba(228, 228, 228, 0.66)' : 'rgba(51, 51, 51, 0.66)';
		currentValueSpan.style.cssText = `
			color: ${currentValueColor};
			font-size: 12px;
			font-weight: 400;
			line-height: 18px;
			display: block;
			height: 18px;
		`;

		// Chevron
		const chevron = append(valueWrapper, $('span'));
		this.agentSidebarChevron = chevron;
		chevron.className = 'codicon codicon-chevron-right agent-layout-quick-menu__chevron';
		chevron.style.cssText = `
			color: ${textColor};
			font-size: 13px;
			line-height: 13px;
			width: 13px;
			height: 13px;
			opacity: 0.3;
			display: block;
			text-align: center;
			font-family: codicon;
			transition: transform 0.2s ease;
			transform: rotate(0deg);
		`;

		// Submenu container (hidden initially)
		this.agentSidebarSubmenu = append(wrapper, $('div'));
		this.agentSidebarSubmenu.className = 'agent-layout-quick-menu__submenu';
		this.agentSidebarSubmenu.style.cssText = `
			display: none;
			flex-direction: column;
			width: 100%;
		`;

		// Submenu options
		const options = ['Left', 'Right'];
		options.forEach((option) => {
			const optionElement = this.createSubmenuOption(option, option === currentValue, isDark, textColor);
			this.agentSidebarSubmenu!.appendChild(optionElement);
		});

		// Hover effect
		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		this._register(addDisposableListener(row, 'mouseenter', () => {
			row.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(row, 'mouseleave', () => {
			row.style.backgroundColor = 'transparent';
		}));

		// Click handler to toggle submenu
		this._register(addDisposableListener(row, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			this.toggleAgentSidebarSubmenu();
		}));

		return wrapper;
	}

	private createSubmenuOption(label: string, isSelected: boolean, isDark: boolean, textColor: string): HTMLElement {
		const option = $('div');
		option.className = `agent-layout-quick-menu__submenu-option ${isSelected ? 'is-selected' : ''}`;
		option.style.cssText = `
			display: flex;
			align-items: center;
			height: 24px;
			padding: 3px 8px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			gap: 8px;
		`;

		// Check icon (always present, visibility controlled by CSS or opacity)
		const checkIcon = append(option, $('span'));
		checkIcon.className = 'codicon codicon-check';
		const checkIconOpacity = isSelected ? '1' : '0';
		checkIcon.style.cssText = `
			color: ${textColor};
			font-size: 16px;
			line-height: 16px;
			width: 16px;
			height: 16px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: codicon;
			opacity: ${checkIconOpacity};
		`;

		// Option text
		const text = append(option, $('span'));
		text.textContent = label;
		text.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			line-height: 18px;
			font-family: system-ui, -apple-system, "system-ui", sans-serif;
		`;

		// Hover effect
		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		this._register(addDisposableListener(option, 'mouseenter', () => {
			option.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(option, 'mouseleave', () => {
			option.style.backgroundColor = 'transparent';
		}));

		// Click handler
		this._register(addDisposableListener(option, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			// Update current value
			this.agentSidebarCurrentValue = label;
			
			// Update current value display
			if (this.agentSidebarCurrentValueSpan) {
				this.agentSidebarCurrentValueSpan.textContent = label;
			}
			
			// Update check icons - find all options and update their selected state
			if (this.agentSidebarSubmenu) {
				const allOptions = this.agentSidebarSubmenu.querySelectorAll('.agent-layout-quick-menu__submenu-option');
				allOptions.forEach((opt) => {
					const optElement = opt as HTMLElement;
					const optText = optElement.querySelector('span:last-child')?.textContent;
					const isNowSelected = optText === label;
					
					// Update class
					if (isNowSelected) {
						optElement.classList.add('is-selected');
					} else {
						optElement.classList.remove('is-selected');
					}
					
					// Update check icon opacity
					const checkIcon = optElement.querySelector('.codicon-check') as HTMLElement;
					if (checkIcon) {
						checkIcon.style.opacity = isNowSelected ? '1' : '0';
					}
				});
			}
			
			// Close submenu after selection
			this.toggleAgentSidebarSubmenu();
		}));

		return option;
	}

	private createDivider(color: string): HTMLElement {
		const divider = $('div');
		divider.className = 'agent-layout-quick-menu__divider';
		divider.style.cssText = `
			display: block;
			height: 1px;
			width: 238px;
			background-color: ${color};
			opacity: 0.8;
			margin: 2px 0;
		`;
		return divider;
	}

	private createFooterLink(label: string, isDark: boolean, textColor: string): HTMLElement {
		const footerLink = $('button') as HTMLButtonElement;
		footerLink.type = 'button';
		footerLink.className = 'agent-layout-quick-menu__footer-link';
		footerLink.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 24px;
			padding: 3px 8px;
			border-radius: 4px;
			cursor: pointer;
			box-sizing: border-box;
			width: 238px;
			background-color: transparent;
			border: none;
			outline: none;
			font-family: -apple-system, "system-ui", sans-serif;
			font-size: 12px;
			line-height: 18px;
		`;

		// Label
		const labelSpan = append(footerLink, $('span'));
		labelSpan.className = 'agent-layout-quick-menu__label';
		labelSpan.textContent = label;
		labelSpan.style.cssText = `
			color: ${textColor};
			font-size: 12px;
			font-weight: 400;
			line-height: 18px;
			display: flex;
			align-items: center;
			height: 18px;
			font-family: system-ui, -apple-system, "system-ui", sans-serif;
		`;

		// Hover effect
		const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
		this._register(addDisposableListener(footerLink, 'mouseenter', () => {
			footerLink.style.backgroundColor = hoverBg;
		}));
		this._register(addDisposableListener(footerLink, 'mouseleave', () => {
			footerLink.style.backgroundColor = 'transparent';
		}));

		// Click handler
		this._register(addDisposableListener(footerLink, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			// TODO: Implement VYBE Settings navigation
			this.hide();
		}));

		return footerLink;
	}

	private toggleAgentSidebarSubmenu(): void {
		if (!this.agentSidebarSubmenu || !this.agentSidebarChevron) {
			return;
		}

		this.agentSidebarSubmenuVisible = !this.agentSidebarSubmenuVisible;
		
		if (this.agentSidebarSubmenuVisible) {
			// Open: show submenu and add is-open class, rotate chevron 90deg clockwise
			this.agentSidebarSubmenu.style.display = 'flex';
			this.agentSidebarSubmenu.classList.add('is-open');
			this.agentSidebarChevron.classList.add('is-open');
			this.agentSidebarChevron.style.transform = 'rotate(90deg)';
		} else {
			// Close: hide submenu and remove is-open class, rotate chevron back to 0deg
			this.agentSidebarSubmenu.style.display = 'none';
			this.agentSidebarSubmenu.classList.remove('is-open');
			this.agentSidebarChevron.classList.remove('is-open');
			this.agentSidebarChevron.style.transform = 'rotate(0deg)';
		}
	}

	public hide(): void {
		if (this.backdrop) {
			this.backdrop.remove();
			this.backdrop = null;
		}

		if (this.dropdownElement) {
			this.dropdownElement.remove();
			this.dropdownElement = null;
			this.menuContainer = null;
			this.agentSidebarSubmenu = null;
			this.agentSidebarChevron = null;
			this.agentSidebarCurrentValueSpan = null;
			this.agentSidebarSubmenuVisible = false;
		}
	}

	public isVisible(): boolean {
		return this.dropdownElement !== null;
	}

	private createToggleSwitch(isOn: boolean): { switchContainer: HTMLElement; switchOuter: HTMLElement; bgFill: HTMLElement; knob: HTMLElement } {
		const switchContainer = $('span');
		switchContainer.style.cssText = `
			flex-shrink: 0;
			margin-left: 4px;
			cursor: pointer;
		`;

		const switchOuter = append(switchContainer, $('div'));
		switchOuter.style.cssText = `
			width: 24px;
			height: 14px;
			border-radius: 14px;
			position: relative;
			display: flex;
			align-items: center;
			cursor: pointer;
			transition: all 300ms;
			overflow: hidden;
			background: ${isOn ? '#3ecf8e' : 'rgba(128, 128, 128, 0.3)'};
			opacity: 1;
		`;

		// Background fill (animated)
		const bgFill = append(switchOuter, $('div'));
		bgFill.style.cssText = `
			border-radius: 14px;
			position: absolute;
			top: 0;
			bottom: 0;
			height: 100%;
			left: 0;
			background: #3ecf8e;
			opacity: ${isOn ? '1' : '0'};
			width: ${isOn ? '100%' : '0%'};
			transition: ${isOn ? '300ms' : '150ms'} cubic-bezier(0.4, 0, 0.2, 1);
		`;

		// Knob
		const knob = append(switchOuter, $('div'));
		knob.style.cssText = `
			width: 10px;
			height: 10px;
			border-radius: 50%;
			position: absolute;
			background: white;
			transition: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
			left: ${isOn ? 'calc(100% - 12px)' : '2px'};
		`;

		return { switchContainer, switchOuter, bgFill, knob };
	}

	private updateToggleSwitch(switchOuter: HTMLElement, bgFill: HTMLElement, knob: HTMLElement, isOn: boolean): void {
		// Update outer background
		switchOuter.style.background = isOn ? '#3ecf8e' : 'rgba(128, 128, 128, 0.3)';

		// Update fill
		bgFill.style.opacity = isOn ? '1' : '0';
		bgFill.style.width = isOn ? '100%' : '0%';
		bgFill.style.transition = isOn ? '300ms cubic-bezier(0.4, 0, 0.2, 1)' : '150ms cubic-bezier(0.4, 0, 0.2, 1)';

		// Update knob position
		knob.style.left = isOn ? 'calc(100% - 12px)' : '2px';
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
