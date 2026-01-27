# Middleware

## Overview

**Middleware** in LangChain agents allows you to intercept and modify agent execution at various lifecycle points. Middleware can modify state, wrap tool/model calls, add tools, and implement cross-cutting concerns like logging, authentication, and error handling.

## Key Concepts

### Middleware Lifecycle Hooks

Middleware can hook into different phases:

1. **`beforeAgent`**: Before agent execution starts
2. **`beforeModel`**: Before each LLM call
3. **`wrapModelCall`**: Around each LLM call (modify request/response)
4. **`afterModel`**: After each LLM response
5. **`wrapToolCall`**: Around each tool call (modify execution)
6. **`afterAgent`**: After agent execution completes

### Middleware State

Middleware can maintain its own state that persists across invocations:

- **State Schema**: Zod schema for middleware state
- **Context Schema**: Read-only context (not persisted)

## Usage

### Creating Middleware

```typescript
import { createMiddleware } from "langchain";
import { z } from "zod";

const loggingMiddleware = createMiddleware({
  name: "LoggingMiddleware",
  stateSchema: z.object({
    callCount: z.number().default(0)
  }),
  beforeModel: async (state, runtime) => {
    console.log("Before model call:", state.messages.length, "messages");
    return {
      callCount: state.callCount + 1
    };
  },
  afterModel: async (state, runtime) => {
    console.log("After model call:", state.messages.length, "messages");
    return {};
  }
});
```

### Using Middleware

```typescript
import { createAgent } from "langchain";

const agent = createAgent({
  model: "gpt-4o",
  tools: [tool1, tool2],
  middleware: [loggingMiddleware]
});
```

## Common Middleware Patterns

### 1. Logging Middleware

```typescript
const loggingMiddleware = createMiddleware({
  name: "LoggingMiddleware",
  beforeModel: async (state, runtime) => {
    console.log(`[${new Date().toISOString()}] Model call starting`);
    console.log("Messages:", state.messages.length);
    return {};
  },
  afterModel: async (state, runtime) => {
    console.log(`[${new Date().toISOString()}] Model call completed`);
    return {};
  },
  wrapToolCall: async (request, handler) => {
    console.log(`Tool call: ${request.tool.name}`);
    const startTime = Date.now();
    try {
      const result = await handler(request);
      console.log(`Tool ${request.tool.name} completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      console.error(`Tool ${request.tool.name} failed:`, error);
      throw error;
    }
  }
});
```

### 2. Authentication Middleware

```typescript
const authMiddleware = createMiddleware({
  name: "AuthMiddleware",
  contextSchema: z.object({
    userId: z.string(),
    permissions: z.array(z.string())
  }),
  wrapToolCall: async (request, handler) => {
    const userId = request.runtime.context.userId;
    const permissions = request.runtime.context.permissions;

    if (!permissions.includes(`tool:${request.tool.name}`)) {
      return new ToolMessage({
        content: `Unauthorized: You don't have permission to use ${request.tool.name}`,
        tool_call_id: request.toolCall.id
      });
    }

    return handler(request);
  }
});
```

### 3. Caching Middleware

```typescript
const cache = new Map<string, ToolMessage>();

const cachingMiddleware = createMiddleware({
  name: "CachingMiddleware",
  wrapToolCall: async (request, handler) => {
    const cacheKey = `${request.tool.name}:${JSON.stringify(request.toolCall.args)}`;

    if (cache.has(cacheKey)) {
      console.log(`Cache hit: ${cacheKey}`);
      return cache.get(cacheKey)!;
    }

    const result = await handler(request);
    cache.set(cacheKey, result);
    return result;
  }
});
```

### 4. Error Handling Middleware

```typescript
const errorHandlingMiddleware = createMiddleware({
  name: "ErrorHandlingMiddleware",
  wrapToolCall: async (request, handler) => {
    try {
      return await handler(request);
    } catch (error) {
      console.error(`Tool ${request.tool.name} error:`, error);

      // Return error message instead of throwing
      return new ToolMessage({
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        tool_call_id: request.toolCall.id
      });
    }
  },
  wrapModelCall: async (request, handler) => {
    try {
      return await handler(request);
    } catch (error) {
      // Retry with fallback model
      const fallbackRequest = {
        ...request,
        model: "gpt-4o-mini" // Fallback model
      };
      return handler(fallbackRequest);
    }
  }
});
```

### 5. Rate Limiting Middleware

```typescript
const rateLimiter = new Map<string, number[]>();

