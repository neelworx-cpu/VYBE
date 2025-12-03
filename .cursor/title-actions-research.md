# Title Actions Research - How Actions Change Per Tab

## Key Finding

**The `title-actions` container shows different actions based on which view/tab is active.**

## How It Works

### 1. View-Specific Menu Contributions

Views contribute actions to `MenuId.ViewTitle` with a `when` clause that matches their view ID:

```typescript
registerAction2(class MyChatAction extends Action2 {
  constructor() {
    super({
      id: 'vybeChat.newChat',
      title: 'New Chat',
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals('view', 'vybeChat.session.123') // Only show for this view
      }
    });
  }
});
```

### 2. Context Key System

When a view becomes active:
- The `view` context key is set to the active view's ID
- Menu system filters actions based on `when` clauses
- Only actions matching the active view are shown in `title-actions`

### 3. ViewPaneContainer Updates

`ViewPaneContainer` listens to active view changes:
- `onDidChangeActiveViewDescriptors` fires when switching tabs
- This triggers `updateTitleArea()`
- `collectCompositeActions()` is called to refresh actions
- Actions are filtered by the active view's context key

## HTML Structure Analysis

### When Chat Tab is Active (First HTML)
```html
<div class="title-actions">
  <!-- Chat-specific actions -->
  <li data-command-id="composer.createNewComposerTab">New Chat</li>
  <li data-command-id="composer.showComposerHistory">Show Chat History</li>
  <li>More...</li>
</div>
```

### When Ports Tab is Active (Second HTML)
```html
<div class="title-actions">
  <!-- Empty - Ports view has no actions -->
  <ul class="actions-container" role="presentation" aria-label="Ports actions"></ul>
</div>
```

## Implementation Strategy

### For VYBE Chat Views

1. **Register actions with view-specific context keys:**
   ```typescript
   registerAction2(class VybeChatNewChatAction extends Action2 {
     constructor() {
       super({
         id: 'vybeChat.newChat',
         title: 'New Chat',
         menu: {
           id: MenuId.ViewTitle,
           when: ContextKeyExpr.regex('view', /^vybeChat\.session\./) // Match all chat views
         }
       });
     }
   });
   ```

2. **Use ViewPane with MenuId.ViewTitle:**
   ```typescript
   export class VybeChatViewPane extends ViewPane {
     constructor(options: IViewPaneOptions, ...) {
       // ViewPane automatically uses MenuId.ViewTitle
       // Actions with matching 'when' clauses will appear
       super({ ...options, titleMenuId: MenuId.ViewTitle }, ...);
     }
   }
   ```

3. **Set view context key when view becomes active:**
   - VS Code automatically sets `view` context key to the active view's ID
   - No manual code needed - it's handled by the view system

## Key Files

- `src/vs/workbench/browser/parts/compositePart.ts` - `collectCompositeActions()` method
- `src/vs/workbench/browser/parts/views/viewPane.ts` - ViewPane uses `MenuId.ViewTitle`
- `src/vs/workbench/browser/parts/views/viewMenuActions.ts` - Menu action collection
- `src/vs/platform/actions/common/actions.ts` - `MenuId.ViewTitle` definition

## Important Notes

1. **Each view gets its own actions** - Actions are filtered by the `view` context key
2. **Actions appear/disappear automatically** - When switching tabs, context key changes, menu filters actions
3. **Non-chat views won't show chat actions** - Because their `view` context key doesn't match
4. **ViewPane handles this automatically** - Just register actions with proper `when` clauses

## Next Steps

1. Register VYBE Chat actions with `MenuId.ViewTitle` and view-specific `when` clauses
2. Ensure each chat session view has a unique ID (e.g., `vybeChat.session.${sessionId}`)
3. Actions will automatically appear/disappear when switching between chat and non-chat views


