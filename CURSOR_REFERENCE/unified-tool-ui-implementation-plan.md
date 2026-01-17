# Unified Tool UI Implementation Plan

## Overview

All tool types share the same outer structure and internal list item pattern. The only differences are:
1. **Verb text** (Listing, Reading, Searching, Grepping, Checking to-dos)
2. **Target display** (directory, filename, query, pattern, etc.)
3. **List item content** (file paths, line ranges, match counts, etc.)
4. **Expand/collapse behavior** (some expandable, some not)

## Tool Types Identified

| Tool Type | In Progress | Complete | Expandable | Notes |
|-----------|-------------|----------|------------|-------|
| `list` | Listing | Listed | ✅ Yes | Already implemented |
| `read` | Reading | Read | ❌ No | Currently no expand |
| `search` | Searching | Searched | ✅ Yes | Codebase search |
| `search_web` | Searching web | Searched web | ✅ Yes | Web search (different content) |
| `grep` | Grepping | Grepped | ✅ Yes | Pattern search |
| `todos` | Checking to-dos | Checked to-dos | ✅ Yes | Todo list |

## Current State

### ✅ Already Implemented (List)
- Expand/collapse with chevron
- File list container with scrollable items
- Animation on verb during streaming (shine effect)
- Proper Cursor structure matching

### ❌ Needs Implementation
- **Read**: No expand/collapse (should it have one? Maybe not - single file)
- **Search**: Has separate `VybeChatSearchedPart` - needs collapse/expand + animation
- **Search Web**: Needs separate handling (different content structure)
- **Grep**: Has separate `VybeChatGreppedPart` - needs collapse/expand + animation
- **Todos**: Needs implementation (checking to-dos / checked to-dos)

## Architecture Decision

### Option 1: Extend `VybeChatToolPart` (Recommended)
- **Pros**: Single unified component, easier maintenance, consistent behavior
- **Cons**: More complex, needs careful handling of different data types

### Option 2: Keep Separate Parts, Share Common Logic
- **Pros**: Cleaner separation, easier to understand
- **Cons**: Code duplication, harder to maintain consistency

**Recommendation**: **Option 1** - Extend `VybeChatToolPart` to handle all tool types.

## Implementation Plan

### Phase 1: Extend Animation to Cover Verb + Target

**Current**: Animation only on verb text
**Target**: Animation flows across entire header (verb + target/filepath)

**Changes needed in `VybeChatToolPart.ts`**:
1. Wrap verb + target in a single container
2. Apply shine animation to the entire container
3. Ensure animation flows smoothly across both elements

```typescript
// Current structure:
<span verb> + <span target>

// New structure:
<div class="tool-header-animated"> // Apply animation here
  <span verb>
  <span target>
</div>
```

### Phase 2: Add Tool Types to `TOOL_VERBS`

```typescript
const TOOL_VERBS = {
	read: { inProgress: 'Reading', complete: 'Read', command: 'Read' },
	list: { inProgress: 'Listing', complete: 'Listed', command: 'List' },
	grep: { inProgress: 'Grepping', complete: 'Grepped', command: 'Grep' },
	search: { inProgress: 'Searching', complete: 'Searched', command: 'Search' },
	search_web: { inProgress: 'Searching web', complete: 'Searched web', command: 'Search web' },
	todos: { inProgress: 'Checking to-dos', complete: 'Checked to-dos', command: 'Check to-dos' }
} as const;
```

### Phase 3: Extend `IVybeChatToolContent` Interface

```typescript
export interface IVybeChatToolContent {
	kind: 'tool';
	id: string;
	toolType: 'read' | 'list' | 'grep' | 'search' | 'search_web' | 'todos';
	target: string;
	filePath?: string;
	lineRange?: { start: number; end: number };
	isStreaming: boolean;
	error?: { code: string; message: string };

	// For list operations
	fileList?: Array<{ name: string; type: 'file' | 'directory'; path: string }>;

	// For search operations (codebase)
	searchResults?: Array<{
		name: string;
		path: string;
		lineRange?: { start: number; end: number };
	}>;

	// For grep operations
	grepResults?: Array<{
		name: string;
		path: string;
		matchCount: number;
	}>;

	// For web search
	webSearchResults?: Array<{
		title: string;
		url: string;
		snippet: string;
	}>;

	// For todos
	todoResults?: Array<{
		id: string;
		description: string;
		status: 'pending' | 'in_progress' | 'completed';
	}>;
}
```

### Phase 4: Implement Expand/Collapse for Each Type

#### 4.1 List (Already Done ✅)
- Chevron shown when `fileList.length > 0`
- Expandable file list with icons, titles, subtitles

#### 4.2 Search (Codebase)
- Chevron shown when `searchResults.length > 0`
- Expandable list showing:
  - File icon
  - Filename (title)
  - Path + line range (subtitle, e.g., `L848-940`)

#### 4.3 Search Web
- Chevron shown when `webSearchResults.length > 0`
- Expandable list showing:
  - Title
  - URL
  - Snippet (different structure - not file-based)

#### 4.4 Grep
- Chevron shown when `grepResults.length > 0`
- Expandable list showing:
  - File icon
  - Filename (title)
  - Path (subtitle)
  - Match count badge (e.g., "5")

