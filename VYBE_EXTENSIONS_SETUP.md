# VYBE Extensions Setup Guide

This guide helps you set up and troubleshoot VYBE extensions for cross-platform development.

## VYBE Extensions Overview

VYBE includes three main extensions:

1. **@vybe/chat** - AI-powered chat interface
2. **@vybe/settings** - VYBE configuration editor
3. **@vybe/indexing** - Codebase indexing and semantic search

## Quick Setup

### 1. Verify Node.js Version
```bash
node --version  # Must be >= 20.11.0
```

If not, switch to the correct version:
```bash
nvm use 20.11.0  # or nvm install 20.11.0
```

### 2. Run Setup Script

**On macOS/Linux:**
```bash
./scripts/setup-vybe-extensions.sh
```

**On Windows:**
```cmd
.\scripts\setup-vybe-extensions.bat
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Verify VYBE Extensions
```bash
npm run vybe:verify
```

### 5. Compile
```bash
npm run compile
```

### 6. Launch
```bash
# macOS/Linux
./scripts/code.sh

# Windows
.\scripts\code.bat
```

## Troubleshooting Blank IDE Issue

If you're experiencing a blank IDE on Windows (or any platform), follow these steps:

### Step 1: Check for Compilation Errors

```bash
npm run compile
```

Look for TypeScript errors related to VYBE extensions. Common issues:
- Missing imports
- Type errors
- Module resolution errors

### Step 2: Verify VYBE Extensions Are Registered

Run the verification script:
```bash
npm run vybe:verify
```

This checks:
- ✅ All VYBE contribution files exist
- ✅ All VYBE extensions are imported in `workbench.common.main.ts`
- ✅ Node.js version is correct
- ✅ package.json configuration is correct

### Step 3: Check Browser Console

1. Launch VS Code with developer tools:
   ```bash
   # macOS/Linux
   ./scripts/code.sh --inspect

   # Windows
   .\scripts\code.bat --inspect
   ```

2. Open DevTools (Help → Toggle Developer Tools)
3. Check Console tab for errors
4. Look for errors related to:
   - `vybeChat`
   - `vybeSettings`
   - `indexing`
   - Module loading errors

### Step 4: Clean Build

If errors persist, try a clean build:

```bash
# Remove compiled output
rm -rf out  # macOS/Linux
rmdir /s /q out  # Windows

# Remove node_modules (optional, if dependencies are corrupted)
rm -rf node_modules package-lock.json  # macOS/Linux
rmdir /s /q node_modules & del package-lock.json  # Windows

# Reinstall
npm install

# Recompile
npm run compile
```

### Step 5: Check Import Paths

Verify that all imports in `workbench.common.main.ts` are correct:

```typescript
// Should be present:
import './contrib/vybeChat/browser/contribution/vybeChat.contribution.js';
import './contrib/vybeSettings/browser/vybeSettings.contribution.js';
import './contrib/indexing/browser/indexing.contribution.js';
```

**Important:** Note the `.js` extension in imports (even though source files are `.ts`). This is required for ES modules.

### Step 6: Verify File Structure

Ensure all VYBE extension files exist:

```
src/vs/workbench/contrib/
├── vybeChat/
│   └── browser/
│       └── contribution/
│           └── vybeChat.contribution.ts
├── vybeSettings/
│   └── browser/
│       └── vybeSettings.contribution.ts
└── indexing/
    └── browser/
        └── indexing.contribution.ts
```

### Step 7: Check for Platform-Specific Issues

**Windows-specific:**
- Ensure line endings are correct (LF vs CRLF)
- Check file paths use forward slashes in imports
- Verify no special characters in file paths

**Common Windows Issues:**
1. **Path length limits**: Windows has a 260-character path limit. If your project path is too long, move it to a shorter location.
2. **Permissions**: Run PowerShell/Command Prompt as Administrator if needed
3. **Antivirus**: Some antivirus software may block npm scripts

## Package Structure

VYBE extensions are packaged in the `packages/` directory:

```
packages/
├── vybe-chat/
│   ├── package.json
│   └── tsconfig.json
├── vybe-settings/
│   ├── package.json
│   └── tsconfig.json
└── vybe-indexing/
    ├── package.json
    └── tsconfig.json
```

These packages can be built independently for development, but they're compiled into the main VS Code bundle during the normal build process.

## Development Workflow

### Building Individual Extensions

```bash
# Build VYBE Chat
cd packages/vybe-chat
npm install
npm run build

# Build VYBE Settings
cd ../vybe-settings
npm install
npm run build

# Build VYBE Indexing
cd ../vybe-indexing
npm install
npm run build
```

### Watch Mode (Auto-rebuild)

```bash
# In each package directory
npm run watch
```

## Cross-Platform Compatibility

All VYBE extensions are designed to work cross-platform:

- ✅ **macOS** (tested)
- ✅ **Windows** (tested)
- ✅ **Linux** (should work, but less tested)

### Platform-Specific Considerations

1. **File Paths**: All imports use forward slashes (`/`) which work on all platforms
2. **Line Endings**: Git should handle CRLF/LF conversion automatically
3. **Native Modules**: No native modules are used in VYBE extensions
4. **Case Sensitivity**: All file names use consistent casing

## Getting Help

If you're still experiencing issues:

1. **Check the logs**: Look in the Developer Console for specific error messages
2. **Verify Node version**: Must be exactly 20.11.0 (or >= 20.11.0 < 21.0.0)
3. **Clean install**: Remove `node_modules` and `package-lock.json`, then reinstall
4. **Check git status**: Ensure all VYBE files are committed and not in a conflicted state
5. **Compare with working setup**: If your colleague's setup works, compare:
   - Node.js version
   - npm version
   - package-lock.json (should be identical)
   - File structure

## Common Error Messages

### "Cannot find module './contrib/vybeChat/...'"
**Solution:** Run `npm run compile` to build the TypeScript files

### "Module not found: Can't resolve '...'"
**Solution:** Check that the import path is correct and uses `.js` extension

### "Blank screen / IDE doesn't load"
**Solution:**
1. Check browser console for errors
2. Verify all VYBE contributions are imported
3. Run `npm run vybe:verify`
4. Try clean build (remove `out/` directory)

### "TypeError: Cannot read property '...' of undefined"
**Solution:** Check that services are properly registered and initialized

## Next Steps

Once setup is complete:
1. ✅ All VYBE extensions should load
2. ✅ VYBE Chat panel should appear in the sidebar
3. ✅ VYBE Settings should be accessible via Command Palette
4. ✅ Indexing should work (check VYBE Settings → Indexing tab)

For more information, see:
- [MERGE_STRATEGY.md](./MERGE_STRATEGY.md) - How to merge upstream changes
- [WINDOWS_SETUP.md](./WINDOWS_SETUP.md) - Windows-specific setup
- [README.md](./README.md) - General project information

