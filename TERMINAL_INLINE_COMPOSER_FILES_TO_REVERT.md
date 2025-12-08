# Files to Revert for Terminal Inline Composer

## NEW FILES (Delete These - Created Only for Terminal Inline Composer)

1. **`src/vs/workbench/contrib/vybeChat/browser/components/terminalInlineComposer/`** (entire directory)
   - `terminalInlineComposer.ts`
   - `terminalInlineComposer.css`
   - `vybeTerminalChatWidget.ts`

2. **`src/vs/workbench/contrib/vybeChat/browser/contribution/vybeTerminalInlineChat.contribution.ts`**

3. **`src/vs/workbench/contrib/vybeChat/browser/contribution/vybeTerminalInlineChatActions.contribution.ts`**

4. **`src/vs/workbench/contrib/vybeChat/browser/contribution/vybeTerminalInlineChatActions.ts`**

## MODIFIED FILES (Revert These Changes - Only Terminal Inline Composer Related)

### 1. `src/vs/workbench/contrib/vybeChat/browser/contribution/vybeChat.contribution.ts`
**Changes to revert:**
- Remove these 3 import lines (lines 16, 19, 20):
  ```typescript
  import './terminalSelectionButton.contribution.js';
  import './vybeTerminalInlineChat.contribution.js';
  import './vybeTerminalInlineChatActions.contribution.js';
  ```

### 2. `src/vs/workbench/contrib/vybeChat/browser/components/composer/messageComposer.ts`
**Changes to revert:**
- Remove `value?: string` from `contextPillsData` Map type
- Remove `value?: string` from `getContextPillsData()` return type
- Remove `value?: string` from `insertContextPill()` parameter
- Remove `value?: string` from `restoreContextPills()` parameter
- Remove debug logging for terminal pills (inspectPills method and console.logs)

### 3. `src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts`
**Changes to revert:**
- Remove console.log for terminal pills when sending messages
- Remove any terminal-specific pill handling code

## FILES TO KEEP (Have Other Important Changes)

### `src/vs/workbench/contrib/vybeChat/browser/contribution/terminalSelectionButton.contribution.ts`
**Status:** KEEP - This is the "Add to Chat" button feature (separate from inline composer)
- This adds the floating button when selecting terminal text
- Used by main chat composer, not just inline composer
- **Decision needed:** Keep if you want the "Add to Chat" button feature

### `src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatTerminalPart.ts`
**Status:** KEEP - Has terminal execution improvements
- Changes for terminal block execution, ANSI parsing, terminal reuse
- Not related to inline composer
- **Keep all changes**

### Other modified files
**Status:** KEEP - These have other unrelated changes
- `vybeChatTerminal.css` - Terminal block styling (keep)
- All action files - Other features (keep)
- Other content parts - Other features (keep)

## Summary

**To completely remove terminal inline composer:**
1. Delete the 4 new files/directories listed above
2. Revert changes in `vybeChat.contribution.ts` (remove 3 imports)
3. Revert changes in `messageComposer.ts` (remove `value` field and debug logs)
4. Revert changes in `vybeChatViewPane.ts` (remove terminal pill logging)

**Note:** `terminalSelectionButton.contribution.ts` is separate - it's the "Add to Chat" button that works with the main chat composer. Decide if you want to keep this feature.

