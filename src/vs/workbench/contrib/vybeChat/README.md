# VYBE Chat Contribution

## Isolation & Upstream Safety

This contribution is **fully isolated** from upstream VS Code code:

### ✅ Complete Isolation
- **All code in isolated folder**: `src/vs/workbench/contrib/vybeChat/`
- **No upstream file modifications**: Zero changes to VS Code core files
- **No VYBE-PATCH markers needed**: We're not patching upstream code
- **Single entry point**: One import in `workbench.common.main.ts`

### ✅ Safe for Upstream Merges
- Uses only **public VS Code APIs**:
  - `Registry` for view registration
  - `ViewContainer` / `IViewDescriptor` for views
  - `MenuId.ViewTitle` for actions
  - `ViewPane` base class
- **No breaking changes** to upstream functionality
- **No conflicts** with existing view containers or IDs
- **Unique IDs**: `workbench.panel.vybeChat` (won't conflict with upstream)

### ✅ Proper Contribution Pattern
- Follows VS Code contribution model (same as `chat/`, `terminal/`, etc.)
- Uses dependency injection (services via constructor)
- Registers via extension points (ViewContainers, Views, Menus)
- Service registered via `registerSingleton`

### ✅ File Structure
```
vybeChat/
├── browser/
│   ├── actions/              # MenuId.ViewTitle actions
│   ├── contribution/         # Registration files
│   │   ├── vybeChat.contribution.ts          # Main entry
│   │   ├── vybeChatParticipant.contribution.ts  # View container
│   │   └── vybeChatSessions.contribution.ts  # Service + dynamic views
│   └── vybeChatViewPane.ts   # View pane implementation
├── common/
│   └── vybeChatConstants.ts  # IDs and constants
└── README.md                 # This file
```

### ✅ Import Location
- Added to `workbench.common.main.ts` in the `workbench contributions` section
- Follows the same pattern as other contributions (chat, terminal, etc.)
- Single import: `import './contrib/vybeChat/browser/contribution/vybeChat.contribution.js';`

## Upstream Merge Safety

When merging upstream VS Code changes:

1. **No conflicts expected**: All code is in isolated `vybeChat/` folder
2. **Import line**: May need to re-add if `workbench.common.main.ts` is modified
3. **API changes**: If VS Code changes view/registry APIs, we'll need to update accordingly
4. **No upstream dependencies**: We don't depend on internal VS Code implementation details

## Testing After Upstream Merge

After merging upstream:
1. Verify import still exists in `workbench.common.main.ts`
2. Check that view registration APIs haven't changed
3. Test that view container appears in auxiliary bar
4. Test dynamic view registration works
