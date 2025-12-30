# Vybe MCP Architecture Analysis & Integration Plan

## Executive Summary

**Current State:**
- Vybe MCP is a standalone MCP server that runs as a separate process
- It uses direct HTTP calls to OpenAI API (`OPENAI_API_KEY` from config)
- It has a complete agentic system with orchestrators, agents (L1/L2/L3), tools, memory, and task graphs
- It communicates via MCP protocol (stdio or SSE)

**What's Needed:**
- Replace direct OpenAI HTTP calls with Vybe IDE's local LLM transport
- Enable MCP to use Ollama/LM Studio models via IDE
- Maintain backward compatibility with cloud providers
- Keep MCP as a separate process (boundary: MCP decides WHAT, IDE executes HOW)

---

## Current Architecture

### 1. **LLM Service** (`src/core/llm.ts`)
```typescript
class LLMService {
    private apiKey: string;  // OPENAI_API_KEY from config
    private model: string;    // 'gpt-4-turbo-preview'

    async chatStream(messages, onPartial) {
        // Direct HTTP to https://api.openai.com/v1/chat/completions
    }

    async chat(messages) {
        // Direct HTTP to OpenAI API
    }
}
```

**Issues:**
- ❌ Hardcoded to OpenAI API
- ❌ Requires `OPENAI_API_KEY` environment variable
- ❌ Cannot use local models (Ollama, LM Studio)
- ❌ No provider abstraction

### 2. **Agent Usage** (`src/agents/agent_l1.ts`, `streaming_utils.ts`)
```typescript
// Agents use llm directly:
const response = await llm.completeStream(prompt, (chunk) => {
    // Stream chunks to events
});

// Or:
const response = await llm.chat(messages);
```

**All LLM calls go through:**
- `llm.chat()` - non-streaming
- `llm.chatStream()` - streaming
- `llm.complete()` / `llm.completeStream()` - convenience methods

### 3. **MCP Server** (`src/core/mcp_server.ts`)
- Runs as standalone server
- Exposes tools via MCP protocol
- Handles tool execution
- Emits events via SSE

### 4. **Tool Registry** (`src/tools/registry.ts`)
- Tools are registered statically
- Tools execute in MCP process
- Tools can call LLM via `llm` singleton

---

## Integration Requirements

### What MCP Needs from IDE:

1. **LLM Transport Abstraction**
   - MCP should NOT make direct HTTP calls
   - MCP should call IDE's `IVybeLLMMessageService` via MCP tool
   - IDE handles all provider-specific logic (Ollama, LM Studio, cloud)

2. **Provider Selection**
   - MCP needs to know which provider/model to use
   - Should come from MCP config or task input
   - IDE provides available models via model listing

3. **Streaming Support**
   - MCP's streaming must work with IDE's streaming
   - Events must flow: IDE → MCP → Client (SSE)

4. **Tool Execution**
   - MCP tools execute in MCP process (unchanged)
   - Tools that need IDE capabilities call IDE via MCP tools
   - IDE provides tools like `apply_patch`, `read_file`, etc.

---

## Integration Architecture (Option C: Hybrid Adapter)

### Phase 1: Create Adapter Interface

**File**: `VYBE-MCP/src/core/llmAdapter.ts`

```typescript
export interface ILLMAdapter {
    chatStream(
        messages: LLMMessage[],
        onPartial: (content: string) => void
    ): Promise<LLMResponse>;

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

### Phase 2: Implement IDE Adapter (Using MCP Client)

**File**: `VYBE-MCP/src/core/adapters/ideLLMAdapter.ts`

```typescript
import { ILLMAdapter, LLMMessage, LLMResponse } from '../llmAdapter.js';
import { mcpClient } from '../mcp_client.js';
import { createLogger } from '../logger.js';

const logger = createLogger('IDELLMAdapter');

export class IDELLMAdapter implements ILLMAdapter {
    // Provider-agnostic: IDE resolves defaults
    constructor() {
        // No provider/model in constructor - IDE decides
    }

