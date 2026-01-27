# Context Engineering

## Overview

**Context engineering** is the practice of strategically managing and optimizing the context provided to LLMs. It involves selecting, organizing, and presenting information to maximize agent performance while staying within token limits.

## Key Concepts

### Context Window Management

LLMs have limited context windows (e.g., 128K tokens). Context engineering ensures:

- **Relevant Information**: Only include necessary context
- **Optimal Organization**: Structure context for best comprehension
- **Token Efficiency**: Maximize information density
- **Dynamic Selection**: Choose context based on current needs

### Context Sources

1. **Conversation History**: Previous messages in thread
2. **Retrieved Documents**: Documents from vector search
3. **Long-Term Memory**: User preferences, profiles
4. **File System**: Code files, documentation
5. **Tool Results**: Previous tool execution results

### Context Strategies

1. **Summarization**: Compress old context
2. **Retrieval**: Fetch relevant context on-demand
3. **Filtering**: Remove irrelevant context
4. **Prioritization**: Order context by importance
5. **Truncation**: Cut context to fit limits

## Usage

### Dynamic Context Selection

```typescript
function agentNode(state, config) {
  // Get all available context
  const messages = state.messages;
  const retrievedDocs = state.retrievedDocs || [];
  const contextFiles = state.contextFiles || [];

  // Calculate current token usage
  const currentTokens = countTokens(messages);
  const maxTokens = 100000; // Model context window

  // Select context based on availability
  let contextToUse = messages;

  if (currentTokens > maxTokens * 0.9) {
    // Approaching limit - summarize old messages
    contextToUse = summarizeMessages(messages, {
      keep: { messages: 20 },
      maxTokens: maxTokens * 0.7
    });
  }

  // Add retrieved documents if space allows
  const remainingTokens = maxTokens - countTokens(contextToUse);
  if (remainingTokens > 5000) {
    contextToUse = contextToUse.concat(
      selectRelevantDocs(retrievedDocs, remainingTokens - 1000)
    );
  }

  // Invoke model with optimized context
  return model.invoke(contextToUse);
}
```

### Context Retrieval Pattern

```typescript
import { tool } from "@langchain/core/tools";
import { getStore } from "@langchain/langgraph";

const retrieveContext = tool(
  async (input: { query: string; limit?: number }, config) => {
    const store = getStore(config);

    // Search long-term memory
    const memoryResults = await store.search(
      ["knowledge"],
      {
        query: input.query,
        limit: input.limit || 5
      }
    );

    // Search vector store
    const vectorResults = await vectorStore.similaritySearch(
      input.query,
      input.limit || 5
    );

    // Combine and format
    const context = [
      ...memoryResults.map(r => r.value.content),
      ...vectorResults.map(d => d.pageContent)
    ].join("\n\n");

    return context;
  },
  {
    name: "retrieve_context",
    description: "Retrieve relevant context from memory and documents",
    schema: z.object({
      query: z.string(),
      limit: z.number().optional()
    })
  }
);
```

### Context Injection in Prompts

```typescript
function buildContextAwarePrompt(state, config) {
  const store = getStore(config);

  // Get user profile from long-term memory
  const userProfile = await store.get(["users"], config.context?.userId);

  // Get recent conversation
  const recentMessages = state.messages.slice(-10);

  // Get relevant files
  const relevantFiles = await findRelevantFiles(state.currentTask);

  // Build optimized prompt
  return `
System: You are an AI assistant for ${userProfile?.value?.name || "user"}.

User Preferences:
${JSON.stringify(userProfile?.value?.preferences || {})}

Recent Conversation:
${formatMessages(recentMessages)}

Relevant Files:
${relevantFiles.map(f => `- ${f.path}`).join("\n")}

Current Task: ${state.currentTask}
`;
}
```

## Context Engineering Patterns

### Pattern 1: Hierarchical Context

```typescript
// Priority order: recent > relevant > historical
const context = [
  ...state.messages.slice(-5), // Most recent
  ...retrievedDocs.slice(0, 3), // Most relevant
  ...summarizedHistory // Historical summary
];
```

### Pattern 2: On-Demand Retrieval

```typescript
// Only retrieve context when needed
if (needsMoreContext(state)) {
  const additionalContext = await retrieveContext({
    query: extractQuery(state),
    limit: 5
  });
  state.context = [...state.context, additionalContext];
}
```

### Pattern 3: Context Compression

```typescript
// Compress context to fit
const compressed = await compressContext(state.context, {
  targetTokens: 50000,
  preserveRecent: true,
  preserveImportant: true
});
```

## Best Practices

1. **Measure Token Usage**: Track tokens to prevent overflow
2. **Prioritize Recent**: Recent context is usually more relevant
3. **Retrieve Strategically**: Only fetch what's needed
4. **Summarize Old**: Compress old context, preserve recent
5. **Structure Clearly**: Organize context for LLM comprehension
6. **Cache Results**: Cache expensive context operations
7. **Monitor Quality**: Ensure context quality doesn't degrade

## Tools for Context Engineering

1. **Summarization Middleware**: Automatic summarization
2. **Retrieval Tools**: Vector search, memory search
3. **Token Counters**: Track token usage
4. **Context Filters**: Remove irrelevant content
5. **Context Organizers**: Structure and prioritize

## Use Cases

1. **Long Conversations**: Manage context in extended chats
2. **Multi-Document Tasks**: Handle many files efficiently
3. **User Personalization**: Include user context appropriately
4. **Cost Optimization**: Reduce token usage
5. **Performance**: Faster processing with optimized context

## References

- [Context Summarization](./06_CONTEXT_SUMMARIZATION.md)
- [Short-Term Memory](./05_SHORT_TERM_MEMORY.md)
- [Long-Term Memory](./07_LONG_TERM_MEMORY.md)
- [Memory Management](https://docs.langchain.com/oss/javascript/langgraph/add-memory)
