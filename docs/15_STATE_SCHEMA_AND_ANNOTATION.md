# State Schema & Annotation

## Overview

**State Schema** and **Annotation** are the two ways to define graph state in LangGraph. They specify the structure of state, how updates are applied (via reducers), and default values.

## Key Concepts

### State Definition

State is the shared data structure that all nodes in a graph can read from and write to. Each key in the state is called a **channel**.

### Reducers

**Reducers** are functions that determine how updates to a channel are applied:

- **Default (Override)**: New value replaces old value
- **Custom Reducer**: Function that combines current state with update

### Default Values

Each channel can have a default value that's used when the state is first initialized.

## Two Approaches

### 1. Annotation (Declarative)

```typescript
import { Annotation, StateGraph } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => []
  }),
  count: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0
  }),
  currentStep: Annotation<string>() // No reducer = override
});

// Extract types
type State = typeof StateAnnotation.State;
type Update = typeof StateAnnotation.Update;

const graph = new StateGraph(StateAnnotation);
```

### 2. StateSchema (Schema-Based)

```typescript
import { StateSchema, ReducedValue } from "@langchain/langgraph";
import { z } from "zod";

const State = new StateSchema({
  messages: z.array(z.any()), // Uses default reducer (override)
  count: new ReducedValue(
    z.number().default(0),
    {
      inputSchema: z.number(),
      reducer: (current, update) => current + update
    }
  ),
  currentStep: z.string()
});

// Extract types
type State = typeof State.State;
type Update = typeof State.Update;

const graph = new StateGraph(State);
```

## Reducer Patterns

### Override (Default)

```typescript
// No reducer specified - new value replaces old
const State = Annotation.Root({
  currentStep: Annotation<string>()
});

// Node returns: { currentStep: "step2" }
// State becomes: { currentStep: "step2" } (replaces "step1")
```

### Append (Array)

```typescript
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => []
  })
});

// Node returns: { messages: [newMessage] }
// State becomes: { messages: [...oldMessages, newMessage] }
```

### Accumulate (Number)

```typescript
const State = Annotation.Root({
  count: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0
  })
});

// Node returns: { count: 5 }
// State becomes: { count: oldCount + 5 }
```

### Merge (Object)

```typescript
const State = Annotation.Root({
  metadata: Annotation<Record<string, any>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({})
  })
});

// Node returns: { metadata: { key: "value" } }
// State becomes: { metadata: { ...oldMetadata, key: "value" } }
```

## Built-in Reducers

### Messages Reducer

```typescript
import { messagesStateReducer } from "@langchain/langgraph";

const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  })
});
```

## Usage in Nodes

### Reading State

```typescript
function myNode(state: typeof StateAnnotation.State) {
  const messages = state.messages;
  const count = state.count;

  // Use state values
  return { count: count + 1 };
}
```

### Updating State

```typescript
function myNode(state: typeof StateAnnotation.State) {
  // Return partial update
  return {
    messages: [new AIMessage("Response")],
    count: state.count + 1
  };

  // Reducers automatically apply updates
}
```

## Input/Output Schemas

You can define separate input and output schemas:

```typescript
const InternalState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  internalData: Annotation<string>() // Not exposed
});

const InputState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
  // internalData not included
});

const OutputState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
  // Only messages exposed
});

const graph = new StateGraph(InternalState, {
  input: InputState,
  output: OutputState
});
```

## Best Practices

1. **Use Reducers for Accumulation**: Arrays, counters, objects that merge
2. **Use Override for Single Values**: Current step, status, flags
3. **Provide Defaults**: Always provide defaults for reducer channels
4. **Type Safety**: Use TypeScript types from Annotation/StateSchema
5. **Consistent Patterns**: Use same reducer pattern across similar channels

## References

- [LangGraph State Guide](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#state)
- [Annotation Reference](https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph.Annotation.html)
- [StateSchema Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateSchema.html)
- [Reducers Guide](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#process-state-updates-with-reducers)
