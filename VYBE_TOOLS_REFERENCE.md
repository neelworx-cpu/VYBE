# VYBE Tools Reference

Complete list of all tools available to AI in VYBE Chat and VYBE IDE.

---

## VYBE-MCP Tools (MCP Server)

These tools are registered in `VYBE-MCP/src/tools/index.ts` and exposed via MCP protocol.

### Local Plane Tools (Always Available)

1. **`read_file`** - Read file content from workspace
2. **`write_file`** - Write content to a file
3. **`list_dir`** - List files and directories in a workspace directory
4. **`run_command`** - Execute shell command in workspace
5. **`index_repo`** - Index repository for codebase search
6. **`get_context_for_files`** - Get context for specific files
7. **`apply_patch`** - Apply unified diff patch to a file
8. **`rollback_snapshot`** - Rollback to a previous snapshot
9. **`get_task_status`** - Get status of a task
10. **`get_indexing_status`** - Get indexing status

### Cloud Plane Tools (Requires SUPABASE_KEY)

11. **`search_codebase`** - Search codebase using hybrid search
12. **`search_context`** - Search context using semantic search
13. **`build_repo_graph`** - Build repository graph
14. **`get_graph_node`** - Get graph node information
15. **`get_graph_neighbors`** - Get graph neighbors
16. **`get_graph_context`** - Get graph context
17. **`get_context_for_task`** - Get context for a task
18. **`get_memory`** - Get memory entry
19. **`store_memory`** - Store memory entry
20. **`list_memory`** - List memory entries
21. **`search_memory`** - Search memory entries
22. **`list_sessions`** - List sessions
23. **`get_session`** - Get session information
24. **`list_session_entries`** - List session entries
25. **`get_repo_settings`** - Get repository settings
26. **`set_repo_settings`** - Set repository settings
27. **`subscribe_task_events`** - Subscribe to task events (SSE)
28. **`get_task_graph`** - Get task graph
29. **`get_session_graphs`** - Get session graphs
30. **`clear_task_graph`** - Clear task graph

### Agent Plane Tools (Always Available)

31. **`solve_task`** - Solve a task using agent loop
32. **`vybe_solve_task`** - VYBE-specific task solving
33. **`vybe_session_solve`** - VYBE session-based task solving

### Execution Plane Tools (Always Available)

34. **`run_sandboxed_command`** - Run command in sandboxed environment
35. **`run_tests`** - Run tests

---

## VYBE IDE Tools (Exposed to MCP via `vybe.*`)

These tools are registered in `VYBE/src/vs/code/electron-main/vybeMcpToolBridge.ts` and exposed to MCP server via stdio transport.

### LLM Tools

1. **`vybe.send_llm_message`** - Send LLM message via IDE's LLM transport (Ollama, LM Studio)
   - Parameters: `messages`, `options`, `stream`, `task_id`, `model_id`
   - Returns: Streaming response via IPC events

2. **`vybe.list_models`** - List available models from IDE's LLM providers
   - Parameters: `providerName` (optional: 'ollama' | 'lmStudio')

3. **`vybe.abort_llm_request`** - Abort an in-flight LLM request
   - Parameters: `requestId`

### File System Tools (Read-Only)

4. **`vybe.read_file`** - Read file content from workspace
   - Parameters: `uri`
   - Read-only operation

5. **`vybe.list_files`** - List files and directories in a workspace directory
   - Parameters: `uri`, `recursive` (optional)
   - Read-only operation

6. **`vybe.get_file_info`** - Get file metadata (size, mtime, type)
   - Parameters: `uri`
   - Read-only operation

### Diff Tools (Read-Only)

7. **`vybe.compute_diff`** - Compute diff between two content strings
   - Parameters: `original`, `modified`, `languageId` (optional), `ignoreTrimWhitespace` (optional), `maxComputationTimeMs` (optional)
   - Pure computation, no side effects

8. **`vybe.get_diff_areas`** - Get existing diff areas for a file
   - Parameters: `uri`
   - Read-only operation

### Edit Transaction Tools

9. **`vybe.create_edit_transaction`** - Create a new edit transaction for a file
   - Parameters: `uri`, `originalContent`, `streaming` (optional)
   - No approval required

10. **`vybe.accept_diff`** - Accept a single diff, applying the change to the file
    - Parameters: `diffId`
    - **Requires approval**

11. **`vybe.reject_diff`** - Reject a single diff, reverting the change
    - Parameters: `diffId`
    - **Requires approval**

12. **`vybe.accept_file`** - Accept all diffs in a file
    - Parameters: `uri`
    - **Requires approval**

13. **`vybe.reject_file`** - Reject all diffs in a file, reverting all changes
    - Parameters: `uri`
    - **Requires approval**

