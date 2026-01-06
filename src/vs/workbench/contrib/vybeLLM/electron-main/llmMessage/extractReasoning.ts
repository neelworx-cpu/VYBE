/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extract reasoning/thinking from Ollama models that use tag-based reasoning.
 * Ollama thinking models output reasoning between <think> and </think> tags.
 *
 * Based on Void's extractReasoningWrapper implementation.
 */

import { OnText, OnFinalMessage } from '../../common/vybeLLMMessageTypes.js';

/**
 * Helper to check if a string ends with any prefix of a given tag.
 * Used to handle cases where the tag is split across chunks.
 */
function endsWithAnyPrefixOf(text: string, tag: string): string | false {
	for (let i = tag.length; i > 0; i--) {
		const prefix = tag.substring(0, i);
		if (text.endsWith(prefix)) {
			return prefix;
		}
	}
	return false;
}

/**
 * Wraps onText and onFinalMessage callbacks to extract reasoning from tag-based output.
 * For Ollama models that use <think>...</think> tags.
 *
 * @param onText - Original onText callback
 * @param onFinalMessage - Original onFinalMessage callback
 * @param thinkTags - Tuple of [openingTag, closingTag], e.g. ['<think>', '</think>']
 * @returns Wrapped callbacks that separate reasoning from content
 */
export function extractReasoningWrapper(
	onText: OnText,
	onFinalMessage: OnFinalMessage,
	thinkTags: [string, string]
): { newOnText: OnText; newOnFinalMessage: OnFinalMessage } {
	let latestAddIdx = 0; // Exclusive index in fullText_
	let foundTag1 = false;
	let foundTag2 = false;

	let fullTextSoFar = '';
	let fullReasoningSoFar = '';

	if (!thinkTags[0] || !thinkTags[1]) {
		throw new Error(`thinkTags must not be empty if provided. Got ${JSON.stringify(thinkTags)}.`);
	}

	const newOnText: OnText = ({ fullText: fullText_, ...p }) => {
		// Until found the first think tag, keep adding to fullText
		if (!foundTag1) {
			const endsWithTag1 = endsWithAnyPrefixOf(fullText_, thinkTags[0]);
			if (endsWithTag1) {
				// Wait until we get the full tag or know more
				return;
			}
			// If found the first tag
			const tag1Index = fullText_.indexOf(thinkTags[0]);
			if (tag1Index !== -1) {
				foundTag1 = true;
				// Add text before the tag to fullTextSoFar
				fullTextSoFar += fullText_.substring(0, tag1Index);
				// Update latestAddIdx to after the first tag
				latestAddIdx = tag1Index + thinkTags[0].length;
				onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
				return;
			}

			// Add the text to fullText
			fullTextSoFar = fullText_;
			latestAddIdx = fullText_.length;
			onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
			return;
		}

		// At this point, we found <tag1>

		// Until found the second think tag, keep adding to fullReasoning
		if (!foundTag2) {
			const endsWithTag2 = endsWithAnyPrefixOf(fullText_, thinkTags[1]);
			if (endsWithTag2 && endsWithTag2 !== thinkTags[1]) {
				// Wait until we get the full tag or know more
				return;
			}

			// If found the second tag
			const tag2Index = fullText_.indexOf(thinkTags[1], latestAddIdx);
			if (tag2Index !== -1) {
				foundTag2 = true;
				// Add everything between first and second tag to reasoning
				fullReasoningSoFar += fullText_.substring(latestAddIdx, tag2Index);
				// Update latestAddIdx to after the second tag
				latestAddIdx = tag2Index + thinkTags[1].length;
				onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
				return;
			}

			// Add the text to fullReasoning (content after first tag but before second tag)
			// If we have more text than we've processed, add it to reasoning
			if (fullText_.length > latestAddIdx) {
				fullReasoningSoFar += fullText_.substring(latestAddIdx);
				latestAddIdx = fullText_.length;
			}

			onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
			return;
		}

		// At this point, we found <tag2> - content after the second tag is normal text
		// Add any new text after the closing tag to fullTextSoFar
		if (fullText_.length > latestAddIdx) {
			fullTextSoFar += fullText_.substring(latestAddIdx);
			latestAddIdx = fullText_.length;
		}

		onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
	};

	const getOnFinalMessageParams = () => {
		const fullText_ = fullTextSoFar;
		const tag1Idx = fullText_.indexOf(thinkTags[0]);
		const tag2Idx = fullText_.indexOf(thinkTags[1]);
		if (tag1Idx === -1) return { fullText: fullText_, fullReasoning: '' }; // Never started reasoning
		if (tag2Idx === -1) return { fullText: '', fullReasoning: fullText_ }; // Never stopped reasoning

		const fullReasoning = fullText_.substring(tag1Idx + thinkTags[0].length, tag2Idx);
		const fullText = fullText_.substring(0, tag1Idx) + fullText_.substring(tag2Idx + thinkTags[1].length, Infinity);

		return { fullText, fullReasoning };
	};

	const newOnFinalMessage: OnFinalMessage = (params) => {
		// Treat like just got text before calling onFinalMessage (or else we sometimes miss the final chunk)
		newOnText({ ...params });

		const { fullText, fullReasoning } = getOnFinalMessageParams();
		onFinalMessage({ ...params, fullText, fullReasoning });
	};

	return { newOnText, newOnFinalMessage };
}


