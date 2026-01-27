# Command

## Overview

**Command** is a LangGraph object that combines state updates with control flow in a single return value. Instead of returning state updates from a node and using conditional edges separately, `Command` allows you to update state AND route to a node in one operation.

## Key Concepts

### Command Properties

A `Command` can have:

- **`update`**: State updates to apply
- **`goto`**: Node name(s) to route to
- **`resume`**: Value to return from `interrupt()` call
- **`graph`**: Which graph level (current or parent)

### Use Cases

1. **State + Routing**: Update state and route in one operation
2. **Interrupt Resume**: Resume from interrupt with value
3. **Handoffs**: Transfer control between agents
4. **Dynamic Routing**: Route based on computed state

## Usage

### Basic Command (State + Routing)

```typescript
import { Command } from "@langchain/langgraph";

function myNode(state: State) {
  // Update state AND route to next node
  return new Command({
    update: {
      step: "completed",
      result: computeResult(state)
    },
    goto: "next_node"
  });
}

const graph = new StateGraph(StateAnnotation)
  .addNode("myNode", myNode)
  .addNode("next_node", nextNode)
  .addEdge(START, "myNode");
  // No conditional edge needed - Command handles routing
```

### Command with Interrupt Resume

```typescript
function toolNode(state: State, config: LangGraphRunnableConfig) {
  const result = await tool.invoke(args);

  if (result.deferred) {
    // Interrupt and wait for resume
    const resumeValue = interrupt({
      toolCallId: toolCall.id,
      type: "awaiting_completion"
    });

    // resumeValue comes from Command.resume()
    return {
      messages: [new ToolMessage({
        content: resumeValue,
        tool_call_id: toolCall.id
      })]
    };
  }

  return { messages: [new ToolMessage({ content: result.message })] };
}

// Later, resume with Command
await graph.stream(
  new Command({
    resume: "File edited successfully. The file system has confirmed the write operation."
  }),
  { configurable: { thread_id } }
);
```

### Command for Handoffs

```typescript
function agentNode(state: State) {
  const nextAgent = determineNextAgent(state);

  return new Command({
    goto: nextAgent,
    graph: Command.PARENT, // Navigate to parent graph
    update: {
      messages: state.messages,
      activeAgent: nextAgent
    }
  });
}
```

### Command with Multiple Nodes

```typescript
function routeNode(state: State) {
  const routes: string[] = [];

  if (state.needsAnalysis) {
    routes.push("analyze");
  }
  if (state.needsResearch) {
    routes.push("research");
  }

  return new Command({
    update: { routed: true },
    goto: routes.length > 0 ? routes : END
  });
}
```

## Command vs Conditional Edges

### Using Conditional Edges

```typescript
function myNode(state: State) {
  return { step: "completed" };
}

function routeNode(state: State) {
  return state.step === "completed" ? "next" : END;
}

graph
  .addNode("myNode", myNode)
  .addConditionalEdges("myNode", routeNode);
```

### Using Command (More Concise)

```typescript
function myNode(state: State) {
  return new Command({
    update: { step: "completed" },
    goto: "next"
  });
}

graph.addNode("myNode", myNode);
// No conditional edge needed
```

## Advanced Patterns

### Command with Parent Graph Navigation

```typescript
// Inside a subgraph node
function subgraphNode(state: State) {
  return new Command({
    goto: "parent_agent",
    graph: Command.PARENT, // Navigate to parent graph
    update: { result: state.result }
  });
}
```

### Command for Dynamic State Updates

```typescript
function dynamicNode(state: State) {
  const updates = computeUpdates(state);
  const nextNode = determineNextNode(state);

  return new Command({
    update: updates,
    goto: nextNode
  });
}
```

## Best Practices

1. **Use for Combined Operations**: When you need state + routing together
2. **Prefer Commands**: More concise than separate state + conditional edges
3. **Type Safety**: Use TypeScript to ensure correct node names
4. **Documentation**: Document complex routing logic
5. **Error Handling**: Handle invalid `goto` targets gracefully

## References

- [LangGraph Command Guide](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#combine-control-flow-and-state-updates-with-command)
- [Command Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.Command.html)
- [Interrupts Guide](./04_INTERRUPTS.md)
