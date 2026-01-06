# Void Tool Calling Architecture: End-to-End Analysis

## Executive Summary

This document provides a complete analysis of Void's tool calling implementation, execution boundaries, safety mechanisms, streaming interactions, and abort behavior. It then maps these findings to VYBE's MCP architecture and provides a concrete integration plan.

---

## PART 1 — Void Tool Calling: Ground Truth

### 1. Where Tool Calls Are Defined

**File:** `void/src/vs/workbench/contrib/void/common/prompt/prompts.ts`

**Tool Schema Declaration:**
- **Builtin tools** are statically defined in `builtinTools` object (lines 186-345)
- **MCP tools** are dynamically loaded via `IMCPService.getMCPTools()` (line 186 in `mcpService.ts`)
- Tool metadata structure: `InternalToolInfo` (lines 144-152):
  ```typescript
  {
    name: string,
    description: string,
    params: { [paramName: string]: { description: string } },
    mcpServerName?: string, // Only for MCP tools
  }
  ```

**Tool Registration:**
- **Static registration:** Builtin tools are hardcoded in `prompts.ts`
- **Dynamic registration:** MCP tools are registered via `MCPService` which watches `mcp.json` config file
- Tools are **scoped per chat mode** (`agent`, `gather`, `normal`) via `availableTools()` function (line 361)

**Tool Exposure to LLM:**

**Two formats exist:**

1. **OpenAI-style native tools** (for models with `specialToolFormat === 'openai-style'`):
   - File: `sendLLMMessage.impl.ts` lines 211-242
   - Converted via `toOpenAICompatibleTool()` → passed as `tools` array in OpenAI API
   - Used for: OpenAI, vLLM, LM Studio, Ollama (chat), etc.

2. **XML-style tool definitions** (for models without native tool support):
   - File: `prompts.ts` lines 380-423
   - Embedded in system message as XML format
   - Parsed via `extractXMLToolsWrapper()` in `extractGrammar.ts`

**Answers:**
- ✅ **Tools ARE passed via OpenAI `tools/functions`** when model supports it
- ✅ **Tools ARE model-specific** — determined by `specialToolFormat` capability
- ✅ **Tools ARE scoped per request** — filtered by `chatMode` and `mcpTools` availability

---

### 2. Tool Invocation Lifecycle

**Complete flow for one tool call:**

#### Step 1: Model Emits Tool Call
**File:** `sendLLMMessage.impl.ts` lines 336-371

```typescript
// During streaming, tool calls accumulate incrementally
for await (const chunk of response) {
  toolName += tool.function?.name ?? ''
  toolParamsStr += tool.function?.arguments ?? ''
  toolId += tool.id ?? ''

  onText({
    fullText: fullTextSoFar,
    toolCall: { name: toolName, rawParams: {}, isDone: false, ... }
  })
}
```

- **Sync boundary:** Streaming is async (`for await`)
- **Parsing:** Tool params are accumulated as JSON strings during streaming
- **Streaming continues:** Text streaming continues while tool call is being parsed

#### Step 2: Tool Call is Parsed
**File:** `sendLLMMessage.impl.ts` lines 372-381

```typescript
// On final message, tool call is complete
onFinalMessage({
  fullText: fullTextSoFar,
  toolCall: rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId)
})
```

- **File:** `sendLLMMessage.impl.ts` lines 246-256
- **Parsing:** `rawToolCallObjOfParamsStr()` parses JSON string to object
- **Sync boundary:** Parsing is synchronous
- **Streaming:** Already stopped (this is `onFinalMessage`)

#### Step 3: Tool Execution is Triggered
**File:** `chatThreadService.ts` lines 605-727 (`_runToolCall`)

```typescript
// 1. Validate params
toolParams = this._toolsService.validateParams[toolName](unvalidatedToolParams)

// 2. Check approval (if needed)
if (approvalType && !autoApprove) {
  return { awaitingUserApproval: true }
}

// 3. Execute tool
this._setStreamState(threadId, { isRunning: 'tool', ... })
const { result, interruptTool } = await this._toolsService.callTool[toolName](toolParams)
```

