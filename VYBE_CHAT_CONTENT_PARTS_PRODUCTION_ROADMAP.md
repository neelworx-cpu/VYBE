# VYBE Chat Content Parts - Production Readiness Roadmap

## Overview
This document outlines what's needed to make the Read, Searched, and Explored content parts production-ready for a high-end agentic AI full-stack engineering IDE.

---

## 1. AI Service Integration

### Current State
- Content parts are manually created via test functions
- No integration with `ILanguageModelsService`
- TODO comment in `vybeChatViewPane.ts` line 384

### Required Implementation

#### 1.1 Custom Response Part Types
**File**: `src/vs/workbench/contrib/vybeChat/common/vybeChatTypes.ts` (new)

```typescript
export interface IVybeChatResponsePart {
  type: 'vybe_read' | 'vybe_searched' | 'vybe_explored' | 'vybe_listed' | 'vybe_directory';
  data: IVybeChatReadingFilesContent | IVybeChatSearchedContent | IVybeChatExploredContent | ...;
  id?: string; // For tracking and updates
  timestamp?: number;
}
```

**Why**: Standardize the format AI service will send.

#### 1.2 Streaming Handler
**File**: `src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts`

```typescript
private handleStreamingResponse(stream: AsyncIterable<IChatResponsePart>): void {
  for await (const part of stream) {
    if (part.type === 'vybe_read' || part.type === 'vybe_searched' || ...) {
      this.handleVybeContentPart(part as IVybeChatResponsePart);
    }
  }
}
```

**Why**: Process AI-sent content parts in real-time.

#### 1.3 Part Update Tracking
- Use `id` field to match streaming updates to existing parts
- Support partial updates (e.g., adding files to a search result)
- Handle out-of-order updates gracefully

---

## 2. Enhanced Data Structures

### 2.1 Search Type Support
**Current**: Generic "Searched"
**Needed**: Specific search types

```typescript
export interface IVybeChatSearchedContent {
  kind: 'searched';
  searchType: 'codebase' | 'semantic' | 'web' | 'documentation';
  query: string;
  files: Array<{...}>;
  webResults?: Array<{ title: string; url: string; snippet: string }>;
  isStreaming?: boolean;
}
```

**Why**: Different search types have different UI needs (web results vs file results).

### 2.2 File Metadata
**Current**: Basic `name`, `path`, `lineRange`
**Needed**: Rich metadata

```typescript
interface IFileMetadata {
  name: string;
  path?: string;
  uri?: URI; // More reliable than path string
  lineRange?: { start: number; end: number };
  language?: string; // For syntax highlighting
  size?: number;
  lastModified?: number;
  iconClasses?: string[]; // VS Code icon classes
  isReadOnly?: boolean;
  exists?: boolean; // For error handling
}
```

**Why**: Better error handling, previews, and user experience.

### 2.3 Action Context
**Current**: No context about why action was taken
**Needed**: Action metadata

```typescript
interface IActionMetadata {
  toolCallId?: string; // Link to tool invocation
  reason?: string; // Why AI performed this action
  duration?: number; // How long it took
  tokensUsed?: number; // Cost tracking
  model?: string; // Which model performed action
}
```

**Why**: Debugging, cost tracking, and transparency.

---

## 3. Error Handling & Edge Cases

### 3.1 File Not Found
**Implementation**:
```typescript
private async openFile(file: IFileMetadata): Promise<void> {
  try {
    // Check if file exists
    const stat = await this.fileService.resolve(URI.file(file.path));
    if (!stat.isFile) {
      this.showError('File not found or is a directory');
      return;
    }
    // Open file...
  } catch (error) {
    this.showError(`Failed to open file: ${error.message}`);
  }
}
```

**Why**: Graceful degradation when files are deleted/moved.

### 3.2 Invalid Line Ranges
- Validate `lineRange.start <= lineRange.end`
- Handle negative numbers
- Cap to file's actual line count
- Show warning if range exceeds file

### 3.3 Network Errors (Web Searches)
- Show retry button for failed web searches
- Cache successful results
- Handle timeout gracefully

### 3.4 Empty States
- "No files found" for searches with 0 results
- "Search in progress..." placeholder
- "Failed to read file" error state

---

## 4. Performance Optimizations

### 4.1 Virtual Scrolling
**For**: Large file lists in Explored blocks (100+ files)

```typescript
// Use virtual scrolling library or custom implementation
class VirtualFileList {
  private visibleRange: { start: number; end: number };
  private itemHeight: number = 24;

  renderVisibleItems(): void {
    // Only render items in viewport
  }
}
```

**Why**: Handle 1000+ file results without lag.

