# VYBE Chat Content Parts - Implementation Order

## ✅ **COMPLETED:**

### 1. VybeChatThinkingPart ✅
- Collapsible thinking block
- Streaming support (loading spinner)
- Auto-scroll during streaming
- Chevron icon when complete
- Hidden scrollbar

### 2. VybeChatMarkdownPart ✅ (Basic)
- Text rendering with VS Code markdown service
- Headings, paragraphs, lists
- Tables, blockquotes, horizontal rules
- Inline code
- Proper spacing/margins

---

## 🔴 **NEXT PRIORITY:**

### 3. Code Blocks in Markdown 🔴 **URGENT**

**Why it's critical:**
- Code blocks are THE most important part of an AI coding assistant
- They appear INSIDE markdown (not separate content parts)
- Need Monaco editor for syntax highlighting
- Need action buttons (copy, insert, run)

**What Copilot does:**
```typescript
// In ChatMarkdownContentPart constructor:
const result = renderer.render(markdown.content, {
    codeBlockRendererSync: (languageId, text, raw) => {
        // Returns a CodeBlockPart instance with:
        // - Monaco editor for syntax highlighting
        // - Line numbers
        // - Copy button
        // - Insert at cursor button
        // - Run in terminal button
        // - Language indicator
        return codeBlockPart.element;
    }
});
```

**Implementation needed:**

#### A. Create `CodeBlockPart` Class
```typescript
// File: src/vs/workbench/contrib/vybeChat/browser/codeBlockPart.ts

export class CodeBlockPart extends Disposable {
    readonly domNode: HTMLElement;
    private editor: ICodeEditor | null = null;

    constructor(
        private readonly languageId: string,
        private readonly code: string,
        private readonly codeBlockIndex: number,
        @IInstantiationService private readonly instantiationService: IInstantiationService,
        @IModelService private readonly modelService: IModelService,
        @ILanguageService private readonly languageService: ILanguageService,
        @ICommandService private readonly commandService: ICommandService
    ) {
        super();
        this.domNode = this.createDomNode();
    }

    private createDomNode(): HTMLElement {
        // Outer container
        const container = $('.vybe-code-block');

        // Toolbar with actions
        const toolbar = this.createToolbar();
        container.appendChild(toolbar);

        // Monaco editor
        const editorContainer = $('.vybe-code-editor');
        this.createEditor(editorContainer);
        container.appendChild(editorContainer);

        return container;
    }

    private createToolbar(): HTMLElement {
        const toolbar = $('.vybe-code-block-toolbar');

        // Language indicator
        const langBadge = $('.language-badge');
        langBadge.textContent = this.languageId;
        toolbar.appendChild(langBadge);

        // Copy button
        const copyBtn = this.createButton('Copy', 'copy', () => {
            this.copyCode();
        });
        toolbar.appendChild(copyBtn);

        // Insert at cursor button
        const insertBtn = this.createButton('Insert at Cursor', 'insert', () => {
            this.insertAtCursor();
        });
        toolbar.appendChild(insertBtn);

        // Run in terminal button (for shell scripts)
        if (this.isExecutable()) {
            const runBtn = this.createButton('Run in Terminal', 'play', () => {
                this.runInTerminal();
            });
            toolbar.appendChild(runBtn);
        }

        return toolbar;
    }

    private createEditor(container: HTMLElement): void {
        const model = this.modelService.createModel(
            this.code,
            this.languageService.createById(this.languageId)
        );

        this.editor = this.instantiationService.createInstance(
            CodeEditorWidget,
            container,
            {
                readOnly: true,
                lineNumbers: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                fontSize: 13,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                padding: { top: 8, bottom: 8 },
                overviewRulerLanes: 0,
                scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto'
                }
            }
        );

        this.editor.setModel(model);
        this._register(this.editor);
        this._register(model);
    }

    private copyCode(): void {
        // Copy to clipboard
        navigator.clipboard.writeText(this.code);
    }

    private insertAtCursor(): void {
        // Insert code at active editor cursor
        this.commandService.executeCommand('editor.action.insertSnippet', {
            snippet: this.code
        });
    }

    private runInTerminal(): void {
        // Run code in terminal
        this.commandService.executeCommand('workbench.action.terminal.sendSequence', {
            text: this.code
        });
    }

    private isExecutable(): boolean {
        return ['bash', 'sh', 'powershell', 'cmd', 'python', 'javascript', 'typescript'].includes(this.languageId);
    }
}
```

#### B. Update `VybeChatMarkdownPart` to Use Code Blocks
```typescript
// In vybeChatMarkdownPart.ts

private renderMarkdown(content: string): void {
    if (!this.markdownContainer) {
        return;
    }

    // Create markdown string
    const markdownString = new MarkdownString(content, {
        isTrusted: true,
        supportThemeIcons: true,
        supportHtml: false
    });

    // Render with code block handler
    const result = this.markdownRendererService.render(markdownString, {
        codeBlockRenderer: async (languageId, code) => {
            // Create CodeBlockPart instance
            const codeBlockPart = new CodeBlockPart(
                languageId,
                code,
                this.codeBlockIndex++,
                this.instantiationService,
                this.modelService,
                this.languageService,
                this.commandService
            );

            this._register(codeBlockPart);
            return codeBlockPart.domNode;
        }
    });

    // Append the rendered content
    this.markdownContainer.appendChild(result.element);
}
```

