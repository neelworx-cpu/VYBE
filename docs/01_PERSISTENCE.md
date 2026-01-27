# Persistence

## Overview

Persistence is the foundation of LangGraph's state management system. It enables agents to maintain state across invocations, resume from failures, and support features like human-in-the-loop, time-travel, and memory.

## Key Concepts

### Threads

A **thread** is a unique ID assigned to a series of checkpoints. Threads enable checkpointing of multiple different runs, making them essential for multi-tenant chat applications.

- `thread_id`: Always required - identifies the conversation/execution thread
- `checkpoint_id`: Optional - refers to a specific checkpoint within a thread

```typescript
const config = {
  configurable: {
    thread_id: "user-123-conversation-1",
    checkpoint_id: "optional-specific-checkpoint"
  }
};
```

### Checkpointers

Checkpointers are implementations of `BaseCheckpointSaver` that persist graph state. LangGraph provides several implementations:

1. **MemorySaver** (`@langchain/langgraph-checkpoint`)
   - In-memory storage for experimentation
   - Included with LangGraph
   - Not suitable for production

2. **SqliteSaver** (`@langchain/langgraph-checkpoint-sqlite`)
   - SQLite database backend
   - Ideal for local workflows and testing
   - Needs to be installed separately

3. **PostgresSaver** (`@langchain/langgraph-checkpoint-postgres`)
   - PostgreSQL database backend
   - Production-ready, used by LangGraph Cloud
   - Needs to be installed separately

4. **MongoDBSaver** (`@langchain/langgraph-checkpoint-mongodb`)
   - MongoDB database backend
   - Production-ready
   - Needs to be installed separately

5. **RedisSaver** (`@langchain/langgraph-checkpoint-redis`)
   - Redis database backend
   - Production-ready
   - Needs to be installed separately

### BaseCheckpointSaver Interface

All checkpointers implement:

- `.put()` - Store a checkpoint with configuration and metadata
- `.putWrites()` - Store intermediate writes linked to a checkpoint (pending writes)
- `.getTuple()` - Fetch a checkpoint tuple for a given configuration
- `.list()` - List checkpoints matching configuration and filter criteria
- `.deleteThread()` - Delete all checkpoints for a thread

## Usage

```typescript
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { StateGraph } from "@langchain/langgraph";

// Create checkpointer
const checkpointer = new MemorySaver();

// Compile graph with checkpointer
const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .compile({ checkpointer });

// Invoke with thread_id
await graph.invoke(
  { messages: [new HumanMessage("Hello")] },
  { configurable: { thread_id: "thread-1" } }
);

// Resume from same thread
await graph.invoke(
  { messages: [new HumanMessage("Continue")] },
  { configurable: { thread_id: "thread-1" } }
);
```

## Pending Writes

When a graph node fails mid-execution, LangGraph stores pending checkpoint writes from any other nodes that completed successfully at that superstep. This ensures that when resuming from that superstep, successful nodes aren't re-executed.

## References

- [LangGraph Persistence Docs](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [BaseCheckpointSaver Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/checkpoint.BaseCheckpointSaver.html)
- [MemorySaver Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/checkpoint.MemorySaver.html)
