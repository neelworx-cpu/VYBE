# Memory (General Concept)

## Overview

**Memory** in AI applications refers to the ability to process, store, and effectively recall information from past interactions. Memory enables agents to learn from feedback, adapt to user preferences, and maintain context across sessions.

## Two Types of Memory

LangGraph provides two complementary memory systems:

### 1. Short-Term Memory (Thread-Scoped)

- **Scope**: Single conversation thread
- **Storage**: Graph state (checkpointed)
- **Lifetime**: Session duration
- **Use Case**: Conversation history, session context
- **Access**: Automatic via `state.messages`

### 2. Long-Term Memory (Cross-Thread)

- **Scope**: Across all threads
- **Storage**: BaseStore
- **Lifetime**: Persistent
- **Use Case**: User profiles, preferences, knowledge
- **Access**: Via `getStore(config)`

## Memory Architecture

```
┌─────────────────────────────────────────┐
│           Memory System                  │
├─────────────────────────────────────────┤
│                                         │
│  Short-Term Memory                      │
│  ┌──────────────────────────────┐      │
│  │ Thread 1: messages, context   │      │
│  └──────────────────────────────┘      │
│  ┌──────────────────────────────┐      │
│  │ Thread 2: messages, context   │      │
│  └──────────────────────────────┘      │
│                                         │
│  Long-Term Memory                      │
│  ┌──────────────────────────────┐      │
│  │ Store: users, preferences     │      │
│  │ (shared across all threads)   │      │
│  └──────────────────────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

## Memory Management Strategies

### 1. Context Summarization

When short-term memory grows too large:

- Summarize old messages
- Preserve recent messages
- Maintain conversational continuity

### 2. Memory Retrieval

For long-term memory:

- Use vector search for semantic retrieval
- Filter by metadata
- Batch operations for efficiency

### 3. Memory Pruning

- Remove irrelevant messages
- Archive old conversations
- Clean up unused data

## Complete Memory Example

```typescript
import { MemorySaver, InMemoryStore } from "@langchain/langgraph-checkpoint";
import { createAgent, summarizationMiddleware } from "langchain";
import { getStore } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";

// Short-term memory (checkpointer)
const checkpointer = new MemorySaver();

// Long-term memory (store)
const store = new InMemoryStore();

// Initialize store with user data
await store.put(["users"], "user_123", {
  name: "John",
  preferences: { theme: "dark" }
});

// Agent with both memory types
const agent = createAgent({
  model: "gpt-4o",
  tools: [
    // Tool that uses long-term memory
    tool(
      async (input: { key: string }, config) => {
        const store = getStore(config);
        const item = await store.get(["users"], input.key);
        return JSON.stringify(item?.value || {});
      },
      {
        name: "get_user_data",
        schema: z.object({ key: z.string() })
      }
    )
  ],
  middleware: [
    // Summarization for short-term memory
    summarizationMiddleware({
      model: "gpt-4o-mini",
      trigger: { tokens: 4000 },
      keep: { messages: 20 }
    })
  ],
  checkpointer
});

// Use agent - both memories work together
await agent.invoke(
  { messages: [new HumanMessage("What are my preferences?")] },
  {
    configurable: { thread_id: "conversation-1" },
    store // Pass store for long-term memory
  }
);
```

## Memory Best Practices

1. **Use Both Types**: Short-term for conversation, long-term for persistent data
2. **Summarize When Needed**: Prevent context window overflow
3. **Namespace Clearly**: Organize long-term memory with namespaces
4. **Handle Missing Data**: Gracefully handle missing memory entries
5. **Optimize Access**: Use batch operations and caching

## Memory Patterns

### Pattern 1: Conversation Continuity

```typescript
// Short-term memory maintains conversation
await agent.invoke(
  { messages: [new HumanMessage("I like Python")] },
  { configurable: { thread_id: "chat-1" } }
);

await agent.invoke(
  { messages: [new HumanMessage("What language did I mention?")] },
  { configurable: { thread_id: "chat-1" } }
);
// Agent remembers: Python
```

### Pattern 2: User Preferences

```typescript
// Long-term memory stores preferences
await agent.invoke(
  { messages: [new HumanMessage("Set my theme to dark")] },
  {
    configurable: { thread_id: "chat-1" },
    store
  }
);

// Later, in different conversation
await agent.invoke(
  { messages: [new HumanMessage("What's my theme?")] },
  {
    configurable: { thread_id: "chat-2" }, // Different thread!
    store
  }
);
// Agent remembers: dark theme (from long-term memory)
```

## References

- [Memory Overview](https://docs.langchain.com/oss/javascript/concepts/memory)
- [Short-Term Memory Guide](https://docs.langchain.com/oss/javascript/langgraph/add-memory#manage-short-term-memory)
- [Long-Term Memory Guide](https://docs.langchain.com/oss/javascript/langgraph/add-memory#long-term-memory)
- [Cross-Thread Persistence](https://docs.langchain.com/oss/javascript/langgraph/how-tos/cross-thread-persistence)
