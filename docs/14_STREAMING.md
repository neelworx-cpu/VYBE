# Streaming

## Overview

**Streaming** is a core feature of LangGraph that enables real-time updates during agent execution. It's crucial for building responsive applications by displaying output progressively, even before a complete response is ready.

## Key Concepts

### Streaming Modes

LangGraph supports multiple streaming modes:

1. **`"values"`**: Streams the full state value after each step
2. **`"updates"`**: Streams state updates (deltas) after each step
3. **`"messages"`**: Streams LLM tokens and metadata as they're generated
4. **`"custom"`**: Streams custom data from tools/nodes using `config.writer`
5. **`"debug"`**: Streams detailed execution information

### Multiple Modes

You can stream multiple modes simultaneously:

```typescript
for await (const [streamMode, chunk] of await agent.stream(
  input,
  { streamMode: ["updates", "messages", "custom"] }
)) {
  console.log(`${streamMode}:`, chunk);
}
```

## Usage

### Stream Agent Progress

```typescript
import { createAgent } from "langchain";

const agent = createAgent({
  model: "gpt-4o",
  tools: [tool1, tool2]
});

// Stream updates after each step
for await (const chunk of await agent.stream(
  { messages: [new HumanMessage("Task")] },
  { streamMode: "updates" }
)) {
  console.log(chunk);
  // Output: { agent: {...}, tools: {...}, agent: {...} }
}
```

### Stream LLM Tokens

```typescript
// Stream tokens as they're generated
for await (const [token, metadata] of await agent.stream(
  { messages: [new HumanMessage("Hello")] },
  { streamMode: "messages" }
)) {
  console.log("Token:", token);
  console.log("Metadata:", metadata);
}
```

### Stream Custom Updates from Tools

```typescript
import { tool } from "@langchain/core/tools";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

const getWeather = tool(
  async (input: { city: string }, config: LangGraphRunnableConfig) => {
    // Stream custom updates
    config.writer?.("Looking up weather for " + input.city);
    await delay(1000);
    config.writer?.("Fetching data from API...");
    await delay(1000);
    config.writer?.("Processing results...");

    return `It's sunny in ${input.city}!`;
  },
  {
    name: "get_weather",
    schema: z.object({ city: z.string() })
  }
);

// Stream custom updates
for await (const chunk of await agent.stream(
  { messages: [new HumanMessage("Weather in SF?")] },
  { streamMode: "custom" }
)) {
  console.log(chunk);
  // Output: "Looking up weather for SF"
  // Output: "Fetching data from API..."
  // Output: "Processing results..."
}
```

### Stream State Values

```typescript
// Stream full state after each step
for await (const state of await graph.stream(
  input,
  { streamMode: "values" }
)) {
  console.log("Current state:", state);
}
```

### Stream State Updates

```typescript
// Stream only the changes (deltas)
for await (const update of await graph.stream(
  input,
  { streamMode: "updates" }
)) {
  console.log("State update:", update);
  // Output: { messages: [newAIMessage] }
  // Output: { tools: [toolResult] }
}
```

## Differences: Values vs Updates

**Values Mode**:
- Returns full state after each step
- Includes all state keys
- Useful for: Complete state snapshots

**Updates Mode**:
- Returns only changed state keys
- More efficient for large states
- Useful for: Tracking what changed

## Use Cases

1. **Real-Time UI Updates**: Show progress as agent works
2. **Token Streaming**: Display LLM responses progressively
3. **Progress Indicators**: Show tool execution progress
4. **Debugging**: Inspect execution flow in real-time
5. **User Feedback**: Keep users informed during long operations

## Best Practices

1. **Choose Right Mode**: Use `updates` for efficiency, `values` for completeness
2. **Handle Errors**: Wrap streaming in try-catch
3. **Close Streams**: Ensure streams are properly closed
4. **Buffer Management**: Handle backpressure for high-frequency streams
5. **UI Integration**: Update UI incrementally, not all at once

## References

- [LangGraph Streaming Guide](https://docs.langchain.com/oss/javascript/langgraph/streaming)
- [Agent Streaming](https://docs.langchain.com/oss/javascript/langchain/streaming/overview)
- [Streaming Modes](https://docs.langchain.com/oss/javascript/langgraph/concepts/streaming)
