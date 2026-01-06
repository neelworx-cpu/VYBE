# 🏗️ VYBE Production-Grade IDE Roadmap

**Full Architecture Assessment & Phased Implementation Plan**

*Generated: January 6, 2026*

---

## Executive Summary

VYBE is a VS Code fork with integrated AI agentic capabilities via a separate MCP server (`VYBE-MCP`). After comprehensive audit, **significant infrastructure exists** but key integration gaps prevent end-to-end agentic workflows.

**Current State**: ~70% infrastructure complete, ~30% integration/wiring needed

---

## 🔍 COMPLETE CODEBASE AUDIT

### Repository Overview

| Repository | Purpose | Lines of Code | Status |
|------------|---------|---------------|--------|
| **VYBE** | VS Code fork (IDE) | ~5,100 TS files | Active |
| **VYBE-MCP** | MCP Agent Server | ~130 TS files | Active |
| **void** | Original Void fork (reference) | ~4,600 TS files | Reference |

---

## ✅ WHAT'S BUILT (Asset Inventory)

### VYBE-MCP Server

#### Core Infrastructure
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **MCP Server** | `src/core/mcp_server.ts` | ✅ Working | Stdio transport for IDE |
| **MCP Client** | `src/core/mcp_client.ts` | ✅ Working | Connects to IDE as tool host |
| **Command Handler** | `src/core/command_handler.ts` | ✅ Working | Routes IDE commands to orchestrator |
| **Streaming Service** | `src/core/streaming/streaming_service.ts` | ✅ Working | OpenAI-compatible, works with Ollama |
| **Agent Loop** | `src/core/agent/agent_loop.ts` | ✅ Working | Full decision loop with budget enforcement |
| **Tool Executor** | `src/core/agent/tool_executor.ts` | ✅ Working | Validates, executes, emits events |
| **Tool Registry** | `src/tools/registry.ts` | ✅ Working | 35+ tools registered |
| **Safety Policy** | `src/safety/safety_policy.ts` | ✅ Working | Mode/Level enforcement |

#### Context & Retrieval
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **Context Router** | `src/context/context_router.ts` | ✅ Working | Graph + semantic expansion |
| **IDE Context Provider** | `src/context/ide_context_provider.ts` | ⚠️ Partial | Needs IDE integration |
| **Memory Service** | `src/memory/memory_service.ts` | ✅ Working | Supabase-backed |
| **Graph Service** | `src/memory/graph_service.ts` | ✅ Working | Node/edge traversal |

#### Indexing & Parsing
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **Tree-Sitter Parser** | `src/indexing/parser.ts` | ✅ Working | TS, JS, Python, Go, Rust |
| **Hierarchical Chunker** | `src/indexing/chunker.ts` | ✅ Working | AST-based chunking |
| **Indexing Queue** | `src/indexing/queue.ts` | ✅ Working | Background file processing |
| **Embedding Service** | `src/core/embedding.ts` | ⚠️ Cloud Only | Uses OpenAI API |

#### Agent Architecture
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **Orchestrator** | `src/agents/orchestrator.ts` | ✅ Working | Dispatches to agents |
| **Agent L1** | `src/agents/agent_l1.ts` | ✅ Working | Simple single-turn |
| **Agent L2** | `src/agents/agent_l2.ts` | ✅ Working | Multi-step reasoning |
| **Agent L3** | `src/agents/agent_l3.ts` | ✅ Working | Full agentic with tools |
| **Multi-Agent Orchestrator** | `src/agents/multi_agent/orchestrator_v2.ts` | ✅ Built | Planner/Coder/Reviewer |
| **Task Decomposer** | `src/core/decomposition/task_decomposer.ts` | ✅ Built | Breaks goals into subtasks |
| **Execution Graph** | `src/core/decomposition/execution_graph.ts` | ✅ Built | DAG-based subtask execution |

#### Tools Inventory (35+ tools)
```
Local Plane:
├── read_file, write_file, list_dir
├── run_command (terminal)
├── apply_patch, rollback_snapshot
├── index_repo, get_indexing_status
└── get_context_for_files

Cloud Plane (Supabase):
├── search_codebase, search_context
├── build_repo_graph, get_graph_*
├── get/store/search_memory
├── list_sessions, get_session
└── get/set_repo_settings

Agent Plane:
├── solve_task, vybe_solve_task
├── vybe_session_solve
└── subscribe_task_events

Execution Plane:
├── run_sandboxed_command
└── run_tests
```

#### Database Schema (Supabase)
| Table | Purpose | Status |
|-------|---------|--------|
| `files` | File registry with repo_id | ✅ |
| `code_chunks` | Chunked code with embeddings | ✅ |
| `graph_nodes` | Symbol nodes | ✅ |
| `graph_edges` | Relationships | ✅ |
| `agent_runs` | Session tracking | ✅ |
| `agent_steps` | Chain-of-thought | ✅ |
| `memories` | Scoped memories | ✅ |
| `context_selections` | Selection audit | ✅ |
| `pending_patches` | Approval queue | ✅ |

---

### VYBE IDE (VS Code Fork)

#### Chat UI Components
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **VybeChatViewPane** | `vybeChatViewPane.ts` | ✅ Working | Main chat container |
| **MessagePage** | `components/chatArea/messagePage.ts` | ✅ Working | Individual message rendering |
| **StreamingEventHandler** | `streaming_event_handler.ts` | ✅ Working | Routes events to UI |
| **MessageComposer** | `components/composer/messageComposer.ts` | ✅ Working | Input with pills, images |

#### Content Parts (Rich Rendering)
| Part | File | Status | Notes |
|------|------|--------|-------|
| **MarkdownPart** | `vybeChatMarkdownPart.ts` | ✅ Working | Full markdown with streaming |
| **ThinkingPart** | `vybeChatThinkingPart.ts` | ✅ Working | Collapsible reasoning |
| **CodeBlockPart** | `vybeChatCodeBlockPart.ts` | ✅ Working | Monaco editor |
| **TextEditPart** | `vybeChatTextEditPart.ts` | ✅ Working | Diff view with streaming |
| **TerminalPart** | `vybeChatTerminalPart.ts` | ✅ Built | Command execution |
| **PlanDocumentPart** | `vybeChatPlanDocumentPart.ts` | ✅ Built | Checklist with Accept/Reject |

