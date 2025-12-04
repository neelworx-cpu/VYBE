# GitHub Copilot Chat Panel - Complete Feature Audit

## Overview
This document provides a comprehensive audit of the GitHub Copilot Chat panel implementation in VS Code. It covers all features, integrations, commands, and connections to other panels to help replace it with a custom AI panel while retaining functionality.

---

## 1. Panel Registration & Structure

### 1.1 View Container & View Registration
- **Container ID**: `workbench.panel.chat`
- **View ID**: `workbench.panel.chat.view.chat`
- **Location**: `ViewContainerLocation.AuxiliaryBar` (secondary sidebar) by default
- **Icon**: `Codicon.chatSparkle`
- **Title**: "Chat"
- **Keybinding**:
  - Default: `Ctrl+Alt+I` (Windows/Linux)
  - Mac: `Cmd+Ctrl+I`
- **Can Move**: Yes (can be moved to different locations)
- **Can Toggle Visibility**: No (always visible when enabled)

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts` (lines 37-77)
- `src/vs/workbench/contrib/chat/browser/chat.ts` (lines 280-281)

### 1.2 Main Components
- **ChatViewPane**: Main view pane extending `ViewPane`
- **ChatWidget**: Core widget handling chat UI and interactions
- **ChatInputPart**: Input editor component
- **ChatListRenderer**: Renders chat messages (requests/responses)

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatViewPane.ts`
- `src/vs/workbench/contrib/chat/browser/chatWidget.ts`
- `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`
- `src/vs/workbench/contrib/chat/browser/chatListRenderer.ts`

---

## 2. Core Features

### 2.1 Chat Modes
The chat supports multiple modes:
- **Ask Mode** (`ChatModeKind.Ask`): Standard Q&A chat
- **Agent Mode** (`ChatModeKind.Agent`): Agent-based interactions
- **Edit Mode** (`ChatModeKind.Edit`): Code editing mode

**Files:**
- `src/vs/workbench/contrib/chat/common/chatModes.ts`
- `src/vs/workbench/contrib/chat/common/constants.ts`

### 2.2 Chat Sessions
- **Session Management**: Multiple chat sessions can be created and managed
- **Session Persistence**: Sessions are saved and can be restored
- **Session Limits**: Maximum of 3 recent sessions displayed (configurable)
- **Session Types**:
  - Local sessions
  - Contributed sessions (via extension point)
- **Session Archiving**: Sessions can be archived

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatSessions.contribution.ts`
- `src/vs/workbench/contrib/chat/common/chatSessionsService.ts`
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts`

### 2.3 Input Features
- **Multi-line Input**: Full editor with syntax highlighting
- **Slash Commands**: Commands prefixed with `/` (e.g., `/fix`, `/explain`)
- **Agent Selection**: `@agent` syntax to select specific agents
- **Variable Substitution**: Support for variables in prompts
- **File References**: Can reference files in input
- **Voice Input**: Voice dictation support (when enabled)
- **Input History**: Navigate through previous inputs
- **Auto-scroll**: Automatic scrolling to latest message
- **Placeholder Text**: Dynamic placeholder based on context

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`
- `src/vs/workbench/contrib/chat/common/chatRequestParser.ts`
- `src/vs/workbench/contrib/chat/common/chatSlashCommands.ts`

### 2.4 Response Features
- **Streaming Responses**: Real-time streaming of AI responses
- **Markdown Rendering**: Full markdown support in responses
- **Code Blocks**: Syntax-highlighted code blocks with actions
- **File Trees**: Display of file structures in responses
- **Follow-up Suggestions**: Suggested follow-up questions/actions
- **Progress Messages**: Progress indicators during response generation
- **Response Actions**: Copy, insert, apply edits, etc.

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatListRenderer.ts`
- `src/vs/workbench/contrib/chat/browser/chatContentParts/`
- `src/vs/workbench/contrib/chat/browser/actions/chatCodeblockActions.ts`

