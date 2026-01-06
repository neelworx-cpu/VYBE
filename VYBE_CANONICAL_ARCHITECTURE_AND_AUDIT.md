# VYBE Canonical Architecture & Full System Audit

**Date**: 2025-01-XX
**Status**: AUTHORITATIVE ARCHITECTURE REFERENCE
**Mode**: Architecture Definition & Audit - NO IMPLEMENTATION

---

## ARCHITECTURE RULES (NON-NEGOTIABLE)

### 1. MCP is the Agent Runtime
- **Owns**: Planning, memory, orchestration, tool sequencing
- **Always runs as**: SEPARATE PROCESS
- **Never**: Embedded inside the IDE
- **Must be**: Independently runnable

### 2. VYBE IDE is a Capability Host
- **Owns**: LLM transport, editor actions, filesystem, UI
- **Implements**: Tool handlers ONLY
- **Must never contain**: Agent logic, memory, or orchestration

### 3. Repos stay separate
- VYBE IDE repo (separate git)
- VYBE-MCP repo (separate git)
- No code merging, no shared runtime

### 4. Transport rules
- **Local mode**: stdio ONLY (no HTTP)
- **Remote mode**: HTTP/SSE ONLY (explicit opt-in)
- **IDE must NOT**: Expose any HTTP server by default
- **IDE provides**: A **stdio tool host**, not a peer MCP server

### 5. Directionality
- MCP calls IDE tools
- IDE never calls MCP internals
- IDE executes tools; MCP decides WHEN and WHY

### 6. LLM Authority
- **MCP selects**: Intent (model_id, capability needs)
- **IDE selects**: Transport (provider, endpoint, credentials)
- **MCP must never**: Manage provider credentials directly

---

## STEP 1 — CORRECTED IMPLEMENTATION PLAN

### Architecture Flow (Local Mode)

