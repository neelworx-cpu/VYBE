# Handoff

## Overview

**Handoff** is the mechanism for transferring control between agents in a multi-agent system. One agent can hand off control to another agent, passing state and context along with the transfer.

## Key Concepts

### Control Transfer

Handoff involves:

1. **Source Agent**: Agent initiating handoff
2. **Destination Agent**: Agent receiving control
3. **State Transfer**: Passing relevant state/context
4. **Continuation**: Destination agent continues execution

### Command-Based Handoff

LangGraph uses `Command` objects for handoffs:

- `goto`: Target agent/node name
- `update`: State updates to pass
- `graph`: Which graph level (current or parent)

### Dynamic Routing

Handoffs enable dynamic behavior:

- Agents decide when to hand off
- Routing based on state/context
- Conditional handoffs
- Multi-agent workflows

## Usage

### Basic Handoff

```typescript
import { Command } from "@langchain/langgraph";

function agentNode(state, config) {
  const nextAgent = determineNextAgent(state);

  if (nextAgent !== "current") {
    // Hand off to another agent
    return new Command({
      goto: nextAgent, // Target agent name
      update: {
        messages: state.messages,
        context: state.context
      }
    });
  }

  // Continue in current agent
  return normalExecution(state);
}
```

### Handoff Tool Pattern

```typescript
import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";

const handoffTool = tool(
  async (input: { agentName: string; message?: string }, config) => {
    const toolMessage = new ToolMessage({
      content: `Successfully transferred to ${input.agentName}`,
      name: "handoff",
      tool_call_id: config.toolCall.id
    });

    // Get current state
    const state = getCurrentTaskInput();

    // Hand off with state
    return new Command({
      goto: input.agentName,
      graph: Command.PARENT, // Navigate to parent graph
      update: {
        messages: state.messages.concat(toolMessage),
        activeAgent: input.agentName
      }
    });
  },
  {
    name: "transfer_to_agent",
    description: "Transfer control to another agent",
    schema: z.object({
      agentName: z.string(),
      message: z.string().optional()
    })
  }
);
```

### Multi-Agent Graph with Handoffs

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";

// Define agents as nodes
const supervisorGraph = new StateGraph(StateAnnotation)
  .addNode("agent_a", agentANode)
  .addNode("agent_b", agentBNode)
  .addNode("agent_c", agentCNode)
  .addEdge(START, "agent_a")
  .addConditionalEdges("agent_a", routeFromA)
  .addConditionalEdges("agent_b", routeFromB)
  .addConditionalEdges("agent_c", routeFromC);

// Routing functions that can hand off
function routeFromA(state) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage instanceof Command && lastMessage.goto) {
    return lastMessage.goto; // Hand off to specified agent
  }

  // Default routing logic
  if (needsAgentB(state)) {
    return "agent_b";
  }

  return "agent_c";
}
```

### LangGraph Swarm Handoff

```typescript
import { createHandoffTool } from "@langchain/langgraph-swarm";

// Create handoff tools for each agent
const handoffToB = createHandoffTool({
  agentName: "agent_b",
  description: "Ask agent B for help with specialized tasks"
});

const handoffToC = createHandoffTool({
  agentName: "agent_c",
  description: "Ask agent C for help with analysis"
});

// Agents can use these tools to hand off
const agentA = createAgent({
  model,
  tools: [handoffToB, handoffToC, ...otherTools]
});
```

### Handoff with State Filtering

```typescript
function handoffNode(state, config) {
  // Filter state for destination agent
  const filteredState = {
    messages: state.messages.slice(-10), // Recent messages only
    context: {
      task: state.context.task,
      userId: state.context.userId
      // Don't pass internal state
    }
  };

  return new Command({
    goto: "destination_agent",
    update: filteredState
  });
}
```

## Handoff Patterns

### Pattern 1: Sequential Handoff

```typescript
// Agent A -> Agent B -> Agent C
function agentA(state) {
  return new Command({
    goto: "agent_b",
    update: { ...state, step: "step1_complete" }
  });
}

function agentB(state) {
  if (state.step === "step1_complete") {
    return new Command({
      goto: "agent_c",
      update: { ...state, step: "step2_complete" }
    });
  }
}
```

### Pattern 2: Conditional Handoff

```typescript
function routeAgent(state) {
  const taskType = analyzeTask(state);

  if (taskType === "code") {
    return new Command({ goto: "code_agent" });
  } else if (taskType === "research") {
    return new Command({ goto: "research_agent" });
  }

  return new Command({ goto: "general_agent" });
}
```

### Pattern 3: Bidirectional Handoff

```typescript
// Agent A can hand off to B, B can hand back to A
function agentB(state) {
  if (taskComplete(state)) {
    return new Command({
      goto: "agent_a",
      update: { result: state.result }
    });
  }

  // Continue in B
  return continueExecution(state);
}
```

## Use Cases

1. **Specialized Agents**: Hand off to domain experts
2. **Workflow Steps**: Sequential processing by different agents
3. **Error Recovery**: Hand off to error handling agent
4. **User Escalation**: Hand off to human agent
5. **Parallel Processing**: Hand off to parallel agent instances

## Best Practices

1. **Clear State Transfer**: Only pass necessary state
2. **Agent Identification**: Use clear, consistent agent names
3. **Error Handling**: Handle handoff failures
4. **State Validation**: Validate state after handoff
5. **Documentation**: Document handoff contracts

## References

- [Multi-Agent Handoffs](https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs)
- [LangGraph Swarm](https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-swarm)
- [Command Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/Command.html)