    async chatStream(
        messages: LLMMessage[],
        onPartial: (content: string) => void
    ): Promise<LLMResponse> {
        // Check if IDE bridge is available
        if (!(await mcpClient.isAvailable())) {
            throw new Error('IDE MCP client not available');
        }

        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;

        try {
            // Call IDE via MCP client: vybe.send_llm_message
            // IDE resolves provider/model defaults
            const result = await mcpClient.callTool({
                name: 'vybe.send_llm_message',
                arguments: {
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    // No provider/model - IDE resolves defaults
                    stream: true
                },
                timeout: 60000 // 60s timeout for streaming
            });

            // Parse streaming response from IDE
            // IDE sends chunks via MCP response format
            if (result.content && Array.isArray(result.content)) {
                for (const chunk of result.content) {
                    if (chunk.type === 'text' && chunk.text) {
                        fullContent += chunk.text;
                        onPartial(chunk.text);
                        outputTokens++; // Approximate
                    }
                }
            }

            return {
                content: fullContent,
                usage: {
                    input: inputTokens,
                    output: outputTokens
                }
            };
        } catch (error) {
            logger.error('IDE LLM call failed', error);
            throw error;
        }
    }

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
        // Non-streaming: collect all chunks
        let fullContent = '';
        await this.chatStream(messages, (delta) => {
            fullContent += delta;
        });
        return { content: fullContent };
    }

    async listModels(): Promise<Model[]> {
        if (!(await mcpClient.isAvailable())) {
            return [];
        }

        try {
            const result = await mcpClient.callTool({
                name: 'vybe.list_models',
                arguments: {},
                timeout: 5000
            });

            if (result.content && Array.isArray(result.content)) {
                const data = result.content[0]?.data;
                if (data && Array.isArray(data.models)) {
                    return data.models.map((m: any) => ({
                        id: m.id,
                        name: m.label || m.name,
                        provider: m.provider
                    }));
                }
            }
            return [];
        } catch (error) {
            logger.warn('Failed to list models from IDE', error);
            return [];
        }
    }
}
```

### Phase 3: Implement Cloud Adapter (Keep Existing Logic)

**File**: `VYBE-MCP/src/core/adapters/cloudLLMAdapter.ts`

```typescript
import { ILLMAdapter, LLMMessage, LLMResponse } from '../llmAdapter.js';
import { config } from '../config.js';

export class CloudLLMAdapter implements ILLMAdapter {
    private apiKey: string;
    private model: string;

    constructor() {
        this.apiKey = config.get('OPENAI_API_KEY') || '';
        this.model = 'gpt-4-turbo-preview';
    }

    async chatStream(messages: LLMMessage[], onPartial: (content: string) => void): Promise<LLMResponse> {
        // Existing OpenAI HTTP logic from llm.ts
        // ... (copy existing implementation)
    }

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
        // Existing OpenAI HTTP logic
        // ... (copy existing implementation)
    }

    async listModels(): Promise<Model[]> {
        // Return cloud models
        return [
            { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo', provider: 'openai' },
            // ... etc
        ];
    }
}
```

### Phase 4: Refactor LLMService to Use Adapter (Provider-Agnostic)

**File**: `VYBE-MCP/src/core/llm.ts`

```typescript
import { ILLMAdapter } from './llmAdapter.js';
import { CloudLLMAdapter } from './adapters/cloudLLMAdapter.js';
import { IDELLMAdapter } from './adapters/ideLLMAdapter.js';
import { config } from './config.js';
import { mcpClient } from './mcp_client.js';
import { createLogger } from './logger.js';

const logger = createLogger('LLMService');

export class LLMService {
    private adapter: ILLMAdapter | null = null;

    constructor(adapter?: ILLMAdapter) {
        if (adapter) {
            this.adapter = adapter;
        }
        // Otherwise, adapter is lazy-loaded based on IDE availability
    }

    /**
     * Get or create adapter (provider-agnostic)
     * Tries IDE adapter first, falls back to cloud
     */
    private async getAdapter(): Promise<ILLMAdapter> {
        if (this.adapter) {
            return this.adapter;
        }

        // Check if IDE is available
        const ideAvailable = await mcpClient.isAvailable();

        if (ideAvailable) {
            logger.info('Using IDE adapter for LLM calls');
            this.adapter = new IDELLMAdapter();
        } else {
            logger.info('IDE not available, using cloud adapter');
            this.adapter = new CloudLLMAdapter();
        }

        return this.adapter;
    }

    setAdapter(adapter: ILLMAdapter): void {
        this.adapter = adapter;
    }

    async chatStream(messages: LLMMessage[], onPartial: (content: string) => void): Promise<LLMResponse> {
        const adapter = await this.getAdapter();
        return adapter.chatStream(messages, onPartial);
    }

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
        const adapter = await this.getAdapter();
        return adapter.chat(messages);
    }

    async listModels(): Promise<Model[]> {
        const adapter = await this.getAdapter();
        return adapter.listModels();
    }
}

export const llm = new LLMService();
```

### Phase 5: Update MCP Client to Connect to IDE

**File**: `VYBE-MCP/src/core/mcp_client.ts`

```typescript
import { createLogger } from './logger.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { config } from './config.js';

const logger = createLogger('MCPClient');