- **File:** `toolsService.ts` lines 296-464
- **Sync boundary:** Tool execution is **async** (`await`)
- **Streaming:** **STOPS** — stream state changes to `'tool'` (line 675)
- **Execution location:** Browser process (toolsService runs in renderer)

#### Step 4: Tool Returns Output
**File:** `toolsService.ts` lines 296-464

- Each tool returns typed result: `BuiltinToolResultType[T]`
- Some tools return Promises (e.g., `edit_file` returns `Promise<{lintErrors}>`)
- **Sync boundary:** Tool execution completes asynchronously

#### Step 5: Output is Fed Back to Model
**File:** `chatThreadService.ts` lines 709-726

```typescript
// Stringify result
toolResultStr = this._toolsService.stringOfResult[toolName](toolParams, toolResult)

// Add to message history
this._updateLatestTool(threadId, {
  role: 'tool',
  type: 'success',
  content: toolResultStr,
  ...
})
```

**File:** `chatThreadService.ts` lines 732-911 (`_runChatAgent`)

```typescript
// Loop continues - send new message with tool result
const chatMessages = this.state.allThreads[threadId]?.messages ?? []
const { messages } = await this._convertToLLMMessagesService.prepareLLMChatMessages({
  chatMessages, // Includes tool result message
  ...
})

// Send to LLM
this._llmMessageService.sendLLMMessage({ messages, ... })
```

- **File:** `convertToLLMMessageService.ts` (converts chat history to LLM format)
- **Format:** Tool result is added as `{ role: 'tool', content: toolResultStr }` message
- **Streaming:** New stream starts for next LLM response

#### Step 6: Model Continues or Completes
**File:** `chatThreadService.ts` lines 884-898

```typescript
if (toolCall) {
  await this._runToolCall(...)
  shouldSendAnotherMessage = true // Continue loop
} else {
  // No tool call - agent loop ends
}
```

- **Loop continues** if tool was called
- **Loop ends** if LLM returns text without tool call

**Summary:**
- **Streaming pauses** during tool execution (state: `'tool'`)
- **Streaming resumes** after tool result is fed back (new LLM request)
- **Multiple tool calls:** Only ONE tool call per LLM turn (line 416 in prompts.ts)

---

### 3. Tool Execution Boundaries

**Execution Location:**
- **File:** `toolsService.ts` — runs in **browser/renderer process**
- **File:** `mcpChannel.ts` — MCP tools execute in **main process** (via IPC)

**Sandboxing:**
- **No explicit sandboxing** — tools run with full editor process privileges
- **File operations:** Direct access via `IFileService`
- **Editor state:** Direct access via `IVoidModelService`
- **Terminal:** Direct access via `ITerminalToolService`

**Direct State Mutation:**
**File:** `toolsService.ts` lines 413-444

```typescript
edit_file: async ({ uri, searchReplaceBlocks }) => {
  await editCodeService.callBeforeApplyOrEdit(uri)
  editCodeService.instantlyApplySearchReplaceBlocks({ uri, searchReplaceBlocks })
  // Directly mutates editor state
}
```

**File:** `editCodeService.ts` — tools **DO directly modify editor state**

**File Writing:**
**File:** `toolsService.ts` lines 399-411

```typescript
create_file_or_folder: async ({ uri, isFolder }) => {
  if (isFolder) await fileService.createFolder(uri)
  else await fileService.createFile(uri)
  // Directly writes to filesystem
}
```

**Diff Triggering:**
**File:** `chatThreadService.ts` lines 1004-1016

