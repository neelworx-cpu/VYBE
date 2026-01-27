# Checkpoint

## Overview

A **checkpoint** is a snapshot of the graph state at a given point in time. Checkpoints are automatically saved at every superstep when using a checkpointer, enabling powerful features like resuming execution, time-travel, and human-in-the-loop.

## Key Concepts

### Checkpoint Structure

A checkpoint contains:

- `v`: Version number
- `ts`: Timestamp
- `id`: Unique checkpoint identifier
- `channel_values`: Current state values for each channel
- `channel_versions`: Version numbers for each channel
- `versions_seen`: Tracking of which versions have been seen
- `pending_sends`: Messages waiting to be sent

### Checkpoint Tuple

A checkpoint tuple includes:

- `checkpoint`: The checkpoint data
- `config`: Configuration (thread_id, checkpoint_id)
- `metadata`: Additional metadata
- `writes`: Pending writes

### Automatic Checkpointing

When a graph is compiled with a checkpointer, LangGraph automatically:

1. Saves state after each superstep
2. Tracks which nodes have been executed
3. Enables resuming from any checkpoint
4. Supports replaying without re-execution

## Usage

### Getting Current State

```typescript
const state = await graph.getState({
  configurable: { thread_id: "thread-1" }
});

console.log(state.values); // Current state values
console.log(state.next); // Next nodes to execute
```

### Getting State History

```typescript
const history = [];
for await (const checkpoint of graph.getStateHistory({
  configurable: { thread_id: "thread-1" }
})) {
  history.push(checkpoint);
}
```

### Resuming from Checkpoint

```typescript
// Resume from specific checkpoint
await graph.invoke(
  null, // No new input - resume from checkpoint
  {
    configurable: {
      thread_id: "thread-1",
      checkpoint_id: "checkpoint-xyz"
    }
  }
);
```

### Updating State

```typescript
// Update state at current checkpoint
await graph.updateState(
  { configurable: { thread_id: "thread-1" } },
  { messages: [new HumanMessage("Updated")] }
);

// Fork from specific checkpoint
await graph.updateState(
  {
    configurable: {
      thread_id: "thread-1",
      checkpoint_id: "checkpoint-xyz"
    }
  },
  { messages: [new HumanMessage("Forked")] }
);
```

## Replay Optimization

LangGraph knows which checkpoints have been executed previously. When replaying:

- **Before checkpoint_id**: Replays without re-execution (uses cached results)
- **After checkpoint_id**: Executes normally (creates new fork)

This optimization makes time-travel efficient even for long execution histories.

## Use Cases

1. **Resume from Failure**: Resume execution after a crash or error
2. **Human-in-the-Loop**: Pause for human approval, resume after decision
3. **Time-Travel**: Replay or fork from past checkpoints
4. **Debugging**: Inspect state at any point in execution
5. **State Inspection**: View current state without modifying it

## References

- [LangGraph Persistence Guide](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Time-Travel Guide](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel)
