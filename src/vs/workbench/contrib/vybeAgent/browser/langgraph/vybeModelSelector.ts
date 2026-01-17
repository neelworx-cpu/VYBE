/*---------------------------------------------------------------------------------------------
 *  VYBE - Dynamic Model Selection for LangGraph Agent
 *  Supports static model initialization and runtime dynamic model selection
 *  Reference: https://docs.langchain.com/oss/javascript/langchain/agents#dynamic-model
 *--------------------------------------------------------------------------------------------*/

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';

// =====================================================
// STATIC MODEL INITIALIZATION
// =====================================================
// Static models are configured once when creating the agent

export const defaultModel = new ChatGoogleGenerativeAI({
	model: 'gemini-2.0-flash',
	temperature: 0.1,
	maxOutputTokens: 8192,
});

// =====================================================
// MODEL POOL FOR DYNAMIC SELECTION
// =====================================================
// Different models for different use cases

export const modelPool = {
	// Fast, cost-effective for simple tasks
	basic: new ChatGoogleGenerativeAI({
		model: 'gemini-2.0-flash',
		temperature: 0.1,
	}),

	// Advanced reasoning for complex tasks
	advanced: new ChatAnthropic({
		model: 'claude-sonnet-4-5-20250929',
		temperature: 0.1,
	}),

	// Deep reasoning for complex problem solving
	reasoning: new ChatOpenAI({
		model: 'o1',
		temperature: 1, // o1 models require temperature of 1
	}),

	// Local model for privacy-sensitive tasks
	local: new ChatOllama({
		model: 'llama3.2',
		temperature: 0.1,
	}),
};

// =====================================================
// MODEL SELECTION TYPES
// =====================================================

export type ModelType = keyof typeof modelPool;

export interface ModelSelectionContext {
	messageCount: number;
	taskComplexity?: 'simple' | 'normal' | 'advanced' | 'reasoning';
	preferLocal?: boolean;
	userRole?: 'beginner' | 'intermediate' | 'expert';
}

// =====================================================
// DYNAMIC MODEL SELECTION LOGIC
// =====================================================

export function selectModel(context: ModelSelectionContext): typeof modelPool[ModelType] {
	const { messageCount, taskComplexity, preferLocal } = context;

	// Prefer local model if explicitly requested
	if (preferLocal) {
		return modelPool.local;
	}

	// Select based on task complexity
	if (taskComplexity === 'reasoning' || messageCount > 20) {
		return modelPool.reasoning;
	}

	if (taskComplexity === 'advanced' || messageCount > 10) {
		return modelPool.advanced;
	}

	// Default to basic model
	return modelPool.basic;
}

// =====================================================
// DYNAMIC MODEL MIDDLEWARE
// =====================================================
// This will be used with createMiddleware from langchain

export interface DynamicModelRequest {
	messages: unknown[];
	runtime: {
		context?: {
			taskComplexity?: 'simple' | 'normal' | 'advanced' | 'reasoning';
			preferLocal?: boolean;
		};
	};
}

export function createDynamicModelSelector() {
	return {
		name: 'VybeDynamicModel',
		wrapModelCall: <T>(request: DynamicModelRequest, handler: (req: DynamicModelRequest & { model: unknown }) => T): T => {
			const messageCount = request.messages.length;
			const complexity = request.runtime.context?.taskComplexity || 'normal';
			const preferLocal = request.runtime.context?.preferLocal || false;

			const selectedModel = selectModel({
				messageCount,
				taskComplexity: complexity,
				preferLocal,
			});

			return handler({ ...request, model: selectedModel });
		},
	};
}

// Export middleware instance
export const dynamicModelMiddleware = createDynamicModelSelector();