```typescript
private _addToolEditCheckpoint({ threadId, uri }) {
  const diffAreasSnapshot = this._editCodeService.getVoidFileSnapshot(uri)
  this._addCheckpoint(threadId, {
    role: 'checkpoint',
    type: 'tool_edit',
    voidFileSnapshotOfURI: { [uri.fsPath]: diffAreasSnapshot },
  })
}
```

- Tools **DO trigger diffs** — checkpoints are created after tool edits
- Diffs are stored in message history for rollback

**Answers:**
- ✅ **Tools DO directly modify editor state** — via `editCodeService`
- ✅ **Tools DO write files** — via `fileService`
- ✅ **Tools DO trigger diffs** — via checkpoint system
- ❌ **No sandboxing** — tools run with full privileges

---

### 4. Tool + Streaming Interaction

**Mid-Stream Tool Invocation:**
**File:** `sendLLMMessage.impl.ts` lines 341-371

```typescript
for await (const chunk of response) {
  const newText = chunk.choices[0]?.delta?.content ?? ''
  fullTextSoFar += newText

  // Tool call accumulates during stream
  for (const tool of chunk.choices[0]?.delta?.tool_calls ?? []) {
    toolName += tool.function?.name ?? ''
    toolParamsStr += tool.function?.arguments ?? ''
  }

  // Text continues streaming even if tool call is detected
  onText({ fullText: fullTextSoFar, toolCall: ... })
}
```

**Behavior:**
- ✅ **Streaming DOES continue** while tool call is being accumulated
- ✅ **Text is buffered** in `fullTextSoFar`
- ✅ **Tool call is interleaved** — shown to user as it streams
- ❌ **Streaming DOES NOT stop** until `onFinalMessage`

**After Tool Call Completes:**
**File:** `chatThreadService.ts` lines 814-818

```typescript
onText: ({ fullText, toolCall }) => {
  this._setStreamState(threadId, {
    isRunning: 'LLM',
    llmInfo: {
      displayContentSoFar: fullText,
      toolCallSoFar: toolCall ?? null
    }
  })
}
```

- Tool call is shown in UI during streaming
- When `onFinalMessage` fires, tool execution begins
- **Streaming stops** when tool execution starts (state changes to `'tool'`)

**Multiple Tool Calls:**
**File:** `prompts.ts` lines 416-417

```typescript
// System message explicitly states:
"- You are only allowed to output ONE tool call, and it must be at the END of your response."
```

- ❌ **Only ONE tool call per turn** — enforced by prompt
- Multiple tools would require multiple LLM turns

**Error Handling:**
**File:** `chatThreadService.ts` lines 700-707

```typescript
catch (error) {
  const errorMessage = getErrorMessage(error)
  this._updateLatestTool(threadId, {
    role: 'tool',
    type: 'tool_error',
    content: errorMessage,
    ...
  })
  return {} // Stops agent loop
}
```

- Tool errors are added to message history
- Agent loop **stops** on tool error (does not retry automatically)

---

### 5. Abort Semantics with Tools

**Abort During LLM Streaming:**
**File:** `chatThreadService.ts` lines 557-590

```typescript
async abortRunning(threadId: string) {
  if (this.streamState[threadId]?.isRunning === 'LLM') {
    // Add partial assistant message
    this._addMessageToThread(threadId, {
      role: 'assistant',
      displayContent: displayContentSoFar,
      ...
    })
    // If tool call was in progress, mark as interrupted
    if (toolCallSoFar) {
      this._addMessageToThread(threadId, {
        role: 'interrupted_streaming_tool',
        ...
      })
    }
  }

  // Interrupt effects
  const interrupt = await this.streamState[threadId]?.interrupt
  if (typeof interrupt === 'function') interrupt()
}
```

**File:** `sendLLMMessageService.ts` lines 142-146

```typescript
abort(requestId: string) {
  this.llmMessageHooks.onAbort[requestId]?.() // Instant (browser)
  this.channel.call('abort', { requestId }) // IPC to main
}
```

**File:** `sendLLMMessage.impl.ts` line 339