#### MCP Integration
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **VybeMcpMainService** | `vybeMcpMainService.ts` | ✅ Working | Spawns MCP subprocess |
| **VybeStdioToolHost** | `vybeStdioToolHost.ts` | ✅ Working | Tool execution bridge |
| **VybeMcpToolBridge** | `vybeMcpToolBridge.ts` | ✅ Working | IDE tool forwarding |
| **VybeMcpToolContribution** | `vybeMcpToolContribution.ts` | ✅ Working | Registers vybe.* tools |
| **VybeChatMcpExecutionService** | `vybeChatMcpExecutionService.ts` | ✅ Working | Chat → MCP bridge |

#### IDE Tool Registration (15 tools)
```
vybe.readFile          - Read file content
vybe.writeFile         - Write file content
vybe.searchCodebase    - Semantic search
vybe.createFile        - Create new file
vybe.applyDiff         - Apply unified diff
vybe.showDiff          - Show diff in editor
vybe.revealFile        - Open file in editor
vybe.runCommand        - Execute terminal command
vybe.getOpenFiles      - List open editors
vybe.getActiveFile     - Get current file info
vybe.getSelection      - Get selected text
vybe.getCursorPosition - Get cursor location
vybe.getWorkspaceInfo  - Workspace metadata
vybe.getDiagnostics    - Get linter errors
vybe.getGitStatus      - Git state
```

---

## ❌ WHAT'S MISSING / BROKEN (Gap Analysis)

### Critical Gaps (Blocking Agentic Flow)

| Gap | Severity | Current State | Required State |
|-----|----------|---------------|----------------|
| **Tools NOT passed to LLM** | 🔴 CRITICAL | `streamLLMResponse()` has `tools` param but never populated | Pass tool definitions to OpenAI-compatible API |
| **No tool call extraction** | 🔴 CRITICAL | `decideNextAction()` calls LLM but extraction is stub | Parse `tool_calls` from response, execute, loop |
| **Context collection incomplete** | 🔴 CRITICAL | IDE tools exist but not called before LLM | Call `vybe.getActiveFile`, `vybe.getSelection`, etc. |
| **IDE → MCP context bridge** | 🔴 CRITICAL | `IDEContextBundle` defined but not populated | Collect IDE state, send to MCP with message |

### Medium Gaps (UX/Polish)

| Gap | Severity | Current State | Required State |
|-----|----------|---------------|----------------|
| **Approval UI not wired** | 🟡 MEDIUM | `TextEditPart` has Accept/Reject buttons | Wire to MCP approval flow |
| **Tool call UI missing** | 🟡 MEDIUM | `tool.call` events handled but no dedicated UI | Create `VybeChatToolCallPart` |
| **Local embeddings** | 🟡 MEDIUM | OpenAI API only | Integrate local ONNX model |
| **Files toolbar integration** | 🟡 MEDIUM | `filesEditedToolbar` exists | Wire to `write_file` tool calls |

### Nice-to-Have Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| **Parallel tool execution** | 🟢 LOW | Sequential works, parallel is optimization |
| **Rollback on reject** | 🟢 LOW | Snapshot exists, undo not wired |
| **Cross-session memory** | 🟢 LOW | Session memory works, global needs UI |

---

## 🎯 PHASED IMPLEMENTATION ROADMAP

### Phase 0: Stabilization & Audit Verification
**Duration**: 1-2 days
**Goal**: Ensure current systems work before building more

#### Milestone 0.1: Verify MCP ↔ IDE Communication
- [ ] Test MCP subprocess spawn with logging
- [ ] Verify stdio transport works both directions
- [ ] Confirm tool.call / tool.result events reach IDE
- [ ] Debug any IPC issues

**Deliverables:**
- Working `vybe:sendVybeMcpCommand` IPC
- Event subscription receiving events
- Console logs proving bidirectional flow

#### Milestone 0.2: Verify Streaming Pipeline
- [ ] Send simple query, verify `content.delta` events
- [ ] Verify `thinking.delta` for reasoning models
- [ ] Confirm `message.complete` fires
- [ ] Test error event propagation

**Deliverables:**
- Streaming text renders in chat
- Thinking blocks collapse/expand
- Error messages display

---

### Phase 1: Wire Tools to LLM (The Critical Gap)
**Duration**: 3-4 days
**Goal**: LLM can see and call tools

#### Milestone 1.1: Pass Tools to StreamingService
```typescript
// CURRENT (broken)
const llmResponse = await this.streamingService.streamLLMResponse(
    messages,
    { temperature: 0.7, maxTokens: 8192, model: modelId },
    state.taskId,
    this.channel
);

// FIXED
const exposedTools = this.toolExposureManager.getToolsForMode(state.agentMode, state.agentLevel);
const llmResponse = await this.streamingService.streamLLMResponse(
    messages,
    {
        temperature: 0.7,
        maxTokens: 8192,
        model: modelId,
        tools: exposedTools  // ← NEW
    },
    state.taskId,
    this.channel
);
```

**Tasks:**
- [ ] Modify `ToolExposureManager.getToolsForMode()` to return OpenAI-format tools
- [ ] Update `StreamingService.streamLLMResponse()` to pass tools to client
- [ ] Update `OpenAICompatibleClient.streamChat()` to include tools in request

**Deliverables:**
- Tools appear in Ollama/OpenRouter API request
- LLM response includes `tool_calls` array when appropriate

#### Milestone 1.2: Parse Tool Calls from Response
**Tasks:**
- [ ] Update `StreamingService` to expose `toolCalls` in result
- [ ] Implement `ToolCallingStrategy.extractToolCalls()` for native format
- [ ] Handle both streaming and non-streaming tool call formats

**Deliverables:**
- `StreamingResult.toolCalls` populated
- Tool calls extracted from both Ollama and OpenRouter

