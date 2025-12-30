# Local LLM Provider Integration Guide

This document explains how Void connects to local LLM providers (Ollama, vLLM, LM Studio) and how to implement the same in VYBE.

## Architecture Overview

Void uses a **three-layer architecture** to connect to local LLM providers:

1. **Browser/Renderer Layer** (`sendLLMMessageService.ts`) - UI-facing service
2. **IPC Channel Layer** (`sendLLMMessageChannel.ts`) - Communication bridge
3. **Main Process Implementation** (`sendLLMMessage.impl.ts`) - Actual LLM provider connections

## Key Components

### 1. Provider Configuration (`modelCapabilities.ts`)

Each local provider has default settings:

```typescript
export const defaultProviderSettings = {
  ollama: {
    endpoint: 'http://127.0.0.1:11434',
  },
  vLLM: {
    endpoint: 'http://localhost:8000',
  },
  lmStudio: {
    endpoint: 'http://localhost:1234',
  },
}
```

### 2. Provider Implementation (`sendLLMMessage.impl.ts`)

#### Ollama Connection

**Two approaches:**
1. **OpenAI-Compatible API** (for chat): Uses OpenAI SDK with custom baseURL
2. **Native Ollama SDK** (for FIM and listing): Uses `ollama` npm package

```typescript
// OpenAI-compatible approach (for chat)
else if (providerName === 'ollama') {
  const thisConfig = settingsOfProvider[providerName]
  return new OpenAI({
    baseURL: `${thisConfig.endpoint}/v1`,
    apiKey: 'noop',
    ...commonPayloadOpts
  })
}

// Native Ollama SDK (for FIM and listing)
const newOllamaSDK = ({ endpoint }: { endpoint: string }) => {
  if (!endpoint) throw new Error(`Ollama Endpoint was empty`)
  const ollama = new Ollama({ host: endpoint })
  return ollama
}
```

#### vLLM Connection

vLLM uses **OpenAI-compatible API** exclusively:

```typescript
else if (providerName === 'vLLM') {
  const thisConfig = settingsOfProvider[providerName]
  return new OpenAI({
    baseURL: `${thisConfig.endpoint}/v1`,
    apiKey: 'noop',
    ...commonPayloadOpts
  })
}
```

#### LM Studio Connection

LM Studio also uses **OpenAI-compatible API**:

```typescript
else if (providerName === 'lmStudio') {
  const thisConfig = settingsOfProvider[providerName]
  return new OpenAI({
    baseURL: `${thisConfig.endpoint}/v1`,
    apiKey: 'noop',
    ...commonPayloadOpts
  })
}
```

### 3. Provider Registry (`sendLLMMessage.impl.ts`)

All providers are registered in a central registry:

```typescript
export const sendLLMMessageToProviderImplementation = {
  ollama: {
    sendChat: (params) => _sendOpenAICompatibleChat(params),
    sendFIM: sendOllamaFIM,  // Uses native Ollama SDK
    list: ollamaList,          // Uses native Ollama SDK
  },
  vLLM: {
    sendChat: (params) => _sendOpenAICompatibleChat(params),
    sendFIM: (params) => _sendOpenAICompatibleFIM(params),
    list: (params) => _openaiCompatibleList(params),
  },
  lmStudio: {
    sendChat: (params) => _sendOpenAICompatibleChat(params),
    sendFIM: (params) => _sendOpenAICompatibleFIM(params),
    list: (params) => _openaiCompatibleList(params),
  },
}
```

### 4. IPC Channel Registration (`app.ts`)

The channel is registered in the main process:

```typescript
const sendLLMMessageChannel = new LLMMessageChannel(accessor.get(IMetricsService));
mainProcessElectronServer.registerChannel('void-channel-llmMessage', sendLLMMessageChannel);
```

## Implementation Flow

### Sending a Chat Message