### 2.5 Attachments & Context
The chat supports multiple attachment types:
- **File Attachments**: Attach files to chat
- **Tool Attachments**: Attach tool outputs
- **MCP Attachments**: Model Context Protocol attachments
- **Image Attachments**: Image support
- **Search Result Attachments**: Search results
- **Instruction Attachments**: Custom instructions
- **Source Control Attachments**: Git/diff context
- **Problem Attachments**: Error/problem context
- **Symbol Attachments**: Code symbols
- **Terminal Attachments**: Terminal output

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatAttachmentModel.ts`
- `src/vs/workbench/contrib/chat/common/chatAgents.ts`

### 2.6 Welcome Screen
- **Welcome Controller**: Shows welcome content when chat is empty
- **Suggested Prompts**: Pre-defined prompt suggestions
- **Getting Started**: Onboarding content
- **Extension Contributions**: Extensions can contribute welcome content

**Files:**
- `src/vs/workbench/contrib/chat/browser/viewsWelcome/chatViewWelcomeController.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatGettingStarted.ts`

---

## 3. Commands & Actions

### 3.1 Global Commands
- **Open Chat**: `workbench.action.chat.open` (Ctrl+Alt+I / Cmd+Ctrl+I)
- **Open Chat (Ask Mode)**: `workbench.action.chat.openInAskMode`
- **Open Chat (Agent Mode)**: `workbench.action.chat.openInAgentMode` (Ctrl+Shift+I)
- **Open Chat (Edit Mode)**: `workbench.action.chat.openInEditMode`
- **Toggle Chat**: `workbench.action.chat.toggle`
- **Quick Chat**: `workbench.action.quickchat.toggle` (Quick input)

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatQuickInputActions.ts`

### 3.2 Chat Input Commands
- **Submit Chat**: `workbench.action.chat.submit` (Enter)
- **Cancel Request**: `workbench.action.chat.cancel`
- **Clear Chat**: `workbench.action.chat.clear`
- **New Chat**: `workbench.action.chat.newChat`
- **Rerun Last Request**: `workbench.action.chat.rerun`
- **Focus Input**: `workbench.action.chat.focusInput`
- **Focus Response**: `workbench.action.chat.focusResponse`

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatNewActions.ts`

### 3.3 Code Block Actions
- **Copy Code**: `workbench.action.chat.copyCode`
- **Insert Code**: `workbench.action.chat.insertCode`
- **Apply Code Edits**: `workbench.action.chat.applyCodeEdits`
- **Run in Terminal**: `workbench.action.chat.runInTerminal`
- **Open in Editor**: `workbench.action.chat.openInEditor`
- **Compare Changes**: `workbench.action.chat.compareCode`
- **Navigate Code Blocks**: `workbench.action.chat.nextCodeBlock` / `workbench.action.chat.previousCodeBlock`

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatCodeblockActions.ts`

### 3.4 Session Management Commands
- **Switch Chat Session**: `workbench.action.chat.switchSession`
- **Delete Chat Session**: `workbench.action.chat.deleteSession`
- **Archive Chat Session**: `workbench.action.chat.archiveSession`
- **Continue in Session**: `workbench.action.chat.continueInSession`

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatSessionsActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatContinueInAction.ts`

### 3.5 Context & Attachment Commands
- **Add Context**: `workbench.action.chat.addContext`
- **Attach Files**: `workbench.action.chat.attachFiles`
- **Attach Selection**: `workbench.action.chat.attachSelection`
- **Attach Terminal**: `workbench.action.chat.attachTerminal`
- **Attach Problems**: `workbench.action.chat.attachProblems`

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts`

### 3.6 Copy & Export Commands
- **Copy Chat**: `workbench.action.chat.copy`
- **Copy Response**: `workbench.action.chat.copyResponse`
- **Export Chat**: `workbench.action.chat.export`
- **Import Chat**: `workbench.action.chat.import`

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatCopyActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatImportExport.ts`

### 3.7 Move & Navigation Commands
- **Move Chat to Editor**: `workbench.action.chat.moveToEditor`
- **Move Chat to Panel**: `workbench.action.chat.moveToPanel`
- **Move Chat to Sidebar**: `workbench.action.chat.moveToSidebar`
- **Navigate Prompts**: `workbench.action.chat.navigatePrompts`

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatMoveActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatPromptNavigationActions.ts`