#### Milestone 1.3: Execute Tool Calls
**Tasks:**
- [ ] In `AgentLoop.decideNextAction()`, check for tool calls
- [ ] Call `ToolExecutor.execute()` for each tool
- [ ] Emit `tool.call` and `tool.result` events
- [ ] Append tool results to message history
- [ ] Loop back to LLM with updated context

**Deliverables:**
- Full tool execution loop working
- Events visible in IDE
- Multi-turn tool calling operational

---

### Phase 2: Context Collection & Injection
**Duration**: 2-3 days
**Goal**: LLM has rich context about IDE state

#### Milestone 2.1: IDE Context Collection
**Tasks:**
- [ ] Create `VybeContextCollector` service in IDE
- [ ] Collect on message send:
  - Active file path + content (first 500 lines)
  - Selection text (if any)
  - Cursor position
  - Open files list
  - Workspace folder info
  - Git branch + changed files
- [ ] Bundle into `IDEContextBundle`

**Deliverables:**
- `IDEContextBundle` populated on every message

#### Milestone 2.2: Context Bridge to MCP
**Tasks:**
- [ ] Extend `solveTask` params to include `ideContext`
- [ ] Pass bundle through IPC to MCP
- [ ] Update `Orchestrator.solveTask()` to receive bundle
- [ ] Feed to `ContextRouter.getMergedContext()`

**Deliverables:**
- Context flows from IDE to MCP
- LLM system prompt includes IDE state

#### Milestone 2.3: System Prompt Enhancement
**Tasks:**
- [ ] Update `buildSystemPrompt()` to include:
  - Workspace structure summary
  - Active file with line numbers
  - Recent tool results summary
  - Available tools list
