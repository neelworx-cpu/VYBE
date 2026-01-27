# Short-Term Memory

## Overview

**Short-term memory** (also called thread-scoped memory) tracks the ongoing conversation by maintaining message history within a session. LangGraph manages short-term memory as part of your agent's state, persisted via thread-scoped checkpoints.

## Key Concepts

### Thread-Scoped

Short-term memory is scoped to a single **thread** (conversation session):

- Each thread has its own isolated memory
- Memory persists across invocations within the same thread
- Different threads have separate memories
- Memory is cleared when thread is deleted

### State-Based Memory

Short-term memory is stored in the graph's state:

- **Messages**: Conversation history (HumanMessage, AIMessage, ToolMessage, etc.)
- **Context**: Additional context data (files, retrieved documents, artifacts)
- **Metadata**: Session-specific metadata

### Automatic Persistence

When using a checkpointer:

- State (including memory) is saved after each superstep
- Memory persists across application restarts
- Can resume conversation from any checkpoint
- Memory is part of the checkpoint data

## Usage

### Basic Short-Term Memory

```typescript
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { StateGraph, Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
});

const checkpointer = new MemorySaver();

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .compile({ checkpointer });

// First message - memory starts
await graph.invoke(
  { messages: [new HumanMessage("I'm Alice")] },
  { configurable: { thread_id: "conversation-1" } }
);

// Second message - memory persists
await graph.invoke(
  { messages: [new HumanMessage("What's my name?")] },
  { configurable: { thread_id: "conversation-1" } }
);
// Agent remembers: "I'm Alice"
```

### Accessing Memory in Nodes

```typescript
function agentNode(state, config) {
  // Access full conversation history
  const messages = state.messages;

  // Get recent messages
  const recentMessages = messages.slice(-10);

  // Search for specific information
  const userInfo = messages.find(
    msg => msg instanceof HumanMessage && msg.content.includes("name")
  );

  // Use memory in LLM call
  const response = await model.invoke(messages);

  return { messages: [response] };
}
```

### Memory with Additional Context

```typescript
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  contextFiles: Annotation<string[]>({
    reducer: (x, y) => [...new Set([...x, ...y])],
    default: () => []
  }),
  retrievedDocs: Annotation<Document[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
});
```

## Memory Management

### Growing Memory

As conversations get longer, memory grows. Common solutions:

1. **Trim Messages**: Remove oldest messages
2. **Summarize**: Compress old messages into summaries
3. **Filter**: Keep only relevant messages
4. **Delete**: Remove specific messages

### Context Window Limits

When memory exceeds LLM context window:

- Use summarization middleware (see Context Summarization)
- Trim old messages
- Use retrieval to find relevant past context
- Implement custom memory management

## Use Cases

1. **Conversation Continuity**: Remember previous messages in chat
2. **Context Retention**: Keep track of files, documents, artifacts
3. **Multi-Turn Reasoning**: Build on previous responses
4. **User Preferences**: Remember user preferences within session
5. **Task State**: Track progress on multi-step tasks

## Comparison with Long-Term Memory

| Aspect | Short-Term Memory | Long-Term Memory |
|--------|------------------|------------------|
| Scope | Single thread | Across all threads |
| Storage | Graph state (checkpoint) | BaseStore |
| Lifetime | Session duration | Persistent |
| Use Case | Conversation history | User profiles, preferences |

## References

- [LangGraph Memory Guide](https://docs.langchain.com/oss/javascript/langgraph/add-memory)
- [Memory Overview](https://docs.langchain.com/oss/javascript/concepts/memory)
- [Persistence Guide](https://docs.langchain.com/oss/javascript/langgraph/persistence)