---

## 4. Menus & Context Menus

### 4.1 Menu IDs
- **MenuId.ChatExecute**: Execute toolbar (send, dictation)
- **MenuId.ChatInputSideToolbar**: Input side toolbar (close, config)
- **MenuId.ChatRecentSessionsToolbar**: Recent sessions toolbar
- **MenuId.ChatSessionsMenu**: Chat sessions menu
- **MenuId.ChatSessionsCreateSubMenu**: New session submenu
- **MenuId.ChatTextEditorMenu**: Text editor context menu
- **MenuId.ChatMultiDiffContext**: Multi-diff context menu

**Files:**
- `src/vs/platform/actions/common/actions.ts`
- `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`

### 4.2 Context Menu Contributions
- Code block context menu
- File tree context menu
- Response context menu
- Input context menu

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatCodeblockActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatFileTreeActions.ts`

---

## 5. Integrations with Other Panels

### 5.1 Terminal Integration
- **Terminal Chat Widget**: Inline chat widget in terminal
- **Terminal Commands**: Run code blocks directly in terminal
- **Terminal Context**: Attach terminal output to chat
- **Move to Panel**: Move terminal chat to main panel
- **Terminal Chat Controller**: Manages terminal chat interactions

**Files:**
- `src/vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget.ts`
- `src/vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController.ts`
- `src/vs/workbench/contrib/terminalContrib/chat/browser/terminalChatActions.ts`

**Key Features:**
- Inline chat widget appears in terminal
- Can run commands from chat in terminal
- Terminal output can be attached to chat
- Terminal chat can be moved to main panel

### 5.2 Inline Chat Integration
- **Inline Chat Widget**: Chat widget in editor
- **Move to Panel**: Move inline chat to panel
- **Ask in Panel**: Send inline chat request to panel
- **Shared Services**: Uses same chat services

**Files:**
- `src/vs/workbench/contrib/inlineChat/browser/inlineChatWidget.ts`
- `src/vs/workbench/contrib/inlineChat/browser/inlineChatSessionService.ts`

**Key Features:**
- Inline chat can be moved to panel
- Panel chat can be moved to inline
- Shared session management

### 5.3 Notebook Integration
- **Cell Chat**: Chat in notebook cells
- **Generate Code**: Generate code cells via chat
- **Notebook Context**: Attach notebook context to chat

**Files:**
- `src/vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatPart.ts`
- `src/vs/workbench/contrib/notebook/browser/controller/chat/notebookChatContext.ts`
- `src/vs/workbench/contrib/notebook/browser/controller/chat/cellChatActions.ts`

**Key Features:**
- Chat can generate notebook cells
- Notebook context can be attached
- Cell-specific chat interactions

### 5.4 Editor Integration
- **Editor Context**: Attach editor selection/context
- **Code Actions**: Chat suggestions in editor
- **Text Edits**: Apply chat suggestions as edits
- **Multi-file Edits**: Edit multiple files from chat

**Files:**
- `src/vs/workbench/contrib/chat/common/chatEditingService.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatCodeblockActions.ts`

**Key Features:**
- Editor selection can be attached
- Code blocks can be inserted into editor
- Multi-file edits supported
- Diff preview for edits

### 5.5 Problems Panel Integration
- **Attach Problems**: Attach problems/errors to chat
- **Fix Suggestions**: Get fixes for problems via chat

**Files:**
- `src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts`

### 5.6 Source Control Integration
- **Git Context**: Attach git diff/status to chat
- **SCM Attachments**: Source control attachments

**Files:**
- `src/vs/workbench/contrib/chat/common/chatAgents.ts` (supportsSourceControlAttachments)

---

## 6. Services & APIs

### 6.1 Core Services
- **IChatService**: Main chat service for sending requests, managing sessions
- **IChatWidgetService**: Manages chat widgets across locations
- **IChatAgentService**: Manages chat agents/participants
- **IChatSessionsService**: Manages chat sessions
- **IChatSlashCommandService**: Manages slash commands
- **IChatModeService**: Manages chat modes
- **IChatEditingService**: Handles code editing from chat
- **IChatAccessibilityService**: Accessibility support
- **IQuickChatService**: Quick chat service

**Files:**
- `src/vs/workbench/contrib/chat/common/chatService.ts`
- `src/vs/workbench/contrib/chat/browser/chatWidgetService.ts`
- `src/vs/workbench/contrib/chat/common/chatAgents.ts`
- `src/vs/workbench/contrib/chat/common/chatSessionsService.ts`

### 6.2 Extension Points
- **chatParticipants**: Register chat participants/agents
- **chatSessions**: Register custom chat session types
- **chatContext**: Register context providers
- **languageModelTools**: Register tools for language models

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`
- `src/vs/workbench/contrib/chat/browser/chatSessions.contribution.ts`
- `src/vs/workbench/contrib/chat/browser/chatContext.contribution.ts`
- `src/vs/workbench/contrib/chat/common/tools/languageModelToolsContribution.ts`