- [ ] Token budget management (don't exceed context window)

**Deliverables:**
- Rich, context-aware system prompts
- Token-efficient context packing

---

### Phase 3: Tool Calling UI
**Duration**: 2-3 days
**Goal**: User sees tool calls and can interact

#### Milestone 3.1: Tool Call Content Part
**Tasks:**
- [ ] Create `VybeChatToolCallPart` component
- [ ] Render:
  - Tool name with icon
  - Arguments (collapsible JSON)
  - Status (pending → running → complete/error)
  - Result preview (truncated)
- [ ] Wire to `tool.call` and `tool.result` events

**Deliverables:**
- Tool calls visible in chat
- Status updates during execution

#### Milestone 3.2: Approval Flow for Dangerous Tools
**Tasks:**
- [ ] Identify tools requiring approval: `write_file`, `run_command`, `apply_patch`
- [ ] Emit `tool.call` with `requiresApproval: true`
- [ ] Show Accept/Reject buttons in `VybeChatToolCallPart`
- [ ] Block execution until user responds
- [ ] Send approval result back to MCP

**Deliverables:**
- Dangerous tools pause for approval
- User can modify command before executing

#### Milestone 3.3: Wire TextEdit to write_file
**Tasks:**
- [ ] When `write_file` tool called, create `textEdit` content part
- [ ] Show diff of proposed changes
- [ ] Accept applies patch
- [ ] Reject sends failure to MCP

**Deliverables:**
- File edits show as diffs
- Accept/Reject fully functional

---

### Phase 4: Local Embeddings & Semantic Search
**Duration**: 3-4 days
**Goal**: Fully local operation without cloud API

#### Milestone 4.1: ONNX Embedding Model Integration
**Tasks:**
- [ ] Add `onnxruntime-web` (already in VYBE package.json)
- [ ] Download/bundle embedding model (e.g., `all-MiniLM-L6-v2`)
- [ ] Create `LocalEmbeddingService` in VYBE-MCP
- [ ] Fallback chain: Local ONNX → OpenAI API

**Deliverables:**
- Embeddings generated locally
- No OpenAI API required for indexing

#### Milestone 4.2: Local Vector Search
**Tasks:**
- [ ] Option 1: Use SQLite with vector extension (`sqlite-vec`)
- [ ] Option 2: In-memory HNSW index
- [ ] Migrate from Supabase `match_code_chunks` RPC
- [ ] Support hybrid search (vector + full-text)

**Deliverables:**
- Semantic search works offline
- Optional Supabase sync for cloud backup

#### Milestone 4.3: Incremental Indexing
**Tasks:**
- [ ] Watch workspace for file changes
- [ ] Re-index only modified files
- [ ] Update graph edges for changed symbols
- [ ] Background indexing with progress

**Deliverables:**
- Index stays fresh automatically
- Low CPU impact during coding

---

### Phase 5: Multi-Agent & Task Decomposition
**Duration**: 4-5 days
**Goal**: Complex tasks handled by specialized agents

#### Milestone 5.1: Task Graph Visualization
**Tasks:**
- [ ] Create `VybeChatTaskGraphPart` component
- [ ] Render subtasks as interactive checklist
- [ ] Show dependencies (which blocks which)
- [ ] Status indicators (pending/running/done/failed)

**Deliverables:**
- Visual task breakdown in chat
- User can see agent's plan

#### Milestone 5.2: Interactive Subtask Control
**Tasks:**
- [ ] User can skip subtasks
- [ ] User can re-order non-dependent subtasks
- [ ] User can add subtasks manually
- [ ] User can trigger re-planning

**Deliverables:**
- Interactive task management
- Human-in-the-loop planning

#### Milestone 5.3: Multi-Agent Orchestration
**Tasks:**
- [ ] Enable Planner → Coder → Reviewer flow
- [ ] Show agent handoffs in UI
- [ ] Expose "thinking" from each agent
- [ ] Allow user to provide feedback between agents

**Deliverables:**
- Multi-agent visible in UI
- User can steer multi-agent flow

---

### Phase 6: Advanced Features
**Duration**: 5-7 days
**Goal**: Production-grade polish

#### Milestone 6.1: Rollback & Undo
**Tasks:**
- [ ] Track all file changes per session
- [ ] Create snapshots before each mutation
- [ ] "Undo last change" button
- [ ] "Rollback to checkpoint" for multi-file changes

**Deliverables:**
- Safe experimentation
- Easy recovery from bad edits

#### Milestone 6.2: Session Memory & Continuity
**Tasks:**
- [ ] Persist session state to disk/Supabase
- [ ] Resume sessions after IDE restart
- [ ] Cross-session learning (user preferences)
- [ ] Memory search/browse UI

**Deliverables:**
- Sessions survive restarts
- Agent learns user patterns

#### Milestone 6.3: Performance Optimization
**Tasks:**
- [ ] Parallel tool execution for independent tools
- [ ] Streaming file reads for large files
- [ ] Lazy loading of content parts
- [ ] Virtual scrolling for long chats

**Deliverables:**
- Snappy UI even with heavy usage
- No freezing during operations

#### Milestone 6.4: Error Recovery & Resilience
**Tasks:**
- [ ] Retry failed tool calls with backoff
- [ ] Graceful degradation when MCP crashes
- [ ] Auto-restart MCP subprocess
- [ ] Clear error messages to user

**Deliverables:**
- Robust production behavior
- Self-healing system

---

## 📊 IMPLEMENTATION PRIORITY MATRIX

```
                    IMPACT
                    High │
                         │  Phase 1: Tool Calling ←── START HERE
                         │  Phase 2: Context
                         │
                    Med  │  Phase 3: Tool UI
                         │  Phase 4: Local Embeddings
                         │
                    Low  │  Phase 5: Multi-Agent
                         │  Phase 6: Polish
                         │
                         └─────────────────────────────
                              Easy    Medium    Hard
                                    EFFORT
```

**Recommended Order**: 0 → 1 → 2 → 3 → 4 → 5 → 6

---

## 🔧 QUICK WINS (Can Do Today)

1. **Enable tool passing** - 2 hours
   - Add `tools` to `streamLLMResponse` call
   - Just the wiring, not the full loop

2. **Add basic context** - 2 hours
   - Call `vybe.getActiveFile` before sending message
   - Include in system prompt

3. **Log tool calls** - 1 hour
   - Add console.log in `StreamingEventHandler.handleToolCall`
   - Verify events are reaching UI

4. **Fix any broken tests** - 1-2 hours
   - Run existing test suite
   - Fix any failures

---

## 📁 KEY FILES TO MODIFY

### Phase 1 (Tool Calling)
```
VYBE-MCP/src/core/agent/agent_loop.ts         ← Pass tools to LLM
VYBE-MCP/src/core/streaming/streaming_service.ts ← Include tools in request
VYBE-MCP/src/core/runtime/tool_exposure_manager.ts ← Format tools for API
VYBE-MCP/src/core/providers/openai_compatible_client.ts ← Send tools
```

### Phase 2 (Context)
```
VYBE/src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts ← Collect context
VYBE/src/vs/workbench/contrib/vybeChat/common/vybeChatMcpExecutionService.ts ← Send context
VYBE-MCP/src/context/ide_context_provider.ts ← Receive context
VYBE-MCP/src/core/prompt_builder.ts ← Inject into prompt
```

### Phase 3 (UI)
```
VYBE/src/vs/workbench/contrib/vybeChat/browser/contentParts/ ← New parts
VYBE/src/vs/workbench/contrib/vybeChat/browser/streaming_event_handler.ts ← Route events
```

---

## 🧪 TESTING STRATEGY

### Unit Tests
- Tool execution (mock LLM responses)
- Context bundling
- Event routing

### Integration Tests
- MCP ↔ IDE communication
- Full tool calling loop (with mock model)
- Approval flow

### E2E Tests
- "Add error handling to auth.ts" → verifies file edit
- "Run npm test" → verifies terminal execution
- "Search for login function" → verifies codebase search

---

## 📈 SUCCESS METRICS

| Metric | Current | Target |
|--------|---------|--------|
| Tool calls per session | 0 | 5-20 |
| Context tokens utilized | ~500 | 4000-6000 |
| User approval rate | N/A | >90% (good suggestions) |
| Time to first response | ~3s | <2s |
| Task completion rate | ~40% | >80% |

---

## 🚀 NEXT IMMEDIATE ACTION

**Start with Phase 0, Milestone 0.1**: Verify MCP ↔ IDE communication works.

```bash
# Terminal 1: Start VYBE-MCP in debug mode
cd /Users/neel/VYBE-MCP
VYBE_IDE_STDIO=1 DEBUG=* npm start

# Terminal 2: Watch for IPC events in VYBE
cd /Users/neel/VYBE
npm run watch-client
```

Then send a test message and check:
1. MCP receives the command
2. Orchestrator dispatches to agent
3. Events stream back to IDE
4. Chat UI updates

---

## 🆕 ADDITIONAL PHASES: FULL IDE FEATURE PARITY

The following phases cover features required for production-grade IDE experience, comparable to Cursor/Windsurf.

---

### Phase 7: Context Summarization & Management
**Duration**: 4-5 days
**Goal**: Handle long conversations without losing context

#### Overview: How Summarization Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BEFORE SUMMARIZATION                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  User: "Add auth to..."        ← Oldest                                     │
│  AI: "Here's the plan..."                                                   │
│  User: "Good, now..."                                                       │
│  AI: "Done! I've..."                                                        │
│  ─────────────────── Context Window Limit ───────────────────               │
│  User: "Next, add..."          ← Newest (gets cut off!)                     │
│  AI: ???                                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  AFTER SUMMARIZATION                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Summarized]: User added auth to routes.ts, created middleware...          │
│  ─────────────────── Context Window Limit ───────────────────               │
│  User: "Next, add..."                                                       │
│  AI: "Based on our previous work on auth, I'll..."  ← Has context!         │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 7.1: Message Summarization Engine
**Tasks:**
- [ ] Create `ConversationSummarizer` service in MCP
- [ ] Detect when message count exceeds threshold (e.g., 20 turns)
- [ ] Use LLM to summarize older messages into single block
- [ ] Preserve:
  - Key decisions made
  - Files modified
  - Tools used and outcomes
  - User preferences expressed
