# VYBE Chat - AI Integration Checklist

## ✅ **Already Complete:**

### 1. **UI Architecture**
- [x] Content parts system (`IVybeChatContentPart`)
- [x] `VybeChatMarkdownPart` - renders markdown
- [x] `VybeChatThinkingPart` - renders thinking blocks with streaming
- [x] `MessagePage` - handles message-response pairs
- [x] `MessageComposer` - user input with context pills, images, etc.
- [x] Streaming UI updates (thinking block auto-scrolls during streaming)
- [x] Stop button (wired up, needs backend)

### 2. **Styling**
- [x] Markdown CSS (headings, paragraphs, lists, tables, etc.)
- [x] Thinking block styling (collapsible, spinner, chevron)
- [x] Proper spacing and margins
- [x] Theme support (VYBE Dark/Light)

### 3. **User Interactions**
- [x] Send message
- [x] Stop generation (UI only)
- [x] Edit message (inline composer)
- [x] Context pills (files, terminals, docs)
- [x] Image attachments
- [x] Agent mode selection
- [x] Model selection

---

## 🚧 **Needs Implementation:**

### 1. **AI Service Integration** 🔴 HIGH PRIORITY

#### a) **Create AI Service Interface**
```typescript
// File: src/vs/workbench/contrib/vybeChat/common/vybeChatService.ts

export interface IVybeChatService {
    /**
     * Send a message to the AI and get a streaming response
     */
    sendMessage(
        message: string,
        context: IVybeChatContext,
        options: IVybeChatOptions
    ): Promise<IVybeChatResponse>;

    /**
     * Stop the current generation
     */
    stopGeneration(messageId: string): Promise<void>;

    /**
     * Regenerate a response
     */
    regenerateResponse(messageId: string): Promise<IVybeChatResponse>;
}

export interface IVybeChatContext {
    sessionId: string;
    messageHistory: IVybeChatMessage[];
    contextPills: ContextPillData[];
    images: ImageAttachmentData[];
    workspaceFiles?: string[];
}

export interface IVybeChatOptions {
    agentMode: 'agent' | 'plan' | 'ask';
    model: string;
    maxTokens?: number;
    temperature?: number;
}

export interface IVybeChatResponse {
    messageId: string;
    stream: ReadableStream<IVybeChatStreamChunk>;
}

export interface IVybeChatStreamChunk {
    type: 'thinking' | 'content' | 'done' | 'error';
    data: string;
    metadata?: {
        thinkingDuration?: number;
        tokensUsed?: number;
    };
}
```

#### b) **Implement Service**
```typescript
// File: src/vs/workbench/contrib/vybeChat/browser/vybeChatServiceImpl.ts

export class VybeChatService implements IVybeChatService {
    constructor(
        @IRequestService private requestService: IRequestService,
        @IConfigurationService private configService: IConfigurationService
    ) {}

    async sendMessage(
        message: string,
        context: IVybeChatContext,
        options: IVybeChatOptions
    ): Promise<IVybeChatResponse> {
        // Get API endpoint from settings
        const apiEndpoint = this.configService.getValue<string>('vybeChat.apiEndpoint');
        const apiKey = this.configService.getValue<string>('vybeChat.apiKey');

        // Prepare request payload
        const payload = {
            message,
            sessionId: context.sessionId,
            history: context.messageHistory,
            context: {
                files: context.contextPills
                    .filter(p => p.type === 'file')
                    .map(p => ({ path: p.path, name: p.name })),
                images: context.images
            },
            options: {
                mode: options.agentMode,
                model: options.model,
                maxTokens: options.maxTokens,
                temperature: options.temperature
            }
        };

        // Make streaming request
        const response = await fetch(`${apiEndpoint}/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`AI service error: ${response.status}`);
        }

        // Return streaming response
        return {
            messageId: generateMessageId(),
            stream: response.body as ReadableStream<IVybeChatStreamChunk>
        };
    }

    async stopGeneration(messageId: string): Promise<void> {
        // Call API to stop generation
        const apiEndpoint = this.configService.getValue<string>('vybeChat.apiEndpoint');
        await fetch(`${apiEndpoint}/chat/stop/${messageId}`, {
            method: 'POST'
        });
    }

    async regenerateResponse(messageId: string): Promise<IVybeChatResponse> {
        // Re-send the original message
        // Implementation similar to sendMessage
    }
}
```

#### c) **Wire Up Service in VybeChatViewPane**
```typescript
// In handleSendMessage():
private async handleSendMessage(message: string): Promise<void> {
    if (!this.chatArea || !message.trim()) {
        return;
    }

    const messageId = `msg-${Date.now()}`;
    const messagePage = this.createMessagePage(messageId, message);

    try {
        // Get AI response
        const response = await this.vybeChatService.sendMessage(
            message,
            {
                sessionId: this.sessionId!,
                messageHistory: this.getMessageHistory(),
                contextPills: this.composer!.getContextPills(),
                images: this.composer!.getImages()
            },
            {
                agentMode: this.composer!.getAgentMode(),
                model: this.composer!.getSelectedModel()
            }
        );

        // Process stream
        await this.processAIStream(response, messagePage);
    } catch (error) {
        // Handle error
        this.handleAIError(messagePage, error);
    }
}