#### C. Create CSS for Code Blocks
```css
/* File: src/vs/workbench/contrib/vybeChat/browser/media/vybeChatCodeBlock.css */

.vybe-code-block {
    margin: 0.5em 0;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    background-color: var(--vscode-textCodeBlock-background);
}

.vybe-code-block-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    background-color: rgba(128, 128, 128, 0.1);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.language-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    background-color: rgba(128, 128, 128, 0.2);
    color: var(--vscode-foreground);
    opacity: 0.7;
}

.vybe-code-editor {
    padding: 0;
}

/* Action buttons */
.vybe-code-block-toolbar .action-button {
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    opacity: 0.7;
    transition: opacity 0.2s;
}

.vybe-code-block-toolbar .action-button:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.2);
    border-radius: 3px;
}
```

**Priority:** 🔴 **URGENT** - Must have for AI coding assistant

**Estimated time:** 2-3 days

---

## 🟡 **AFTER CODE BLOCKS:**

### 4. VybeChatTextEditPart 🟡 **HIGH**

**What it does:**
- Shows file edits proposed by AI
- Diff view (before/after)
- Accept/Reject buttons
- Apply changes to actual files

**Why it's important:**
- Core feature for AI suggesting file changes
- Different from code blocks (which are standalone)
- Needs diff editor (2 panels side-by-side)

**Example structure:**
```typescript
export interface IVybeChatTextEditGroup {
    kind: 'textEditGroup';
    uri: URI;  // File being edited
    edits: ITextEdit[];  // The changes
    state: 'pending' | 'accepted' | 'rejected';
}
```

**Priority:** 🟡 **HIGH** - Core AI coding feature

**Estimated time:** 3-4 days

---

### 5. VybeChatProgressPart 🟡 **MEDIUM**

**What it does:**
- Loading spinners
- Progress messages ("Analyzing code...", "Searching files...")
- Status updates during long operations

**Example:**
```typescript
export interface IVybeChatProgressMessage {
    kind: 'progressMessage';
    content: string;
    progress?: number;  // 0-100
}
```

**Priority:** 🟡 **MEDIUM** - Nice for UX

**Estimated time:** 1 day

---

### 6. VybeChatErrorPart 🟡 **MEDIUM**

**What it does:**
- Display error messages
- Retry button
- Error details

**Example:**
```typescript
export interface IVybeChatError {
    kind: 'error';
    message: string;
    code?: string;
    retry?: () => void;
}
```

**Priority:** 🟡 **MEDIUM** - Important for error handling

**Estimated time:** 1 day

---

### 7. VybeChatReferencesPart 🟢 **LOW**

**What it does:**
- Show files/symbols AI used for context
- Clickable links to open files
- Reference counts

**Example:**
```
📄 Used 3 files:
- src/app.ts (lines 10-25)
- src/utils.ts (lines 5-15)
- package.json
```

**Priority:** 🟢 **LOW** - Nice to have for transparency

**Estimated time:** 2 days

---

### 8. VybeChatConfirmationPart 🟢 **LOW**

**What it does:**
- Yes/No prompts
- User confirmation for destructive actions

**Example:**
```
This will delete 5 files. Continue?
[Yes] [No]
```

**Priority:** 🟢 **LOW** - Only if AI needs confirmations

**Estimated time:** 1 day

---

### 9-21. Other Content Parts 🟢 **VERY LOW**

The remaining 13 content types are specialized:
- Tree views
- Extension recommendations
- GitHub PR previews
- Task lists
- Tool invocations
- MCP servers
- etc.

**Priority:** 🟢 **VERY LOW** - Implement only if needed

---

## 📋 **Implementation Order Summary:**

1. ✅ **VybeChatThinkingPart** - DONE
2. ✅ **VybeChatMarkdownPart** (basic) - DONE
3. 🔴 **Code Blocks in Markdown** - NEXT (2-3 days)
4. 🟡 **VybeChatTextEditPart** - File edits (3-4 days)
5. 🟡 **VybeChatProgressPart** - Loading indicators (1 day)
6. 🟡 **VybeChatErrorPart** - Error messages (1 day)
7. 🟢 **VybeChatReferencesPart** - References (2 days)
8. 🟢 **Others as needed**

---

## 🎯 **Next Steps:**

1. **Implement Code Blocks** (2-3 days)
   - Create `CodeBlockPart` class
   - Integrate with markdown renderer
   - Add action buttons (copy, insert, run)
   - Style with CSS

2. **Test Code Blocks**
   - Run `__vybeTestSpacing()`
   - Add code blocks to test
   - Verify syntax highlighting
   - Test action buttons

3. **Then move to Text Edits**

**Ready to start implementing Code Blocks?** This is the #1 priority for an AI coding assistant! 🚀

