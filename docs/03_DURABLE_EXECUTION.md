# Durable Execution

## Overview

**Durable execution** is the ability to pause and resume workflows from their last recorded state. This is enabled by LangGraph's persistence layer (checkpointing), allowing agents to:

- Survive crashes and failures
- Run for extended periods
- Resume from exact point of interruption
- Handle long-running tasks reliably

## Key Concepts

### Execution Persistence

With durable execution:

1. **State is Saved**: After every superstep, state is persisted
2. **Resumable**: Can resume from last checkpoint after any interruption
3. **Fault-Tolerant**: Crashes don't lose progress
4. **Long-Running**: Can execute for hours, days, or indefinitely

### Interruption Handling

Durable execution handles:

- **Crashes**: Process termination, OOM errors, etc.
- **Network Failures**: API timeouts, connection drops
- **Human Interrupts**: Pause for approval, resume later
- **Scheduled Pauses**: Stop at specific points, resume on schedule

### Checkpoint-Based Recovery

When resuming:

1. Load last checkpoint from checkpointer
2. Restore full graph state
3. Continue execution from that point
4. No need to restart from beginning

## Usage

### Basic Durable Execution

```typescript
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { StateGraph } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .compile({ checkpointer });

// First invocation - saves checkpoint
await graph.invoke(
  { messages: [new HumanMessage("Task 1")] },
  { configurable: { thread_id: "long-task" } }
);

// Process crashes or is interrupted...

// Resume from last checkpoint
await graph.invoke(
  { messages: [new HumanMessage("Continue")] },
  { configurable: { thread_id: "long-task" } }
);
```

### Production Setup

For production, use a persistent checkpointer:

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = new PostgresSaver({
  connectionString: process.env.DATABASE_URL
});

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .compile({ checkpointer });
```

### Resuming After Failure

```typescript
try {
  await graph.invoke(input, config);
} catch (error) {
  // Process crashed or error occurred
  console.error("Execution failed:", error);

  // Later, resume from last checkpoint
  const state = await graph.getState(config);
  if (state.next.length > 0) {
    // Still has work to do - resume
    await graph.invoke(null, config);
  }
}
```

## Benefits

1. **Reliability**: Agents survive failures and continue working
2. **Long-Running Tasks**: Can execute for hours or days
3. **Cost Efficiency**: Don't lose progress on expensive operations
4. **User Experience**: Seamless resumption after interruptions
5. **Debugging**: Can inspect state at any point

## Comparison with Traditional Execution

**Traditional (Non-Durable)**:
- State lost on crash
- Must restart from beginning
- Can't pause/resume
- Limited to single session

**Durable Execution**:
- State persisted automatically
- Resume from exact point
- Can pause indefinitely
- Works across sessions

## References

- [LangGraph Overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [Persistence Guide](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Durable Execution Concept](https://docs.langchain.com/oss/javascript/concepts/products#agent-runtimes-like-langgraph)
