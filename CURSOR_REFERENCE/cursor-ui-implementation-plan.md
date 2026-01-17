# Cursor UI Implementation Plan

## Analysis of Cursor's Structure

All tool results (List, Search, Grep, Thoughts) share the same outer structure:

### Common Outer Structure:
1. `composer-message-group` (outermost - added by messagePage)
2. Padding wrapper: `padding: 0px 18px` (added by messagePage)
3. `composer-message-group composer-new-convo-summary` (added by messagePage)
4. Message bubble with attributes:
   - `data-tool-call-id` (for tools) or `data-message-id` (for thoughts)
   - `data-tool-status="completed"` (for tools)
   - `data-message-kind="tool"` (for tools) or `data-message-kind="thinking"` (for thoughts)
   - Classes: `composer-rendered-message hide-if-empty composer-message-blur composer-grouped-toolformer-message composer-summary-single-message`
5. Transparent wrapper: `background-color: transparent;`
6. Tool/Think container:
   - Tools: `composer-tool-former-message` with `padding: 0px;`
   - Thoughts: `markdown-jsx markdown-think` with `padding: 2px 0px;`
7. `collapsible-clean` container (with `collapsible-thought` class for thoughts)
8. Header row (clickable for expand/collapse):
   - Extra wrapper div
   - `collapsible-header-text` with verb + target + chevron
9. `collapsible-clean-children` container (expandable content)

### Differences by Tool Type:

#### List:
- Verb: "Listed"
- Target: directory name
- Chevron: shown when files exist
- Content: `context-list-item` elements (files/directories)
- Subtitle: full path

#### Search:
- Verb: "Searched"
- Target: query text
- Chevron: shown when files exist
- Content: `context-list-item` elements (files with line ranges)
- Subtitle: full path + line range (e.g., `L848-940`)

#### Grep:
- Verb: "Grepped"
- Target: pattern + path (e.g., "llm in /Users/neel/VYBE")
- Chevron: shown when files exist
- Content: `context-list-item` elements (files with match count badges)
- Subtitle: full path
- Badge: `cursor-badge cursor-badge-subtle cursor-badge-small` with match count

#### Thoughts:
- Verb: "Thought"
- Target: duration (e.g., "for 3s")
- Chevron: always shown
- Content: markdown-rendered text in scrollable container
- Height: 144px (fixed)
- Opacity: 0.6 for content text

## Implementation Tasks

### 1. VybeChatSearchedPart
- [ ] Add `isExpanded`, `chevronElement`, `childrenContainer`, `clickHandlerAttached` properties
- [ ] Add chevron icon (matching list implementation)
- [ ] Make header clickable
- [ ] Add `toggleExpand()` method
- [ ] Add `createFileListContainer()` method (similar to list, but with line ranges in subtitle)
- [ ] Add `createFileListItem()` method (with line ranges: `L848-940`)
- [ ] Update header to show query text (not filename)
- [ ] Update `updateContent()` to handle file list updates

### 2. VybeChatGreppedPart
- [ ] Add `isExpanded`, `chevronElement`, `childrenContainer`, `clickHandlerAttached` properties
- [ ] Add chevron icon
- [ ] Make header clickable
- [ ] Add `toggleExpand()` method
- [ ] Add `createFileListContainer()` method
- [ ] Add `createFileListItem()` method (with match count badges)
- [ ] Update header to show pattern + path
- [ ] Add badge styling: `cursor-badge cursor-badge-subtle cursor-badge-small`

### 3. VybeChatThinkingPart
- [ ] Update outer structure to match Cursor exactly
- [ ] Fix chevron positioning (should be in `collapsible-header-text`, not separate)
- [ ] Update scrollable container structure
- [ ] Fix height to 144px (matching Cursor)
- [ ] Update content opacity to 0.6
- [ ] Ensure proper markdown rendering structure

## Key Implementation Details

### Chevron Icon:
- Class: `codicon codicon-chevron-right chevron-right`
- Size: `width: 21px; height: 14px; font-size: 18px;`
- Transform origin: `center center`
- Opacity: 0 when collapsed, 0.6 when expanded
- Transform: `rotate(90deg)` when expanded
- Position: inside `collapsible-header-text`, after target text

### File List Container:
- Max height: 126px (for 5 items)
- Scrollable when content exceeds height
- Structure: `collapsible-clean-children` → height container → overflow container → scrollable → monaco-scrollable → content wrapper → inline container → context-list

### File List Items:
- Class: `context-list-item`
- Structure: icon container → content container (title + subtitle)
- Hover: `var(--vscode-titleBar-activeBackground)`
- Clickable: opens file in editor

### Line Ranges (Search):
- Format: `L848-940` in subtitle
- Structure: `context-list-item-subtitle` → `span[direction: ltr]` → `span.monaco-highlighted-label` with path + `span.context-list-item-lines` with line range

### Match Count Badges (Grep):
- Class: `cursor-badge cursor-badge-subtle cursor-badge-small`
- Position: `margin-left: auto` in `context-list-item-content`
- Text: match count number