---

## 7. Context Keys

### 7.1 Chat Context Keys
- **ChatContextKeys.enabled**: Chat is enabled
- **ChatContextKeys.panelLocation**: Location of chat panel
- **ChatContextKeys.requestInProgress**: Request is in progress
- **ChatContextKeys.agentInInput**: Agent selected in input
- **ChatContextKeys.hasActiveRequest**: Has active request
- **ChatContextKeys.hasResponse**: Has response
- **ChatContextKeys.hasCodeBlock**: Response has code block
- **ChatContextKeys.hasFileTree**: Response has file tree
- **ChatContextKeys.lockedToCodingAgent**: Locked to coding agent
- **ChatContextKeys.Setup.hidden**: Setup is hidden
- **ChatContextKeys.Setup.disabled**: Setup is disabled

**Files:**
- `src/vs/workbench/contrib/chat/common/chatContextKeys.ts`

---

## 8. Configuration Settings

### 8.1 Chat Configuration
- **chat.emptyChatViewRecentSessionsEnabled**: Show recent sessions in empty chat
- **chat.agent.enabled**: Enable agent mode
- **chat.maxRequests**: Maximum requests per session
- **chat.editor.enablePreview**: Enable preview for edits
- **chat.editor.enablePreviewChanges**: Enable preview changes

**Files:**
- `src/vs/workbench/contrib/chat/common/constants.ts`

---

## 9. Accessibility

### 9.1 Accessibility Features
- **Accessible View**: Screen reader support
- **Keyboard Navigation**: Full keyboard support
- **ARIA Labels**: Proper ARIA labeling
- **Focus Management**: Proper focus handling

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatAccessibilityProvider.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatAccessibilityActions.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp.ts`

---

## 10. Storage & Persistence

### 10.1 Storage Keys
- **interactive-session-view-chat**: View state storage
- **workbench.panel.chat.numberOfVisibleViews**: Number of visible views
- Session data stored per workspace/profile

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatViewPane.ts` (line 108)
- `src/vs/workbench/browser/layout.ts` (line 3061)

---

## 11. Telemetry

### 11.1 Telemetry Events
- Chat view opened
- Chat request submitted
- Chat response received
- Code block actions
- Session management actions
- Agent interactions

**Files:**
- Various action files with telemetry logging

---

## 12. UI Components

### 12.1 Main UI Elements
- **Chat List**: Tree view of chat messages
- **Input Editor**: Monaco editor for input
- **Welcome Screen**: Welcome content when empty
- **Sessions Control**: Recent sessions list
- **Toolbar**: Action toolbar
- **Status Bar**: Status indicators

