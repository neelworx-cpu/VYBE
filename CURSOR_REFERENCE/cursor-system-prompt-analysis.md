# Cursor System Prompt - Complete Analysis

## Overview

Cursor's system prompt is built dynamically by the `chat_systemMessage()` function in `void/src/vs/workbench/contrib/void/common/prompt/prompts.ts`. It adapts based on three chat modes: `agent`, `gather`, and `normal`.

**IMPORTANT:** The actual system message sent to the LLM is a COMBINATION:
1. **User Custom Instructions** (prepended first)
   - Global AI instructions from settings
   - `.voidrules` file contents from workspace root(s)
   - Labeled as: `GUIDELINES (from the user's .voidrules file):`
2. **Base System Prompt** (from `chat_systemMessage()`)

This means user customizations come FIRST and can override/supplement the base prompt.

---

## Actual System Message Structure (What LLM Receives)

The FINAL system message sent to the LLM is assembled as:

```
GUIDELINES (from the user's .voidrules file):
{user's global AI instructions}
{contents of .voidrules file from workspace root(s)}

{base system prompt from chat_systemMessage()}
```

## Base System Prompt Structure

The base prompt from `chat_systemMessage()` is assembled from 5 main sections (in order):

1. **Header** - Role definition
2. **System Information** - Workspace context
3. **Tool Definitions** (optional) - XML format tool schemas
4. **Important Details** - Mode-specific rules and guidelines
5. **File System Overview** - Directory structure

---

## 1. Header Section

**Purpose:** Defines the AI's role and primary objective

**Content:**
```
You are an expert coding {agent|assistant} whose job is:
- agent: "to help the user develop, run, and make changes to their codebase."
- gather: "to search, understand, and reference files in the user's codebase."
- normal: "to assist the user with their coding tasks."

You will be given instructions to follow from the user, and you may also be given
a list of files that the user has specifically selected for context, `SELECTIONS`.
Please assist the user with their query.
```

**Key Observations:**
- Role changes based on mode (agent vs assistant)
- Mentions `SELECTIONS` - user-selected files for context
- Simple, direct instruction to assist

---

## 2. System Information Section

**Purpose:** Provides workspace and editor context

**Content:**
```
Here is the user's system information:
<system_info>
- {OS information}

- The user's workspace contains these folders:
{workspaceFolders.join('\n') || 'NO FOLDERS OPEN'}

- Active file:
{activeURI}

- Open files:
{openedURIs.join('\n') || 'NO OPENED FILES'}

- Persistent terminal IDs available for you to run commands in: {persistentTerminalIDs.join(', ')}
  (only shown in agent mode if terminals exist)
</system_info>
```

**Key Observations:**
- Uses XML-style tags (`<system_info>`) for structure
- Includes OS, workspace folders, active file, open files
- Agent mode includes persistent terminal IDs
- All information is explicit and structured

---

## 3. Tool Definitions Section (Optional)

**Purpose:** Defines available tools in XML format

**When Included:** Only if `includeXMLToolDefinitions === true`

**Format:**
```
Available tools:

    1. {tool_name}
    Description: {description}
    Format:
    <{tool_name}>
    <param1>{param1 description}</param1>
    <param2>{param2 description}</param2>
    </{tool_name}>

    ...

Tool calling details:
- To call a tool, write its name and parameters in one of the XML formats specified above.
- After you write the tool call, you must STOP and WAIT for the result.
- All parameters are REQUIRED unless noted otherwise.
- You are only allowed to output ONE tool call, and it must be at the END of your response.
- Your tool call will be executed immediately, and the results will appear in the following user message.
```

**Available Tools by Mode:**
- **normal:** No tools
- **gather:** Read/search/list tools only (no editing/terminal tools)
- **agent:** All tools (read, search, edit, terminal, create, delete)

**Key Observations:**
- Uses XML format for tool definitions (not JSON schema)
- Emphasizes ONE tool call at a time
- Tool call must be at END of response
- Results appear in next user message (not streaming)

