# VYBE Architecture Realignment & Full System Audit

**Date**: 2025-01-XX
**Status**: Architecture Definition & Audit Phase
**Mode**: STOP ALL IMPLEMENTATION - Architecture + Audit Only

---

## 1️⃣ ARCHITECTURAL REALIGNMENT

### Authority Model (Non-Negotiable)

#### MCP is the Agent Runtime
- **Owns**: Planning, memory, multi-agent orchestration, tool sequencing, decision-making
- **Runs**: As separate process (always)
- **State**: Long-lived reasoning state, agent state, memory graphs, task orchestration
- **Never**: Embedded in IDE, shares process with IDE

#### VYBE IDE is a Capability Host
- **Owns**: LLM transport, editor + filesystem actions, UI surfaces and widgets
- **Provides**: Tool handlers that MCP can call
- **Never**: Agent state, memory graphs, task orchestration, long-lived reasoning state

### Process & Repository Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    VYBE IDE (Repo 1)                    │
│  - Separate git repository                              │
│  - Electron app (main + renderer)                      │
│  - Provides capability tools                           │
│  - NO agent logic                                       │
└─────────────────────────────────────────────────────────┘
         │                    │
         │ (spawn)            │ (stdio transport)
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              VYBE-MCP (Repo 2)                          │
│  - Separate git repository                              │
│  - Standalone Node.js process                           │
│  - Agent runtime (planning, memory, orchestration)      │
│  - Calls IDE tools via MCP protocol                    │
│  - Independently runnable                               │
└─────────────────────────────────────────────────────────┘
```

**Rules**:
1. `VYBE` and `VYBE-MCP` remain **separate git repositories**
2. MCP always runs as **separate process**
3. IDE may spawn MCP but must never embed it
4. MCP must be independently runnable outside the IDE

### Transport Rules

#### Local MCP (Spawned by IDE)
- **Transport**: `stdio` ONLY
- **Pattern**: IDE spawns MCP subprocess, communicates via stdin/stdout
- **Security**: No network exposure, process isolation
- **Use Case**: Development, single-user, local execution

#### Remote MCP (Standalone Server)
- **Transport**: `HTTP / SSE` ONLY
- **Pattern**: MCP runs as standalone server, IDE connects via HTTP
- **Security**: Explicit opt-in, minimal network exposure
- **Use Case**: Production, multi-user, centralized execution

#### IDE MCP Server (For MCP to Call IDE)
- **MUST NOT**: Expose HTTP server by default
- **MUST**: Use stdio transport when MCP is spawned locally
- **MAY**: Expose HTTP server only if explicitly configured (opt-in)
- **Security**: Network exposure must be explicit, minimal, and documented

### Tool Directionality

```
MCP (Agent Runtime)
  │
  │ calls tools
  ▼
IDE (Capability Host)
  │
  │ implements tool handlers
  ▼
IDE Services (LLM, Editor, Filesystem, etc.)
```

**Rules**:
- MCP calls IDE tools (via MCP protocol)
- IDE never calls MCP internals
- IDE implements **tool handlers**, not agent logic
- All tool execution happens in IDE process

### Corrected Architecture Flow

#### Local Mode (Development)

```
┌─────────────────────────────────────────────────────────┐
│                    VYBE IDE                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Launcher (spawns subprocess)                │  │
│  │  - Spawn: node /path/to/VYBE-MCP/build/index.js  │  │
│  │  - Transport: stdio (stdin/stdout)               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  IDE Tool Handlers (via stdio MCP server)        │  │
│  │  - vybe.send_llm_message                          │  │
│  │  - vybe.list_models                               │  │
│  │  - vybe.apply_patch                               │  │
│  │  - vybe.read_file                                 │  │
│  │  - etc.                                           │  │
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
│  │  MCP Server (stdio transport)                    │  │
│  │  - Receives tool calls from IDE                  │  │
│  │  - Exposes tools to external clients             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Agent Runtime                                   │  │
│  │  - Planning, memory, orchestration                │  │
│  │  - Calls IDE tools via stdio MCP client          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Client (connects to IDE stdio server)      │  │
│  │  - Calls: vybe.send_llm_message                  │  │
│  │  - Calls: vybe.list_models                       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Points**:
- IDE spawns MCP as subprocess (stdio)
- IDE exposes stdio MCP server (for MCP to call IDE tools)
- MCP connects back to IDE via stdio MCP client
- No HTTP/network exposure in local mode