### 4.2 Lazy Loading
- Load file icons on-demand
- Defer file existence checks
- Lazy-render Explored content when expanded

### 4.3 Debouncing & Throttling
- Debounce grouping checks (don't check on every update)
- Throttle scroll updates
- Batch DOM updates

### 4.4 Memory Management
- Dispose unused content parts
- Clear large file lists when collapsed
- Limit history of completed actions

---

## 5. User Experience Enhancements

### 5.1 File Previews
**Feature**: Hover over filename to see preview

```typescript
private setupFilePreview(filenameElement: HTMLElement, file: IFileMetadata): void {
  this._register(dom.addDisposableListener(filenameElement, 'mouseenter', () => {
    // Show hover card with file preview
    this.hoverService.showHover({
      target: filenameElement,
      content: this.createFilePreview(file)
    });
  }));
}
```

**Why**: Quick context without opening file.

### 5.2 Multi-File Selection
- Select multiple files from search results
- Bulk open in editor
- "Open all" button for search results

### 5.3 Action History
- Undo/redo for grouped actions
- "Re-run search" button
- Copy search query

### 5.4 Keyboard Navigation
- Arrow keys to navigate between items
- Enter to open file
- Escape to close Explored block
- Tab to focus next action

---

## 6. Accessibility (A11y)

### 6.1 ARIA Labels
```typescript
headerElement.setAttribute('aria-label', `Read file ${file.name}`);
headerElement.setAttribute('role', 'button');
headerElement.setAttribute('aria-expanded', this.isExpanded.toString());
```

### 6.2 Screen Reader Support
- Announce "Reading file X" when streaming starts
- Announce "Read file X" when complete
- Announce "Grouped into Explored block" when grouping happens

### 6.3 Focus Management
- Focus first item when Explored expands
- Maintain focus when items group
- Skip links for keyboard users

### 6.4 High Contrast Mode
- Test with VS Code high contrast themes
- Ensure VYBE green is visible in all themes
- Provide alternative indicators (icons, borders)

---

## 7. Internationalization (i18n)

### 7.1 String Externalization
**File**: `src/vs/workbench/contrib/vybeChat/browser/nls/vybeChatStrings.ts` (new)

```typescript
export const vybeChatStrings = {
  readFile: nls.localize('vybe.readFile', 'Read'),
  readingFile: nls.localize('vybe.readingFile', 'Reading'),
  searched: nls.localize('vybe.searched', 'Searched'),
  searching: nls.localize('vybe.searching', 'Searching'),
  explored: nls.localize('vybe.explored', 'Explored'),
  // ...
};
```

**Why**: Support multiple languages.

### 7.2 Date/Time Formatting
- Use VS Code's date formatter
- Respect user locale
- Relative time ("2 minutes ago" for search timestamps)

---

## 8. State Management & Persistence

### 8.1 Action State Tracking
```typescript
interface IActionState {
  id: string;
  type: 'read' | 'searched' | ...;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  error?: string;
}
```

**Why**: Track action lifecycle, debugging, analytics.

### 8.2 Session Persistence
- Save completed actions to session storage
- Restore on IDE restart
- Export action history

### 8.3 Undo/Redo
- Track action sequence
- Allow reverting grouped actions
- "Un-group" Explored block

---

## 9. Testing Infrastructure

### 9.1 Unit Tests
**File**: `src/vs/workbench/contrib/vybeChat/browser/contentParts/*.test.ts`

```typescript
describe('VybeChatReadingFilesPart', () => {
  test('renders single file correctly', () => { ... });
  test('handles missing file path', () => { ... });
  test('updates from streaming to complete', () => { ... });
});
```

### 9.2 Integration Tests
- Test grouping logic with various sequences
- Test file opening with invalid paths
- Test streaming updates

### 9.3 E2E Tests
- Full workflow: send message → receive parts → group → interact
- Test with real AI service
- Performance benchmarks

---

## 10. Analytics & Observability

### 10.1 Action Metrics
```typescript
interface IActionMetrics {
  actionType: string;
  duration: number;
  fileCount: number;
  success: boolean;
  errorType?: string;
}
```

**Why**: Understand usage patterns, identify bottlenecks.

### 10.2 Performance Monitoring
- Track render times
- Monitor memory usage
- Alert on performance regressions

### 10.3 User Behavior
- Which actions are most common?
- How often do users click filenames?
- Do users expand Explored blocks?

---

## 11. Security & Privacy

### 11.1 File Path Sanitization
- Validate file paths (prevent directory traversal)
- Check file permissions before opening
- Warn on sensitive files (e.g., `.env`, `secrets/`)

### 11.2 Content Filtering
- Don't display sensitive file contents in previews
- Redact API keys, tokens in search results
- Respect `.gitignore` for file discovery

### 11.3 Audit Logging
- Log all file access attempts
- Track which files AI reads
- Export audit trail

---

## 12. Future Features

### 12.1 Advanced Search
- **Semantic Search**: Show code snippets, not just files
- **Web Search**: Rich previews with snippets, images
- **Documentation Search**: Link to docs, show excerpts

### 12.2 File Operations
- **Multi-file edits**: Show diff for multiple files
- **File creation**: "Created file X" action
- **File deletion**: "Deleted file X" action (with undo)

### 12.3 Code Intelligence
- **Symbol references**: "Found 12 references to `functionName`"
- **Type information**: Show types when hovering
- **Dependency graph**: Visualize file relationships

### 12.4 Collaboration
- **Shared actions**: See what AI did in team sessions
- **Action comments**: Add notes to actions
- **Action sharing**: Export action sequence as script

---

## 13. API Design for AI Service

### 13.1 Response Format
```typescript
// AI service should send:
{
  type: 'vybe_read',
  id: 'read_123',
  data: {
    kind: 'readingFiles',
    files: [{ name: 'file.ts', path: '/path/to/file.ts', lineRange: { start: 1, end: 100 } }],
    isStreaming: true
  }
}

// Update:
{
  type: 'vybe_read',
  id: 'read_123',
  data: {
    ...previousData,
    isStreaming: false
  }
}
```

### 13.2 Streaming Protocol
1. **Initial**: Send part with `isStreaming: true`
2. **Updates**: Send same `id` with updated data
3. **Complete**: Send with `isStreaming: false`
4. **Grouping**: Handled client-side automatically

### 13.3 Error Handling
```typescript
{
  type: 'vybe_read',
  id: 'read_123',
  error: {
    code: 'FILE_NOT_FOUND',
    message: 'File does not exist',
    recoverable: false
  }
}
```

---

## 14. Documentation

### 14.1 API Documentation
- JSDoc comments for all public methods
- Type definitions with examples
- Migration guide for breaking changes

### 14.2 User Guide
- How to interpret action blocks
- How to use Explored grouping
- Keyboard shortcuts

### 14.3 Developer Guide
- How to add new content part types
- How to extend existing parts
- Best practices

---

## 15. Migration Path

### Phase 1: Foundation (Current)
- ✅ Basic Read, Searched, Explored parts
- ✅ Streaming states
- ✅ Grouping logic

### Phase 2: Integration (Next)
- [ ] AI service integration
- [ ] Error handling
- [ ] File validation

### Phase 3: Enhancement
- [ ] Search types
- [ ] File previews
- [ ] Performance optimizations

### Phase 4: Polish
- [ ] Accessibility
- [ ] Internationalization
- [ ] Analytics

---

## Priority Recommendations

### High Priority (MVP)
1. **AI Service Integration** - Without this, parts are useless
2. **Error Handling** - File not found, invalid paths
3. **File Path Validation** - Security and reliability
4. **Search Type Support** - Differentiate web vs codebase searches

### Medium Priority (V1)
5. **Performance Optimizations** - Virtual scrolling for large lists
6. **Accessibility** - ARIA labels, keyboard nav
7. **File Previews** - Hover cards
8. **State Tracking** - Action IDs, timestamps

### Low Priority (Future)
9. **Analytics** - Usage metrics
10. **Internationalization** - Multi-language
11. **Advanced Features** - Multi-file ops, code intelligence

---

## Questions to Resolve

1. **How will AI service send these parts?**
   - Custom response part type?
   - Tool call results?
   - Structured text that we parse?

2. **What's the update frequency?**
   - Real-time streaming?
   - Batched updates?
   - On completion only?

3. **How do we handle conflicts?**
   - Multiple AI agents acting simultaneously
   - Out-of-order updates
   - Conflicting file operations

4. **What's the scale?**
   - Max files per search?
   - Max actions per Explored block?
   - Memory limits?

---

## Next Steps

1. **Define AI Service Contract** - How will parts be sent?
2. **Implement Error Handling** - File validation, error states
3. **Add Search Types** - Codebase vs web vs semantic
4. **Performance Testing** - Test with 100+ files
5. **Accessibility Audit** - Screen reader testing
6. **Documentation** - API docs, user guide

---

## Conclusion

The current implementation is a solid foundation. To make it production-ready, focus on:
- **Integration** with AI service
- **Reliability** through error handling
- **Performance** for scale
- **User Experience** through polish

The architecture is extensible and can grow with future needs.