- [ ] Store summary in session state

**Implementation:**
```typescript
interface ConversationSummary {
    turnsSummarized: number;       // e.g., "Messages 1-15"
    keyDecisions: string[];        // "Added JWT auth", "Using bcrypt"
    filesModified: string[];       // ["auth.ts", "middleware.ts"]
    toolsUsed: string[];           // ["write_file", "run_command"]
    userPreferences: string[];     // "Prefers functional components"
    summaryText: string;           // LLM-generated summary paragraph
    timestamp: number;
}
```

**Deliverables:**
- Auto-summarization when context limit approached
- Summary appears as collapsible block in chat
- Context preserved across long sessions

#### Milestone 7.2: Manual /summarize Command
**Tasks:**
- [ ] Add `/summarize` command to composer
- [ ] Trigger immediate summarization of conversation
- [ ] Option: summarize last N messages only
- [ ] Show token savings in UI

**Deliverables:**
- User can manually trigger summarization
- Token usage visible in chat

#### Milestone 7.3: Smart Context Window Management
**Tasks:**
- [ ] Track token usage per message
- [ ] Implement sliding window with summarization trigger
- [ ] Priority-based context retention:
  1. Most recent 3-5 messages (full)
  2. User instructions/preferences (preserved)
  3. Code changes (preserved as diffs)
  4. Older conversation (summarized)
- [ ] Visual indicator when summarization occurs

**Deliverables:**
- Automatic context management
- Users never hit "context too long" errors

---

### Phase 8: File & Folder Condensation
**Duration**: 3-4 days
**Goal**: Include large files/folders in context intelligently

#### Overview: Condensation States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILE CONDENSATION STATES                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📄 FULL                    │  Entire file content included                 │
│     auth.ts (245 lines)     │  Used when: small file, explicitly requested │
│                                                                              │
│  📄 CONDENSED               │  Structure + signatures only                  │
│     database.ts [condensed] │  Shows: exports, function sigs, class defs   │
│                                                                              │
│  📄 SIGNIFICANTLY CONDENSED │  Only filename + brief description           │
│     bigFile.ts [sig. cond.] │  Used when: huge file, limited context       │
│                                                                              │
│  ⚠️ NOT INCLUDED            │  Too large even for name                      │
│     node_modules/           │  Warning icon shown                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 8.1: File Condensation Engine
**Tasks:**
- [ ] Create `FileCondenser` in MCP
- [ ] For TypeScript/JavaScript:
  - Extract: exports, function signatures, class definitions
  - Preserve: JSDoc comments, type annotations
  - Omit: function bodies, implementation details
- [ ] For Python:
  - Extract: class defs, function defs, docstrings
  - Preserve: type hints, decorators
- [ ] Estimate token count before/after condensation

**Implementation:**
```typescript
interface CondensedFile {
    path: string;
    state: 'full' | 'condensed' | 'significantly_condensed' | 'excluded';
    originalTokens: number;
    condensedTokens: number;
    content: string;  // Full or condensed content
    signature?: string;  // For sig. condensed - just the summary
    expandable: boolean;  // Can model request expansion?
}
```

**Deliverables:**
- Files auto-condensed based on size
- Token savings tracked and reported

#### Milestone 8.2: Folder/Directory Condensation
**Tasks:**
- [ ] Create `FolderCondenser` for directory trees
- [ ] Generate structure summary:
  ```
  src/
  ├── components/ (12 files, React components)
  ├── utils/ (8 files, helper functions)
  ├── api/ (5 files, API routes)
  └── types/ (3 files, TypeScript types)
  ```
- [ ] Smart selection: include key files (index.ts, main entry points)
- [ ] Exclude: node_modules, .git, build artifacts

**Deliverables:**
- Folder structure included efficiently
- Key files identified automatically

#### Milestone 8.3: Dynamic Expansion
**Tasks:**
- [ ] Allow LLM to request file expansion mid-conversation
- [ ] Emit `context.expand` event when model needs more detail
- [ ] Replace condensed version with full content
- [ ] Re-condense other files if needed for token budget

**Deliverables:**
- Model can "drill down" into files as needed
- Dynamic context management

#### Milestone 8.4: Context Pills UI Integration
**Tasks:**
- [ ] Show condensation state in context pills
- [ ] Hover tooltip: "Condensed: 1,200 → 150 tokens"
- [ ] User can force full/condensed for any file
- [ ] Warning icon for excluded files

**Deliverables:**
- Visual feedback on what's in context
- User control over condensation

---

### Phase 9: Inline Code Editing (Ctrl+K / Cmd+K)
**Duration**: 5-7 days
**Goal**: Edit code directly in editor with AI assistance

#### Overview: Inline Edit Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INLINE EDIT FLOW                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User selects code (or places cursor)                                    │
│  2. Presses Ctrl+K (or Cmd+K on Mac)                                        │
│  3. Inline composer appears above/below selection                           │
│  4. User types instruction: "Add error handling"                            │
│  5. AI generates replacement code                                           │
│  6. Diff preview shown inline in editor                                     │
│  7. User presses Enter to accept, Escape to reject                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  function login(email, password) {  ← Original                      │    │
│  │- │   const user = db.findUser(email);                               │    │
│  │- │   return user.verify(password);                                  │    │
│  │+ │   try {                                                          │    │
│  │+ │     const user = await db.findUser(email);                       │    │
│  │+ │     if (!user) throw new Error('User not found');                │    │
│  │+ │     return await user.verify(password);                          │    │
│  │+ │   } catch (err) {                                                │    │
│  │+ │     logger.error('Login failed', err);                           │    │
│  │+ │     throw err;                                                   │    │
│  │+ │   }                                                              │    │
│  │  }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  [Enter to Accept] [Tab to iterate] [Escape to Cancel]                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 9.1: Inline Composer Widget
**Tasks:**
- [ ] Create `InlineEditWidget` extending VS Code's `ContentWidget`
- [ ] Trigger on Ctrl+K / Cmd+K
- [ ] Position: above selection for single line, below for multi-line
- [ ] Components:
  - Text input with auto-focus
  - Model indicator
  - Token count
  - Cancel button