```
┌─────────────────────────────────────────────────────────┐
│                    VYBE IDE                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Launcher (spawns subprocess)                  │  │
│  │  - Spawn: node /path/to/VYBE-MCP/build/index.js   │  │
│  │  - Transport: stdio (stdin/stdout)                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  IDE MCP Tool Host (stdio transport)             │  │
│  │  - NOT a peer MCP server                         │  │
│  │  - Exposes tools via stdio for spawned MCP       │  │
│  │  - Tools: vybe.send_llm_message, etc.            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  IDE Tool Handlers                               │  │
│  │  - vybe.send_llm_message → IVybeLLMMessageService│  │
│  │  - vybe.list_models → IVybeLLMModelService       │  │
│  │  - vybe.read_file → IFileService                 │  │
│  │  - vybe.write_file → IFileService                │  │
│  │  - vybe.apply_patch → IVybeEditService           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │
         │ stdio              │ stdio (tool calls)
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              VYBE-MCP (spawned process)                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Server (stdio transport)                   │  │
│  │  - Receives tool calls from external clients    │  │
│  │  - Exposes MCP tools to external clients        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Agent Runtime                                   │  │
│  │  - Planning, memory, orchestration                │  │
│  │  - Calls IDE tools via stdio MCP client          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Client (connects to IDE stdio tool host)   │  │
│  │  - Calls: vybe.send_llm_message                  │  │
│  │  - Calls: vybe.list_models                       │  │
│  │  - Calls: vybe.read_file                         │  │
│  │  - Calls: vybe.write_file                        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Corrections**:
- IDE provides **stdio tool host**, NOT a peer MCP server
- IDE spawns MCP subprocess with stdio transport
- MCP connects back to IDE via stdio MCP client
- No HTTP/network exposure in local mode

### What IDE Must NEVER Implement

1. **Agent Logic**:
   - Planning algorithms
   - Task decomposition
   - Agent orchestration
   - Multi-agent coordination

2. **Memory Systems**:
   - Long-term memory storage
   - Memory graphs
   - Agent state persistence
   - Task graph management

3. **Orchestration**:
   - Tool sequencing logic
   - Decision-making about which tools to call
   - Agent level selection (L1/L2/L3)
   - Recursion depth management

4. **MCP Server Logic**:
   - MCP protocol server implementation (except stdio tool host)
   - Tool registry for agent tools
   - Agent tool execution

### What IDE MUST Implement

1. **Tool Host (stdio)**:
   - Expose tools via stdio for spawned MCP
   - Handle tool invocations from MCP
   - Bridge tool calls to IDE services

2. **Tool Handlers**:
   - Implement `vybe.*` tool handlers
   - Execute tools in IDE process
   - Return results to MCP

3. **MCP Launcher**:
   - Spawn MCP subprocess
   - Configure stdio transport
   - Manage MCP process lifecycle

---

## STEP 2 — FULL AUDIT: VYBE IDE REPO

### A. LLM Transport

**Location**: `src/vs/workbench/contrib/vybeLLM/`

**Purpose**: Local LLM provider integration (Ollama, LM Studio)

**Responsibilities**:
- Send LLM messages (streaming)
- List models from providers
- Abort requests
- Manage provider settings

**Current Capabilities**:
- ✅ Send chat messages (streaming)
- ✅ List models from providers
- ✅ Abort requests
- ✅ Provider settings management
- ✅ IPC communication (renderer ↔ main)
- ✅ Main process LLM calls

**MCP Should Call**: **YES**
- Tool: `vybe.send_llm_message` ✅ (exists)
- Tool: `vybe.list_models` ✅ (exists)
- Tool: `vybe.abort_llm_request` (needed)

**MCP Must NOT Access**:
- Provider settings (API keys, endpoints) - IDE manages internally
- Provider credential storage

**Security Risk**: Low (LLM calls only)

**Status**: **READY** (partial - missing abort tool)

---

### B. Diff Engine

**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: Compute and display diffs between original and modified content

**Responsibilities**:
- Compute diffs (original vs modified)
- Update diffs for streaming
- Manage diff areas

**Current Capabilities**:
- ✅ Compute diffs
- ✅ Update diffs for streaming
- ✅ Manage diff areas
- ✅ Get diff areas for URI

**MCP Should Call**: **YES**
- Tool: `vybe.compute_diff` (needed)
- Tool: `vybe.get_diff_areas` (needed)

**MCP Must NOT Access**:
- Direct diff computation internals
- Diff decoration rendering

**Security Risk**: Low (diff computation only)

**Status**: **PARTIAL** (service exists, tools missing)

---

### C. Edit Transactions

**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: Manage edit transactions and lifecycle

**Responsibilities**:
- Create edit transactions
- Accept/reject diffs
- Manage transaction state

**Current Capabilities**:
- ✅ Create edit transactions
- ✅ Accept/reject diffs (single, file, all)
- ✅ Get transaction by ID
- ✅ Get all diffs
- ✅ Get edited files

**MCP Should Call**: **YES**
- Tool: `vybe.create_edit_transaction` (needed)
- Tool: `vybe.accept_diff` (needed)
- Tool: `vybe.reject_diff` (needed)
- Tool: `vybe.get_edit_transaction` (needed)
- Tool: `vybe.get_all_diffs` (needed)
- Tool: `vybe.get_edited_files` (needed)

**MCP Must NOT Access**:
- Direct transaction state manipulation
- UI rendering of transactions

**Security Risk**: Medium (state creation), High (code changes via accept/reject)

**Status**: **PARTIAL** (service exists, tools missing)

---

### D. File Operations

**Location**: `src/vs/workbench/contrib/files/` (upstream), `src/vs/workbench/contrib/vybeChat/` (custom)

**Purpose**: Read/write files, list directories

**Responsibilities**:
- Read file contents
- Write file contents
- List directory contents
- Get file metadata

**Current Capabilities**:
- ✅ Read file (via upstream IFileService)
- ✅ Write file (via upstream IFileService)
- ✅ List directory (via upstream IFileService)
- ✅ Get file info (via upstream IFileService)

**MCP Should Call**: **YES**
- Tool: `vybe.read_file` (needed)
- Tool: `vybe.write_file` (needed)
- Tool: `vybe.list_files` (needed)
- Tool: `vybe.get_file_info` (needed)

**MCP Must NOT Access**:
- Direct filesystem access
- File watchers
- File decoration rendering

**Security Risk**: Medium (file access), High (file writes)

**Status**: **PARTIAL** (services exist, tools missing)

---

### E. Indexing System

**Location**: `src/vs/workbench/contrib/indexing/`

**Purpose**: Codebase indexing for context retrieval

**Responsibilities**:
- Index codebase
- Hybrid search (lexical + vector + graph)
- Get indexing status

**Current Capabilities**:
- ✅ Codebase indexing
- ✅ Context retrieval
- ✅ Hybrid search
- ✅ Indexing status

**MCP Should Call**: **YES**
- Tool: `vybe.get_context_for_mcp` ✅ (exists)
- Tool: `vybe.search_hybrid` ✅ (exists)
- Tool: `vybe.list_index_status` ✅ (exists)
- Tool: `vybe.refresh_index` (needed)

**MCP Must NOT Access**:
- Direct indexing internals
- Index storage format

**Security Risk**: Low (read-only), Medium (indexing)

**Status**: **READY** (mostly complete)

---

### F. Checkpoint Service

**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: File state checkpoints for rollback

**Responsibilities**:
- Create checkpoints
- Restore from checkpoints
- Manage checkpoint lifecycle

**Current Capabilities**:
- ✅ Create checkpoints
- ✅ Restore from checkpoints
- ✅ Get checkpoint by ID
- ✅ Get all checkpoints

**MCP Should Call**: **YES**
- Tool: `vybe.create_checkpoint` (needed)
- Tool: `vybe.restore_checkpoint` (needed)
- Tool: `vybe.get_checkpoint` (needed)

**MCP Must NOT Access**:
- Direct checkpoint storage
- Checkpoint UI rendering

**Security Risk**: Medium (state capture), High (state restore)

**Status**: **PARTIAL** (service exists, tools missing)

---

### G. Terminal & Execution

**Location**: `src/vs/workbench/contrib/terminal/` (upstream)

**Purpose**: Execute commands and run tests

**Responsibilities**:
- Run shell commands
- Run tests
- Get terminal output

**Current Capabilities**:
- ✅ Execute commands (via upstream ITerminalService)
- ✅ Run tests (via upstream ITestingService)
- ✅ Get terminal output

**MCP Should Call**: **YES**
- Tool: `vybe.run_command` (needed, **CRITICAL**)
- Tool: `vybe.run_tests` (needed, **CRITICAL**)
- Tool: `vybe.get_terminal_output` (needed)

**MCP Must NOT Access**:
- Direct terminal access
- Terminal UI rendering

**Security Risk**: **CRITICAL** (code execution)

**Status**: **PARTIAL** (services exist, tools missing)

---

### H. MCP Integration Layer

**Location**: `src/vs/workbench/contrib/mcp/`

**Purpose**: MCP server management and tool execution

**Current State**:
- ✅ MCP service exists
- ✅ MCP server connection management
- ✅ Tool request handling
- ✅ Vybe-specific tools registered

**Issues**:
- ⚠️ Current implementation may expose HTTP server (needs audit)
- ⚠️ Tool host implementation unclear (needs stdio tool host)

**MCP Should Call**: **N/A** (this is the integration layer)

**MCP Must NOT Access**:
- MCP server internals
- Tool registry internals

**Security Risk**: Medium (if HTTP exposed)

**Status**: **PARTIAL** (needs stdio tool host implementation)

---

### I. UI Rendering vs Execution Boundaries

**Location**: `src/vs/workbench/contrib/vybeChat/browser/`

**Purpose**: UI components for chat, diffs, and editor interactions

**Responsibilities**:
- Render chat UI
- Render markdown/code blocks
- Display diffs
- Handle user interactions

**MCP Should Call**: **NO**
- UI rendering is IDE-internal
- MCP should not manipulate UI directly

**MCP Must NOT Access**:
- Direct UI manipulation
- Rendering internals
- User interaction handlers

**Security Risk**: High (UI manipulation)

**Status**: **READY** (correctly isolated)

---

## STEP 3 — FULL AUDIT: VYBE-MCP REPO

### A. Agent Layers

**Location**: `src/agents/`

**Purpose**: Multi-level agent system (L1/L2/L3)

**Current State**:
- ✅ `agent_l1.ts` - Basic agent
- ✅ `agent_l2.ts` - Intermediate agent
- ✅ `agent_l3.ts` - Advanced agent
- ✅ `orchestrator.ts` - Task orchestration

**LLM Calls**:
- All agents use `llm.completeStream()` or `llm.chatStream()`
- LLM service uses adapter pattern (IDE or Cloud)

**What Must Be Replaced**:
- ✅ Already using adapter pattern - **NO CHANGE NEEDED**
- LLM calls will route to IDE via `IDELLMAdapter`

**What Must Remain MCP-Internal**:
- Agent logic
- Planning algorithms
- Task decomposition
- Agent orchestration

**Status**: **READY** (already adapter-based)

---

### B. Planning Flow

**Location**: `src/agents/orchestrator.ts`, `src/agents/agent_l1.ts`, etc.

**Purpose**: Task planning and decomposition

**Current State**:
- ✅ Orchestrator dispatches to agents
- ✅ Agents plan and decompose tasks
- ✅ Recursion depth management
- ✅ Safety policy enforcement

**LLM Usage**:
- Planning prompts use `llm.completeStream()`
- Will route to IDE via adapter

**What Must Be Replaced**:
- ✅ Already using adapter - **NO CHANGE NEEDED**

**What Must Remain MCP-Internal**:
- Planning logic
- Task decomposition
- Recursion management
- Safety policy

**Status**: **READY**

---

### C. Memory Systems

**Location**: `src/memory/`

**Purpose**: Long-term memory storage and retrieval

**Current State**:
- ✅ `memory_service_v2.ts` - Memory service
- ✅ `graph_service.ts` - Memory graph
- ✅ Memory storage in Supabase
- ✅ Semantic search via embeddings

**LLM Usage**:
- Memory retrieval uses embeddings (no LLM)
- Memory storage uses embeddings (no LLM)

**What Must Be Replaced**:
- **NONE** - Memory is MCP-internal

**What Must Remain MCP-Internal**:
- All memory systems
- Memory graphs
- Memory storage
- Memory retrieval

**Status**: **READY** (correctly isolated)

---

### D. Tool Registry

**Location**: `src/tools/registry.ts`, `src/tools/index.ts`

**Purpose**: Tool registration and execution

**Current State**:
- ✅ Tool registry exists
- ✅ Tools registered by plane (local, cloud, agent, execution)
- ✅ Tool execution in MCP process

**Tool Categories**:
1. **Local Plane**: `read_file`, `write_file`, `list_dir`, `apply_patch`, etc.
2. **Cloud Plane**: `search_codebase`, `get_memory`, `get_session`, etc.
3. **Agent Plane**: `solve_task`, `vybe_solve_task`, etc.
4. **Execution Plane**: `run_command`, `run_tests`

**What Must Be Replaced**:
- **Local Plane tools** that access filesystem → Must call IDE tools
  - `read_file` → `vybe.read_file`
  - `write_file` → `vybe.write_file`
  - `list_dir` → `vybe.list_files`
  - `apply_patch` → `vybe.apply_patch`
- **LLM calls** → Already using adapter (no change)

**What Must Remain MCP-Internal**:
- Tool registry
- Tool execution orchestration
- Agent plane tools
- Cloud plane tools (Supabase)
- Execution plane tools (sandboxed)

**Status**: **PARTIAL** (local tools need IDE migration)

---

### E. Tool Execution Model

**Location**: `src/tools/`

**Purpose**: Tool execution and safety

**Current State**:
- ✅ Tools execute in MCP process
- ✅ Safety policy enforcement
- ✅ Path validation
- ✅ Snapshot service
- ✅ Audit logging

**What Must Be Replaced**:
- **File operations** → Call IDE tools
- **Patch application** → Call IDE tools
- **LLM calls** → Already using adapter

**What Must Remain MCP-Internal**:
- Safety policy
- Path validation
- Snapshot service (if MCP-managed)
- Audit logging (if MCP-managed)
- Tool execution orchestration

**Status**: **PARTIAL** (needs IDE tool migration)

---

### F. Streaming Model

**Location**: `src/agents/streaming_utils.ts`

**Purpose**: Stream LLM responses and tool outputs

**Current State**:
- ✅ `emitPartialOutputStream()` - Stream LLM output
- ✅ `emitThoughtStream()` - Stream agent thoughts
- ✅ Event emission via task event registry

**LLM Usage**:
- Uses `llm.completeStream()` with callbacks
- Will route to IDE via adapter

**What Must Be Replaced**:
- ✅ Already using adapter - **NO CHANGE NEEDED**

**What Must Remain MCP-Internal**:
- Streaming orchestration
- Event emission
- Task event registry

**Status**: **READY**

---

### G. Where LLM Calls Happen Today

**Files with LLM calls**:
1. `src/agents/orchestrator.ts` - `llm.completeStream()`
2. `src/agents/agent_l1.ts` - `llm.completeStream()`
3. `src/agents/agent_l3.ts` - `llm.completeStream()`
4. `src/agents/streaming_utils.ts` - `llm.chat()`, `llm.chatStream()`

**Current Implementation**:
- All use `llm` singleton from `src/core/llm.ts`
- LLM service uses adapter pattern
- Adapter routes to IDE (if available) or Cloud

**What Must Be Replaced**:
- ✅ **ALREADY REPLACED** - Using adapter pattern
- No changes needed to LLM call sites

**Status**: **READY**

---

## STEP 4 — TOOL SURFACE CONTRACT

### Definitive Tool Contract Table

| Tool Name | Sync/Stream | Read/Mutate | Required Approvals | Security Risk | Phase | Status |
|-----------|-------------|-------------|-------------------|---------------|-------|--------|
| `vybe.send_llm_message` | Streaming | Read-only | None | Low | P1 | ✅ Done |
| `vybe.list_models` | Sync | Read-only | None | None | P1 | ✅ Done |
| `vybe.abort_llm_request` | Sync | Read-only | None | None | P1 | ⚠️ Needed |
| `vybe.read_file` | Sync | Read-only | None | Medium | P2 | ⚠️ Needed |
| `vybe.write_file` | Sync | Mutating | User approval (high-risk) | High | P2 | ⚠️ Needed |
| `vybe.list_files` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.get_file_info` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.apply_patch` | Sync | Mutating | User approval (high-risk) | High | P2 | ⚠️ Needed |
| `vybe.compute_diff` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.get_diff_areas` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.create_edit_transaction` | Sync | Mutating | None | Medium | P2 | ⚠️ Needed |
| `vybe.accept_diff` | Sync | Mutating | User approval (high-risk) | High | P2 | ⚠️ Needed |
| `vybe.reject_diff` | Sync | Mutating | None | Medium | P2 | ⚠️ Needed |
| `vybe.get_edit_transaction` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.get_all_diffs` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.get_edited_files` | Sync | Read-only | None | Low | P2 | ⚠️ Needed |
| `vybe.create_checkpoint` | Sync | Mutating | None | Medium | P3 | ⚠️ Needed |
| `vybe.restore_checkpoint` | Sync | Mutating | User approval (high-risk) | High | P3 | ⚠️ Needed |
| `vybe.get_checkpoint` | Sync | Read-only | None | Low | P3 | ⚠️ Needed |
| `vybe.get_context_for_mcp` | Sync | Read-only | None | Low | P1 | ✅ Done |
| `vybe.search_hybrid` | Sync | Read-only | None | Low | P1 | ✅ Done |
| `vybe.list_index_status` | Sync | Read-only | None | None | P1 | ✅ Done |
| `vybe.refresh_index` | Sync | Mutating | None | Medium | P3 | ⚠️ Needed |
| `vybe.run_command` | Streaming | Mutating | User approval (**CRITICAL**) | **CRITICAL** | P3 | ⚠️ Needed |
| `vybe.run_tests` | Streaming | Mutating | User approval (**CRITICAL**) | **CRITICAL** | P3 | ⚠️ Needed |
| `vybe.get_terminal_output` | Sync | Read-only | None | Low | P3 | ⚠️ Needed |

### Tools That Must NEVER Exist

1. **Agent State Tools**:
   - `vybe.get_agent_state` - Agent state is MCP-internal
   - `vybe.set_agent_state` - Agent state is MCP-internal
   - `vybe.get_memory` - Memory is MCP-internal
   - `vybe.store_memory` - Memory is MCP-internal

2. **Orchestration Tools**:
   - `vybe.plan_task` - Planning is MCP-internal
   - `vybe.delegate_task` - Delegation is MCP-internal
   - `vybe.select_tools` - Tool selection is MCP-internal

3. **UI Manipulation Tools**:
   - `vybe.show_notification` - UI is IDE-internal
   - `vybe.update_ui` - UI is IDE-internal
   - `vybe.focus_editor` - UI is IDE-internal

4. **Provider Credential Tools**:
   - `vybe.set_provider_settings` - Credentials are IDE-internal
   - `vybe.get_provider_settings` - Credentials are IDE-internal

---

## STEP 5 — GAP & PHASING REPORT

### What Already Exists

**VYBE IDE**:
- ✅ LLM transport (Ollama, LM Studio)
- ✅ LLM message service
- ✅ LLM model service
- ✅ Diff service
- ✅ Edit service
- ✅ Checkpoint service
- ✅ Indexing system
- ✅ File operations (via upstream)
- ✅ Terminal service (via upstream)
- ✅ MCP integration layer (partial)

**VYBE-MCP**:
- ✅ Agent system (L1/L2/L3)
- ✅ Orchestrator
- ✅ Memory system
- ✅ Tool registry
- ✅ LLM adapter pattern
- ✅ Safety policy
- ✅ Snapshot service
- ✅ Audit logging

### What Must Be Built

**VYBE IDE** (Phase 1 - Core Architecture):
1. **IDE stdio tool host** - Expose tools via stdio for spawned MCP
2. **MCP launcher** - Spawn MCP subprocess with stdio transport
3. **Tool handler bridge** - Connect MCP tool calls to IDE services

**VYBE IDE** (Phase 2 - Essential Tools):
1. `vybe.abort_llm_request` - Abort in-flight LLM requests
2. `vybe.read_file` - Read file contents
3. `vybe.write_file` - Write file contents (with approval)
4. `vybe.list_files` - List directory contents
5. `vybe.get_file_info` - Get file metadata
6. `vybe.apply_patch` - Apply patch to file (with approval)
7. `vybe.compute_diff` - Compute diffs
8. `vybe.get_diff_areas` - Get diff areas
9. `vybe.create_edit_transaction` - Create edit transaction
10. `vybe.accept_diff` - Accept diff (with approval)
11. `vybe.reject_diff` - Reject diff
12. `vybe.get_edit_transaction` - Get transaction
13. `vybe.get_all_diffs` - Get all diffs
14. `vybe.get_edited_files` - Get edited files

**VYBE IDE** (Phase 3 - Advanced Tools):
1. `vybe.create_checkpoint` - Create checkpoint
2. `vybe.restore_checkpoint` - Restore checkpoint (with approval)
3. `vybe.get_checkpoint` - Get checkpoint
4. `vybe.refresh_index` - Refresh index
5. `vybe.run_command` - Run command (**CRITICAL**, with approval)
6. `vybe.run_tests` - Run tests (**CRITICAL**, with approval)
7. `vybe.get_terminal_output` - Get terminal output

**VYBE-MCP** (Phase 2 - Tool Migration):
1. Replace `read_file` tool → Call `vybe.read_file`
2. Replace `write_file` tool → Call `vybe.write_file`
3. Replace `list_dir` tool → Call `vybe.list_files`
4. Replace `apply_patch` tool → Call `vybe.apply_patch`

### What Must Be Deleted or Refactored

**VYBE IDE**:
- ⚠️ **AUDIT NEEDED**: Check if MCP integration exposes HTTP server (must be stdio only)
- ⚠️ **AUDIT NEEDED**: Remove any agent logic from IDE (if exists)

**VYBE-MCP**:
- ⚠️ **REFACTOR**: Local plane file tools must call IDE tools instead of direct filesystem
- ✅ **NO CHANGE**: LLM adapter pattern is correct

### Phased Roadmap

#### Phase 1: Core Architecture (Required)
**Goal**: Enable MCP to call IDE tools via stdio

**Tasks**:
1. Implement IDE stdio tool host
2. Implement MCP launcher
3. Implement tool handler bridge
4. Test: L1 agent uses Ollama via IDE adapter

**Deliverables**:
- IDE stdio tool host implementation
- MCP launcher implementation
- Tool handler bridge
- End-to-end test with L1 agent

**Timeline**: 1-2 weeks

---

#### Phase 2: Essential Tools (High Priority)
**Goal**: Enable basic file operations and diff management

**Tasks**:
1. Implement file operation tools (`read_file`, `write_file`, `list_files`, `get_file_info`)
2. Implement diff tools (`compute_diff`, `get_diff_areas`)
3. Implement edit transaction tools (`create_edit_transaction`, `accept_diff`, `reject_diff`, etc.)
4. Implement `abort_llm_request` tool
5. Migrate MCP local plane tools to call IDE tools

**Deliverables**:
- All Phase 2 tools implemented
- MCP local plane tools migrated
- Approval gates for high-risk operations
- End-to-end test with file operations

**Timeline**: 2-3 weeks

---

#### Phase 3: Advanced Tools (Medium Priority)
**Goal**: Enable checkpoint management and execution

**Tasks**:
1. Implement checkpoint tools (`create_checkpoint`, `restore_checkpoint`, `get_checkpoint`)
2. Implement execution tools (`run_command`, `run_tests`, `get_terminal_output`) with **CRITICAL** approval gates
3. Implement `refresh_index` tool

**Deliverables**:
- All Phase 3 tools implemented
- Approval gates for critical operations
- End-to-end test with execution

**Timeline**: 2-3 weeks

---

#### Phase 4: Remote Mode (Low Priority)
**Goal**: Enable remote MCP connection (opt-in)

**Tasks**:
1. Implement IDE HTTP tool host (opt-in, explicit config)
2. Implement remote MCP connector
3. Configuration for remote mode

**Deliverables**:
- IDE HTTP tool host (opt-in)
- Remote MCP connector
- Configuration system

**Timeline**: 1-2 weeks

---

### Architectural Drift Prevention

**Checkpoints**:
1. After Phase 1: Verify no agent logic in IDE
2. After Phase 2: Verify all file operations go through IDE tools
3. After Phase 3: Verify approval gates for critical operations
4. After Phase 4: Verify remote mode is opt-in only

**Validation Rules**:
- No agent logic in IDE codebase
- No memory systems in IDE codebase
- No orchestration logic in IDE codebase
- All file operations must go through IDE tools
- All LLM calls must go through IDE transport
- Approval gates for high-risk operations

---

## SUMMARY

### Architecture Compliance
- ✅ MCP is agent runtime (separate process)
- ✅ IDE is capability host (tool handlers only)
- ✅ Repos stay separate
- ✅ Transport: stdio for local, HTTP/SSE for remote (opt-in)
- ✅ Directionality: MCP calls IDE tools
- ✅ LLM authority: MCP selects intent, IDE selects transport

### Implementation Status
- **Phase 1**: 0% (needs stdio tool host, launcher, bridge)
- **Phase 2**: 20% (2/14 tools done, 12 needed)
- **Phase 3**: 0% (0/7 tools done)
- **Phase 4**: 0% (not started)

### Critical Gaps
1. IDE stdio tool host (missing)
2. MCP launcher (missing)
3. Tool handler bridge (missing)
4. File operation tools (missing)
5. Diff/edit tools (missing)
6. Execution tools with approval gates (missing)

### Next Steps
1. **Review & Approve** this architecture document
2. **Implement Phase 1** (Core Architecture)
3. **Implement Phase 2** (Essential Tools)
4. **Test end-to-end** with L1 agent
5. **Iterate** based on testing results

---

**END OF CANONICAL ARCHITECTURE & AUDIT DOCUMENT**



