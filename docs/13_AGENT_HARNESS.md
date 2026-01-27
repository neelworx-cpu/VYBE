# Agent Harness

## Overview

**Agent Harness** (also called Agent Runtime or Agent Framework) is the complete infrastructure that orchestrates and manages agent execution. It provides the runtime environment, persistence, streaming, error handling, and all the capabilities needed to run agents in production.

## Key Concepts

### Runtime Components

An agent harness typically includes:

1. **Graph Execution Engine**: Runs the agent graph
2. **Persistence Layer**: Checkpointing and state management
3. **Streaming System**: Real-time updates and token streaming
4. **Error Handling**: Failure recovery and retry logic
5. **Memory Management**: Short-term and long-term memory
6. **Tool Execution**: Tool calling and result handling
7. **Interrupt Handling**: Human-in-the-loop and pauses
8. **Monitoring**: Observability and logging

### LangGraph as Harness

LangGraph provides the core harness capabilities:

- **StateGraph**: Graph execution engine
- **Checkpointing**: Persistence layer
- **Streaming**: Built-in streaming support
- **Interrupts**: Pause/resume functionality
- **Memory**: Store integration
- **Subgraphs**: Nested agent support

### LangChain createAgent

LangChain's `createAgent` is a high-level harness built on LangGraph:

- Pre-built agent architecture
- Tool integration
- Middleware support
- Streaming
- Checkpointing
- Human-in-the-loop

## Usage

### Basic Agent Harness

```typescript
import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// Define state
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
});

// Create checkpointer
const checkpointer = new MemorySaver();

// Build graph
const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent")
  .compile({ checkpointer });

// Harness is ready to use
await graph.invoke(
  { messages: [new HumanMessage("Hello")] },
  { configurable: { thread_id: "thread-1" } }
);
```

### Complete Harness with All Features

```typescript
import { createAgent, summarizationMiddleware } from "langchain";
import { MemorySaver, InMemoryStore } from "@langchain/langgraph-checkpoint";

// Create harness components
const checkpointer = new MemorySaver(); // Short-term memory
const store = new InMemoryStore(); // Long-term memory

// Build complete agent harness
const agent = createAgent({
  model: "gpt-4o",
  tools: [tool1, tool2, tool3],
  middleware: [
    summarizationMiddleware({
      model: "gpt-4o-mini",
      trigger: { tokens: 4000 },
      keep: { messages: 20 }
    }),
    errorHandlingMiddleware(),
    loggingMiddleware()
  ],
  checkpointer,
  stateSchema: CustomStateSchema
});

// Use harness
const result = await agent.invoke(
  { messages: [new HumanMessage("Task")] },
  {
    configurable: { thread_id: "task-1" },
    store // Long-term memory
  }
);
```

### Custom Harness with Interrupts

```typescript
import { interrupt, Command } from "@langchain/langgraph";

function customAgentNode(state, config) {
  // Execute agent logic
  const response = await model.invoke(state.messages);

  // Check for interrupts
  if (needsApproval(response)) {
    const decision = interrupt({
      type: "awaiting_approval",
      action: response.tool_calls[0]
    });

    // decision is value from Command.resume()
    return handleDecision(decision, response);
  }

  return { messages: [response] };
}

const harness = new StateGraph(StateAnnotation)
  .addNode("agent", customAgentNode)
  .compile({ checkpointer });
```

## Harness Features

### 1. Persistence

```typescript
// Automatic checkpointing
const checkpointer = new PostgresSaver({ connectionString });
const graph = graph.compile({ checkpointer });

// State persists across restarts
await graph.invoke(input, { configurable: { thread_id } });
```

### 2. Streaming

```typescript
// Stream updates in real-time
const stream = await graph.stream(input, config);

for await (const event of stream) {
  if (event.agent?.messages) {
    // Handle agent messages
    console.log(event.agent.messages);
  }

  if (event.tools) {
    // Handle tool calls
    console.log(event.tools);
  }
}
```

### 3. Error Handling

```typescript
// Automatic error recovery
try {
  await graph.invoke(input, config);
} catch (error) {
  // State is saved, can resume
  const state = await graph.getState(config);
  if (state.next.length > 0) {
    // Resume from last checkpoint
    await graph.invoke(null, config);
  }
}
```

### 4. Memory Management

```typescript
// Short-term + long-term memory
const agent = createAgent({
  // ... config
  checkpointer, // Short-term
});

await agent.invoke(input, {
  configurable: { thread_id },
  store // Long-term
});
```

## Harness Patterns

### Pattern 1: Production Harness

```typescript
// Production-ready harness
const productionHarness = {
  checkpointer: new PostgresSaver({ /* prod config */ }),
  store: new RedisStore({ /* prod config */ }),
  middleware: [
    summarizationMiddleware({ /* config */ }),
    errorHandlingMiddleware(),
    monitoringMiddleware(),
    rateLimitingMiddleware()
  ],
  streaming: true,
  retry: { maxAttempts: 3 }
};
```

### Pattern 2: Development Harness

```typescript
// Development harness
const devHarness = {
  checkpointer: new MemorySaver(), // In-memory
  store: new InMemoryStore(), // In-memory
  middleware: [loggingMiddleware()],
  streaming: true
};
```

### Pattern 3: Testing Harness

```typescript
// Testing harness
const testHarness = {
  checkpointer: new MemorySaver(),
  store: new InMemoryStore(),
  middleware: [mockMiddleware()],
  streaming: false // Disable for tests
};
```

## VYBE Agent Harness

VYBE's agent harness includes:

1. **LangGraph Service**: Core orchestration (`vybeLangGraphService.ts`)
2. **Custom StateGraph**: Fine-grained control
3. **Tool Execution**: Deferred file writes with interrupts
4. **IPC Communication**: Electron main/renderer communication
5. **Event Streaming**: Real-time UI updates
6. **Checkpointing**: Thread persistence
7. **Error Handling**: Tool error middleware

## Best Practices

1. **Use Production Checkpointers**: Postgres, MongoDB, Redis for production
2. **Enable Streaming**: For real-time user feedback
3. **Add Middleware**: Summarization, error handling, logging
4. **Monitor Performance**: Track execution times, token usage
5. **Handle Errors Gracefully**: Retry logic, fallback strategies
6. **Manage Memory**: Summarization, pruning, efficient storage

## References

- [LangGraph Overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangChain createAgent](https://docs.langchain.com/oss/javascript/langchain/agents)
- [Agent Runtimes](https://docs.langchain.com/oss/javascript/concepts/products#agent-runtimes-like-langgraph)