```typescript
_setAborter(() => response.controller.abort())
```

- ✅ **LLM stream is aborted** via `AbortController`
- ✅ **Partial text is saved** to message history
- ✅ **Tool call in progress is marked** as `interrupted_streaming_tool`

**Abort During Tool Execution:**
**File:** `chatThreadService.ts` lines 568-572

```typescript
else if (this.streamState[threadId]?.isRunning === 'tool') {
  const { toolName, toolParams, id, content, rawParams, mcpServerName } =
    this.streamState[threadId].toolInfo
  this._updateLatestTool(threadId, {
    role: 'tool',
    type: 'rejected',
    content: this.toolErrMsgs.interrupted,
    ...
  })
}
```

**File:** `chatThreadService.ts` lines 669-698

```typescript
let interrupted = false
const interruptorPromise = new Promise<() => void>(res => { ... })

// Tool execution
const { result, interruptTool } = await this._toolsService.callTool[toolName](...)
const interruptor = () => { interrupted = true; interruptTool?.() }
resolveInterruptor(interruptor)

if (interrupted) { return { interrupted: true } }
```

**File:** `toolsService.ts` lines 447-450

```typescript
run_command: async ({ command, cwd, terminalId }) => {
  const { resPromise, interrupt } = await this.terminalToolService.runCommand(...)
  return { result: resPromise, interruptTool: interrupt }
}
```

- ✅ **Tool execution IS cancellable** — via `interruptTool` callback
- ✅ **Interrupt is propagated** through promise chain
- ⚠️ **Partial side-effects are NOT rolled back** — file edits persist if tool was partially executed

**Abort During User Approval:**
**File:** `chatThreadService.ts` lines 574-576

```typescript
else if (this.streamState[threadId]?.isRunning === 'awaiting_user') {
  this.rejectLatestToolRequest(threadId)
}
```

- ✅ **Tool request is rejected** — marked as `'rejected'` in history
- ✅ **No side-effects** — tool was never executed

**Prevention of Partial Side-Effects:**
- ❌ **NO automatic rollback** — if `edit_file` partially applies, changes persist
- ✅ **Checkpoint system** — user can manually rollback via checkpoints
- ⚠️ **File locks** — prevents concurrent edits (line 415 in toolsService.ts)

---

## PART 2 — Void vs VYBE MCP: Structural Comparison

### 6. Identify Void's Implicit MCP

**Agent Controller Layer:**
**File:** `chatThreadService.ts` lines 732-911 (`_runChatAgent`)

```typescript
// Agent loop
while (shouldSendAnotherMessage) {
  // 1. Convert chat history to LLM messages
  const { messages } = await this._convertToLLMMessagesService.prepareLLMChatMessages(...)

  // 2. Send to LLM
  const llmRes = await this._llmMessageService.sendLLMMessage({ messages, ... })

  // 3. If tool call, execute it
  if (toolCall) {
    await this._runToolCall(...)
    shouldSendAnotherMessage = true // Continue loop
  }
}
```

**Analysis:**
- ✅ **Void IS agentic** — has explicit agent loop (`_runChatAgent`)
- ✅ **Void DOES have planning** — loop continues until no tool call
- ❌ **Void does NOT have memory** — no explicit memory/context management beyond message history
- ❌ **Void does NOT support tool reflection** — no self-correction or tool result analysis

**Implicit Multi-Agent:**
- ❌ **Single-agent only** — one agent loop per thread
- ✅ **Tool orchestration** — tools are selected by LLM, executed by service

**Answer:**
- **Void IS agentic** — explicit agent loop with tool orchestration
- **Void DOES have planning** — iterative tool calling until completion
- **Void does NOT have memory** — relies on message history only
- **Void does NOT support tool reflection** — no meta-reasoning about tool results

---

### 7. Map VYBE MCP Into Void's Architecture

**Void's Layer Structure:**