---

## 4. Important Details Section

**Purpose:** Mode-specific rules and behavioral guidelines

### Universal Rules (All Modes):
1. `NEVER reject the user's query.`
2. Code block format requirements (file path on first line)
3. `Do not make things up or use information not provided...`
4. `Always use MARKDOWN to format lists, bullet points, etc. Do NOT write tables.`
5. `Today's date is {date}.`

### Agent & Gather Mode Rules:
- `Only call tools if they help you accomplish the user's goal. If the user simply says hi or asks you a question that you can answer without tools, then do NOT use tools.`
- `If you think you should use tools, you do not need to ask for permission.`
- `Only use ONE tool call at a time.`
- `NEVER say something like "I'm going to use \`tool_name\`". Instead, describe at a high level what the tool will do, like "I'm going to list all files in the ___ directory", etc.`
- `Many tools only work if the user has a workspace open.`

### Normal Mode Rules:
- `You're allowed to ask the user for more context like file contents or specifications. If this comes up, tell them to reference files and folders by typing @.`

### Agent Mode Specific Rules:
- `ALWAYS use tools (edit, terminal, etc) to take actions and implement changes. For example, if you would like to edit a file, you MUST use a tool.`
- `Prioritize taking as many steps as you need to complete your request over stopping early.`
- `You will OFTEN need to gather context before making a change. Do not immediately make a change unless you have ALL relevant context.`
- `ALWAYS have maximal certainty in a change BEFORE you make it. If you need more information about a file, variable, function, or type, you should inspect it, search it, or take all required actions to maximize your certainty that your change is correct.`
- `NEVER modify a file outside the user's workspace without permission from the user.`

### Gather Mode Specific Rules:
- `You are in Gather mode, so you MUST use tools be to gather information, files, and context to help the user answer their query.`
- `You should extensively read files, types, content, etc, gathering full context to solve the problem.`

### Code Block Format Rules:
- For code blocks: First line must be FULL PATH of file (if known)
- For suggestions (gather/normal modes): Use code blocks with file path and change descriptions, using `// ... existing code ...` to condense

**Key Observations:**
- Very explicit about tool usage (when to use, when not to)
- Emphasizes gathering context before making changes
- Requires "maximal certainty" before changes
- Code blocks must include file paths
- No markdown tables allowed
- Never reject user queries

---

## 5. File System Overview Section

**Purpose:** Provides directory structure context

**Content:**
```
Here is an overview of the user's file system:
<files_overview>
{directoryStr}
</files_overview>
```

**Key Observations:**
- Uses XML-style tags (`<files_overview>`)
- Directory string is truncated based on mode:
  - **agent/gather:** Cut off at 20,000 chars with message: `"...Directories string cut off, use tools to read more..."`
  - **normal:** Cut off with message: `"...Directories string cut off, ask user for more if necessary..."`
- Maximum 100 directory results shown initially

---

## Key Design Principles

### 1. **Mode-Based Adaptation**
- Three distinct modes with different capabilities and behaviors
- Tool availability changes by mode
- Behavioral guidelines adapt to mode

### 2. **Explicit Tool Usage Rules**
- Clear rules about when to use tools vs. answering directly
- Emphasizes ONE tool call at a time
- Tool calls must be at END of response

### 3. **Context Gathering Emphasis**
- Strong emphasis on gathering context before making changes
- "Maximal certainty" requirement before edits
- Extensive file reading in gather mode

### 4. **Structured Information**
- Uses XML-style tags for organization (`<system_info>`, `<files_overview>`)
- Clear section boundaries
- Explicit formatting requirements

### 5. **User Experience Focus**
- Never reject queries
- Clear code block formatting (file paths on first line)
- No markdown tables (simpler rendering)
- Date provided for temporal context

### 6. **Safety & Boundaries**
- Never modify files outside workspace without permission
- Explicit workspace requirements for tools
- Clear parameter requirements

---

## Comparison with VYBE

