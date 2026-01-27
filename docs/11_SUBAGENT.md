# Subagent

## Overview

**Subagents** are specialized agents that can be spawned by a main agent to handle specific tasks. They provide context isolation, specialized instructions, and can have their own tools and middleware.

## Key Concepts

### Context Isolation

Subagents operate in isolated contexts:

- **Separate State**: Own state, separate from main agent
- **Specialized Instructions**: Custom system prompts
- **Dedicated Tools**: Tools specific to subagent's task
- **Isolated Memory**: Doesn't pollute main agent's context

### Spawning Pattern

Main agent spawns subagent:

1. **Identify Task**: Determine task requiring subagent
2. **Select Subagent**: Choose appropriate subagent type
3. **Invoke Subagent**: Execute subagent with task
4. **Receive Result**: Get result back from subagent
5. **Continue**: Main agent continues with result

### Subagent Types

Subagents can be:

- **Specialized**: Focused on specific domain (e.g., code review, research)
- **General**: Versatile but with different instructions
- **Nested**: Subagents can spawn their own subagents

## Usage

### Basic Subagent (LangGraph)

```typescript
import { StateGraph, Annotation } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

// Define subagent state
const SubagentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  task: Annotation<string>()
});

// Create subagent graph
const subagentGraph = new StateGraph(SubagentState)
  .addNode("execute", async (state) => {
    const model = getModel();
    const response = await model.invoke([
      { role: "system", content: "You are a code review specialist." },
      { role: "user", content: state.task }
    ]);
    return { messages: [response] };
  })
  .addEdge(START, "execute")
  .compile({ checkpointer: new MemorySaver() });

// Main agent spawns subagent
function mainAgentNode(state, config) {
  const task = extractTask(state);

  if (needsCodeReview(task)) {
    // Spawn subagent
    const result = await subagentGraph.invoke(
      { task, messages: [] },
      { configurable: { thread_id: `subagent-${Date.now()}` } }
    );

    return {
      messages: [
        new AIMessage(`Code review result: ${result.messages[0].content}`)
      ]
    };
  }

  // Continue normal execution
  return normalExecution(state);
}
```

### Deep Agents Subagents

```typescript
import { createDeepAgent, type SubAgent } from "@anthropic/deepagents";

const subagents: SubAgent[] = [
  {
    name: "code_reviewer",
    description: "Specialized agent for reviewing code",
    systemPrompt: "You are an expert code reviewer. Analyze code for bugs, performance issues, and best practices.",
    tools: [readFileTool, analyzeCodeTool],
    model: "gpt-4o"
  },
  {
    name: "researcher",
    description: "Specialized agent for research tasks",
    systemPrompt: "You are a research specialist. Find and synthesize information from multiple sources.",
    tools: [searchTool, summarizeTool],
    model: "gpt-4o"
  }
];

const mainAgent = createDeepAgent({
  model: "gpt-4o",
  tools: [mainTools],
  subagents // Subagents available to main agent
});

// Main agent can now invoke subagents via tool calls
await mainAgent.invoke({
  messages: [new HumanMessage("Review this code: ...")]
});
```

### Subagent Tool Pattern

```typescript
import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";

// Tool that spawns subagent
const spawnSubagentTool = tool(
  async (input: { task: string; subagentType: string }, config) => {
    const subagent = getSubagent(input.subagentType);

    // Invoke subagent
    const result = await subagent.invoke(
      { messages: [new HumanMessage(input.task)] },
      {
        configurable: {
          thread_id: `subagent-${config.configurable.thread_id}-${Date.now()}`
        }
      }
    );

    // Return result as tool message
    return result.messages[0].content;
  },
  {
    name: "spawn_subagent",
    description: "Spawn a specialized subagent to handle a task",
    schema: z.object({
      task: z.string(),
      subagentType: z.enum(["code_reviewer", "researcher", "analyst"])
    })
  }
);
```

## Subagent Patterns

### Pattern 1: Task Delegation

```typescript
// Main agent delegates complex task to subagent
if (taskComplexity > threshold) {
  const subagentResult = await spawnSubagent({
    task: complexTask,
    type: "specialist"
  });
  return subagentResult;
}
```

### Pattern 2: Parallel Subagents

```typescript
// Spawn multiple subagents in parallel
const results = await Promise.all([
  spawnSubagent({ task: task1, type: "type1" }),
  spawnSubagent({ task: task2, type: "type2" }),
  spawnSubagent({ task: task3, type: "type3" })
]);
```

### Pattern 3: Hierarchical Subagents

```typescript
// Subagent spawns its own subagent
const subagent1 = await spawnSubagent({ task, type: "level1" });
const subagent2 = await spawnSubagent({
  task: subagent1.result,
  type: "level2"
});
```

## Benefits

1. **Context Isolation**: Prevents context pollution
2. **Specialization**: Each subagent optimized for specific tasks
3. **Modularity**: Reusable subagent components
4. **Scalability**: Handle complex tasks by decomposition
5. **Maintainability**: Easier to test and debug individual subagents

## Use Cases

1. **Code Review**: Specialized code review agent
2. **Research**: Research-focused subagent
3. **Analysis**: Data analysis subagent
4. **Translation**: Language translation subagent
5. **Formatting**: Document formatting subagent

## Best Practices

1. **Clear Boundaries**: Define clear task boundaries for subagents
2. **Appropriate Tools**: Give subagents tools they need
3. **Result Formatting**: Standardize subagent result format
4. **Error Handling**: Handle subagent failures gracefully
5. **Resource Management**: Manage subagent resources efficiently

## References

- [Deep Agents Subagents](https://docs.langchain.com/oss/javascript/deepagents/overview#subagents)
- [Multi-Agent Systems](https://docs.langchain.com/oss/javascript/langchain/multi-agent)
- [LangGraph Subgraphs](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)
