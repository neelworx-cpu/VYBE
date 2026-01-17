/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { $, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

export interface TerminalPermissionResult {
	allowed: boolean;
	dontAskAgain: boolean;
}

export interface TerminalPermissionOptions {
	command: string;
	onResult: (result: TerminalPermissionResult) => void;
}

const STORAGE_KEY_TERMINAL_DONT_ASK = 'vybe.terminal.dontAskAgain';

/**
 * Terminal Permission Dialog
 *
 * Shows a dialog asking for permission to execute a terminal command.
 * Includes a "Don't ask again" checkbox that links to VYBE settings.
 */
export class TerminalPermissionDialog extends Disposable {
	private dialogElement: HTMLElement | null = null;
	private overlayElement: HTMLElement | null = null;
	private storageService: IStorageService;
	private options: TerminalPermissionOptions | null = null;

	constructor(
		_parentElement: HTMLElement,
		storageService: IStorageService
	) {
		super();
		this.storageService = storageService;
	}

	/**
	 * Check if "don't ask again" is enabled
	 */
	public shouldSkipDialog(): boolean {
		return this.storageService.getBoolean(STORAGE_KEY_TERMINAL_DONT_ASK, StorageScope.PROFILE, false);
	}

	/**
	 * Clear "don't ask again" preference (for settings reset)
	 */
	public clearDontAskAgain(): void {
		this.storageService.remove(STORAGE_KEY_TERMINAL_DONT_ASK, StorageScope.PROFILE);
	}

	/**
	 * Show the terminal permission dialog
	 */
	public show(options: TerminalPermissionOptions): void {
		// Check if we should skip the dialog
		if (this.shouldSkipDialog()) {
			options.onResult({ allowed: true, dontAskAgain: true });
			return;
		}

		this.options = options;
		this.hide(); // Remove any existing dialog

		// Create overlay
		this.overlayElement = $('div');
		this.overlayElement.className = 'vybe-terminal-permission-overlay';
		this.overlayElement.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: rgba(0, 0, 0, 0.4);
			z-index: 10000;
			display: flex;
			align-items: center;
			justify-content: center;
		`;

		// Create dialog
		this.dialogElement = $('div');
		this.dialogElement.className = 'vybe-terminal-permission-dialog';
		this.dialogElement.style.cssText = `
			background-color: var(--vscode-dialog-background);
			border: 1px solid var(--vscode-dialog-border);
			border-radius: 8px;
			padding: 24px;
			min-width: 400px;
			max-width: 500px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
			z-index: 10001;
		`;

		// Title
		const title = $('div');
		title.style.cssText = `
			font-size: 18px;
			font-weight: 600;
			color: var(--vscode-foreground);
			margin-bottom: 16px;
		`;
		title.textContent = 'Terminal Command Permission';

		// Message
		const message = $('div');
		message.style.cssText = `
			font-size: 13px;
			color: var(--vscode-foreground);
			margin-bottom: 20px;
			line-height: 1.5;
		`;
		message.textContent = `The AI wants to execute the following command in your terminal:`;

		// Command preview
		const commandPreview = $('div');
		commandPreview.style.cssText = `
			background-color: var(--vscode-textBlockQuote-background);
			border-left: 3px solid var(--vscode-textBlockQuote-border);
			padding: 12px;
			margin-bottom: 20px;
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
			color: var(--vscode-foreground);
			word-break: break-all;
			border-radius: 4px;
		`;
		commandPreview.textContent = options.command;

		// Warning
		const warning = $('div');
		warning.style.cssText = `
			font-size: 12px;
			color: var(--vscode-editorWarning-foreground);
			margin-bottom: 20px;
			display: flex;
			align-items: flex-start;
			gap: 8px;
		`;
		const warningIcon = $('span');
		warningIcon.className = 'codicon codicon-warning';
		warningIcon.style.cssText = 'flex-shrink: 0; margin-top: 2px;';
		const warningText = $('span');
		warningText.textContent = 'Executing commands can modify your files and system. Only allow commands you trust.';
		warning.appendChild(warningIcon);
		warning.appendChild(warningText);

		// Don't ask again checkbox
		const checkboxContainer = $('div');
		checkboxContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 24px;
			cursor: pointer;
		`;
		const checkbox = document.createElement('input') as HTMLInputElement;
		checkbox.type = 'checkbox';
		checkbox.id = 'vybe-terminal-dont-ask';
		checkbox.style.cssText = 'cursor: pointer;';
		const checkboxLabel = document.createElement('label') as HTMLLabelElement;
		checkboxLabel.htmlFor = 'vybe-terminal-dont-ask';
		checkboxLabel.style.cssText = `
			font-size: 12px;
			color: var(--vscode-foreground);
			cursor: pointer;
			user-select: none;
		`;
		checkboxLabel.textContent = "Don't ask again (can be reset in VYBE Settings)";
		checkboxContainer.appendChild(checkbox);
		checkboxContainer.appendChild(checkboxLabel);

		// Buttons container
		const buttonsContainer = $('div');
		buttonsContainer.style.cssText = `
			display: flex;
			gap: 8px;
			justify-content: flex-end;
		`;

		// Cancel button
		const cancelButton = $('button');
		cancelButton.className = 'vybe-button-secondary';
		cancelButton.style.cssText = `
			padding: 8px 16px;
			border: 1px solid var(--vscode-button-border);
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
		`;
		cancelButton.textContent = 'Cancel';

		// Allow button
		const allowButton = $('button');
		allowButton.className = 'vybe-button-primary';
		allowButton.style.cssText = `
			padding: 8px 16px;
			border: none;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
		`;
		allowButton.textContent = 'Allow';

		// Event handlers
		const handleResult = (allowed: boolean) => {
			const dontAskAgain = (checkbox as HTMLInputElement).checked;
			if (dontAskAgain) {
				this.storageService.store(STORAGE_KEY_TERMINAL_DONT_ASK, true, StorageScope.PROFILE, StorageTarget.USER);
			}
			this.hide();
			if (this.options) {
				this.options.onResult({ allowed, dontAskAgain });
			}
		};

		addDisposableListener(cancelButton, 'click', () => handleResult(false));
		addDisposableListener(allowButton, 'click', () => handleResult(true));
		addDisposableListener(this.overlayElement, 'click', (e) => {
			if (e.target === this.overlayElement) {
				handleResult(false);
			}
		});

		// Keyboard handler
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				handleResult(false);
			} else if (e.key === 'Enter' && e.target === allowButton) {
				handleResult(true);
			}
		};
		addDisposableListener(document, 'keydown', handleKeyDown);

		// Build structure
		buttonsContainer.appendChild(cancelButton);
		buttonsContainer.appendChild(allowButton);

		this.dialogElement.appendChild(title);
		this.dialogElement.appendChild(message);
		this.dialogElement.appendChild(commandPreview);
		this.dialogElement.appendChild(warning);
		this.dialogElement.appendChild(checkboxContainer);
		this.dialogElement.appendChild(buttonsContainer);

		this.overlayElement.appendChild(this.dialogElement);
		document.body.appendChild(this.overlayElement);

		// Focus the allow button
		setTimeout(() => allowButton.focus(), 0);
	}

	/**
	 * Hide the dialog
	 */
	public hide(): void {
		if (this.overlayElement) {
			this.overlayElement.remove();
			this.overlayElement = null;
		}
		this.dialogElement = null;
		this.options = null;
	}
}