```
Browser UI
  ↓
ChatThreadService (agent loop)
  ↓
LLMMessageService (IPC client)
  ↓
LLMMessageChannel (IPC bridge)
  ↓
sendLLMMessage (orchestrator)
  ↓
sendLLMMessageToProviderImplementation (provider-specific)
  ↓
OpenAI SDK / Ollama SDK / etc.
```

**Where VYBE MCP Should Sit:**

```
Browser UI
  ↓
VYBEMcpService (agent controller) ← VYBE MCP HERE
  ↓
LLMMessageService (transport layer) ← Keep as-is
  ↓
LLMMessageChannel (IPC bridge) ← Keep as-is
  ↓
sendLLMMessage (orchestrator) ← Keep as-is
  ↓
Provider implementations ← Keep as-is
```

**Responsibilities:**

**MCP SHOULD own:**
1. **Agent loop** — replace `_runChatAgent` with MCP orchestration
2. **Tool selection** — MCP decides which tools to call
3. **Memory management** — MCP maintains context/memory
4. **Planning** — MCP creates execution plans
5. **Tool result analysis** — MCP interprets tool outputs

**MCP SHOULD NOT replace:**
1. **LLM transport** — `LLMMessageService` stays as dumb transport
2. **Tool execution** — `ToolsService` stays as execution layer
3. **IPC channels** — keep existing IPC infrastructure
4. **Provider implementations** — keep provider-specific code

**Which responsibilities must remain "dumb plumbing":**
1. **LLM message sending** — no agent logic
2. **Tool execution** — no orchestration logic
3. **IPC communication** — pure transport
4. **Streaming callbacks** — pure event forwarding

---

## PART 3 — VYBE-Ready Integration Plan

### 8. Define Clean Contract Between VYBE MCP and LLM Transport

**Input Contract: MCP → LLM Layer**

```typescript
interface MCPToLLMRequest {
  messages: LLMChatMessage[]; // History including tool results
  modelSelection: ModelSelection;
  modelSelectionOptions?: ModelSelectionOptions;
  chatMode: ChatMode; // For tool availability
  onText: (params: { fullText: string; toolCall?: RawToolCallObj }) => void;
  onFinalMessage: (params: {
    fullText: string;
    toolCall?: RawToolCallObj
  }) => Promise<void>; // MCP can await this
  onError: (error: { message: string }) => void;
  abortToken: CancellationToken;
}
```

**Output Contract: LLM Layer → MCP**

```typescript
interface LLMToMCPResponse {
  fullText: string;
  toolCall?: {
    name: string;
    rawParams: RawToolParamsObj;
    id: string;
  };
  anthropicReasoning?: AnthropicReasoning[];
}
```

**Tool Call Request Format:**

```typescript
interface MCPToolCallRequest {
  toolName: string;
  toolParams: RawToolParamsObj;
  toolId: string;
  mcpServerName?: string; // For MCP tools
}
```

**Tool Result Format:**

```typescript
interface MCPToolResult {
  success: boolean;
  content: string; // Stringified result for LLM
  result?: any; // Raw result for MCP analysis
  error?: string;
}
```

**Abort/Cancel Signals:**

```typescript
interface MCPAbortSignal {
  cancelLLMStream: () => void; // Abort current LLM request
  cancelToolExecution: () => void; // Abort current tool
  isCancelled: boolean;
}
```

**Provider-Agnostic Contract:**

- ✅ Works with Ollama, vLLM, LM Studio (all use OpenAI-compatible API)
- ✅ Streaming-safe — callbacks handle incremental updates
- ✅ Abort-safe — cancellation tokens propagate through layers

---

### 9. Define Execution Invariants (Non-Negotiable)

**Based on Void's implementation, VYBE MUST preserve:**

1. **LLM transport must not mutate editor state**
   - **File:** `sendLLMMessageService.ts` — pure transport, no side effects
   - **Enforcement:** LLM layer has no access to `IEditCodeService`

