# VYBE MCP Integration - Option C: Hybrid Adapter Pattern

## Overview

Option C implements a hybrid adapter pattern where MCP's `LLMService` accepts an adapter interface that can switch between:
- **Direct HTTP** (for cloud providers: OpenAI, Anthropic, etc.)
- **IDE Adapter** (for local providers: uses `IVybeLLMMessageService`)

This allows MCP to seamlessly route LLM calls to either cloud or local providers based on configuration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VYBE MCP Server                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         LLMService (with adapter pattern)             │  │
│  │                                                        │  │
│  │  ┌──────────────────┐      ┌──────────────────┐      │  │
│  │  │  Cloud Adapter    │      │  IDE Adapter    │      │  │
│  │  │  (Direct HTTP)    │      │  (IPC to IDE)   │      │  │
│  │  │                   │      │                 │      │  │
│  │  │  - OpenAI API     │      │  - Uses         │      │  │
│  │  │  - Anthropic API  │      │    IVybeLLM     │      │  │
│  │  │  - Gemini API     │      │    Message      │      │  │
│  │  │                   │      │    Service      │      │  │
│  │  └──────────────────┘      └──────────────────┘      │  │
│  │           │                        │                  │  │
│  │           └────────┬───────────────┘                  │  │
│  │                    │                                  │  │
│  │           ┌────────▼─────────┐                        │  │
│  │           │  Adapter Router  │                        │  │
│  │           │  (selects based  │                        │  │
│  │           │   on provider)   │                        │  │
│  │           └──────────────────┘                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (MCP Protocol)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VYBE IDE                                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      IVybeLLMMessageService                          │  │
│  │      (Main Process LLM Transport)                     │  │
│  │                                                        │  │
│  │  - Ollama                                             │  │
│  │  - vLLM                                               │  │
│  │  - LM Studio                                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Define Adapter Interface

**File**: `VYBE-MCP/src/core/llmAdapter.ts`

```typescript
export interface ILLMAdapter {
    chatStream(messages: LLMMessage[], onPartial: (content: string) => void): Promise<LLMResponse>;
    chat(messages: LLMMessage[]): Promise<LLMResponse>;
    listModels(): Promise<Model[]>;
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    content: string;
    usage?: {
        input: number;
        output: number;
    };
}

export interface Model {
    id: string;
    name: string;
    provider: string;
}
```

### Phase 2: Implement Cloud Adapter

**File**: `VYBE-MCP/src/core/adapters/cloudLLMAdapter.ts`

- Wraps existing direct HTTP calls
- Handles OpenAI, Anthropic, Gemini, etc.
- Uses API keys from environment/config

### Phase 3: Implement IDE Adapter

**File**: `VYBE-MCP/src/core/adapters/ideLLMAdapter.ts`

- Communicates with IDE via MCP tool: `vybe.send_llm_message`
- Translates between MCP's LLM types and IDE's types
- Handles streaming via MCP events
- Falls back gracefully if IDE unavailable

**MCP Tool Contract**:
```typescript
// Tool: vybe.send_llm_message
{
    name: "vybe.send_llm_message",
    description: "Send LLM message via IDE's LLM transport",
    inputSchema: {
        type: "object",
        properties: {
            messages: { type: "array" },
            providerName: { type: "string" }, // "ollama" | "vLLM" | "lmStudio"
            modelName: { type: "string" },
            options: { type: "object" }
        }
    }
}
```

### Phase 4: Refactor LLMService

**File**: `VYBE-MCP/src/core/llm.ts`

```typescript
export class LLMService {
    private adapter: ILLMAdapter;

    constructor(adapter?: ILLMAdapter) {
        // Default to cloud adapter if none provided
        this.adapter = adapter || new CloudLLMAdapter();
    }

    setAdapter(adapter: ILLMAdapter): void {
        this.adapter = adapter;
    }

    async chatStream(messages: LLMMessage[], onPartial: (content: string) => void): Promise<LLMResponse> {
        return this.adapter.chatStream(messages, onPartial);
    }

    // ... other methods delegate to adapter
}
```

### Phase 5: Adapter Router

**File**: `VYBE-MCP/src/core/llmRouter.ts`

```typescript
export class LLMRouter {
    private cloudAdapter: CloudLLMAdapter;
    private ideAdapter: IDELLMAdapter | null = null;

    getAdapter(providerName: string): ILLMAdapter {
        const localProviders = ['ollama', 'vLLM', 'lmStudio'];

        if (localProviders.includes(providerName)) {
            // Use IDE adapter for local providers
            if (!this.ideAdapter) {
                this.ideAdapter = new IDELLMAdapter();
            }
            return this.ideAdapter;
        } else {
            // Use cloud adapter for cloud providers
            return this.cloudAdapter;
        }
    }
}
```

### Phase 6: IDE Tool Implementation

**File**: `VYBE/src/vs/workbench/contrib/vybeLLM/browser/tools/vybeLLMTool.ts`

- Expose `vybe.send_llm_message` MCP tool
- Bridge MCP tool calls to `IVybeLLMMessageService`
- Handle streaming events and convert to MCP format

## Benefits

1. **Clean Separation**: MCP doesn't need to know about IDE internals
2. **Flexible Routing**: Can switch adapters at runtime
3. **Fallback Support**: IDE adapter can fallback to cloud if IDE unavailable
4. **Testability**: Adapters can be mocked/tested independently
5. **Future-Proof**: Easy to add new adapters (e.g., proxy, cache)

## Migration Path

1. Keep existing `LLMService` with direct HTTP (backward compatible)
2. Add adapter interface alongside existing code
3. Gradually migrate to adapter pattern
4. Remove direct HTTP code once fully migrated

## Configuration

```typescript
// MCP config
{
    llm: {
        mode: "hybrid", // "cloud" | "local" | "hybrid"
        defaultAdapter: "ide", // "cloud" | "ide"
        providers: {
            ollama: { adapter: "ide" },
            openai: { adapter: "cloud" },
            anthropic: { adapter: "cloud" }
        }
    }
}
```