const rateLimitMiddleware = createMiddleware({
  name: "RateLimitMiddleware",
  wrapModelCall: async (request, handler) => {
    const userId = request.runtime.context?.userId || "default";
    const now = Date.now();
    const window = 60000; // 1 minute
    const maxCalls = 10;

    const calls = rateLimiter.get(userId) || [];
    const recentCalls = calls.filter(time => now - time < window);

    if (recentCalls.length >= maxCalls) {
      throw new Error("Rate limit exceeded");
    }

    recentCalls.push(now);
    rateLimiter.set(userId, recentCalls);

    return handler(request);
  }
});
```

## Built-in Middleware

### Summarization Middleware

```typescript
import { summarizationMiddleware } from "langchain";

const middleware = summarizationMiddleware({
  model: "gpt-4o-mini",
  trigger: { tokens: 4000 },
  keep: { messages: 20 }
});
```

### Human-in-the-Loop Middleware

```typescript
import { humanInTheLoopMiddleware } from "langchain";

const middleware = humanInTheLoopMiddleware({
  interruptOn: {
    sendEmail: {
      allowedDecisions: ["approve", "edit", "reject"]
    }
  }
});
```

### PII Redaction Middleware

```typescript
import { piiRedactionMiddleware } from "langchain";

const middleware = piiRedactionMiddleware({
  patterns: ["email", "phone", "ssn"]
});
```

## Middleware State Management

```typescript
const statefulMiddleware = createMiddleware({
  name: "StatefulMiddleware",
  stateSchema: z.object({
    requestCount: z.number().default(0),
    totalTokens: z.number().default(0)
  }),
  beforeAgent: async (state, runtime) => {
    return {
      requestCount: state.requestCount + 1
    };
  },
  afterModel: async (state, runtime) => {
    const tokens = estimateTokens(state.messages);
    return {
      totalTokens: state.totalTokens + tokens
    };
  }
});
```

## Middleware Context

```typescript
const contextAwareMiddleware = createMiddleware({
  name: "ContextAwareMiddleware",
  contextSchema: z.object({
    userId: z.string(),
    userLevel: z.enum(["beginner", "expert"])
  }),
  wrapModelCall: async (request, handler) => {
    const userLevel = request.runtime.context.userLevel;

    // Adjust system prompt based on user level
    const systemPrompt = userLevel === "expert"
      ? "You are an expert assistant."
      : "You are a beginner-friendly assistant.";

    const modifiedRequest = {
      ...request,
      systemPrompt
    };

    return handler(modifiedRequest);
  }
});

// Use with context
await agent.invoke(input, {
  context: {
    userId: "user123",
    userLevel: "expert"
  }
});
```

## Best Practices

1. **Single Responsibility**: Each middleware should handle one concern
2. **Order Matters**: Middleware executes in order - place important ones first
3. **Error Handling**: Don't let middleware errors break agent execution
4. **Performance**: Keep middleware lightweight
5. **State Management**: Use middleware state for cross-invocation data
6. **Context Usage**: Use context for request-specific data

## References

- [LangChain Middleware Guide](https://docs.langchain.com/oss/javascript/langchain/middleware)
- [Built-in Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in)
- [createMiddleware Reference](https://reference.langchain.com/javascript/langchain/functions/createMiddleware)
