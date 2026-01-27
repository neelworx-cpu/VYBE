# Conditional Edges

## Overview

**Conditional edges** allow you to route execution to different nodes based on the current state. Unlike fixed edges that always go to the same node, conditional edges use routing functions to dynamically decide the next node(s) to execute.

## Key Concepts

### Routing Function

A routing function:
- Takes current state as input
- Returns node name(s) or `END`
- Can return single node, array of nodes, or `Send` objects
- Can be async

### Routing Patterns

1. **Single Node**: Route to one node
2. **Multiple Nodes**: Route to multiple nodes (parallel execution)
3. **Conditional Mapping**: Map return values to node names
4. **Send Objects**: Dynamic routing with custom state

## Usage

### Basic Conditional Edge

```typescript
import { StateGraph, END } from "@langchain/langgraph";

function shouldContinue(state: State) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools"; // Route to tools node
  }

  return END; // End execution
}

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");
```

### Conditional Edge with Mapping

```typescript
function routeAgent(state: State) {
  if (state.done) {
    return "end";
  }
  if (state.needsTools) {
    return "tools";
  }
  return "continue";
}

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("continue", continueNode)
  .addConditionalEdges("agent", routeAgent, {
    end: END,
    tools: "tools",
    continue: "continue"
  });
```

### Multiple Node Routing

```typescript
function routeToMultiple(state: State) {
  const routes: string[] = [];

  if (state.needsAnalysis) {
    routes.push("analyze");
  }
  if (state.needsResearch) {
    routes.push("research");
  }

  return routes.length > 0 ? routes : END;
}

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("analyze", analyzeNode)
  .addNode("research", researchNode)
  .addConditionalEdges("agent", routeToMultiple);
```

### Using Send for Dynamic Routing

```typescript
import { Send } from "@langchain/langgraph";

function routeToSubjects(state: State) {
  // Route to multiple nodes with different state
  return state.subjects.map(
    (subject) => new Send("process_subject", { subject })
  );
}

const graph = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("process_subject", processSubjectNode)
  .addConditionalEdges("agent", routeToSubjects);
```

## Common Patterns

### Pattern 1: Tool Calling Router

```typescript
import { toolsCondition } from "@langchain/langgraph/prebuilt";

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addConditionalEdges("agent", toolsCondition, ["tools", END])
  .addEdge("tools", "agent");
```

### Pattern 2: State-Based Router

```typescript
function routeByState(state: State) {
  if (state.step === "initial") {
    return "initialize";
  } else if (state.step === "processing") {
    return "process";
  } else if (state.step === "complete") {
    return END;
  }
  return "default";
}
```

### Pattern 3: Error Handling Router

```typescript
function routeWithErrorHandling(state: State) {
  if (state.error) {
    return "error_handler";
  }
  if (state.retryCount > 3) {
    return "fallback";
  }
  return "normal";
}
```

### Pattern 4: Conditional Entry Point

```typescript
function routeFromStart(state: State) {
  if (state.type === "quick") {
    return "quick_path";
  }
  return "full_path";
}

const graph = new StateGraph(StateAnnotation)
  .addNode("quick_path", quickPathNode)
  .addNode("full_path", fullPathNode)
  .addConditionalEdges(START, routeFromStart);
```

## Typed Conditional Edges

```typescript
import { ConditionalEdgeRouter } from "@langchain/langgraph";

const router: ConditionalEdgeRouter<
  typeof StateAnnotation,
  "tools" | "end"
> = (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  return lastMessage.tool_calls?.length ? "tools" : "end";
};

graph.addConditionalEdges("agent", router);
```

## Best Practices

1. **Clear Logic**: Keep routing functions simple and readable
2. **Type Safety**: Use `ConditionalEdgeRouter` for type safety
3. **Default Cases**: Always handle unexpected states
4. **Error Handling**: Route errors to error handling nodes
5. **Documentation**: Document routing logic for complex cases

## References

- [LangGraph Conditional Edges](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#conditional-edges)
- [ConditionalEdgeRouter Reference](https://langchain-ai.github.io/langgraphjs/reference/types/langgraph.ConditionalEdgeRouter.html)
- [toolsCondition Reference](https://langchain-ai.github.io/langgraphjs/reference/functions/prebuilt.toolsCondition.html)