1. **Browser calls service** (`LLMMessageService.sendLLMMessage()`)
2. **Service calls IPC channel** (`channel.call('sendLLMMessage', ...)`)
3. **Channel routes to implementation** (`sendLLMMessageToProviderImplementation[providerName].sendChat()`)
4. **Implementation creates SDK client** (`newOpenAICompatibleSDK()` or `newOllamaSDK()`)
5. **SDK makes HTTP request** to local endpoint
6. **Response streams back** through callbacks (`onText`, `onFinalMessage`, `onError`)

### Listing Models

1. **Browser calls service** (`LLMMessageService.ollamaList()` or `openAICompatibleList()`)
2. **Service calls IPC channel** (`channel.call('ollamaList', ...)`)
3. **Channel routes to implementation** (`sendLLMMessageToProviderImplementation[providerName].list()`)
4. **Implementation queries provider**:
   - Ollama: Uses native `ollama.list()` API
   - vLLM/LM Studio: Uses OpenAI SDK `models.list()` endpoint
5. **Models returned** via `onSuccess` callback

## Key Differences Between Providers

### Ollama
- **Chat**: OpenAI-compatible API (`/v1/chat/completions`)
- **FIM**: Native Ollama API (`ollama.generate()`)
- **Listing**: Native Ollama API (`ollama.list()`)
- **Default endpoint**: `http://127.0.0.1:11434`

### vLLM
- **All operations**: OpenAI-compatible API
- **Default endpoint**: `http://localhost:8000`
- **Models endpoint**: `/v1/models`

### LM Studio
- **All operations**: OpenAI-compatible API
- **Default endpoint**: `http://localhost:1234`
- **Models endpoint**: `/v1/models`

## Required Dependencies

```json
{
  "dependencies": {
    "openai": "^4.x.x",      // For OpenAI-compatible providers
    "ollama": "^1.x.x"       // For native Ollama support
  }
}
```

## Implementation Steps for VYBE

### Step 1: Add Provider Settings

Add to your settings/types file:

```typescript
export const defaultProviderSettings = {
  ollama: {
    endpoint: 'http://127.0.0.1:11434',
  },
  vLLM: {
    endpoint: 'http://localhost:8000',
  },
  lmStudio: {
    endpoint: 'http://localhost:1234',
  },
}
```

### Step 2: Create SDK Factory Function

```typescript
import OpenAI from 'openai';
import { Ollama } from 'ollama';

const newOpenAICompatibleSDK = async ({
  settingsOfProvider,
  providerName
}: {
  settingsOfProvider: SettingsOfProvider,
  providerName: ProviderName
}) => {
  if (providerName === 'ollama') {
    const thisConfig = settingsOfProvider[providerName]
    return new OpenAI({
      baseURL: `${thisConfig.endpoint}/v1`,
      apiKey: 'noop'
    })
  }
  else if (providerName === 'vLLM') {
    const thisConfig = settingsOfProvider[providerName]
    return new OpenAI({
      baseURL: `${thisConfig.endpoint}/v1`,
      apiKey: 'noop'
    })
  }
  else if (providerName === 'lmStudio') {
    const thisConfig = settingsOfProvider[providerName]
    return new OpenAI({
      baseURL: `${thisConfig.endpoint}/v1`,
      apiKey: 'noop'
    })
  }
  // ... other providers
}
```

### Step 3: Implement Chat Function

```typescript
const _sendOpenAICompatibleChat = async ({
  messages,
  onText,
  onFinalMessage,
  onError,
  settingsOfProvider,
  modelName,
  providerName
}: SendChatParams) => {
  const openai = await newOpenAICompatibleSDK({
    providerName,
    settingsOfProvider
  })

  const stream = await openai.chat.completions.create({
    model: modelName,
    messages: messages,
    stream: true,
  })

  let fullText = ''
  for await (const chunk of stream) {
    const newText = chunk.choices[0]?.delta?.content ?? ''
    fullText += newText
    onText({ fullText })
  }

  onFinalMessage({ fullText })
}
```

### Step 4: Implement Model Listing

