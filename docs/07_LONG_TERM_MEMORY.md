# Long-Term Memory

## Overview

**Long-term memory** stores user-specific or application-level data across conversations and is shared across conversational threads. Unlike short-term memory (thread-scoped), long-term memory persists across all threads and sessions.

## Key Concepts

### Cross-Thread Persistence

Long-term memory:

- **Shared Across Threads**: Accessible from any thread
- **Persistent**: Survives thread deletion
- **Namespaced**: Organized by custom namespaces (e.g., `["users"]`, `["preferences"]`)
- **Key-Value Storage**: Store and retrieve by namespace + key

### BaseStore Interface

Long-term memory uses LangGraph's `BaseStore` interface:

- **Hierarchical Namespaces**: Organize data (e.g., `["users", "preferences"]`)
- **Key-Value Storage**: Store data with metadata
- **Vector Search**: Optional similarity search support
- **Filtering**: Query with metadata filters

### Store Implementations

1. **InMemoryStore**: In-memory (for testing)
2. **RedisStore**: Redis backend (production)
3. **PostgresStore**: PostgreSQL backend (production)
4. **Custom Stores**: Implement `BaseStore` for custom backends

## Usage

### Basic Long-Term Memory

```typescript
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import { getStore } from "@langchain/langgraph";

const store = new InMemoryStore();

// Store user preference
await store.put(
  ["users"], // namespace
  "user_123", // key
  {
    name: "John Smith",
    language: "English",
    preferences: { theme: "dark" }
  }
);

// Retrieve user preference
const user = await store.get(["users"], "user_123");
console.log(user?.value); // { name: "John Smith", ... }
```

### Using Store in Agent

```typescript
import { tool } from "@langchain/core/tools";
import { getStore } from "@langchain/langgraph";

const getUserInfo = tool(
  async (input: { userId: string }, config) => {
    const store = getStore(config);
    const user = await store.get(["users"], input.userId);

    if (!user) {
      return "User not found";
    }

    return JSON.stringify(user.value);
  },
  {
    name: "get_user_info",
    description: "Get user information from long-term memory",
    schema: z.object({
      userId: z.string().describe("User ID")
    })
  }
);
```

### Storing in Agent Tools

```typescript
const saveUserPreference = tool(
  async (input: { userId: string; preference: string; value: any }, config) => {
    const store = getStore(config);

    // Get existing user data
    const existing = await store.get(["users"], input.userId);
    const userData = existing?.value || {};

    // Update preference
    userData.preferences = userData.preferences || {};
    userData.preferences[input.preference] = input.value;

    // Save back
    await store.put(["users"], input.userId, userData);

    return `Preference ${input.preference} saved`;
  },
  {
    name: "save_user_preference",
    schema: z.object({
      userId: z.string(),
      preference: z.string(),
      value: z.any()
    })
  }
);
```

### Cross-Thread Access

```typescript
// Thread 1: Save to long-term memory
await agent.invoke(
  { messages: [new HumanMessage("My favorite color is blue")] },
  { configurable: { thread_id: "thread-1" } }
);

// Thread 2: Read from long-term memory (different conversation!)
await agent.invoke(
  { messages: [new HumanMessage("What's my favorite color?")] },
  { configurable: { thread_id: "thread-2" } }
);
// Agent can access: favorite color = blue
```

## Store Operations

### Put (Store)

```typescript
await store.put(
  ["users", "preferences"], // namespace
  "user_123", // key
  { theme: "dark", language: "en" }, // value
  { metadata: { updated: Date.now() } } // optional metadata
);
```

### Get (Retrieve)

```typescript
const item = await store.get(["users"], "user_123");
console.log(item?.value); // stored value
console.log(item?.metadata); // stored metadata
```

### Search (Query)

```typescript
// Search with filters
const results = await store.search(
  ["users"],
  {
    filter: { language: "English" },
    limit: 10
  }
);

// Vector similarity search
const results = await store.search(
  ["documents"],
  {
    query: "technical documentation",
    limit: 20
  }
);
```

### Batch Operations

```typescript
const operations = [
  { type: "get", namespace: ["users"], key: "user_123" },
  { type: "put", namespace: ["users"], key: "user_456", value: {...} },
  { type: "search", namespace: ["users"], options: {...} }
];

const results = await store.batch(operations);
```

## Use Cases

1. **User Profiles**: Store user information, preferences, settings
2. **Application State**: Global application configuration
3. **Knowledge Base**: Persistent knowledge across sessions
4. **Preferences**: User preferences that persist
5. **Historical Data**: Long-term conversation analytics

## Comparison with Short-Term Memory

| Aspect | Short-Term Memory | Long-Term Memory |
|--------|------------------|------------------|
| Scope | Single thread | All threads |
| Storage | Graph state (checkpoint) | BaseStore |
| Lifetime | Session duration | Persistent |
| Use Case | Conversation history | User data, preferences |
| Access | Automatic in state | Via `getStore(config)` |

## Best Practices

1. **Namespacing**: Use clear, hierarchical namespaces
2. **Key Design**: Use consistent, predictable keys
3. **Metadata**: Store metadata for filtering/searching
4. **Error Handling**: Handle missing keys gracefully
5. **Performance**: Use batch operations when possible

## References

- [LangGraph Memory Guide](https://docs.langchain.com/oss/javascript/langgraph/add-memory)
- [Cross-Thread Persistence](https://docs.langchain.com/oss/javascript/langgraph/how-tos/cross-thread-persistence)
- [BaseStore Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/checkpoint.BaseStore.html)