/**
 * MCP Client for calling IDE tools
 *
 * IDE exposes vybe.send_llm_message and vybe.list_models as MCP tools.
 * This client connects to IDE's MCP server endpoint.
 */
export class MCPClient {
    private client: Client | null = null;
    private transport: SSEClientTransport | null = null;
    private readonly DEFAULT_TIMEOUT = 5000;
    private ideUrl: string;

    constructor() {
        // IDE MCP server URL (from config or env)
        this.ideUrl = config.get('IDE_MCP_URL') || 'http://localhost:3001/sse';
    }

    /**
     * Connect to IDE's MCP server
     */
    async connect(): Promise<void> {
        if (this.client) {
            return; // Already connected
        }

        try {
            this.transport = new SSEClientTransport(new URL(this.ideUrl));
            this.client = new Client(
                {
                    name: 'vybe-mcp-client',
                    version: '0.5.0',
                },
                {
                    capabilities: {
                        tools: {}
                    }
                }
            );

            await this.client.connect(this.transport);
            logger.info('Connected to IDE MCP server');
        } catch (error) {
            logger.error('Failed to connect to IDE MCP server', error);
            throw error;
        }
    }

    /**
     * Check if IDE bridge is available.
     */
    async isAvailable(): Promise<boolean> {
        try {
            if (!this.client) {
                await this.connect();
            }
            // Try to list tools to verify connection
            await this.client!.listTools();
            return true;
        } catch (error) {
            logger.warn('IDE MCP client not available', error);
            return false;
        }
    }

    /**
     * Call an IDE MCP tool.
     */
    async callTool(params: {
        name: string;
        arguments: Record<string, any>;
        timeout?: number;
    }): Promise<{ content: Array<{ type: string; text?: string; data?: any }> }> {
        const timeout = params.timeout || this.DEFAULT_TIMEOUT;

        if (!this.client) {
            await this.connect();
        }

        if (!this.client) {
            throw new Error('MCP client not connected');
        }

        logger.debug(`Calling IDE tool: ${params.name}`, { args: params.arguments });

        try {
            const result = await this.client.callTool({
                name: params.name,
                arguments: params.arguments
            });

            return result;
        } catch (error) {
            logger.error(`IDE tool call failed: ${params.name}`, error);
            throw error;
        }
    }