#### 4.5 Todos
- Chevron shown when `todoResults.length > 0`
- Expandable list showing:
  - Checkbox icon (pending/in-progress/completed)
  - Description (title)
  - Status (subtitle)

#### 4.6 Read
- **Decision**: Should read have expand/collapse?
  - **Option A**: No expand (single file, just show filename)
  - **Option B**: Expand to show file preview (first N lines)
  - **Recommendation**: Option A (matches Cursor - read doesn't expand)

### Phase 5: Create List Item Renderers

Each tool type needs a custom list item renderer:

```typescript
// In VybeChatToolPart
private createListItemForType(
	type: ToolType,
	item: any,
	basePath: string,
	workspaceFolder?: WorkspaceFolder
): HTMLElement {
	switch (type) {
		case 'list':
			return this.createFileListItem(item, basePath, workspaceFolder);
		case 'search':
			return this.createSearchResultItem(item, basePath, workspaceFolder);
		case 'grep':
			return this.createGrepResultItem(item, basePath, workspaceFolder);
		case 'search_web':
			return this.createWebSearchResultItem(item);
		case 'todos':
			return this.createTodoItem(item);
		default:
			return this.createFileListItem(item, basePath, workspaceFolder);
	}
}
```

### Phase 6: Update `vybeChatViewPane.ts` to Handle All Tool Types

Currently handles:
- `read_file` → `toolType: 'read'`
- `list_dir` → `toolType: 'list'`

Need to add:
- `codebase_search` → `toolType: 'search'`
- `web_search` → `toolType: 'search_web'`
- `grep` → `toolType: 'grep'`
- `write_todos` or similar → `toolType: 'todos'`

### Phase 7: Migration from Separate Parts

**Current separate parts to migrate**:
1. `VybeChatSearchedPart` → Merge into `VybeChatToolPart` with `toolType: 'search'`
2. `VybeChatGreppedPart` → Merge into `VybeChatToolPart` with `toolType: 'grep'`
3. `VybeChatReadingFilesPart` → Keep separate OR merge (decision needed)

**Migration strategy**:
1. Extend `VybeChatToolPart` first
2. Test with new tool calls
3. Migrate existing parts gradually
4. Remove old parts once migration complete

## Animation Implementation Details

### Current Animation (Verb Only)
```css
@keyframes tool-shine {
	0% { background-position: 200% center; }
	100% { background-position: -200% center; }
}

/* Applied to verb span only */
.verb-text {
	animation: tool-shine 2s linear infinite;
	background-image: linear-gradient(...);
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}
```

### New Animation (Verb + Target)
```css
/* Apply to container wrapping verb + target */
.tool-header-animated {
	animation: tool-shine 2s linear infinite;
	background-image: linear-gradient(
		90deg,
		rgba(200, 200, 200, 0.6) 0%,
		rgba(200, 200, 200, 0.6) 25%,
		rgba(255, 255, 255, 1) 50%,
		rgba(200, 200, 200, 0.6) 75%,
		rgba(200, 200, 200, 0.6) 100%
	);
	background-size: 200% 100%;
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.tool-header-animated span {
	/* Inherit transparent text from parent */
}
```

## Data Flow

### Tool Call → UI Update

1. **Tool call starts** (`tool.call` event)
   - Create tool part with `isStreaming: true`
   - Show animation on verb + target
   - No chevron yet (no results)

2. **Tool result arrives** (`tool.result` event)
   - Update `isStreaming: false`
   - Remove animation
   - Parse results into appropriate format
   - Show chevron if results exist
   - Create expandable list if results exist

3. **User clicks header**
   - Toggle `isExpanded`
   - Rotate chevron
   - Show/hide list container

## File Structure

```
vybeChatToolPart.ts (extended)
├── createDomNode() - Creates header + optional list
├── updateContent() - Updates streaming state, results
├── toggleExpand() - Handles expand/collapse
├── createFileListContainer() - Creates scrollable list container
├── createFileListItem() - For list operations
├── createSearchResultItem() - For search operations (with line ranges)
├── createGrepResultItem() - For grep operations (with match count badges)
├── createWebSearchResultItem() - For web search (different structure)
└── createTodoItem() - For todo operations
```

## Testing Checklist

- [ ] List: Expand/collapse works, animation flows verb + target
- [ ] Search: Expand/collapse works, shows line ranges, animation flows
- [ ] Search Web: Expand/collapse works, shows web results, animation flows
- [ ] Grep: Expand/collapse works, shows match counts, animation flows
- [ ] Todos: Expand/collapse works, shows todo items, animation flows
- [ ] Read: No expand (as designed), animation flows verb + target
- [ ] Error states: No animation, no chevron, error message shown
- [ ] Streaming → Complete: Animation stops, chevron appears if results exist
- [ ] Empty results: No chevron, no expand
- [ ] Theme switching: Colors update correctly

## Next Steps

1. ✅ Create this plan document
2. ⏭️ Extend animation to verb + target (Phase 1)
3. ⏭️ Add new tool types to `TOOL_VERBS` (Phase 2)
4. ⏭️ Extend interface (Phase 3)
5. ⏭️ Implement expand/collapse for each type (Phase 4)
6. ⏭️ Create list item renderers (Phase 5)
7. ⏭️ Update view pane (Phase 6)
8. ⏭️ Migrate separate parts (Phase 7)
