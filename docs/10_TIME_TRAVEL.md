# Time-Travel

## Overview

**Time-travel** allows you to revisit an agent's past actions, replay execution, and explore alternative paths. This is enabled by LangGraph's checkpointing system, which saves state at every superstep.

## Key Concepts

### Replaying

**Replaying** allows you to revisit and reproduce an agent's past actions:

- Replay from current state
- Replay from specific checkpoint
- Efficient: Reuses cached results, doesn't re-execute
- Useful for: Understanding reasoning, debugging mistakes

### Forking

**Forking** allows you to explore alternative paths:

- Edit state at a checkpoint
- Create new execution branch
- Test different decisions
- Useful for: Exploring alternatives, testing fixes

### Checkpoint-Based

Time-travel works by:

1. Identifying target checkpoint
2. Loading checkpoint state
3. Optionally modifying state (forking)
4. Resuming execution from that point

## Usage

### Replay from Current State

```typescript
// Replay all actions from current state
const threadConfig = {
  configurable: { thread_id: "thread-1" },
  streamMode: "values" as const
};

for await (const event of await graph.stream(null, threadConfig)) {
  console.log(event);
}
```

### Replay from Specific Checkpoint

```typescript
// Get checkpoint history
const checkpoints = [];
for await (const state of graph.getStateHistory({
  configurable: { thread_id: "thread-1" }
})) {
  checkpoints.push(state);
}

// Find desired checkpoint
const targetCheckpoint = checkpoints.find(
  cp => cp.metadata?.step === 5
);

// Replay from that checkpoint
const threadConfig = {
  configurable: {
    thread_id: "thread-1",
    checkpoint_id: targetCheckpoint.checkpoint_id
  },
  streamMode: "values" as const
};

for await (const event of await graph.stream(null, threadConfig)) {
  console.log(event);
}
```

### Forking (Explore Alternatives)

```typescript
// Get checkpoint to fork from
const checkpoint = await graph.getState({
  configurable: {
    thread_id: "thread-1",
    checkpoint_id: "checkpoint-xyz"
  }
});

// Modify state
await graph.updateState(
  {
    configurable: {
      thread_id: "thread-1",
      checkpoint_id: "checkpoint-xyz"
    }
  },
  {
    messages: [
      ...checkpoint.values.messages,
      new HumanMessage("Try a different approach")
    ]
  }
);

// Resume from forked checkpoint
const forkedConfig = {
  configurable: {
    thread_id: "thread-1",
    checkpoint_id: "checkpoint-xyz-fork" // New fork ID
  }
};

for await (const event of await graph.stream(null, forkedConfig)) {
  console.log(event);
}
```

### Time-Travel Manager (VYBE Example)

```typescript
export class VybeTimeTravelManager {
  async getCheckpoint<T>(
    agent: CompiledGraph,
    threadId: string,
    checkpointId: string
  ): Promise<StateSnapshot<T> | null> {
    const state = await agent.getState({
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId
      }
    });

    return {
      checkpointId: state.checkpoint_id,
      values: state.values as T,
      next: state.next || []
    };
  }

  async travelTo<T>(
    agent: CompiledGraph,
    threadId: string,
    checkpointId: string,
    modifiedState?: Partial<T>
  ): Promise<T> {
    // Optionally modify state
    if (modifiedState) {
      await agent.updateState(
        {
          configurable: {
            thread_id: threadId,
            checkpoint_id: checkpointId
          }
        },
        modifiedState
      );
    }

    // Resume execution
    const result = await agent.invoke(null, {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId
      }
    });

    return result as T;
  }

  async fork<T>(
    agent: CompiledGraph,
    threadId: string,
    checkpointId: string,
    newInput: { messages: BaseMessage[] }
  ): Promise<{ newThreadId: string; result: T }> {
    // Create new thread for fork
    const newThreadId = `${threadId}-fork-${Date.now()}`;

    // Update state in new thread
    await agent.updateState(
      {
        configurable: {
          thread_id: newThreadId,
          checkpoint_id: checkpointId
        }
      },
      newInput
    );

    // Execute fork
    const result = await agent.invoke(null, {
      configurable: {
        thread_id: newThreadId,
        checkpoint_id: checkpointId
      }
    });

    return {
      newThreadId,
      result: result as T
    };
  }
}
```

## Use Cases

### 1. Understanding Reasoning

```typescript
// Replay to see how agent reached conclusion
const history = await graph.getStateHistory({ configurable: { thread_id } });
for (const checkpoint of history) {
  console.log(`Step ${checkpoint.metadata?.step}:`, checkpoint.values);
}
```

### 2. Debugging Mistakes

```typescript
// Find checkpoint where error occurred
const errorCheckpoint = checkpoints.find(
  cp => cp.metadata?.error
);

// Replay from before error
await graph.stream(null, {
  configurable: {
    thread_id,
    checkpoint_id: errorCheckpoint.parent_checkpoint_id
  }
});
```

### 3. Exploring Alternatives

```typescript
// Fork at decision point
await graph.updateState(
  { configurable: { thread_id, checkpoint_id: decisionPoint } },
  { decision: "alternative_choice" }
);

// Test alternative
await graph.stream(null, {
  configurable: {
    thread_id,
    checkpoint_id: `${decisionPoint}-fork`
  }
});
```

## Replay Optimization

LangGraph optimizes replay:

- **Cached Results**: Previously executed nodes are replayed, not re-executed
- **Efficient**: Only executes nodes after the checkpoint
- **Fast**: Replay is much faster than original execution

## Best Practices

1. **Identify Checkpoints**: Use meaningful checkpoint IDs or metadata
2. **Track History**: Maintain checkpoint history for easy access
3. **Fork Carefully**: Understand state modifications before forking
4. **Test Alternatives**: Use forks to test different approaches
5. **Debug Systematically**: Replay step-by-step to find issues

## References

- [Time-Travel Guide](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel)
- [Time-Travel Concept](https://langchain-ai.github.io/langgraphjs/concepts/time-travel)
- [Persistence Guide](https://docs.langchain.com/oss/javascript/langgraph/persistence)
