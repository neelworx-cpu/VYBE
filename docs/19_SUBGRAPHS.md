# Subgraphs

## Overview

**Subgraphs** are graphs that are used as nodes in another (parent) graph. They enable modular graph composition, multi-agent systems, code reuse, and distributed development.

## Key Concepts

### Graph Composition

- **Parent Graph**: The main graph that contains subgraphs
- **Subgraph**: A graph used as a node in the parent
- **State Sharing**: Subgraphs can share state with parent or have isolated state
- **Checkpoint Propagation**: Checkpointers automatically propagate to subgraphs

### Communication Patterns

1. **Invoke from Node**: Call subgraph from inside a parent node
2. **Add as Node**: Add subgraph directly as a node (shares state)

## Usage

### Pattern 1: Invoke Subgraph from Node

```typescript
import { StateGraph, MemorySaver } from "@langchain/langgraph";

// Create subgraph
const subgraphState = Annotation.Root({
  task: Annotation<string>(),
  result: Annotation<string>()
});

const subgraph = new StateGraph(subgraphState)
  .addNode("execute", async (state) => {
    const result = await processTask(state.task);
    return { result };
  })
  .addEdge(START, "execute")
  .compile({ checkpointer: new MemorySaver() });

// Use subgraph in parent node
function parentNode(state: ParentState, config: LangGraphRunnableConfig) {
  const task = extractTask(state);

  // Invoke subgraph
  const subgraphResult = await subgraph.invoke(
    { task },
    { configurable: { thread_id: `sub-${config.configurable.thread_id}` } }
  );

  return {
    result: subgraphResult.result
  };
}

const parentGraph = new StateGraph(ParentState)
  .addNode("parent", parentNode)
  .compile({ checkpointer: new MemorySaver() });
```

### Pattern 2: Add Subgraph as Node

```typescript
// Create subgraph
const subgraph = new StateGraph(SharedState)
  .addNode("process", processNode)
  .addEdge(START, "process")
  .compile();

// Add subgraph as node in parent
const parentGraph = new StateGraph(SharedState)
  .addNode("subgraph", subgraph) // Subgraph as node
  .addNode("parent_node", parentNode)
  .addEdge(START, "subgraph")
  .addEdge("subgraph", "parent_node")
  .compile({ checkpointer: new MemorySaver() });
```

### Pattern 3: Subgraph with Isolated State

```typescript
// Subgraph with its own state
const SubgraphState = Annotation.Root({
  input: Annotation<string>(),
  output: Annotation<string>()
});

const subgraph = new StateGraph(SubgraphState)
  .addNode("process", (state) => {
    return { output: process(state.input) };
  })
  .addEdge(START, "process")
  .compile();

// Parent with different state
const ParentState = Annotation.Root({
  task: Annotation<string>(),
  result: Annotation<string>()
});

function parentNode(state: ParentState, config: LangGraphRunnableConfig) {
  // Invoke subgraph with its own state
  const subResult = await subgraph.invoke(
    { input: state.task },
    config
  );

  // Map subgraph result to parent state
  return { result: subResult.output };
}
```

## Checkpoint Propagation

When you compile the parent graph with a checkpointer, it automatically propagates to subgraphs:

```typescript
const checkpointer = new MemorySaver();

// Subgraph doesn't need checkpointer
const subgraph = new StateGraph(State)
  .addNode("node", nodeFunction)
  .compile(); // No checkpointer here

// Parent has checkpointer - propagates to subgraph
const parent = new StateGraph(State)
  .addNode("subgraph", subgraph)
  .compile({ checkpointer }); // Subgraph gets checkpointer automatically
```

## Use Cases

### 1. Multi-Agent Systems

```typescript
// Agent A subgraph
const agentA = new StateGraph(State)
  .addNode("agent", agentANode)
  .compile();

// Agent B subgraph
const agentB = new StateGraph(State)
  .addNode("agent", agentBNode)
  .compile();

// Supervisor graph
const supervisor = new StateGraph(State)
  .addNode("agent_a", agentA)
  .addNode("agent_b", agentB)
  .addConditionalEdges(START, routeToAgent)
  .compile({ checkpointer });
```

### 2. Code Reuse

```typescript
// Reusable processing subgraph
const processSubgraph = new StateGraph(State)
  .addNode("validate", validateNode)
  .addNode("process", processNode)
  .addNode("format", formatNode)
  .addEdge(START, "validate")
  .addEdge("validate", "process")
  .addEdge("process", "format")
  .compile();

// Use in multiple parent graphs
const graph1 = new StateGraph(State)
  .addNode("preprocess", preprocessNode)
  .addNode("process", processSubgraph) // Reuse
  .addEdge(START, "preprocess")
  .addEdge("preprocess", "process")
  .compile();
```

### 3. Distributed Development

```typescript
// Team A works on subgraph A
const subgraphA = new StateGraph(StateA)
  .addNode("a1", nodeA1)
  .addNode("a2", nodeA2)
  .compile();

// Team B works on subgraph B
const subgraphB = new StateGraph(StateB)
  .addNode("b1", nodeB1)
  .addNode("b2", nodeB2)
  .compile();

// Integration team composes them
const mainGraph = new StateGraph(MainState)
  .addNode("subgraph_a", subgraphA)
  .addNode("subgraph_b", subgraphB)
  .addEdge(START, "subgraph_a")
  .addEdge("subgraph_a", "subgraph_b")
  .compile();
```

## Best Practices

1. **Clear Interfaces**: Define clear input/output schemas for subgraphs
2. **State Isolation**: Use separate state when subgraph should be isolated
3. **State Sharing**: Share state when subgraph needs parent context
4. **Checkpointing**: Let parent handle checkpointing (auto-propagates)
5. **Documentation**: Document subgraph contracts and dependencies

## References

- [LangGraph Subgraphs Guide](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)
- [Graph Composition](https://docs.langchain.com/oss/javascript/langgraph/concepts/low_level#subgraphs)