    /**
     * Disconnect from IDE
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.transport = null;
        }
    }
}

export const mcpClient = new MCPClient();
```

**Note**: IDE tools are NOT registered in MCP's tool registry. They are exposed by IDE and called via MCP client.

### Phase 6: Implement IDE Side MCP Tool Handler

**File**: `VYBE/src/vs/workbench/contrib/vybeLLM/browser/tools/vybeLLMMCPTool.ts`

```typescript
import { IVybeLLMMessageService } from '../common/vybeLLMMessageService.js';
import { IVybeLLMModelService } from '../common/vybeLLMModelService.js';
import { defaultVybeLLMProviderSettings } from '../common/vybeLLMProviderSettings.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';

/**
 * IDE resolves provider/model defaults from settings
 */
function getDefaultProviderAndModel(
    storageService: IStorageService
): { providerName: 'ollama' | 'vLLM' | 'lmStudio'; modelName: string } {
    // Read from storage or use defaults
    const stored = storageService.get('vybe.llm.settings', StorageScope.APPLICATION);
    if (stored) {
        try {
            const settings = JSON.parse(stored);
            // Use first available provider with first model
            // Or use user's last selection
            // For now, default to Ollama
            return {
                providerName: 'ollama',
                modelName: 'llama3.1' // Default model
            };
        } catch {
            // Fall through to defaults
        }
    }

    // Defaults
    return {
        providerName: 'ollama',
        modelName: 'llama3.1'
    };
}

/**
 * Handle vybe.send_llm_message MCP tool call
 * IDE resolves provider/model defaults
 */
export async function handleVybeSendLLMMessage(
    llmService: IVybeLLMMessageService,
    storageService: IStorageService,
    args: {
        messages: Array<{ role: string; content: string }>;
        // No provider/model in args - IDE resolves
        options?: { temperature?: number; maxTokens?: number };
        stream?: boolean;
    }
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    // IDE resolves defaults
    const { providerName, modelName } = getDefaultProviderAndModel(storageService);

    return new Promise((resolve, reject) => {
        const chunks: Array<{ type: 'text'; text: string }> = [];
        let fullContent = '';

        const requestId = llmService.sendChat({
            messages: args.messages as any,
            providerName,
            modelName,
            onText: ({ fullText, delta }) => {
                fullContent = fullText;
                // Emit streaming chunks
                if (delta) {
                    chunks.push({ type: 'text', text: delta });
                }
            },
            onFinalMessage: ({ fullText }) => {
                fullContent = fullText;
                // Return all chunks
                resolve({
                    content: chunks.length > 0 ? chunks : [{ type: 'text', text: fullContent }]
                });
            },
            onError: ({ message }) => {
                reject(new Error(message));
            },
            onAbort: () => {
                reject(new Error('Request aborted'));
            },
            options: args.options
        });
    });
}

/**
 * Handle vybe.list_models MCP tool call
 */
export async function handleVybeListModels(
    modelService: IVybeLLMModelService,
    args: { providerName?: 'ollama' | 'vLLM' | 'lmStudio' }
): Promise<{ content: Array<{ type: 'text'; data: { models: Array<{ id: string; label: string; provider: string }> } }> }> {
    const allModels = await modelService.getAllModels();

    let filtered = allModels;
    if (args.providerName) {
        filtered = allModels.filter(m => m.provider === args.providerName);
    }

    return {
        content: [{
            type: 'text',
            data: {
                models: filtered.map(m => ({
                    id: m.id,
                    label: m.label,
                    provider: m.provider
                }))
            }
        }]
    };
}
```

---

## Integration Flow

### Local Model Flow:
```
MCP Agent (agent_l1.ts)
  ↓ calls llm.chatStream()
  ↓
LLMService (llm.ts)
  ↓ uses IDELLMAdapter
  ↓
IDELLMAdapter (ideLLMAdapter.ts)
  ↓ calls toolRegistry.execute('vybe.send_llm_message')
  ↓
MCP Tool: vybe.send_llm_message
  ↓ (MCP protocol)
  ↓
IDE MCP Tool Handler (vybeLLMMCPTool.ts)
  ↓ calls IVybeLLMMessageService.sendChat()
  ↓
VybeLLMMessageService (vybeLLMMessageService.ts)
  ↓ IPC to main process
  ↓
Main Process: sendLLMMessage.impl.ts
  ↓ calls Ollama/LM Studio
  ↓
Streaming response flows back:
  Main → IPC → Renderer → MCP Tool → Adapter → Agent → Events → Client
```

### Cloud Model Flow (Fallback):
```
MCP Agent
  ↓ calls llm.chatStream()
  ↓
LLMService
  ↓ uses CloudLLMAdapter
  ↓
CloudLLMAdapter
  ↓ direct HTTP to OpenAI API
  ↓
Response flows back
```

---

## Configuration

**MCP Config** (`vybe.config.json`):
```json
{
  "llm": {
    "mode": "hybrid",  // "local" | "cloud" | "hybrid"
    "defaultProvider": "ollama",
    "defaultModel": "llama3.1",
    "providers": {
      "ollama": {
        "adapter": "ide",
        "model": "llama3.1"
      },
      "openai": {
        "adapter": "cloud",
        "apiKey": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

---

## Implementation Checklist

### MCP Side:
- [ ] Create `ILLMAdapter` interface
- [ ] Implement `IDELLMAdapter` (calls MCP tool)
- [ ] Implement `CloudLLMAdapter` (existing HTTP logic)
- [ ] Refactor `LLMService` to use adapter pattern
- [ ] Register `vybe.send_llm_message` and `vybe.list_models` tools
- [ ] Update config to support adapter selection
- [ ] Test adapter switching

### IDE Side:
- [ ] Create MCP tool handler for `vybe.send_llm_message`
- [ ] Create MCP tool handler for `vybe.list_models`
- [ ] Register tools in IDE's MCP client
- [ ] Handle streaming callbacks
- [ ] Test end-to-end flow

### Testing:
- [ ] Test local model (Ollama) via MCP
- [ ] Test local model (LM Studio) via MCP
- [ ] Test cloud model fallback
- [ ] Test streaming
- [ ] Test tool calling with local models
- [ ] Test error handling

---

## Key Design Decisions

1. **MCP as Separate Process**: MCP remains standalone, communicates with IDE via MCP protocol
2. **Adapter Pattern**: Clean abstraction allows switching providers without changing agent code
3. **Backward Compatible**: Cloud adapter preserves existing behavior
4. **IDE Owns Transport**: All LLM network calls happen in IDE main process
5. **MCP Owns Orchestration**: MCP decides which tools to call, when to call LLM, etc.

---

## Next Steps

1. **Start with Adapter Interface**: Define `ILLMAdapter` and implement both adapters
2. **Test Locally**: Get one agent (L1) working with Ollama via IDE adapter
3. **Add Tool Support**: Ensure tool calling works with local models
4. **Production Hardening**: Error handling, fallbacks, logging

