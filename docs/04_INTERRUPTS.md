# Interrupts

## Overview

**Interrupts** allow you to pause graph execution at specific points and wait for external input before continuing. This enables human-in-the-loop patterns, deferred operations, and conditional execution flows.

## Key Concepts

### How Interrupts Work

1. **Call `interrupt()`**: At any point in a graph node, call `interrupt()` with a payload
2. **State Saved**: LangGraph automatically saves the graph state using checkpointing
3. **Execution Pauses**: Graph execution stops and waits indefinitely
4. **Resume with Command**: Resume by invoking graph with `Command.resume()`

### Interrupt Payload

The value passed to `interrupt()` is surfaced to the caller in the `__interrupt__` field, allowing you to know what the graph is waiting on.

### Resume Value

When resuming with `Command.resume()`, the value passed becomes the return value of the `interrupt()` call from inside the node.

## Usage

### Basic Interrupt Pattern

```typescript
import { interrupt, Command } from "@langchain/langgraph";

function toolNode(state, config) {
  const result = await tool.invoke(args);

  // Check if we need to pause
  if (result.needsApproval) {
    // Interrupt and wait for resume
    const resumeValue = interrupt({
      toolCallId: toolCall.id,
      action: "file_edit",
      filePath: result.filePath,
      type: "awaiting_approval"
    });

    // resumeValue is what was passed to Command.resume()
    return { messages: [new ToolMessage({ content: resumeValue })] };
  }

  return { messages: [new ToolMessage({ content: result.message })] };
}
```

### Resuming from Interrupt

```typescript
// After external event (e.g., file write completes, user approves)
await graph.stream(
  new Command({
    resume: "File edited successfully: path/to/file. The file system has confirmed the write operation."
  }),
  { configurable: { thread_id: taskId } }
);
```

### Handling Interrupt Events

```typescript
const stream = await graph.stream(input, config);

for await (const event of stream) {
  if (event.__interrupt__) {
    // Graph is paused, waiting for resume
    console.log("Interrupted:", event.__interrupt__);

    // Do something (e.g., wait for file write, show approval UI)
    await handleInterrupt(event.__interrupt__);

    // Resume with result
    await graph.stream(
      new Command({ resume: "Approved" }),
      config
    );
  }
}
```

## Use Cases

### 1. Deferred File Writes

```typescript
function editFileNode(state, config) {
  const toolCall = state.messages[state.messages.length - 1].tool_calls[0];
  const result = await editFileTool.invoke(toolCall.args);

  if (result.deferred) {
    // Interrupt until file write completes
    const resumeValue = interrupt({
      toolCallId: toolCall.id,
      filePath: result.filePath,
      type: "file_write_pending"
    });

    return {
      messages: [new ToolMessage({
        content: resumeValue,
        tool_call_id: toolCall.id
      })]
    };
  }

  return { messages: [new ToolMessage({ content: result.message })] };
}
```

### 2. Human-in-the-Loop Approval

```typescript
function approvalNode(state, config) {
  const action = determineAction(state);

  if (requiresApproval(action)) {
    const decision = interrupt({
      action: action.type,
      details: action.details,
      type: "awaiting_human_approval"
    });

    // decision is "approve", "reject", or "edit"
    return handleDecision(decision, action);
  }

  return executeAction(action);
}
```

### 3. Conditional Execution

```typescript
function conditionalNode(state, config) {
  const condition = await checkCondition(state);

  if (condition.requiresExternalInput) {
    const input = interrupt({
      type: "awaiting_external_input",
      question: condition.question
    });

    return { externalInput: input };
  }

  return { externalInput: condition.defaultValue };
}
```

## Requirements

1. **Checkpointer**: Must be set when compiling graph
2. **Thread ID**: Must use same `thread_id` for interrupt and resume
3. **Command.resume()**: Must pass resume value when resuming
4. **State Persistence**: Graph state is saved at interrupt point

## Best Practices

1. **Clear Payloads**: Include all necessary context in interrupt payload
2. **Timeout Handling**: Consider timeouts for long waits
3. **Error Handling**: Handle resume failures gracefully
4. **State Validation**: Validate state after resume
5. **Idempotency**: Ensure resume operations are idempotent

## References

- [LangGraph Interrupts Guide](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [Human-in-the-Loop Guide](https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop)
- [Command Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/Command.html)
