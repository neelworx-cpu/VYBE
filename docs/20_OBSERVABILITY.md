# Observability

## Overview

**Observability** in LangGraph/LangChain refers to the ability to monitor, debug, and analyze agent execution. This includes tracing, logging, metrics, and visualization of agent behavior.

## Key Concepts

### Traces

A **trace** records the complete sequence of steps from input to output:

- **Runs**: Individual operations (LLM calls, tool executions, node executions)
- **Projects**: Groups of traces for organization
- **Threads**: Links traces from multi-turn conversations

### LangSmith Integration

LangSmith is the primary observability platform for LangChain/LangGraph:

- **Automatic Tracing**: Built into `createAgent`
- **Visualization**: UI for viewing traces
- **Debugging**: Inspect execution steps
- **Evaluation**: Test agent performance
- **Monitoring**: Track metrics and alerts

## Usage

### Enabling Tracing

```typescript
import { createAgent } from "langchain";

// Tracing is automatic with createAgent
const agent = createAgent({
  model: "gpt-4o",
  tools: [tool1, tool2]
});

// Set environment variables for LangSmith
process.env.LANGSMITH_API_KEY = "your-api-key";
process.env.LANGSMITH_PROJECT = "my-project";

// Traces are automatically sent to LangSmith
await agent.invoke({
  messages: [new HumanMessage("Hello")]
});
```

### Custom Tracing

```typescript
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({
  apiUrl: "https://api.langsmith.com"
});

// Create run with custom metadata
const run = await client.runs.create({
  name: "my-agent-run",
  runType: "chain",
  inputs: { messages: [...] },
  projectName: "my-project"
});

// Update run with results
await client.runs.update(run.id, {
  outputs: { result: "..." },
  endTime: Date.now()
});
```

### Viewing Traces

Traces can be viewed:

1. **LangSmith UI**: Web interface at langsmith.com
2. **LangSmith API**: Programmatic access
3. **LangGraph Studio**: Visual graph debugging

### Logging

```typescript
import { createAgent } from "langchain";

const agent = createAgent({
  model: "gpt-4o",
  tools: [tool1, tool2],
  // Logging happens automatically via LangSmith
});

// Custom logging in tools
const myTool = tool(
  async (input, config) => {
    console.log(`[Tool] Executing: ${input}`);
    const result = await execute(input);
    console.log(`[Tool] Result: ${result}`);
    return result;
  },
  { name: "my_tool" }
);
```

### Metrics

LangSmith automatically tracks:

- **Latency**: Execution time for each step
- **Token Usage**: Tokens consumed by LLM calls
- **Cost**: Estimated cost based on model pricing
- **Error Rate**: Frequency of errors
- **Tool Usage**: Which tools are called and how often

### Monitoring

```typescript
// Set up monitoring in LangSmith
// 1. Create dashboards
// 2. Set up alerts
// 3. Track key metrics
// 4. Monitor error rates
```

## Observability Patterns

### Pattern 1: Debug Mode

```typescript
// Enable debug streaming
for await (const event of await graph.stream(
  input,
  { streamMode: "debug" }
)) {
  console.log("Debug event:", event);
}
```

### Pattern 2: Custom Logging Middleware

```typescript
const loggingMiddleware = createMiddleware({
  name: "LoggingMiddleware",
  beforeModel: async (state, runtime) => {
    console.log("Model call:", {
      messages: state.messages.length,
      timestamp: new Date().toISOString()
    });
    return {};
  },
  wrapToolCall: async (request, handler) => {
    const startTime = Date.now();
    const result = await handler(request);
    const duration = Date.now() - startTime;

    console.log("Tool call:", {
      tool: request.tool.name,
      duration,
      success: true
    });

    return result;
  }
});
```

### Pattern 3: Performance Monitoring

```typescript
const performanceMiddleware = createMiddleware({
  name: "PerformanceMiddleware",
  stateSchema: z.object({
    totalLatency: z.number().default(0),
    callCount: z.number().default(0)
  }),
  wrapModelCall: async (request, handler) => {
    const startTime = Date.now();
    const result = await handler(request);
    const latency = Date.now() - startTime;

    return {
      totalLatency: state.totalLatency + latency,
      callCount: state.callCount + 1
    };
  },
  afterAgent: async (state, runtime) => {
    const avgLatency = state.totalLatency / state.callCount;
    console.log(`Average latency: ${avgLatency}ms`);
    return {};
  }
});
```

## LangSmith Features

### 1. Trace Visualization

- View complete execution flow
- Inspect each step in detail
- See inputs/outputs for each operation
- Identify bottlenecks

### 2. Debugging

- Step through execution
- Inspect state at each checkpoint
- Compare different runs
- Identify errors and failures

### 3. Evaluation

- Test agent on datasets
- Compare different prompts/models
- Measure performance metrics
- A/B testing

### 4. Monitoring

- Real-time dashboards
- Alerts for errors/slowdowns
- Usage analytics
- Cost tracking

## Best Practices

1. **Enable Tracing**: Always enable LangSmith tracing in production
2. **Use Projects**: Organize traces by project/feature
3. **Add Metadata**: Include useful metadata in traces
4. **Monitor Key Metrics**: Track latency, errors, costs
5. **Set Alerts**: Get notified of issues
6. **Regular Review**: Review traces to improve agent

## References

- [LangSmith Observability](https://docs.langchain.com/langsmith/observability)
- [LangGraph Observability](https://docs.langchain.com/oss/javascript/langgraph/observability)
- [Tracing Quickstart](https://docs.langchain.com/langsmith/observability-quickstart)