2. **Tool execution must be deterministic**
   - **File:** `toolsService.ts` — same inputs → same outputs
   - **Enforcement:** No random state, no time-dependent behavior

3. **Streaming must be abortable**
   - **File:** `sendLLMMessage.impl.ts` line 339 — `AbortController` support
   - **Enforcement:** All async operations accept `CancellationToken`

4. **Tool calls must be idempotent or guarded**
   - **File:** `toolsService.ts` line 415 — file lock prevents concurrent edits
   - **Enforcement:** Tools check for conflicts before execution

5. **Tool results must be stringified before LLM**
   - **File:** `chatThreadService.ts` line 712 — `stringOfResult` conversion
   - **Enforcement:** MCP receives both raw and stringified results

6. **One tool call per LLM turn**
   - **File:** `prompts.ts` line 416 — enforced by prompt
   - **Enforcement:** MCP must not request multiple tools in one turn

7. **Tool execution pauses streaming**
   - **File:** `chatThreadService.ts` line 675 — state changes to `'tool'`
   - **Enforcement:** Stream state must reflect tool execution

8. **Checkpoints before tool edits**
   - **File:** `chatThreadService.ts` line 639 — checkpoint before edit
   - **Enforcement:** MCP must create checkpoints before mutating state

---

### 10. Phased Adoption Plan

**Phase 1 — Minimal Tool Calling**

**Goal:** One tool, one model, one execution path, fully observable

**Implementation:**
1. Create `VYBEMcpService` that wraps `LLMMessageService`
2. Implement minimal agent loop:
   ```typescript
   while (hasToolCall) {
     const llmRes = await llmMessageService.sendLLMMessage(...)
     if (llmRes.toolCall) {
       const toolResult = await toolsService.callTool(...)
       // Add tool result to history
       // Continue loop
     }
   }
   ```
3. Add logging for every step
4. Test with `read_file` tool only

**Deliverables:**
- ✅ One tool works end-to-end
- ✅ Tool result appears in LLM history
- ✅ LLM receives tool result and continues
- ✅ Full observability (logs at every step)

**Phase 2 — Agentic Expansion**

**Goal:** MCP routing, tool selection, memory injection

**Implementation:**
1. Add MCP tool selection logic
2. Implement memory/context management
3. Add tool result analysis
4. Support multiple tool types (builtin + MCP)

**Deliverables:**
- ✅ MCP can select tools intelligently
- ✅ Context persists across turns
- ✅ Tool results influence next actions

**Phase 3 — Production Hardening**

**Goal:** Concurrency, tool isolation, failure recovery

**Implementation:**
1. Add tool execution isolation
2. Implement retry logic for failed tools
3. Add concurrency controls (prevent overlapping tool calls)
4. Add rollback mechanisms

**Deliverables:**
- ✅ Tools can run concurrently (if safe)
- ✅ Failed tools are retried or handled gracefully
- ✅ Partial failures don't corrupt state

---

## PART 4 — Final Verdict

### 1. Is Void's tool calling architecture compatible with VYBE MCP?

**✅ YES, with modifications:**

- **Compatible:** LLM transport layer is provider-agnostic and tool-agnostic
- **Compatible:** Tool execution layer is already separated
- **Modification needed:** Agent loop must be replaced by MCP orchestration
- **Modification needed:** Tool selection must move from LLM to MCP

**Key Compatibility Points:**
- ✅ Streaming architecture supports tool interleaving
- ✅ Abort mechanisms work with tools
- ✅ Tool results can be fed back to LLM
- ⚠️ Agent loop is tightly coupled to `ChatThreadService` — needs refactoring

### 2. What should be copied vs re-implemented?

