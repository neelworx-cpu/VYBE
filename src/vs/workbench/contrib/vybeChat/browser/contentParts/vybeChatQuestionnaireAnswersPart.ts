/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VybeChatContentPart, IVybeChatQuestionnaireAnswersContent } from './vybeChatContentPart.js';
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;

/**
 * Renders questionnaire answers in AI responses.
 * Shows question-answer pairs after user answers questionnaire questions.
 */
export class VybeChatQuestionnaireAnswersPart extends VybeChatContentPart {
	private answers: Array<{ questionId: string; questionText: string; answerText: string }>;
	private toolCallId: string | undefined;
	private toolStatus: 'loading' | 'completed' | 'error';

	constructor(content: IVybeChatQuestionnaireAnswersContent) {
		super('questionnaireAnswers');
		this.answers = content.answers || [];
		this.toolCallId = content.toolCallId;
		this.toolStatus = content.toolStatus || 'completed';
	}

	protected createDomNode(): HTMLElement {
		// Message container with data attributes (matches structure from analysis)
		const messageContainer = $('div', {
			'data-tool-call-id': this.toolCallId || '',
			'data-tool-status': this.toolStatus,
			'data-message-role': 'ai',
			'data-message-kind': 'tool',
			class: 'relative composer-rendered-message hide-if-empty composer-message-blur',
			style: `
				display: block;
				outline: none;
				padding: 0px 18px;
				background-color: var(--composer-pane-background);
				opacity: 1;
				z-index: 99;
			`
		});

		// Inner wrapper (transparent background)
		const innerWrapper = $('div', {
			style: 'background-color: transparent;'
		});

		// Tool former message container
		const toolFormerMessage = $('.composer-tool-former-message', {
			style: 'padding: 0px;'
		});

		// Ask question tool call block
		const askQuestionBlock = $('.composer-ask-question-tool-call-block');

		// Tool call simple layout (main container)
		const simpleLayout = $('.composer-tool-call-simple-layout', {
			style: `
				background: var(--vscode-editor-background);
				border-radius: 8px;
				border: 1px solid var(--vscode-commandCenter-inactiveBorder);
				contain: paint;
				padding: 6px 8px;
				width: 100%;
				box-sizing: border-box;
				font-size: 12px;
				margin: 6px 0px;
				display: flex;
				flex-direction: column;
				gap: 4px;
			`
		});

		// Header
		const header = $('.composer-tool-call-simple-layout-header', {
			style: `
				display: flex;
				align-items: center;
				border-bottom: 1px solid rgba(228, 228, 228, 0.11);
				padding: 0px 6px 0px 6px;
				flex-shrink: 0;
			`
		});

		// Header content
		const headerContent = $('.composer-tool-call-simple-layout-header-content', {
			style: `
				display: flex;
				align-items: center;
				column-gap: 6px;
				flex: 1 1 0%;
				min-width: 0px;
			`
		});

		// Question icon
		const questionIcon = $('span.codicon.codicon-chat-question.composer-tool-call-simple-layout-header-icon', {
			style: `
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 13px;
				width: 16px;
				height: 16px;
				padding-top: 2px;
				color: rgba(228, 228, 228, 0.55);
			`
		});

		// Answers text
		const answersText = $('span', {
			style: `
				display: block;
				font-size: 12px;
				line-height: 18.2px;
				color: rgba(228, 228, 228, 0.55);
			`
		});
		answersText.textContent = 'Answers';

		// Assemble header
		headerContent.appendChild(questionIcon);
		headerContent.appendChild(answersText);
		header.appendChild(headerContent);

		// Body
		const body = $('.composer-tool-call-simple-layout-body', {
			style: `
				display: block;
				padding: 4px 8px 4px 6px;
				font-size: 12px;
			`
		});

		// User questionnaire answers body
		const answersBody = $('.user-questionnaire-answers-body', {
			style: `
				display: flex;
				flex-direction: column;
				gap: 8px;
				margin-top: 2px;
			`
		});

		// Create answer items
		this.answers.forEach((answer) => {
			const answerItem = $('.user-questionnaire-answer-item', {
				style: `
					display: flex;
					flex-direction: column;
				`
			});

			// Question text
			const questionText = $('.user-questionnaire-question-text', {
				style: `
					display: block;
					font-size: 12px;
					line-height: 18px;
					color: rgba(228, 228, 228, 0.92);
					margin-bottom: 0px;
				`
			});
			questionText.textContent = answer.questionText;

			// Answer text
			const answerText = $('.user-questionnaire-answer-text', {
				style: `
					display: block;
					font-size: 12px;
					line-height: 18px;
					color: rgba(228, 228, 228, 0.55);
					margin-top: 0px;
				`
			});
			answerText.textContent = answer.answerText;

			answerItem.appendChild(questionText);
			answerItem.appendChild(answerText);
			answersBody.appendChild(answerItem);
		});

		// Assemble body
		body.appendChild(answersBody);

		// Assemble simple layout
		simpleLayout.appendChild(header);
		simpleLayout.appendChild(body);

		// Assemble ask question block
		askQuestionBlock.appendChild(simpleLayout);

		// Assemble tool former message
		toolFormerMessage.appendChild(askQuestionBlock);

		// Assemble inner wrapper
		innerWrapper.appendChild(toolFormerMessage);

		// Assemble message container
		messageContainer.appendChild(innerWrapper);

		return messageContainer;
	}

	override hasSameContent(other: VybeChatContentPart): boolean {
		if (other.kind !== 'questionnaireAnswers') {
			return false;
		}
		const otherPart = other as VybeChatQuestionnaireAnswersPart;
		if (this.answers.length !== otherPart.answers.length) {
			return false;
		}
		// Compare answers by questionId and answerText
		for (let i = 0; i < this.answers.length; i++) {
			const thisAnswer = this.answers[i];
			const otherAnswer = otherPart.answers[i];
			if (thisAnswer.questionId !== otherAnswer.questionId ||
				thisAnswer.answerText !== otherAnswer.answerText) {
				return false;
			}
		}
		return true;
	}
}
