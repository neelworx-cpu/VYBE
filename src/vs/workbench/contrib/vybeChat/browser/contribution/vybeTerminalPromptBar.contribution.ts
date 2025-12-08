/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITerminalContribution, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import type { ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { VybeTerminalPromptBarWidget } from '../components/terminalPromptBar/vybeTerminalPromptBarWidget.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { ChatMessageRole, IChatMessage } from '../../../chat/common/languageModels.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';

export class VybeTerminalPromptBarContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'vybe.terminal.promptBar';

	private _promptBarWidget: VybeTerminalPromptBarWidget | undefined;
	private _currentCancellationToken: CancellationTokenSource | null = null;

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
	) {
		super();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		if (!this._ctx.instance.domElement) {
			return;
		}

		this._promptBarWidget = this._register(new VybeTerminalPromptBarWidget(
			this._ctx.instance.domElement,
			this._ctx.instance,
			xterm
		));

		// Wire up send event handler
		this._register(this._promptBarWidget.onSend(({ message, isQuickQuestion }) => {
			this.handleSend(message, isQuickQuestion);
		}));

		// Wire up stop event handler
		this._register(this._promptBarWidget.onStop(() => {
			this.handleStop();
		}));
	}

	private async handleSend(message: string, isQuickQuestion: boolean): Promise<void> {
		if (isQuickQuestion) {
			// Quick question mode: send to AI and stream response
			await this.handleQuickQuestion(message);
		} else {
			// Command generation mode: execute command in terminal
			await this.executeCommand(message);
		}
	}

	private async handleQuickQuestion(message: string): Promise<void> {
		if (!this._promptBarWidget) {
			return;
		}

		// Cancel any existing request
		if (this._currentCancellationToken) {
			this._currentCancellationToken.cancel();
			this._currentCancellationToken.dispose();
		}

		// Create new cancellation token
		this._currentCancellationToken = new CancellationTokenSource();
		const token = this._currentCancellationToken.token;

		// Show quick answer row and clear previous content
		this._promptBarWidget.showQuickAnswer();

		// Set streaming state
		this._promptBarWidget.setStreaming(true);

		try {
			// Get available models - use first available model or a default
			const models = this._languageModelsService.getLanguageModelIds();
			if (models.length === 0) {
				this._promptBarWidget.appendQuickAnswerText('No language models available.');
				return;
			}

			const modelId = models[0]; // Use first available model

			// Prepare messages for chat request
			const messages: IChatMessage[] = [
				{
					role: ChatMessageRole.User,
					content: [{ type: 'text', value: message }]
				}
			];

			// Send chat request (parameter order: modelId, from, messages, options, token)
			const response = await this._languageModelsService.sendChatRequest(
				modelId,
				new ExtensionIdentifier('core'),
				messages,
				{},
				token
			);

			// Stream the response
			const streaming = (async () => {
				try {
					for await (const part of response.stream) {
						if (token.isCancellationRequested) {
							break;
						}

						// Handle different part types
						if (Array.isArray(part)) {
							for (const p of part) {
								if (p.type === 'text' && this._promptBarWidget) {
									this._promptBarWidget.appendQuickAnswerText(p.value);
								}
							}
						} else if (part.type === 'text' && this._promptBarWidget) {
							this._promptBarWidget.appendQuickAnswerText(part.value);
						}
					}
				} catch (err) {
					if (!token.isCancellationRequested && this._promptBarWidget) {
						this._promptBarWidget.appendQuickAnswerText(`\n\nError: ${err instanceof Error ? err.message : String(err)}`);
					}
				}
			})();

			// Wait for both the result and streaming to complete
			await Promise.allSettled([response.result, streaming]);
		} catch (err) {
			if (!token.isCancellationRequested && this._promptBarWidget) {
				this._promptBarWidget.appendQuickAnswerText(`\n\nError: ${err instanceof Error ? err.message : String(err)}`);
			}
		} finally {
			// Reset streaming state
			if (this._promptBarWidget) {
				this._promptBarWidget.setStreaming(false);
			}

			// Clean up cancellation token
			if (this._currentCancellationToken) {
				this._currentCancellationToken.dispose();
				this._currentCancellationToken = null;
			}
		}
	}

	private async executeCommand(command: string): Promise<void> {
		const instance = this._ctx.instance;
		if (!instance) {
			return;
		}

		try {
			// Wait for terminal to be ready
			await instance.xtermReadyPromise;

			// Send command to terminal
			await instance.sendText(command, true);
		} catch (error) {
			console.error('[VYBE Terminal] Failed to execute command:', error);
		}
	}

	private handleStop(): void {
		// Cancel current request if streaming
		if (this._currentCancellationToken) {
			this._currentCancellationToken.cancel();
			this._currentCancellationToken.dispose();
			this._currentCancellationToken = null;
		}

		// Reset streaming state
		if (this._promptBarWidget) {
			this._promptBarWidget.setStreaming(false);
		}
	}

	override dispose(): void {
		// Cancel any pending requests
		if (this._currentCancellationToken) {
			this._currentCancellationToken.cancel();
			this._currentCancellationToken.dispose();
			this._currentCancellationToken = null;
		}
		super.dispose();
	}

	reveal(): void {
		this._promptBarWidget?.reveal();
	}

	hide(): void {
		this._promptBarWidget?.hide();
	}

	focus(): void {
		this._promptBarWidget?.focus();
	}

	hasFocus(): boolean {
		return this._promptBarWidget?.hasFocus() ?? false;
	}
}

registerTerminalContribution(VybeTerminalPromptBarContribution.ID, VybeTerminalPromptBarContribution, false);