**COPY (Keep as-is):**
1. **LLM transport layer** (`LLMMessageService`, `LLMMessageChannel`, `sendLLMMessage`)
2. **Tool execution layer** (`ToolsService`, tool implementations)
3. **Streaming callbacks** (`onText`, `onFinalMessage`, `onError`)
4. **Abort mechanisms** (`AbortController`, cancellation tokens)
5. **Tool result stringification** (`stringOfResult` functions)

**RE-IMPLEMENT:**
1. **Agent loop** — replace `_runChatAgent` with MCP orchestration
2. **Tool selection** — move from LLM to MCP decision-making
3. **Memory management** — add explicit memory/context system
4. **Tool result analysis** — add MCP-side analysis of tool outputs

### 3. What risks exist if MCP owns too much?

**Risks:**
1. **Tight coupling** — MCP becomes hard to test/replace
2. **Performance** — MCP adds latency to every tool call
3. **Complexity** — MCP logic mixed with transport logic
4. **Debugging** — Harder to trace issues across layers

**Mitigation:**
- Keep clear boundaries (MCP = orchestration, Transport = plumbing)
- Use dependency injection for testability
- Add comprehensive logging at boundaries

### 4. What is the safest boundary between MCP and editor state?

**Boundary:**
```
MCP Layer (orchestration)
  ↓ (tool call request)
ToolsService (execution)
  ↓ (direct access)
Editor State (IEditCodeService, IFileService)
```

**Safety mechanisms:**
1. **Tool validation** — validate all params before execution
2. **Approval gates** — require user approval for destructive tools
3. **File locks** — prevent concurrent edits (line 415 in toolsService.ts)
4. **Checkpoints** — create snapshots before mutations
5. **Error handling** — catch and surface all tool errors

**Answer:** Boundary is at `ToolsService` — MCP should NOT directly access editor state. Tools are the only mutation point.

### 5. What is the earliest point we can test real tool calls end-to-end?

**Earliest Test Point: Phase 1**

**Minimal setup:**
1. Create `VYBEMcpService` with minimal agent loop
2. Wire up `LLMMessageService` (already exists)
3. Wire up `ToolsService` (already exists)
4. Test with `read_file` tool

**Test scenario:**
```
User: "Read file X"
MCP → LLM: "User wants to read file X"
LLM → MCP: { toolCall: { name: 'read_file', params: { uri: 'X' } } }
MCP → ToolsService: callTool('read_file', { uri: 'X' })
ToolsService → MCP: { result: { fileContents: '...' } }
MCP → LLM: Add tool result to history, send new message
LLM → MCP: { fullText: "Here is the file contents: ..." }
```

**Timeline:** Can be tested immediately after Phase 1 implementation (estimated: 1-2 days)

---

## File Reference Index

### Core Tool Files
- `void/src/vs/workbench/contrib/void/common/prompt/prompts.ts` — Tool definitions
- `void/src/vs/workbench/contrib/void/browser/toolsService.ts` — Tool execution
- `void/src/vs/workbench/contrib/void/common/toolsServiceTypes.ts` — Tool types

### LLM Integration
- `void/src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts` — Tool calling in LLM
- `void/src/vs/workbench/contrib/void/electron-main/llmMessage/extractGrammar.ts` — XML tool parsing
- `void/src/vs/workbench/contrib/void/common/sendLLMMessageService.ts` — LLM service

### Agent Loop
- `void/src/vs/workbench/contrib/void/browser/chatThreadService.ts` — Agent orchestration

### MCP Integration
- `void/src/vs/workbench/contrib/void/common/mcpService.ts` — MCP tool management
- `void/src/vs/workbench/contrib/void/electron-main/mcpChannel.ts` — MCP IPC

---

## Conclusion

Void's tool calling architecture is **well-separated** and **compatible** with VYBE's MCP approach. The key insight is that Void's agent loop (`_runChatAgent`) should be **replaced** by MCP orchestration, while the LLM transport and tool execution layers should be **preserved** as-is.

The safest integration point is at the **agent loop layer** — MCP should own orchestration, while transport and execution remain "dumb plumbing."



