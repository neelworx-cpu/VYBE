# Terminal Tool Call Block - Structure Analysis

## Overview
Terminal tool calls have **3 states** that affect the header text and visual appearance:

## States

### 1. **PENDING** (Asking Permission)
- **Header Text:** "Run command: npm install"
- **Permission Dropdown:** "Ask Every Time" (visible and active)
- **Status:** Hidden or "Waiting for approval"
- **Output:** Not visible yet
- **Icon:** Terminal icon (static)

### 2. **RUNNING** (Executing)
- **Header Text:** "Running command: npm install"
- **Permission Dropdown:** Still visible but disabled
- **Status:** "Running" with spinner icon
- **Output:** Streaming live output
- **Icon:** Terminal icon (may pulse/animate)

### 3. **COMPLETED** (Success/Failed)
- **Header Text:** "Ran command: npm install"
- **Permission Dropdown:** Still visible but disabled
- **Status:** "Success" (✓ green) or "Failed" (✗ red)
- **Output:** Full final output
- **Icon:** Terminal icon (static)

---

## Visual Structure

### Header Background
- **Same as Code Block header** - uses `var(--vscode-titleBar-activeBackground)`
- **NOT** the panel background like text edits
- Header should have the darker background to match code blocks

### Terminal Icon
- **NOT a file icon** - should be `codicon-terminal` or similar
- Positioned where file icon would be in text edit
- May animate during "running" state

### Top Header Text Pattern
```
[State Icon] [State Text]: [Command Summary]
```

Examples:
- 🖥️ Run command: npm install
- 🖥️ Running command: npm install
- 🖥️ Ran command: npm install

---

## Component Hierarchy

```
.composer-terminal-tool-call-block-container
├── .composer-tool-call-top-header (NO BACKGROUND)
│   ├── Command summary text
│   └── Action buttons (copy, external, menu)
│
├── .composer-tool-call-content
│   ├── .composer-tool-call-header (WITH BACKGROUND - like code block)
│   │   ├── Terminal icon (codicon-terminal)
│   │   └── Command editor (Monaco, shellscript)
│   │
│   └── .composer-tool-call-body
│       └── Terminal output (<pre>)
│
└── .composer-tool-call-control-row
    ├── Permission dropdown
    └── Status indicator
```

---

## Key Differences from Text Edit

| Feature | Text Edit | Terminal |
|---------|-----------|----------|
| **Icon** | File icon (dynamic) | Terminal icon (static) |
| **Header BG** | Panel background | Code block header background |
| **Top Header** | None | Command summary + buttons |
| **State Text** | Static filename | Dynamic (Run/Running/Ran) |
| **Expand Button** | Yes (chevron) | No |
| **Permission** | No | Yes (dropdown) |

---

## CSS Classes Needed

### Header with Background (like code blocks)
```css
.composer-tool-call-header {
    background: var(--vscode-titleBar-activeBackground) !important;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}
```

### Terminal Icon Container
```css
.composer-terminal-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.composer-terminal-icon .codicon {
    font-size: 16px;
    color: var(--vscode-terminal-ansiGreen);
}
```

### Top Header (no background, just text)
```css
.composer-tool-call-top-header {
    background: transparent;
    /* Text styling only */
}
```

---

## State Management Logic

```typescript
interface TerminalState {
    phase: 'pending' | 'running' | 'completed';
    status: 'success' | 'failed' | 'cancelled' | null;
}

function getHeaderText(state: TerminalState): string {
    switch (state.phase) {
        case 'pending':
            return 'Run command:';
        case 'running':
            return 'Running command:';
        case 'completed':
            return 'Ran command:';
    }
}
```

---

## Implementation Checklist

- [ ] Change icon from file icon to terminal icon (`codicon-terminal`)
- [ ] Add background to command header (like code blocks)
- [ ] Implement state-based header text (Run/Running/Ran)
- [ ] Add `phase` property to track state
- [ ] Update top header to show dynamic text based on phase
- [ ] Style terminal icon with terminal green color
- [ ] Ensure permission dropdown only active in pending state
- [ ] Add state transition logic (pending → running → completed)

---

## Example Data Structure

```typescript
interface IVybeChatTerminalContent {
    kind: 'terminal';
    command: string;
    output: string;
    phase: 'pending' | 'running' | 'completed'; // NEW!
    status: 'success' | 'failed' | 'running' | 'cancelled';
    permission?: 'Ask Every Time' | 'Always Allow' | 'Never Allow';
    isStreaming?: boolean;
    exitCode?: number;
}
```

---

## Notes

- Terminal header background should match **code blocks** (darker/colored)
- Text edit header background is **panel background** (lighter)
- This creates visual hierarchy: Code/Terminal = executable, Text Edit = file changes
- Permission dropdown should be disabled (grayed out) when not in pending state
- Top header text changes are the PRIMARY indicator of state