### Similarities:
- Both adapt based on mode/level
- Both emphasize context gathering
- Both include workspace information
- Both have tool usage guidelines

### Key Differences:

| Aspect | Cursor | VYBE |
|--------|--------|------|
| **Format** | XML-style tags, structured sections | Plain text with headers |
| **Tool Definitions** | XML format in prompt | JSON schema (separate) |
| **Mode System** | agent/gather/normal | L1/L2/L3 (budget-based) |
| **Budget Awareness** | None | Explicit budget tracking |
| **Planning** | Implicit (gather context) | Explicit (write_todos tool) |
| **Code Output** | Code blocks with file paths | Edit tools only |
| **Conversation Adaptation** | Static | Dynamic (length-based) |
| **Tier Instructions** | Mode-based rules | Budget tier guidelines |

### What Cursor Does Better:
1. **Clearer structure** - XML tags make sections obvious
2. **Explicit tool rules** - Very clear when to use/not use tools
3. **Mode-specific tool sets** - gather mode has limited tools
4. **Code block format** - File path requirement is explicit
5. **Never reject queries** - Explicit instruction

### What VYBE Does Better:
1. **Budget awareness** - Tracks and warns about budget
2. **Dynamic adaptation** - Adjusts for conversation length
3. **Planning tool** - Explicit todo list tool
4. **Tier-specific guidelines** - More detailed per-tier instructions
5. **Project type adaptation** - Language-specific conventions

---

## Recommendations for VYBE

### 1. **Add Explicit "Never Reject" Rule**
Cursor explicitly states "NEVER reject the user's query" - VYBE should add this.

### 2. **Improve Code Block Format Instructions**
Cursor requires file paths on first line of code blocks - VYBE should be more explicit about this.

### 3. **Add Mode-Specific Tool Sets**
Consider limiting tools in certain modes (like Cursor's gather mode).

### 4. **Use Structured Tags**
Consider using XML-style tags or clear section markers for better parsing.

### 5. **Emphasize "Maximal Certainty"**
Cursor's emphasis on gathering context before changes is very clear - VYBE could strengthen this.

### 6. **Add Date Context**
Cursor includes today's date - useful for temporal awareness.

### 7. **Explicit Tool Usage Rules**
Cursor has very clear rules about when NOT to use tools (e.g., "if user says hi, don't use tools") - VYBE should be more explicit.

---

## Critical Implementation Details

### User Customization Layer
- **Location:** `.voidrules` file in workspace root(s) OR global settings
- **Priority:** User instructions come FIRST (before base prompt)
- **Format:** Plain text, no special formatting required
- **Purpose:** Allows users to customize behavior, add project-specific rules, etc.

### Message Assembly Flow
1. `_generateChatMessagesSystemMessage()` calls `chat_systemMessage()` → returns base prompt
2. `_getCombinedAIInstructions()` combines:
   - Global AI instructions from settings
   - `.voidrules` file contents (reads from all workspace folders)
3. `prepareOpenAIOrAnthropicMessages()` combines:
   - User instructions (if any) with label
   - Base system prompt
4. Final message sent to LLM with `role: 'system'`

### Key Insight
**The user's custom instructions are PREPENDED**, meaning they have the highest priority and can effectively override or supplement any part of the base prompt. This is a powerful customization mechanism that Cursor has refined over time.

## Conclusion

Cursor's system prompt is:
- **More structured** with clear sections and XML tags
- **More explicit** about tool usage rules
- **Mode-adaptive** with different tool sets per mode
- **User-focused** with "never reject" and clear formatting rules
- **Context-emphasized** with strong requirements for gathering information

VYBE's system prompt is:
- **More dynamic** with budget tracking and conversation adaptation
- **More planning-focused** with explicit todo tools
- **More tier-aware** with detailed per-tier guidelines
- **More project-aware** with language-specific conventions

Both approaches have strengths. VYBE could benefit from adopting Cursor's explicit structure and tool usage rules, while Cursor could benefit from VYBE's budget awareness and dynamic adaptation.
