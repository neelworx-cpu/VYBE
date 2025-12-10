# Plan Document Production Readiness

## ✅ Completed Features

1. **Markdown Streaming**: Plan documents stream markdown content character-by-character with live rendering
2. **Title Management**: Title is displayed separately and stripped from markdown content to prevent duplication
3. **File Path Links**: Inline code that looks like file paths (e.g., `src/file.ts`) are automatically converted to clickable links with VYBE green styling
4. **Full Markdown Support**: Supports all GitHub Flavored Markdown features:
   - Headings (H1-H6)
   - Bold, italic, inline code
   - Code blocks with syntax highlighting
   - Tables
   - Lists (ordered and unordered)
   - Links
   - File path links with special styling
5. **Streaming Animation**: Character-by-character streaming with loading spinner in header
6. **Control Bar**: Model selection dropdown and build button appear after streaming completes
7. **Content Structure**: Title → Summary → Full Plan (with proper sections)

## 🔧 What's Needed for Production

### 1. **MCP/AI Tool Integration**

The plan document is already registered as a content part type (`planDocument`) in:
- `src/vs/workbench/contrib/vybeChat/browser/contentParts/vybeChatContentPart.ts` (interface definition)
- `src/vs/workbench/contrib/vybeChat/browser/components/chatArea/messagePage.ts` (content part creation)

**To make it callable by MCP/AI:**

1. **Add to MCP Tool Response Handler**: When MCP tools return plan document data, parse it and create `IVybeChatPlanDocumentContent` objects
2. **Response Format**: MCP tools should return JSON with:
   ```json
   {
     "kind": "planDocument",
     "id": "unique-id",
     "filename": "plan-name.plan.md",
     "title": "Plan Title",
     "summary": "Brief summary...",
     "content": "# Full markdown content...",
     "isStreaming": true/false,
     "modelState": { ... }
   }
   ```
3. **Streaming Support**: If MCP returns streaming data, update `isStreaming` flag and call `updateContentParts()` with incremental content

### 2. **Error Handling**

- ✅ Basic error handling (fallback to plain text if markdown fails)
- ⚠️ Add error logging/reporting for production
- ⚠️ Handle edge cases (empty content, malformed markdown, etc.)

### 3. **Performance**

- ✅ Streaming is throttled (character-by-character with delays)
- ⚠️ Consider debouncing markdown re-renders during streaming for very long plans
- ✅ Markdown rendering uses `fillInIncompleteTokens` for efficient partial rendering

### 4. **Accessibility**

- ⚠️ Add ARIA labels for screen readers
- ⚠️ Keyboard navigation for control buttons
- ✅ Text is selectable (`user-select: text`)

### 5. **Testing**

- ✅ Test function `__vybeTestPlanDocument()` exists
- ⚠️ Add unit tests for title stripping
- ⚠️ Add unit tests for file path link conversion
- ⚠️ Add integration tests with MCP tool responses

### 6. **Documentation**

- ⚠️ Document the `IVybeChatPlanDocumentContent` interface
- ⚠️ Document how MCP tools should format plan document responses
- ⚠️ Document streaming behavior and state management

## 📋 Implementation Checklist for MCP Integration

1. **Parse MCP Tool Response**:
   - Detect when MCP tool returns plan document format
   - Extract `title`, `summary`, `content`, `filename` from response
   - Generate unique `id` for tracking

2. **Create Content Part**:
   ```typescript
   messagePage.addContentPart({
     kind: 'planDocument',
     id: generatedId,
     filename: response.filename || 'plan.plan.md',
     title: response.title,
     summary: response.summary,
     content: response.content,
     isStreaming: response.isStreaming || false,
     modelState: response.modelState || defaultModelState
   });
   ```

3. **Handle Streaming**:
   - If `isStreaming: true`, start streaming animation
   - Update content incrementally as data arrives
   - When streaming completes, set `isStreaming: false`

4. **Error Handling**:
   - Validate required fields (title, summary, content)
   - Handle malformed markdown gracefully
   - Log errors for debugging

## 🎯 Current Status

**Ready for Production**: ✅ Yes, with MCP integration

The plan document component is fully functional and ready to be called by MCP tools or AI. The main remaining work is:
1. Integrating with MCP tool response handlers
2. Adding comprehensive error handling
3. Adding accessibility features
4. Writing tests

## 📝 Example MCP Tool Response Format

```json
{
  "type": "plan_document",
  "data": {
    "filename": "implement-feature-x.plan.md",
    "title": "Implement Feature X",
    "summary": "This plan outlines the steps to implement feature X...",
    "content": "# Implement Feature X\n\n## Plan Summary\n\n...",
    "isStreaming": false
  }
}
```

The MCP handler should convert this to `IVybeChatPlanDocumentContent` format and pass it to `messagePage.addContentPart()`.

