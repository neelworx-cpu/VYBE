/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// =====================================================
// LANGGRAPH MODULE EXPORTS
// =====================================================
//
// LangGraph is now running in the main process (electron-main).
// The browser process communicates with it via IPC.
//
// Architecture:
// - Browser: Uses VybeLangGraphClient (IPC) to communicate with main
// - Main: VybeLangGraphService loads LangChain/LangGraph npm packages
//
// =====================================================

// LangGraph Client - The main browser-side interface
export {
	VybeLangGraphClient,
	getLangGraphClient,
	type LangGraphEvent,
	type LangGraphStartRequest,
	type LangGraphStatus,
	type ToolExecRequest,
	type ToolExecutor,
	type ToolResult,
} from './vybeLangGraphClient.js';

// Type definitions (for documentation/compatibility)
export type VybeAgentConfig = {
	enableHITL?: boolean;
	maxIterations?: number;
};

export interface VybeToolContext {
	fileService: {
		readFile: (path: string, offset?: number, limit?: number) => Promise<string>;
		writeFile: (path: string, contents: string) => Promise<void>;
		editFile: (path: string, oldString: string, newString: string) => Promise<void>;
		grep: (pattern: string, path?: string, glob?: string) => Promise<string>;
		listDir: (path: string) => Promise<string>;
		glob: (pattern: string) => Promise<string[]>;
	};
	terminalService: {
		runCommand: (command: string, isBackground?: boolean) => Promise<string>;
		runInSession: (command: string) => Promise<string>;
	};
	indexService: {
		semanticSearch: (query: string, directories?: string[]) => Promise<string>;
		getVectorStore: () => unknown;
	};
}

export interface VybeAgentEvent {
	type: string;
	data: unknown;
	timestamp?: number;
}

export interface LangGraphStreamChunk {
	__interrupt__?: unknown;
	messages?: unknown[];
	updates?: unknown;
	custom?: unknown;
}