14. **`vybe.write_file`** - Write content to a file
    - Parameters: `uri`, `content`, `overwrite` (optional, default: true)
    - Creates transaction, seeds diffs, **requires approval**, and saves to disk

15. **`vybe.apply_patch`** - Apply a unified diff patch to a file
    - Parameters: `uri`, `patch`
    - Validates patch, creates transaction, seeds diffs, **requires approval**, and saves to disk

---

## VYBE IDE Internal Tools (Exposed via Language Model Tools Service)

These tools are registered in `VYBE/src/vs/workbench/contrib/mcp/common/vybeMcpToolContribution.ts` and available to the IDE's internal chat system.

### Indexing Tools

1. **`vybe.get_context_for_mcp`** - Returns local index context bundle (gated)
2. **`vybe.search_hybrid`** - Performs hybrid lexical/graph/semantic search (gated)
3. **`vybe.list_index_status`** - Reports local index status (gated)
4. **`vybe.refresh_index`** - Requests index refresh (gated)

### LLM Tools (Internal)

5. **`vybe.send_llm_message`** - Send LLM message via IDE's LLM transport (same as MCP tool)
6. **`vybe.list_models`** - List available models (same as MCP tool)

---

## VS Code Built-in Chat Tools (Available in VYBE Chat)

These are standard VS Code chat tools available in the chat interface:

1. **`edit`** - Edit file content
2. **`manageTodoList`** - Manage todo list
3. **`confirmation`** - Request user confirmation
4. **`runSubagent`** - Delegate tasks to other agents

---

## Tool Categories Summary

### By Plane (VYBE-MCP)
- **Local Plane**: 10 tools (file ops, terminal, indexing)
- **Cloud Plane**: 20 tools (requires Supabase, includes search, graph, memory, sessions)
- **Agent Plane**: 3 tools (task solving)
- **Execution Plane**: 2 tools (sandboxed commands, tests)

### By Access Pattern
- **Read-Only**: `read_file`, `list_files`, `get_file_info`, `compute_diff`, `get_diff_areas`
- **Requires Approval**: `accept_diff`, `reject_diff`, `accept_file`, `reject_file`, `write_file`, `apply_patch`
- **No Approval**: `create_edit_transaction`, `read_file`, `list_files`, `get_file_info`, `compute_diff`, `get_diff_areas`

### By Provider
- **MCP Tools**: All VYBE-MCP tools (35 total)
- **IDE Tools**: All `vybe.*` tools (15 total)
- **VS Code Tools**: Built-in chat tools (4 total)

---

## VYBE Chat Content Parts (UI Rendering Components)

These are UI components that render different types of content in VYBE Chat. They are not callable tools, but rather rendering capabilities that the AI can use to display content.

### Foundation Content Parts

1. **`markdown`** - Main text responses with markdown formatting
   - Renders: Headings, paragraphs, lists, tables, blockquotes, inline code
   - Component: `VybeChatMarkdownPart`
   - Supports streaming updates

2. **`thinking`** - Collapsible AI thinking process
   - Renders: Collapsible block with AI reasoning/thought process
   - Component: `VybeChatThinkingPart`
   - Features: Loading spinner during streaming, chevron icon when complete
   - Supports streaming updates

3. **`codeBlock`** - Code blocks with syntax highlighting
   - Renders: Monaco editor with syntax highlighting, line numbers
   - Component: `VybeChatCodeBlockPart`
   - Features: Copy button, language indicator
   - Supports streaming updates

4. **`progress`** - Loading/status messages
   - Renders: Progress indicators, loading spinners
   - Component: `VybeChatProgressContent`
   - Used for: Status updates during task execution

5. **`error`** - Error messages
   - Renders: Error messages with severity levels
   - Component: `VybeChatErrorContent`
   - Levels: `info`, `warning`, `error`

### File Operation Content Parts

6. **`readingFiles`** - Files being read by AI
   - Renders: List of files being read with metadata
   - Component: `VybeChatReadingFilesPart`
   - Features: File icons, line ranges, language indicators
   - Supports streaming updates

7. **`searched`** - Search results
   - Renders: Search results with file references
   - Component: `VybeChatSearchedPart`
   - Types: `codebase`, `semantic`, `web`, `documentation`
   - Features: Web search results, file references
   - Supports streaming updates

8. **`listed`** - Listed items/directories
   - Renders: Directory listings, file lists
   - Component: `IVybeChatListedContent`
   - Supports streaming updates

9. **`directory`** - Directory operations
   - Renders: Directory structure, navigation
   - Component: `IVybeChatDirectoryContent`
   - Supports streaming updates