- [ ] Focus management (Escape to close)

**Deliverables:**
- Keyboard shortcut triggers inline composer
- Widget appears at correct position
- Input captures user instruction

#### Milestone 9.2: Selection Context Collection
**Tasks:**
- [ ] Capture:
  - Selected text (or current line if no selection)
  - Surrounding context (±20 lines)
  - File path and language
  - Cursor position
- [ ] Build focused prompt for edit task
- [ ] Include symbols from current file

**Deliverables:**
- Rich context for inline edits
- Focused prompt generation

#### Milestone 9.3: Inline Diff Preview
**Tasks:**
- [ ] Create `InlineDiffDecorator` using VS Code decorations
- [ ] Show:
  - Red background for deleted lines
  - Green background for added lines
  - Gutter markers for changes
- [ ] Real-time diff as AI streams response
- [ ] Animate additions character-by-character

**Deliverables:**
- Live diff preview in editor
- Streaming edit visualization

#### Milestone 9.4: Accept/Reject/Iterate Flow
**Tasks:**
- [ ] Enter key: Accept changes, apply to document
- [ ] Escape key: Reject changes, restore original
- [ ] Tab key: Request iteration ("make it shorter", "add types")
- [ ] Arrow keys: Navigate between multiple suggestions
- [ ] History: Ctrl+Z after accept reverts to original

**Deliverables:**
- Full keyboard-driven workflow
- Easy iteration on suggestions

#### Milestone 9.5: Multi-Cursor Inline Edit
**Tasks:**
- [ ] Support multiple cursors for batch edits
- [ ] Same instruction applied to each cursor location
- [ ] Preview all changes simultaneously
- [ ] Accept/reject all at once or individually

**Deliverables:**
- Powerful batch editing capability

---

### Phase 10: Code Completion / FIM (Fill-in-the-Middle)
**Duration**: 6-8 days
**Goal**: Intelligent autocomplete as you type

#### Overview: FIM Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILL-IN-THE-MIDDLE (FIM) COMPLETION                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PREFIX (before cursor):                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  function validateUser(user: User): boolean {                       │    │
│  │    if (!user.email) {                                               │    │
│  │      return false;                                                  │    │
│  │    }                                                                │    │
│  │    █  ← CURSOR HERE                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  SUFFIX (after cursor):                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │    return true;                                                     │    │
│  │  }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  AI GENERATES (fills the middle):                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  if (!user.password || user.password.length < 8) {                  │    │
│  │    return false;                                                    │    │
│  │  }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 10.1: FIM Provider Setup
**Tasks:**
- [ ] Create `VybeCompletionProvider` implementing `InlineCompletionItemProvider`
- [ ] Register for all supported languages
- [ ] Debounce triggers (e.g., 300ms after typing stops)
- [ ] Cancellation on further typing

**Deliverables:**
- Completion provider registered
- Triggers on pause in typing

#### Milestone 10.2: Context Extraction for Completions
**Tasks:**
- [ ] Extract PREFIX: ~1500 tokens before cursor
- [ ] Extract SUFFIX: ~500 tokens after cursor
- [ ] Include:
  - Imports at file top
  - Current function/class context
  - Recent edits in file
- [ ] Language-aware tokenization

**Deliverables:**
- Rich FIM context
- Language-specific optimizations

#### Milestone 10.3: Local FIM Model Integration
**Tasks:**
- [ ] Option 1: Use Ollama with FIM-capable models (DeepSeek Coder, Codestral)
- [ ] Option 2: Use cloud API (OpenAI, Anthropic)
- [ ] FIM prompt format (varies by model):
  ```
  <|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>
  ```
- [ ] Parse completion from response
- [ ] Handle multi-line completions

**Deliverables:**
- FIM completions working with local or cloud models