```typescript
// For OpenAI-compatible providers (vLLM, LM Studio)
const _openaiCompatibleList = async ({
  onSuccess,
  onError,
  settingsOfProvider,
  providerName
}: ListParams) => {
  try {
    const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider })
    const response = await openai.models.list()
    onSuccess({ models: response.data })
  } catch (error) {
    onError({ error: error + '' })
  }
}

// For Ollama (native)
const ollamaList = async ({
  onSuccess,
  onError,
  settingsOfProvider
}: ListParams) => {
  try {
    const thisConfig = settingsOfProvider.ollama
    const ollama = new Ollama({ host: thisConfig.endpoint })
    const response = await ollama.list()
    onSuccess({ models: response.models })
  } catch (error) {
    onError({ error: error + '' })
  }
}
```

### Step 5: Register Providers

```typescript
export const sendLLMMessageToProviderImplementation = {
  ollama: {
    sendChat: _sendOpenAICompatibleChat,
    sendFIM: sendOllamaFIM,  // Optional: native FIM support
    list: ollamaList,
  },
  vLLM: {
    sendChat: _sendOpenAICompatibleChat,
    sendFIM: _sendOpenAICompatibleFIM,
    list: _openaiCompatibleList,
  },
  lmStudio: {
    sendChat: _sendOpenAICompatibleChat,
    sendFIM: _sendOpenAICompatibleFIM,
    list: _openaiCompatibleList,
  },
}
```

### Step 6: Set Up IPC Channel

Create a channel similar to `LLMMessageChannel` that:
- Implements `IServerChannel`
- Handles `sendLLMMessage`, `abort`, `ollamaList`, `openAICompatibleList` commands
- Emits events for `onText`, `onFinalMessage`, `onError`, `onSuccess`, `onError` (for listing)

### Step 7: Register Channel in Main Process

In your main process initialization:

```typescript
const sendLLMMessageChannel = new LLMMessageChannel(/* dependencies */);
mainProcessElectronServer.registerChannel('vybe-channel-llmMessage', sendLLMMessageChannel);
```

## Testing

### Test Ollama Connection

1. Start Ollama: `ollama serve`
2. Pull a model: `ollama pull llama3.1`
3. Configure endpoint: `http://127.0.0.1:11434`
4. Test chat completion

### Test vLLM Connection

1. Start vLLM server: `python -m vllm.entrypoints.openai.api_server --model <model>`
2. Configure endpoint: `http://localhost:8000`
3. Test chat completion

### Test LM Studio Connection

1. Start LM Studio and load a model
2. Enable local server (usually port 1234)
3. Configure endpoint: `http://localhost:1234`
4. Test chat completion

## Error Handling

Void handles errors at multiple levels:

1. **Connection errors**: Caught when creating SDK client
2. **API errors**: Caught in `.catch()` blocks
3. **Streaming errors**: Caught during stream iteration
4. **Timeout errors**: Handled by abort mechanism

All errors are propagated back through the IPC channel to the browser layer.

## Key Takeaways

1. **Ollama** requires both OpenAI-compatible API (chat) and native SDK (FIM, listing)
2. **vLLM and LM Studio** use OpenAI-compatible API exclusively
3. All providers use **streaming responses** for real-time updates
4. **IPC channels** bridge browser and main process
5. **Model listing** is provider-specific (native API vs OpenAI-compatible)

## File Structure Reference

```
void/
├── src/vs/workbench/contrib/void/
│   ├── common/
│   │   ├── sendLLMMessageService.ts      # Browser service
│   │   ├── sendLLMMessageTypes.ts         # Type definitions
│   │   ├── voidSettingsTypes.ts          # Provider settings
│   │   └── modelCapabilities.ts          # Provider configs
│   └── electron-main/
│       ├── sendLLMMessageChannel.ts       # IPC channel
│       └── llmMessage/
│           ├── sendLLMMessage.ts          # Main orchestrator
│           └── sendLLMMessage.impl.ts     # Provider implementations
└── src/vs/code/electron-main/
    └── app.ts                             # Channel registration
```


