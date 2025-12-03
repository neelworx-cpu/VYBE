/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { getWindow } from '../../../../../base/browser/dom.js';

export interface ThemeColors {
	isDark: boolean;
	toolbarBackground: string;
	toolbarBorder: string;
	separatorColor: string;
	composerBackground: string;
	scrollbarSlider: string;
}

/**
 * Check if the current theme is dark
 */
export function isDarkTheme(themeService?: IThemeService, element?: HTMLElement): boolean {
	if (themeService) {
		const theme = themeService.getColorTheme();
		return theme.type === ColorScheme.DARK || theme.type === ColorScheme.HIGH_CONTRAST_DARK;
	}

	// Fallback: check DOM
	const window = element ? getWindow(element) : getWindow(document.body);
	const workbench = window.document.querySelector('.monaco-workbench');
	return workbench
		? workbench.classList.contains('vs-dark') || workbench.classList.contains('hc-black')
		: true;
}

/**
 * Get theme-aware colors for UI components
 */
export function getThemeColors(themeService?: IThemeService, element?: HTMLElement): ThemeColors {
	const isDark = isDarkTheme(themeService, element);

	return {
		isDark,
		toolbarBackground: isDark ? '#1e1f21' : '#f8f8f9',
		toolbarBorder: isDark
			? '0.5px solid rgba(128, 128, 128, 0.2)'
			: '0.5px solid rgba(0, 0, 0, 0.1)',
		separatorColor: isDark ? 'rgba(128, 128, 128, 0.2)' : 'rgba(0, 0, 0, 0.1)',
		composerBackground: isDark ? '#1e1f21' : '#f8f8f9',
		scrollbarSlider: isDark ? 'rgba(228, 228, 228, 0.4)' : 'rgba(51, 51, 51, 0.4)',
	};
}

/**
 * Get terminal syntax highlighting colors based on theme
 */
export function getTerminalSyntaxColors(isDark: boolean): {
	command: string;
	flag: string;
	string: string;
	operator: string;
} {
	return isDark
		? {
				command: '#4ec9b0', // Teal for commands
				flag: '#9cdcfe', // Light blue for flags
				string: '#ce9178', // Orange for strings/paths
				operator: '#d4d4d4', // Light gray for operators
			}
		: {
				command: '#008080', // Teal for commands
				flag: '#0070c1', // Blue for flags
				string: '#a31515', // Red for strings/paths
				operator: '#000000', // Black for operators
			};
}


