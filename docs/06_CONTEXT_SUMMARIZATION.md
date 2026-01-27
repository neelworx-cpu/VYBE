# Context Summarization

## Overview

**Context summarization** automatically compresses conversation history when approaching token limits, preserving recent messages while summarizing older context. This prevents context window overflow while maintaining conversational continuity.

## Key Concepts

### When to Summarize

Summarization triggers when:

- **Token Count**: Total tokens exceed threshold (e.g., 4000 of 8000)
- **Message Count**: Number of messages exceeds limit (e.g., 50 messages)
- **Fraction**: Percentage of context window used (e.g., 85%)

### Summarization Process

1. **Identify Messages to Summarize**: Old messages beyond cutoff point
2. **Preserve Recent Messages**: Keep recent messages intact (e.g., last 10-20)
3. **Generate Summary**: Use LLM to create concise summary of old messages
4. **Replace Old Messages**: Remove old messages, insert summary message
5. **Continue Conversation**: Agent continues with summary + recent messages

### Summary Message

The summary is inserted as a `HumanMessage` or `SystemMessage` with:

- Summary content
- Metadata indicating it's from summarization
- Preserved context for agent understanding

## Usage

### Using LangChain Summarization Middleware

```typescript
import { createAgent, summarizationMiddleware } from "langchain";
import { MemorySaver } from "@langchain/langgraph";

const agent = createAgent({
  model: "gpt-4o",
  tools: [tool1, tool2],
  middleware: [
    summarizationMiddleware({
      model: "gpt-4o-mini", // Model for summarization
      trigger: { tokens: 4000 }, // Trigger at 4000 tokens
      keep: { messages: 20 }, // Keep last 20 messages
    }),
  ],
  checkpointer: new MemorySaver(),
});
```

### Custom Summarization Middleware

```typescript
import { createMiddleware } from "langchain";
import { RemoveMessage, REMOVE_ALL_MESSAGES } from "@langchain/core/messages";

const customSummarization = createMiddleware({
  name: "CustomSummarization",
  beforeModel: async (state, runtime) => {
    const messages = state.messages;
    const tokenCount = await countTokens(messages);

    if (tokenCount > 4000) {
      // Determine cutoff
      const cutoffIndex = messages.length - 20;
      const messagesToSummarize = messages.slice(0, cutoffIndex);
      const recentMessages = messages.slice(cutoffIndex);

      // Generate summary
      const summary = await generateSummary(messagesToSummarize);

      // Replace old messages with summary
      return {
        messages: [
          new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
          new SystemMessage({
            content: `Previous conversation summary: ${summary}`,
            additional_kwargs: { lc_source: "summarization" }
          }),
          ...recentMessages
        ]
      };
    }

    return {};
  }
});
```

### Deep Agents Summarization (with Backend)

```typescript
import { createSummarizationMiddleware } from "@anthropic/deepagents";
import { FilesystemBackend } from "@anthropic/deepagents";

const backend = new FilesystemBackend({ rootDir: "/data" });

const middleware = createSummarizationMiddleware({
  model: "gpt-4o-mini",
  backend, // Offloads old messages to backend
  trigger: { type: "fraction", value: 0.85 },
  keep: { type: "fraction", value: 0.10 },
});
```

## Configuration Options

### Trigger Conditions

```typescript
// Token-based trigger
trigger: { tokens: 4000 }

// Message-based trigger
trigger: { messages: 50 }

// Fraction-based trigger
trigger: { type: "fraction", value: 0.85 }

// Multiple conditions
trigger: [{ tokens: 4000 }, { messages: 50 }]
```

### Keep Options

```typescript
// Keep last N messages
keep: { messages: 20 }

// Keep last N% of messages
keep: { type: "fraction", value: 0.10 }

// Keep last N tokens worth
keep: { tokens: 2000 }
```

## Best Practices

1. **Use Smaller Model**: Use cheaper model (e.g., gpt-4o-mini) for summarization
2. **Preserve Recent Context**: Keep enough recent messages for continuity
3. **Quality Summaries**: Ensure summaries capture important information
4. **Metadata**: Mark summary messages for debugging
5. **Testing**: Test summarization with various conversation lengths

## Use Cases

1. **Long Conversations**: Chat sessions with many messages
2. **Context Window Management**: Prevent exceeding LLM limits
3. **Cost Optimization**: Reduce token usage for long histories
4. **Performance**: Faster processing with shorter contexts
5. **Multi-Turn Tasks**: Complex tasks requiring many interactions

## Limitations

- **Information Loss**: Some detail may be lost in summarization
- **Context Dependency**: Agent may lose track of very old details
- **Summary Quality**: Depends on summarization model quality
- **Timing**: Must trigger before context window overflow

## References

- [LangChain Summarization Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in#summarization)
- [Deep Agents Summarization](https://docs.langchain.com/oss/javascript/deepagents/long-term-memory)
- [Manage Message History](https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs-customer-support#8-manage-message-history)
