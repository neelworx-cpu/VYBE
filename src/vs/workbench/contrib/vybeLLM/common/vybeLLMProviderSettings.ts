/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE LLM Provider Settings
 * Default settings for local LLM providers (Ollama, LM Studio)
 * Matches Void's implementation: void/src/vs/workbench/contrib/void/common/modelCapabilities.ts:12-69
 */

export const defaultVybeLLMProviderSettings = {
	ollama: {
		endpoint: 'http://127.0.0.1:11434',
	},
	lmStudio: {
		endpoint: 'http://localhost:1234',
	},
} as const;

export type VybeLLMProviderName = keyof typeof defaultVybeLLMProviderSettings;

export type VybeLLMProviderSettings = {
	[K in VybeLLMProviderName]: {
		endpoint: string;
	}
};