#### Remote Mode (Production)

```
┌─────────────────────────────────────────────────────────┐
│                    VYBE IDE                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Client (HTTP/SSE)                           │  │
│  │  - Connects to: http://mcp-server:3000/sse      │  │
│  │  - Receives tool calls from MCP                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  IDE Tool Handlers (via HTTP MCP server)        │  │
│  │  - OPT-IN: Only if explicitly configured        │  │
│  │  - Exposes: vybe.* tools                         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │
         │ HTTP/SSE           │ HTTP/SSE (tool calls)
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│        VYBE-MCP (standalone server process)              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Server (HTTP/SSE transport)                │  │
│  │  - Runs on: http://mcp-server:3000/sse           │  │
│  │  - Exposes tools to external clients             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Agent Runtime                                   │  │
│  │  - Planning, memory, orchestration                │  │
│  │  - Calls IDE tools via HTTP MCP client           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MCP Client (connects to IDE HTTP server)        │  │
│  │  - Calls: vybe.send_llm_message                  │  │
│  │  - Calls: vybe.list_models                       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Points**:
- MCP runs as standalone server (HTTP/SSE)
- IDE connects to MCP as client (optional)
- IDE exposes HTTP MCP server (OPT-IN, explicit config)
- MCP connects to IDE via HTTP MCP client

### Security Boundary Explanation

1. **Process Isolation**: MCP runs in separate process, cannot directly access IDE memory/state
2. **Transport Security**:
   - Local: stdio (no network exposure)
   - Remote: HTTP/SSE (explicit opt-in, minimal surface)
3. **Capability Model**: IDE exposes only specific tools, not full system access
4. **Sandboxing**: Tool execution happens in IDE process with IDE's security model

### Why This Design Scales

- **Local**: stdio transport, no network, fast, secure
- **Hybrid**: Can mix local MCP + remote IDE tools (or vice versa)
- **Enterprise Cloud**: MCP runs on server, IDE connects, scales horizontally
- **Development**: MCP repo stays separate, IDE spawns from external path

---

## 2️⃣ FULL AUDIT — VYBE IDE

### A. Feature Inventory

#### 1. LLM / AI Integration
**Location**: `src/vs/workbench/contrib/vybeLLM/`

**Purpose**: Local LLM provider integration (Ollama, LM Studio)

**Entry Points**:
- `vybeLLM.contribution.ts` - Main contribution
- `vybeLLMMessageService.contribution.ts` - Message service registration
- `vybeLLMModelService.contribution.ts` - Model service registration
- `vybeLLMCommands.contribution.ts` - Dev commands

**Key Files**:
- `common/vybeLLMMessageService.ts` - Renderer service (IPC to main)
- `common/vybeLLMModelService.ts` - Model aggregation service
- `common/vybeLLMMessageTypes.ts` - Type definitions
- `common/vybeLLMProviderSettings.ts` - Provider settings
- `electron-main/vybeLLMMessageChannel.ts` - IPC channel
- `electron-main/llmMessage/sendLLMMessage.ts` - Main orchestrator
- `electron-main/llmMessage/sendLLMMessage.impl.ts` - Provider implementations
- `browser/tools/vybeLLMMCPTool.ts` - MCP tool handlers

**Capabilities**:
- Send chat messages (streaming)
- List models from providers
- Abort requests
- Provider settings management

#### 2. Diff Engine & Decorations
**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: Compute and display diffs between original and modified content

**Entry Points**:
- `vybeDiffService.contribution.ts` - Service registration

**Key Files**:
- `vybeDiffService.ts` - Diff computation service
- `vybeEditService.ts` - Edit transaction management
- `vybeEditTypes.ts` - Type definitions (Diff, DiffArea, Checkpoint)
- `browser/vybeDiffDecorations.ts` - UI decorations

**Capabilities**:
- Compute diffs (original vs modified)
- Update diffs for streaming
- Manage diff areas
- Accept/reject diffs
- Transaction lifecycle

#### 3. Inline Widgets & Actions
**Location**: `src/vs/workbench/contrib/vybeChat/browser/`

**Purpose**: UI components for chat, diffs, and editor interactions

**Entry Points**:
- `vybeChat.contribution.ts` - Main chat contribution
- `vybeChatParticipant.contribution.ts` - View container registration

**Key Files**:
- `vybeChatViewPane.ts` - Main chat panel
- `components/composer/messageComposer.ts` - Message input
- `components/composer/modelDropdown.ts` - Model selection
- `contentParts/vybeChatMarkdownPart.ts` - Markdown rendering
- `contentParts/vybeChatCodeBlockPart.ts` - Code block rendering
- `contentParts/vybeChatPlanDocumentPart.ts` - Plan document rendering

**Capabilities**:
- Chat UI rendering
- Model selection
- Streaming content display
- Code block editing (Monaco)
- Diff visualization

#### 4. Tool Execution Framework
**Location**: `src/vs/workbench/contrib/mcp/common/`

**Purpose**: MCP tool registration and execution

**Entry Points**:
- `mcp.contribution.ts` - MCP contribution
- `vybeMcpToolContribution.ts` - Vybe-specific tools

**Key Files**:
- `mcpService.ts` - MCP service implementation
- `mcpServer.ts` - MCP server connection management
- `mcpServerRequestHandler.ts` - Tool request handling
- `vybeMcpToolContribution.ts` - Tool registration
- `vybeMcpRouter.ts` - Router for IDE context tools

**Capabilities**:
- Register MCP tools
- Handle tool invocations
- Manage MCP server connections
- Tool execution lifecycle

#### 5. Command System
**Location**: `src/vs/workbench/contrib/commands/`

**Purpose**: VS Code command registration and execution

**Entry Points**:
- `commands.contribution.ts` - Command contribution

**Key Files**:
- Various command handlers throughout codebase

**Capabilities**:
- Register commands
- Execute commands
- Command palette integration

#### 6. Panels
**Location**: `src/vs/workbench/contrib/vybeChat/`, `src/vs/workbench/contrib/vybeSettings/`

**Purpose**: UI panels for chat and settings

**Entry Points**:
- `vybeChat.contribution.ts` - Chat panel
- `vybeSettings.contribution.ts` - Settings panel

**Key Files**:
- `vybeChatViewPane.ts` - Chat panel implementation
- `vybeSettingsEditor.ts` - Settings editor
- `tabs/vybeSettingsModelsTab.ts` - Models tab
- `tabs/vybeSettingsAgentsTab.ts` - Agents tab

**Capabilities**:
- Chat panel UI
- Settings UI
- Model configuration
- Agent configuration

#### 7. Settings & Persistence
**Location**: `src/vs/workbench/contrib/vybeSettings/`, `src/vs/platform/storage/`

**Purpose**: Settings storage and retrieval

**Entry Points**:
- `vybeSettings.contribution.ts` - Settings contribution

**Key Files**:
- `vybeSettingsEditor.ts` - Settings editor
- `tabs/vybeSettingsModelsTab.ts` - Models settings
- Uses `IStorageService` for persistence

**Capabilities**:
- Store/retrieve settings
- Provider endpoint configuration
- Model selection persistence

#### 8. Model Selection & Provider Logic
**Location**: `src/vs/workbench/contrib/vybeLLM/`

**Purpose**: Model discovery and selection

**Key Files**:
- `vybeLLMModelService.ts` - Model aggregation
- `vybeLLMProviderSettings.ts` - Provider defaults
- `vybeLLMMessageService.ts` - Model listing

**Capabilities**:
- List models from providers
- Aggregate models from multiple providers
- Format model IDs for display
- Provider-specific model handling

#### 9. IPC & Main-Process Boundaries
**Location**: `src/vs/workbench/contrib/vybeLLM/electron-main/`

**Purpose**: Communication between renderer and main process

**Key Files**:
- `vybeLLMMessageChannel.ts` - IPC channel
- `llmMessage/sendLLMMessage.ts` - Main orchestrator
- `llmMessage/sendLLMMessage.impl.ts` - Provider implementations

**Capabilities**:
- IPC communication
- Main process LLM calls
- Streaming event propagation
- Abort handling

#### 10. Theming & UI Primitives
**Location**: `src/vs/workbench/contrib/vybeChat/browser/media/`

**Purpose**: UI styling and theming

**Key Files**:
- `vybeChat.css` - Chat styles
- `vybeChatInput.css` - Input styles
- `vybeChatList.css` - List styles

**Capabilities**:
- Theme-aware styling
- Responsive layouts
- UI component styling

#### 11. Indexing System
**Location**: `src/vs/workbench/contrib/indexing/`

**Purpose**: Codebase indexing for context retrieval

**Entry Points**:
- `indexing.contribution.ts` - Indexing contribution

**Key Files**:
- `indexingMcpTools.ts` - Indexing MCP tools
- `indexingTools.ts` - Indexing tools

**Capabilities**:
- Codebase indexing
- Context retrieval
- Hybrid search (lexical + vector + graph)

#### 12. Checkpoint Service
**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: File state checkpoints for rollback

**Entry Points**:
- `vybeCheckpointService.contribution.ts` - Service registration

**Key Files**:
- `vybeCheckpointService.ts` - Checkpoint service interface
- `browser/vybeCheckpointServiceImpl.ts` - Checkpoint service implementation
- `vybeCheckpointTypes.ts` - Checkpoint types

**Capabilities**:
- Create checkpoints (file state snapshots)
- Restore from checkpoints
- Checkpoint lifecycle management
- Checkpoint metadata (label, description, timestamp)

#### 13. Chat Agents Service
**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: Agent management for chat

**Key Files**:
- `vybeChatAgents.ts` - Agent service interface and implementation

**Capabilities**:
- Agent registration
- Agent discovery
- Agent metadata

#### 14. Chat Sessions Service
**Location**: `src/vs/workbench/contrib/vybeChat/common/`

**Purpose**: Chat session management

**Key Files**:
- `vybeChatSessionsService.ts` - Sessions service interface and implementation

**Capabilities**:
- Create sessions
- Get sessions
- Session lifecycle

#### 15. Content Parts (Rendering)
**Location**: `src/vs/workbench/contrib/vybeChat/browser/contentParts/`

**Purpose**: Render different content types in chat

**Key Files**:
- `vybeChatContentPart.ts` - Base content part
- `vybeChatMarkdownPart.ts` - Markdown rendering
- `vybeChatCodeBlockPart.ts` - Code block with Monaco editor
- `vybeChatPlanDocumentPart.ts` - Plan document rendering
- `vybeChatThinkingPart.ts` - Thinking/reasoning display
- `vybeChatTextEditPart.ts` - Text edit visualization
- `vybeChatTerminalPart.ts` - Terminal output display
- `vybeChatReadingFilesPart.ts` - File reading indicator
- `vybeChatSearchedPart.ts` - Search results display
- `vybeChatExploredPart.ts` - Exploration results display

**Capabilities**:
- Render markdown with code blocks
- Render code blocks with syntax highlighting (Monaco)
- Render streaming content
- Handle partial markdown during streaming
- Code block preservation during streaming

#### 16. Chat Actions
**Location**: `src/vs/workbench/contrib/vybeChat/browser/actions/`

**Purpose**: User actions in chat UI

**Key Files**:
- `vybeChatActions.ts` - Basic actions (open, toggle, focus)
- `vybeChatCodeblockActions.ts` - Code block actions
- `vybeChatContextActions.ts` - Context actions
- `vybeChatCopyExportActions.ts` - Copy/export actions
- `vybeChatExecuteActions.ts` - Execute actions
- `vybeChatMoveActions.ts` - Navigation actions
- `vybeChatTitleActions.ts` - Title bar actions

**Capabilities**:
- Open/close chat panel
- Focus chat input
- Copy content
- Export content
- Execute code
- Navigate messages

#### 17. Diff Zone Manager
**Location**: `src/vs/workbench/contrib/vybeChat/browser/`

**Purpose**: Manage diff zones in editor

**Entry Points**:
- `vybeDiffZoneManager.contribution.ts` - Manager registration

**Key Files**:
- `vybeDiffZoneManager.ts` - Diff zone management

**Capabilities**:
- Create diff zones
- Manage diff zone lifecycle
- Update diff zones during streaming

#### 18. Diff Decorations
**Location**: `src/vs/workbench/contrib/vybeChat/browser/`

**Purpose**: Visual decorations for diffs in editor

**Entry Points**:
- `vybeDiffDecorations.contribution.ts` - Decorations registration

**Key Files**:
- `vybeDiffDecorations.ts` - Decoration management

**Capabilities**:
- Apply diff decorations
- Update decorations
- Remove decorations

#### 19. Terminal Integration
**Location**: `src/vs/workbench/contrib/vybeChat/browser/`

**Purpose**: Terminal selection and prompt bar

**Entry Points**:
- `terminalSelectionButton.contribution.ts` - Terminal button
- `vybeTerminalPromptBar.contribution.ts` - Terminal prompt bar

**Key Files**:
- Terminal integration components

**Capabilities**:
- Select terminal text
- Send to chat
- Terminal prompt bar

#### 20. MCP Integration (Existing)
**Location**: `src/vs/workbench/contrib/mcp/`

**Purpose**: MCP server management and tool execution

**Key Files**:
- `mcpService.ts` - MCP service
- `mcpServer.ts` - MCP server connection
- `mcpServerRequestHandler.ts` - Tool request handling
- `vybeMcpToolContribution.ts` - Vybe-specific tools
- `vybeMcpRouter.ts` - Context router

**Capabilities**:
- Connect to MCP servers
- Register tools
- Execute tool calls
- Manage server lifecycle

---

### B. MCP-Facing Capabilities

For each IDE capability, specify:
- Should MCP call this? (Yes / No)
- Tool name (if Yes)
- Sync vs Streaming
- Read-only vs Mutating
- Security / permission risks

#### LLM Transport

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Send LLM message | **Yes** | `vybe.send_llm_message` | Streaming | Read-only | Low (LLM calls only) |
| List models | **Yes** | `vybe.list_models` | Sync | Read-only | None |
| Abort request | **Yes** | `vybe.abort_llm_request` | Sync | Read-only | None |
| Provider settings | **No** | - | - | - | High (API keys) |

#### Editor & Filesystem

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Read file | **Yes** | `vybe.read_file` | Sync | Read-only | Medium (file access) |
| Write file | **Yes** | `vybe.write_file` | Sync | Mutating | High (file writes) |
| Apply patch | **Yes** | `vybe.apply_patch` | Sync | Mutating | High (code changes) |
| List files | **Yes** | `vybe.list_files` | Sync | Read-only | Low (directory listing) |
| Get file info | **Yes** | `vybe.get_file_info` | Sync | Read-only | Low (metadata) |

#### Diff & Edit Management

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Compute diff | **Yes** | `vybe.compute_diff` | Sync | Read-only | Low (diff computation) |
| Accept diff | **Yes** | `vybe.accept_diff` | Sync | Mutating | High (code changes) |
| Reject diff | **Yes** | `vybe.reject_diff` | Sync | Mutating | Medium (revert) |
| Get diff areas | **Yes** | `vybe.get_diff_areas` | Sync | Read-only | Low (state query) |
| Create checkpoint | **Yes** | `vybe.create_checkpoint` | Sync | Mutating | Medium (state capture) |
| Restore checkpoint | **Yes** | `vybe.restore_checkpoint` | Sync | Mutating | High (state restore) |

#### Context & Indexing

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Get context | **Yes** | `vybe.get_context_for_mcp` | Sync | Read-only | Low (context retrieval) |
| Hybrid search | **Yes** | `vybe.search_hybrid` | Sync | Read-only | Low (search) |
| Index status | **Yes** | `vybe.list_index_status` | Sync | Read-only | None |
| Refresh index | **Yes** | `vybe.refresh_index` | Sync | Mutating | Medium (indexing) |

#### Terminal & Execution

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Run command | **Yes** | `vybe.run_command` | Streaming | Mutating | **CRITICAL** (code execution) |
| Run tests | **Yes** | `vybe.run_tests` | Streaming | Mutating | **CRITICAL** (test execution) |
| Terminal output | **Yes** | `vybe.get_terminal_output` | Sync | Read-only | Low (output read) |

#### UI & Notifications

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Show notification | **No** | - | - | - | Medium (UI spam) |
| Update UI | **No** | - | - | - | High (UI manipulation) |
| Open file | **Yes** | `vybe.open_file` | Sync | Read-only | Low (navigation) |
| Focus editor | **No** | - | - | - | Low (but unnecessary) |

#### Session & State

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Get session | **No** | - | - | - | High (state leakage) |
| Create session | **No** | - | - | - | High (state management) |
| Update session | **No** | - | - | - | High (state mutation) |

#### Transaction Management

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Create transaction | **Yes** | `vybe.create_edit_transaction` | Sync | Mutating | Medium (state creation) |
| Get transaction | **Yes** | `vybe.get_edit_transaction` | Sync | Read-only | Low (state query) |
| Get all diffs | **Yes** | `vybe.get_all_diffs` | Sync | Read-only | Low (state query) |
| Get edited files | **Yes** | `vybe.get_edited_files` | Sync | Read-only | Low (state query) |

#### Content Rendering

| Capability | MCP Call? | Tool Name | Sync/Stream | Read/Mutate | Security Risk |
|------------|-----------|-----------|-------------|-------------|---------------|
| Render markdown | **No** | - | - | - | None (UI only) |
| Render code block | **No** | - | - | - | None (UI only) |
| Update streaming | **No** | - | - | - | None (UI only) |

---

## 3️⃣ IMPLEMENTATION PRIORITIES

### Phase 1: Core Architecture (Required)
1. **IDE stdio MCP server** - Expose tools via stdio when MCP is spawned
2. **MCP launcher** - Spawn MCP subprocess with stdio transport
3. **Tool handler bridge** - Connect MCP tool calls to IDE services
4. **Test**: L1 agent uses Ollama via IDE adapter

### Phase 2: Essential Tools (High Priority)
1. `vybe.send_llm_message` ✅ (done)
2. `vybe.list_models` ✅ (done)
3. `vybe.read_file` (needed)
4. `vybe.write_file` (needed)
5. `vybe.apply_patch` (needed)
6. `vybe.compute_diff` (needed)

### Phase 3: Advanced Tools (Medium Priority)
1. `vybe.get_context_for_mcp` ✅ (exists)
2. `vybe.search_hybrid` ✅ (exists)
3. `vybe.run_command` (needed, high security)
4. `vybe.create_checkpoint` (needed)
5. `vybe.restore_checkpoint` (needed)

### Phase 4: Remote Mode (Low Priority)
1. IDE HTTP MCP server (opt-in)
2. Remote MCP connector
3. Configuration for remote mode

---

## 4️⃣ SECURITY CONSIDERATIONS

### Critical Risk Tools
- `vybe.run_command` - **CRITICAL**: Can execute arbitrary code
- `vybe.write_file` - **HIGH**: Can modify any file
- `vybe.apply_patch` - **HIGH**: Can make code changes
- `vybe.restore_checkpoint` - **HIGH**: Can restore arbitrary state

### Mitigation Strategies
1. **Sandboxing**: Tool execution in isolated context
2. **Approval Gates**: User approval for high-risk operations
3. **Path Validation**: Restrict file operations to workspace
4. **Command Whitelisting**: Only allow safe commands
5. **Audit Logging**: Log all tool invocations

---

## 5️⃣ NEXT STEPS

1. **Review & Approve** this architecture document
2. **Implement Phase 1** (Core Architecture)
3. **Implement Phase 2** (Essential Tools)
4. **Test end-to-end** with L1 agent
5. **Iterate** based on testing results

---

**END OF ARCHITECTURE & AUDIT DOCUMENT**