#### Milestone 10.4: Ghost Text Rendering
**Tasks:**
- [ ] Display completion as ghost text (gray, italic)
- [ ] Tab to accept, any other key to dismiss
- [ ] Partial accept: Ctrl+Right to accept word-by-word
- [ ] Multiple suggestions: Ctrl+] / Ctrl+[ to cycle

**Deliverables:**
- Beautiful ghost text UI
- Keyboard shortcuts for navigation

#### Milestone 10.5: Completion Caching & Performance
**Tasks:**
- [ ] Cache completions by (prefix_hash, suffix_hash)
- [ ] Precompute likely next completions
- [ ] Cancel in-flight requests on new keystroke
- [ ] Target: <100ms perceived latency

**Deliverables:**
- Fast, responsive completions
- Low resource usage

#### Milestone 10.6: Smart Completion Triggers
**Tasks:**
- [ ] Trigger on:
  - End of line
  - After `=`, `(`, `{`, `:`, `,`
  - After keywords: `if`, `for`, `function`, `class`
  - After comment lines
- [ ] Don't trigger:
  - In strings (usually)
  - In comments (configurable)
  - While scrolling
  - During paste

**Deliverables:**
- Intelligent trigger logic
- Reduced false positives

---

### Phase 11: Terminal Composer Integration
**Duration**: 2-3 days
**Goal**: AI-powered terminal command generation

#### Overview: Terminal Composer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TERMINAL COMPOSER                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ $ npm run build                                                      │   │
│  │ > vybe@1.0.0 build                                                   │   │
│  │ > tsc && node build.js                                               │   │
│  │ error TS2304: Cannot find name 'User'.                               │   │
│  │ █                                                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ 🤖 [Ctrl+L to ask AI] Fix this TypeScript error                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  AI Response:                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ The error is in `src/auth.ts`. You need to import the User type:    │   │
│  │ ```typescript                                                        │   │
│  │ import { User } from './types';                                      │   │
│  │ ```                                                                  │   │
│  │                                                                      │   │
│  │ [Apply Fix] [Copy Command] [Open File]                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 11.1: Terminal Output Capture
**Tasks:**
- [ ] Capture terminal output for context
- [ ] Detect error patterns (exit codes, stack traces)
- [ ] Extract relevant error message
- [ ] Include recent commands (last 5-10)

**Deliverables:**
- Terminal output available for AI

#### Milestone 11.2: Terminal Inline Composer
**Tasks:**
- [ ] Ctrl+L in terminal triggers composer
- [ ] Composer appears above terminal
- [ ] Pre-fill with error context
- [ ] Suggest fix commands

**Deliverables:**
- Quick AI access from terminal

#### Milestone 11.3: Command Generation & Execution
**Tasks:**
- [ ] AI suggests commands for task
- [ ] User can preview before execution
- [ ] One-click execution
- [ ] Safety check for dangerous commands (rm -rf, etc.)

**Deliverables:**
- AI-generated commands with safety

---

### Phase 12: Editor Composer (Floating Panel)
**Duration**: 4-5 days
**Goal**: Full composer panel in editor (not sidebar chat)

#### Overview: Editor Composer Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EDITOR COMPOSER (Floating Panel)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ Editor Tab Bar ─────────────────────────────────────────────────────┐   │
│  │ auth.ts × │ middleware.ts │ + │                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─ Editor Content ─────────────────────────────────────────────────────┐   │
│  │ 1  │ import { Router } from 'express';                               │   │
│  │ 2  │                                                                 │   │
│  │ 3  │ export function createAuthRouter() {                            │   │
│  │ 4  │   const router = Router();                                      │   │
│  │ 5  │   █                                                             │   │
│  │    │                                                                 │   │
│  │    │  ┌─ Editor Composer (Cmd+I) ──────────────────────────────┐    │   │
│  │    │  │                                                         │    │   │
│  │    │  │  Add login and register routes with JWT                │    │   │
│  │    │  │                                                         │    │   │
│  │    │  │  [@auth.ts] [Model: qwen3] [Mode: Agent]               │    │   │
│  │    │  │                                                 [Send] │    │   │
│  │    │  └─────────────────────────────────────────────────────────┘    │   │
│  │    │                                                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 12.1: Editor Composer Widget
**Tasks:**
- [ ] Create floating panel component
- [ ] Trigger with Cmd+I / Ctrl+I
- [ ] Position: bottom of editor, resizable
- [ ] Same composer components as chat:
  - Context pills
  - Model selector
  - Mode selector
  - Send button

**Deliverables:**
- Floating composer in editor
- Keyboard shortcut trigger

#### Milestone 12.2: Context-Aware Defaults
**Tasks:**
- [ ] Auto-add current file as context pill
- [ ] Include selection if any
- [ ] Show cursor location
- [ ] Pre-fill with common patterns

**Deliverables:**
- Smart defaults for editor context

#### Milestone 12.3: Streaming Response in Editor
**Tasks:**
- [ ] Response appears below composer
- [ ] Code changes apply inline (with diff highlighting)
- [ ] Text explanations in overlay
- [ ] Accept/Reject controls

**Deliverables:**
- Full response rendering in editor

---

### Phase 13: @ Mentions & Context System
**Duration**: 4-5 days
**Goal**: Rich context referencing like Cursor's @ system

#### Overview: @ Mention Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  @ MENTION TYPES                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  @file     - Reference specific file       @auth.ts                         │
│  @folder   - Reference directory           @src/components                   │
│  @symbol   - Reference function/class      @validateUser                     │
│  @code     - Reference code block          @selection                        │
│  @docs     - Reference documentation       @react                            │
│  @web      - Search web                    @web how to use JWT               │
│  @codebase - Semantic search               @codebase auth handling           │
│  @git      - Git history/diff              @git diff HEAD~1                  │
│  @terminal - Terminal output               @terminal last-error              │
│  @image    - Attach image                  @image screenshot.png             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 13.1: @ Trigger Detection
**Tasks:**
- [ ] Detect `@` character in composer input
- [ ] Show autocomplete dropdown
- [ ] Categories: Files, Folders, Symbols, Docs, Web, Codebase
- [ ] Fuzzy search within each category

**Deliverables:**
- @ triggers autocomplete menu

#### Milestone 13.2: File/Folder Picker
**Tasks:**
- [ ] `@` shows recent files first
- [ ] Type to filter by path
- [ ] Tab to complete
- [ ] Show file icons and paths

**Deliverables:**
- Quick file/folder reference

#### Milestone 13.3: Symbol Picker
**Tasks:**
- [ ] `@` + function/class name
- [ ] Search symbols across workspace
- [ ] Show symbol type (function, class, variable)
- [ ] Jump-to-definition on hover

**Deliverables:**
- Reference functions/classes by name

#### Milestone 13.4: @web and @docs Integration
**Tasks:**
- [ ] `@web` triggers web search
- [ ] `@docs` triggers documentation search
- [ ] Index common docs (React, Node, TypeScript)
- [ ] Show search results inline

**Deliverables:**
- Web and documentation context

#### Milestone 13.5: @codebase Semantic Search
**Tasks:**
- [ ] `@codebase` triggers semantic search
- [ ] Uses local embeddings (Phase 4)
- [ ] Shows top-k relevant files/chunks
- [ ] User can select which to include

**Deliverables:**
- Powerful codebase search

---

### Phase 14: Rules & Instructions System
**Duration**: 2-3 days
**Goal**: User-defined AI behavior rules

#### Overview: Rules System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RULES SYSTEM (.vybe/rules)                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  .vybe/rules/                                                               │
│  ├── project.md       ← Project-wide rules (always applied)                │
│  ├── react.md         ← Applied to React files                             │
│  ├── testing.md       ← Applied to test files                              │
│  └── typescript.md    ← Applied to TypeScript files                        │
│                                                                              │
│  Example .vybe/rules/project.md:                                            │
│  ───────────────────────────────────────────────────────────────────────    │
│  # Project Rules                                                            │
│                                                                              │
│  - Use functional components with hooks, not class components               │
│  - All functions must have TypeScript types                                 │
│  - Use `async/await` instead of `.then()` chains                           │
│  - Error messages should be user-friendly, not technical                    │
│  - Always add JSDoc comments to exported functions                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 14.1: Rules File Detection
**Tasks:**
- [ ] Watch for `.vybe/rules/` directory
- [ ] Parse markdown rules files
- [ ] Determine which rules apply (by file pattern, language)
- [ ] Cache parsed rules

**Deliverables:**
- Rules automatically detected

#### Milestone 14.2: Rules Injection into Prompts
**Tasks:**
- [ ] Inject applicable rules into system prompt
- [ ] Token budget for rules (e.g., max 1000 tokens)
- [ ] Priority: project.md > language-specific > file-specific

**Deliverables:**
- Rules affect AI behavior

#### Milestone 14.3: Rules UI
**Tasks:**
- [ ] Show active rules in composer
- [ ] Quick edit rules from UI
- [ ] Preview which rules apply to current file

**Deliverables:**
- User can manage rules easily

---

### Phase 15: Advanced Features & Polish
**Duration**: 5-7 days
**Goal**: Production-grade experience

#### Milestone 15.1: Image/Vision Support
**Tasks:**
- [ ] Paste images into composer
- [ ] Encode as base64 for vision models
- [ ] Support: screenshots, diagrams, UI mockups
- [ ] Vision model selection (GPT-4V, Claude, etc.)

**Deliverables:**
- Image understanding in chat

#### Milestone 15.2: Voice Input
**Tasks:**
- [ ] Microphone button in composer
- [ ] Speech-to-text (Web Speech API or Whisper)
- [ ] Voice commands: "Edit the function above"
- [ ] Optional: Text-to-speech for responses

**Deliverables:**
- Hands-free coding assistance

#### Milestone 15.3: Background Agents
**Tasks:**
- [ ] Long-running agents for complex tasks
- [ ] Progress indicators
- [ ] Can continue while user works
- [ ] Notification when complete

**Deliverables:**
- Non-blocking agent execution

#### Milestone 15.4: Settings & Preferences UI
**Tasks:**
- [ ] VYBE settings page in VS Code settings
- [ ] Configurable:
  - Default model
  - Auto-complete enabled/disabled
  - Keyboard shortcuts
  - Context window size
  - Privacy settings
- [ ] Sync settings across devices

**Deliverables:**
- Full configuration UI

#### Milestone 15.5: Telemetry & Analytics (Opt-in)
**Tasks:**
- [ ] Track usage patterns (opt-in)
- [ ] Error reporting
- [ ] Performance metrics
- [ ] User feedback collection

**Deliverables:**
- Data for improvement

---

## 📊 UPDATED IMPLEMENTATION PRIORITY MATRIX

```
                         IMPACT
                         High │
                              │  Phase 1: Tool Calling ←── START HERE
                              │  Phase 2: Context Collection
                              │  Phase 7: Summarization
                              │  Phase 9: Inline Edit (Ctrl+K)
                              │  Phase 10: Code Completion (FIM)
                              │
                         Med  │  Phase 3: Tool UI
                              │  Phase 4: Local Embeddings
                              │  Phase 8: File Condensation
                              │  Phase 11: Terminal Composer
                              │  Phase 13: @ Mentions
                              │
                         Low  │  Phase 5: Multi-Agent
                              │  Phase 6: Polish
                              │  Phase 12: Editor Composer
                              │  Phase 14: Rules System
                              │  Phase 15: Advanced Features
                              │
                              └─────────────────────────────────────
                                   Easy       Medium       Hard
                                           EFFORT
```

---

## 📅 FULL TIMELINE (Recommended Order)

| Phase | Name | Duration | Cumulative |
|-------|------|----------|------------|
| 0 | Stabilization | 1-2 days | Day 2 |
| 1 | Wire Tools to LLM | 3-4 days | Day 6 |
| 2 | Context Collection | 2-3 days | Day 9 |
| 3 | Tool Calling UI | 2-3 days | Day 12 |
| 4 | Local Embeddings | 3-4 days | Day 16 |
| 7 | Context Summarization | 4-5 days | Day 21 |
| 8 | File Condensation | 3-4 days | Day 25 |
| 9 | Inline Edit (Ctrl+K) | 5-7 days | Day 32 |
| 10 | Code Completion (FIM) | 6-8 days | Day 40 |
| 11 | Terminal Composer | 2-3 days | Day 43 |
| 13 | @ Mentions | 4-5 days | Day 48 |
| 5 | Multi-Agent | 4-5 days | Day 53 |
| 6 | Advanced Features | 5-7 days | Day 60 |
| 12 | Editor Composer | 4-5 days | Day 65 |
| 14 | Rules System | 2-3 days | Day 68 |
| 15 | Polish & Advanced | 5-7 days | Day 75 |

**Total Estimated Time**: ~75 working days (~15 weeks / ~4 months)

---

## 🎯 MVP DEFINITION (Phases 0-4)

For a **Minimum Viable Product**, complete Phases 0-4:

| Feature | Included in MVP |
|---------|-----------------|
| Chat with streaming | ✅ |
| Tool calling (read/write files) | ✅ |
| Context from IDE | ✅ |
| Tool approval UI | ✅ |
| Local semantic search | ✅ |
| Context summarization | ❌ (Phase 7) |
| Inline edit (Ctrl+K) | ❌ (Phase 9) |
| Code completion (FIM) | ❌ (Phase 10) |

**MVP Timeline**: ~2-3 weeks

---

## 🔑 SUCCESS CRITERIA

| Metric | Current | MVP Target | Production Target |
|--------|---------|------------|-------------------|
| Tool calls per session | 0 | 5-10 | 20-50 |
| Context tokens utilized | ~500 | 4,000 | 8,000+ |
| Inline edit usage | 0 | N/A | 10/day |
| Completion acceptance rate | 0 | N/A | >30% |
| User approval rate | N/A | >80% | >90% |
| Time to first response | ~3s | <2s | <1s |
| Sessions per user/day | ? | 3-5 | 10+ |

---

*This document is the source of truth for VYBE's path to production.*