private async processAIStream(
    response: IVybeChatResponse,
    messagePage: MessagePage
): Promise<void> {
    const reader = response.stream.getReader();
    let thinkingContent = '';
    let markdownContent = '';
    let isThinking = true;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = value as IVybeChatStreamChunk;

        switch (chunk.type) {
            case 'thinking':
                thinkingContent += chunk.data;
                messagePage.renderContentParts([
                    {
                        kind: 'thinking',
                        value: thinkingContent,
                        duration: 0,
                        isStreaming: true
                    }
                ]);
                break;

            case 'content':
                if (isThinking) {
                    // Transition: complete thinking, start markdown
                    isThinking = false;
                    messagePage.renderContentParts([
                        {
                            kind: 'thinking',
                            value: thinkingContent,
                            duration: chunk.metadata?.thinkingDuration || 0,
                            isStreaming: false
                        }
                    ]);
                }
                markdownContent += chunk.data;
                messagePage.renderContentParts([
                    {
                        kind: 'thinking',
                        value: thinkingContent,
                        duration: chunk.metadata?.thinkingDuration || 0,
                        isStreaming: false
                    },
                    {
                        kind: 'markdown',
                        content: markdownContent
                    }
                ]);
                break;

            case 'done':
                messagePage.setStreaming(false);
                this.composer!.switchToSendButton();
                break;

            case 'error':
                throw new Error(chunk.data);
        }
    }
}
```

---

### 2. **Code Block Content Part** 🟡 MEDIUM PRIORITY

Currently, code blocks are rendered inline in markdown. For proper syntax highlighting and copy buttons, create a separate content part:

```typescript
// File: src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatCodeBlockPart.ts

export interface IVybeChatCodeBlockContent {
    code: string;
    language: string;
    filename?: string;
}

export class VybeChatCodeBlockPart extends Disposable implements IVybeChatContentPart {
    readonly kind = 'codeBlock';
    readonly domNode: HTMLElement;
    private editor: ICodeEditor | null = null;

    constructor(
        private currentContent: IVybeChatCodeBlockContent,
        @IInstantiationService private readonly instantiationService: IInstantiationService
    ) {
        super();
        this.domNode = this.createDomNode();
    }

    protected createDomNode(): HTMLElement {
        // Create Monaco editor instance for syntax highlighting
        // Add copy button
        // Add language indicator
        // Add filename if provided
    }

    public hasSameContent(other: IVybeChatContentData): boolean {
        return other.kind === 'codeBlock' &&
               other.code === this.currentContent.code;
    }

    public updateContent(content: IVybeChatContentData): void {
        if (content.kind !== 'codeBlock') return;
        this.currentContent = content;
        // Update editor content
    }
}
```

---

### 3. **Error Handling** 🟡 MEDIUM PRIORITY

```typescript
// Add error content part
export interface IVybeChatErrorContent {
    message: string;
    code?: string;
    retry?: () => void;
}

export class VybeChatErrorPart extends Disposable implements IVybeChatContentPart {
    // Display error message with retry button
}

// In VybeChatViewPane:
private handleAIError(messagePage: MessagePage, error: Error): void {
    messagePage.setStreaming(false);
    messagePage.renderContentParts([
        {
            kind: 'error',
            message: error.message,
            retry: () => this.regenerateResponse(messagePage.messageId)
        }
    ]);
    this.composer!.switchToSendButton();
}
```

---

### 4. **Settings/Configuration** 🟢 LOW PRIORITY

Add VS Code settings for VYBE Chat:

```typescript
// File: src/vs/workbench/contrib/vybeChat/common/vybeChatConfiguration.ts

export const VYBE_CHAT_CONFIG = {
    'vybeChat.apiEndpoint': {
        type: 'string',
        default: 'https://api.vybe.ai',
        description: 'VYBE Chat API endpoint'
    },
    'vybeChat.apiKey': {
        type: 'string',
        default: '',
        description: 'VYBE Chat API key'
    },
    'vybeChat.defaultModel': {
        type: 'string',
        default: 'composer-1',
        enum: ['composer-1', 'composer-2', 'opus-4', 'sonnet-4'],
        description: 'Default AI model'
    },
    'vybeChat.maxTokens': {
        type: 'number',
        default: 4096,
        description: 'Maximum tokens per response'
    },
    'vybeChat.temperature': {
        type: 'number',
        default: 0.7,
        minimum: 0,
        maximum: 1,
        description: 'AI temperature (creativity)'
    }
};
```

---

### 5. **Message Persistence** 🟢 LOW PRIORITY

Save/load chat history:

```typescript
export interface IVybeChatStorageService {
    saveSession(sessionId: string, messages: IVybeChatMessage[]): Promise<void>;
    loadSession(sessionId: string): Promise<IVybeChatMessage[]>;
    listSessions(): Promise<IVybeChatSessionInfo[]>;
    deleteSession(sessionId: string): Promise<void>;
}
```

---

### 6. **Copy/Edit/Regenerate Actions** 🟢 LOW PRIORITY

Add action buttons to AI responses:
- Copy response
- Edit message and regenerate
- Regenerate without editing
- Insert at cursor (for code blocks)

---

## 📋 **Implementation Priority:**

1. **Phase 1 (Critical):** AI Service Integration
2. **Phase 2 (Important):** Error Handling
3. **Phase 3 (Nice to have):** Code Block Part
4. **Phase 4 (Polish):** Settings, Persistence, Actions

---

## 🎯 **Next Steps:**

1. **Define API Contract:** Work with backend team to define the streaming API format
2. **Create AI Service:** Implement `VybeChatService` with real API calls
3. **Wire Up Streaming:** Connect the stream to `MessagePage.renderContentParts()`
4. **Test End-to-End:** Send a message and verify the full flow works
5. **Add Error Handling:** Handle network errors, rate limits, etc.
6. **Polish UX:** Add loading states, error messages, retry buttons

---

## 💡 **Current State:**

- **UI:** 95% complete ✅
- **Backend Integration:** 0% complete 🔴
- **Error Handling:** 10% complete 🟡
- **Advanced Features:** 0% complete 🟢

The markdown system is **UI-ready** but needs backend integration to be functional.