10. **`explored`** - Grouped multiple actions
    - Renders: Grouped file operations (read, search, list, directory)
    - Component: `VybeChatExploredPart`
    - Features: Auto-groups related actions
    - Supports streaming updates

### File Edit Content Parts

11. **`textEdit`** - File edit suggestions
    - Renders: Side-by-side diff view, accept/reject buttons
    - Component: `VybeChatTextEditPart`
    - Features: Line-by-line diff, syntax highlighting
    - Supports streaming updates

12. **`diff`** - Side-by-side diff view
    - Renders: Unified diff view
    - Status: Coming soon (Phase 3)

### Advanced Content Parts

13. **`terminal`** - Terminal command execution
    - Renders: Terminal output with command history
    - Component: `VybeChatTerminalPart`
    - Phases: `pending` (ask permission), `running` (executing), `completed` (done)
    - Status: `success`, `failed`, `cancelled`
    - Features: Permission prompts, exit codes, streaming output
    - Supports streaming updates

14. **`reference`** - File references
    - Renders: Links to files/symbols referenced
    - Status: Coming soon (Phase 4)

15. **`command`** - Command buttons
    - Renders: Clickable command buttons
    - Status: Coming soon (Phase 4)

### Planning Content Parts

16. **`planDocument`** - AI-generated plan document
    - Renders: Collapsible plan document with title, summary, full content
    - Component: `VybeChatPlanDocumentPart`
    - Features: Expand/collapse, markdown rendering, model state tracking
    - Supports streaming updates

---

## VYBE Chat Streaming Event Types

These are event types emitted during streaming LLM responses. They are part of the normalized event contract between MCP and IDE.

### Assistant Events

1. **`assistant.delta`** - Incremental text tokens
   - Payload: `{ text: string }`
   - Emitted: During streaming text output
   - Renders: Appended to markdown content part

2. **`assistant.thinking.delta`** - Incremental thinking tokens
   - Payload: `{ text: string }`
   - Emitted: During streaming thinking output
   - Renders: Appended to thinking content part

3. **`assistant.block.start`** - Start of a code/markdown block
   - Payload: `{ block_id: string, block_type: 'code' | 'markdown', language?: string }`
   - Emitted: When a code block begins
   - Renders: Creates new code block content part

4. **`assistant.block.delta`** - Incremental block content
   - Payload: `{ block_id: string, text: string }`
   - Emitted: During streaming block content
   - Renders: Appended to existing code block

5. **`assistant.block.end`** - End of a code/markdown block
   - Payload: `{ block_id: string }`
   - Emitted: When a code block completes
   - Renders: Finalizes code block content part

6. **`assistant.final`** - Final response with full text
   - Payload: `{ full_text: string, usage?: { input_tokens?: number, output_tokens?: number } }`
   - Emitted: When streaming completes
   - Renders: Finalizes all content parts

### Tool Events

7. **`tool.call`** - Tool execution started
   - Payload: `{ tool_id: string, tool_name: string, arguments: Record<string, unknown> }`
   - Emitted: When AI calls a tool
   - Renders: Tool invocation UI

8. **`tool.result`** - Tool execution result
   - Payload: `{ tool_id: string, result: unknown, error?: string }`
   - Emitted: When tool execution completes
   - Renders: Tool result UI

### Agent Events

9. **`agent.phase`** - Agent phase transition
   - Payload: `{ phase: 'planning' | 'acting' | 'reflecting' | 'finalizing', label?: string, visibility?: 'dev' | 'debug' | 'user' }`
   - Emitted: During agent loop phase transitions
   - Renders: Phase indicator UI (e.g., "Planning next step")

### Error Events

10. **`error`** - Streaming error
    - Payload: `{ message: string, code?: string }`
    - Emitted: On streaming errors or contract violations
    - Renders: Error content part

---

## Notes

- **MCP Tools** are exposed via MCP protocol and can be called by any MCP client
- **IDE Tools** (`vybe.*`) are exposed to MCP server via stdio transport and bridge to IDE services
- **Internal Tools** are available to IDE's chat system via Language Model Tools Service
- **Cloud Plane Tools** require `SUPABASE_KEY` environment variable to be set
- **Edit Tools** require user approval before applying changes to files
- **LLM Tools** support streaming via IPC events when `stream: true` and `task_id` are provided
- **Content Parts** are UI rendering components, not callable tools
- **Streaming Events** are emitted by MCP and consumed by IDE's `StreamingEventHandler`
- **Content Parts** support incremental updates during streaming via `updateContent()` method
- **Streaming Events** follow a normalized contract defined in `event_contract.ts` (MCP) and `streaming_event_types.ts` (IDE)