**Files:**
- `src/vs/workbench/contrib/chat/browser/chatWidget.ts`
- `src/vs/workbench/contrib/chat/browser/chatViewPane.ts`

### 12.2 Styling
- **CSS Files**:
  - `chatViewPane.css`
  - `chat.css`
  - `chatAgentHover.css`
  - `chatViewWelcome.css`

**Files:**
- `src/vs/workbench/contrib/chat/browser/media/`

---

## 13. Key Integration Points to Preserve

### 13.1 Critical Integrations
1. **Terminal**: Run code blocks, attach terminal output
2. **Editor**: Insert code, apply edits, attach context
3. **Inline Chat**: Move between inline and panel
4. **Notebook**: Generate cells, attach context
5. **Problems**: Attach errors, get fixes
6. **Source Control**: Attach git context
7. **Quick Chat**: Quick input integration

### 13.2 Service Dependencies
- Must implement `IChatWidgetService` interface
- Must register with `IViewsService`
- Must support `IChatService` for requests
- Must support `IChatAgentService` for agents
- Must support `IChatSessionsService` for sessions

### 13.3 Extension Point Compatibility
- Should support `chatParticipants` extension point
- Should support `chatSessions` extension point
- Should support `chatContext` extension point
- Should support `languageModelTools` extension point

---

## 14. Replacement Checklist

When replacing the Copilot Chat panel, ensure:

- [ ] View container registered with same ID or migration path
- [ ] All commands registered and functional
- [ ] Terminal integration maintained
- [ ] Inline chat integration maintained
- [ ] Editor integration maintained
- [ ] Notebook integration maintained
- [ ] Session management functional
- [ ] Slash commands supported
- [ ] Agent selection supported
- [ ] Attachments supported
- [ ] Code block actions functional
- [ ] Context menu contributions work
- [ ] Accessibility features maintained
- [ ] Storage/persistence maintained
- [ ] Extension points supported
- [ ] Keybindings preserved
- [ ] Menu contributions work
- [ ] Telemetry events logged
- [ ] Welcome screen functional
- [ ] Recent sessions display works

---

## 15. File Reference Summary

### Core Files
- `src/vs/workbench/contrib/chat/browser/chatViewPane.ts` - Main view pane
- `src/vs/workbench/contrib/chat/browser/chatWidget.ts` - Core widget
- `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts` - Registration
- `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` - Main contribution

### Action Files
- `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts` - Main actions
- `src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts` - Execute actions
- `src/vs/workbench/contrib/chat/browser/actions/chatCodeblockActions.ts` - Code block actions
- `src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts` - Context actions
- `src/vs/workbench/contrib/chat/browser/actions/chatNewActions.ts` - New chat actions
- `src/vs/workbench/contrib/chat/browser/actions/chatMoveActions.ts` - Move actions
- `src/vs/workbench/contrib/chat/browser/actions/chatCopyActions.ts` - Copy actions
- `src/vs/workbench/contrib/chat/browser/actions/chatImportExport.ts` - Import/export

### Service Files
- `src/vs/workbench/contrib/chat/common/chatService.ts` - Chat service
- `src/vs/workbench/contrib/chat/browser/chatWidgetService.ts` - Widget service
- `src/vs/workbench/contrib/chat/common/chatAgents.ts` - Agent service
- `src/vs/workbench/contrib/chat/common/chatSessionsService.ts` - Sessions service

### Integration Files
- `src/vs/workbench/contrib/terminalContrib/chat/` - Terminal integration
- `src/vs/workbench/contrib/inlineChat/` - Inline chat integration
- `src/vs/workbench/contrib/notebook/browser/controller/chat/` - Notebook integration

---

## Notes

- The chat panel is deeply integrated with VS Code's architecture
- Many features depend on extension points and services
- Terminal and inline chat integrations are critical
- Session management and persistence are important
- Accessibility must be maintained
- Extension compatibility should be considered



