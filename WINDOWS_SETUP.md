# Windows Setup Guide for VYBE Development

This guide will help you set up the VS Code fork (VYBE) on Windows.

## Prerequisites

### 1. Node.js Version
**Required: Node.js 20.11.0** (exact version)

**Installation Options:**

**Option A: Using nvm-windows (Recommended)**
1. Download and install [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)
2. Open PowerShell or Command Prompt as Administrator
3. Run:
   ```powershell
   nvm install 20.11.0
   nvm use 20.11.0
   ```

**Option B: Direct Install**
1. Download Node.js 20.11.0 from [nodejs.org](https://nodejs.org/)
2. Install it (npm comes bundled)

**Verify Installation:**
```powershell
node --version    # Should show: v20.11.0
npm --version     # Should show: 10.x.x or higher
```

### 2. Git
- Ensure Git is installed (usually comes with VS Code or download from [git-scm.com](https://git-scm.com/))

### 3. Python (for native modules)
- Install Python 3.x from [python.org](https://www.python.org/downloads/)
- Or install via Windows Store
- Required for building native Node.js modules

### 4. Visual Studio Build Tools 2022 (REQUIRED)
**This is essential for building native modules on Windows.**

1. Download and install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. During installation, select:
   - **C++ build tools** workload
   - **Windows 10/11 SDK** (any recent version, e.g., 10.0.19041.0 or later)
3. **CRITICAL: Install Spectre-mitigated libraries** (required for native modules):
   - Open Visual Studio Installer
   - Click **Modify** on Visual Studio Build Tools 2022
   - Go to **Individual components** tab
   - Search for "Spectre"
   - Check: **MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)**
   - Optionally also install:
     - C++ ATL for latest v143 build tools with Spectre Mitigations
     - C++ MFC for latest v143 build tools with Spectre Mitigations
   - Click **Modify** to install

**Why this is needed:**
- Native modules like `@vscode/sqlite3`, `@vscode/spdlog`, `@vscode/windows-registry`, `@parcel/watcher`, etc. must be built from source for Electron 39.2.3
- These modules require Windows SDK libraries (like `DelayImp.lib`) and Spectre-mitigated libraries
- Without these, you'll get errors like:
  - `LINK : fatal error LNK1181: cannot open input file 'DelayImp.lib'`
  - `error MSB8040: Spectre-mitigated libraries are required`

## Setup Steps

### 1. Clone the Repository
```powershell
git clone <repository-url>
cd VYBE
```

### 2. Switch to Develop Branch (if not already)
```powershell
git checkout develop
```

### 3. Install Dependencies
```powershell
npm install
```

This will:
- Run preinstall/postinstall scripts (which verify Node.js version matches `.nvmrc`)
- Install all npm packages using exact versions from `package-lock.json`
- Set up the build environment
- **Build native modules from source** (requires Visual Studio Build Tools)

**Important Notes:**
- The `package-lock.json` file ensures you get the exact same dependency versions as other developers
- **Always commit `package-lock.json`** - it prevents version mismatches between Mac and Windows
- If you get version errors, delete `node_modules` and `package-lock.json`, then run `npm install` again
- This may take 10-20 minutes on first run (native modules need to be compiled)
- **Native modules are built from source** because pre-built binaries aren't available for Electron 39.2.3
- The `.npmrc` file has `build_from_source="true"` which is required for Windows builds

### 4. Download Electron
```powershell
npm run electron
```

This downloads the Electron binary for Windows. It's a large download (~100-200MB) and may take a few minutes.

### 5. Compile the Application
```powershell
npm run compile
```

This compiles all TypeScript code. First compile may take 5-10 minutes.

### 6. Launch the Application

**Option A: Using the batch script (Recommended)**
```powershell
.\scripts\code.bat
```

**Option B: Using npm script**
```powershell
npm run compile
.\scripts\code.bat
```

## Development Workflow

### Watch Mode (Auto-recompile on changes)
Open a terminal and run:
```powershell
npm run watch
```

This will:
- Watch for file changes
- Automatically recompile TypeScript
- Keep running until you stop it (Ctrl+C)

**In a separate terminal**, launch the app:
```powershell
.\scripts\code.bat
```

Now when you make changes to the code, they'll automatically recompile and you can reload the window (Ctrl+R or Cmd+R).

### Quick Commands Reference

| Command | Description |
|---------|-------------|
| `npm install` | Install/update dependencies |
| `npm run compile` | Compile once |
| `npm run watch` | Watch mode (auto-compile) |
| `npm run electron` | Download Electron binary |
| `.\scripts\code.bat` | Launch VS Code |
| `.\scripts\code-cli.bat` | Launch VS Code CLI |
| `.\scripts\code-web.bat` | Launch web version |

## Troubleshooting

### "Node version mismatch"
- Ensure you're using Node 20.11.0 exactly (or any Node 20.x version >= 20.11.0)
- Check with: `node --version`
- If using nvm-windows: `nvm use 20.11.0`
- The project enforces Node version via:
  - `.nvmrc` file (for nvm)
  - `package.json` `engines` field (npm warning)
  - Preinstall script (hard check)

### "ERR_UNKNOWN_FILE_EXTENSION" or TypeScript errors
- Make sure you ran `npm install` completely
- Check that `tsx` is installed: `npm list tsx`
- Try deleting `node_modules` and `package-lock.json`, then `npm install` again
- **Important**: After deleting `package-lock.json`, make sure to commit the newly generated one to keep versions in sync

### "Electron not found" or launch fails
- Run: `npm run electron`
- Check that `.build\electron\` folder exists
- On Windows, the Electron app will be in `.build\electron\VYBE.exe` (or similar)

### Native Module Build Errors

#### Error: `LINK : fatal error LNK1181: cannot open input file 'DelayImp.lib'`
**Cause:** Missing Windows SDK
**Fix:**
1. Open Visual Studio Installer
2. Modify Visual Studio Build Tools 2022
3. Install **Windows 10/11 SDK** (any recent version)
4. Run: `npm rebuild` or `npm install` again

#### Error: `error MSB8040: Spectre-mitigated libraries are required`
**Cause:** Missing Spectre-mitigated libraries
**Fix:**
1. Open Visual Studio Installer
2. Modify Visual Studio Build Tools 2022
3. Go to **Individual components** tab
4. Search for "Spectre" and install **MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)**
5. Run: `npm rebuild` or `npm install` again

#### Error: `Cannot find module '../build/Release/vscode-sqlite3.node'` or similar
**Cause:** Native module wasn't built for Electron
**Fix:** Rebuild the specific native module:
```powershell
npm rebuild @vscode/sqlite3
npm rebuild @vscode/spdlog
npm rebuild @vscode/policy-watcher
npm rebuild @vscode/windows-registry
npm rebuild @vscode/windows-mutex
npm rebuild @vscode/windows-process-tree
npm rebuild @parcel/watcher
```

Or rebuild all native modules:
```powershell
npm rebuild
```

#### Error: `No prebuild or local build of @parcel/watcher found`
**Cause:** `@parcel/watcher` needs to be built from source
**Fix:**
```powershell
cd node_modules\@parcel\watcher
$env:npm_config_build_from_source = "true"
npx node-gyp rebuild
cd ..\..\..
```

For extensions folder:
```powershell
cd extensions\node_modules\@parcel\watcher
$env:npm_config_build_from_source = "true"
npx node-gyp rebuild
cd ..\..\..\..
```

### App Launches but Shows Blank Window
**Possible causes:**
1. **Missing native modules** - Check console for errors:
   - Press `F12` in the VYBE window to open DevTools
   - Check Console tab for missing module errors
   - Rebuild missing modules (see above)

2. **Compilation not complete** - Wait for watch mode to finish:
   - Look for "Finished compilation with 0 errors" in terminal
   - The first compile takes 5-10 minutes

3. **Missing files** - Verify compilation:
   ```powershell
   Test-Path "out\main.js"                    # Should be True
   Test-Path "out\vs\workbench\workbench.desktop.main.js"  # Should be True
   ```

### App Crashes Immediately on Launch
**Check for these errors in the terminal:**
- Missing native module errors (rebuild them - see above)
- Missing `nls.messages.json` (this is OK in dev mode, can be ignored)
- Module resolution errors

**Fix:** Rebuild all native modules:
```powershell
npm rebuild @vscode/sqlite3
npm rebuild @vscode/spdlog
npm rebuild @vscode/policy-watcher
npm rebuild @vscode/windows-registry
npm rebuild @vscode/windows-mutex
npm rebuild @vscode/windows-process-tree
npm rebuild @vscode/deviceid
npm rebuild @parcel/watcher
npm rebuild native-keymap
```

### Build scripts fail
- Ensure you're in the repository root directory
- Check that all files from the repo are present (especially `build/` folder)
- Try: `npm run compile` to see specific errors

### Permission errors
- Run PowerShell/Command Prompt as Administrator if needed
- Some antivirus software may block npm scripts - temporarily disable if needed

### Slow performance
- First compile is always slow (5-10 min)
- Subsequent compiles are faster
- Watch mode uses more CPU but is faster for development

## Differences from macOS

| macOS | Windows |
|-------|---------|
| `./scripts/code.sh` | `.\scripts\code.bat` |
| `npm run watch` | `npm run watch` (same) |
| `npm run compile` | `npm run compile` (same) |
| Electron path: `.build/electron/Code - OSS.app` | Electron path: `.build\electron\VYBE.exe` |

## Native Module Build Configuration

The project uses `build_from_source="true"` in `.npmrc` because:
- Pre-built binaries aren't available for Electron 39.2.3
- Native modules must be compiled for your specific Windows environment
- This ensures compatibility with your Visual Studio Build Tools version

**Key native modules that need building:**
- `@vscode/sqlite3` - Database engine
- `@vscode/spdlog` - Logging library
- `@vscode/policy-watcher` - Policy monitoring
- `@vscode/windows-registry` - Windows registry access
- `@vscode/windows-mutex` - Windows mutex synchronization
- `@vscode/windows-process-tree` - Process tree enumeration
- `@vscode/deviceid` - Device identification
- `@parcel/watcher` - File system watcher
- `native-keymap` - Keyboard layout detection
- And others...

**If native modules fail to build:**
1. Ensure Visual Studio Build Tools 2022 is installed with:
   - Windows SDK
   - Spectre-mitigated libraries
2. Rebuild specific modules: `npm rebuild <module-name>`
3. Rebuild all: `npm rebuild`

## Next Steps

Once setup is complete:
1. ✅ Node 20.11.0 installed
2. ✅ Visual Studio Build Tools 2022 installed (with Windows SDK and Spectre libraries)
3. ✅ Dependencies installed (`npm install`)
4. ✅ Native modules built successfully
5. ✅ Electron downloaded (`npm run electron`)
6. ✅ Code compiled (`npm run compile`)
7. ✅ Application launches (`.\scripts\code.bat`)

You're ready to develop! Start with `npm run watch` in one terminal and `.\scripts\code.bat` in another.

## Version Consistency

To ensure both Mac and Windows developers use the same package versions:

1. **Always commit `package-lock.json`** - This file locks dependency versions
2. **Use the same Node.js version** - Check `.nvmrc` for the required version
3. **After pulling changes**, always run `npm install` to sync dependencies
4. **If packages are out of sync**, both developers should:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item package-lock.json
   npm install
   # Commit the new package-lock.json
   ```

## Complete Troubleshooting Checklist

If the app won't launch or shows errors:

### 1. Verify Prerequisites
- [ ] Node.js 20.11.0 installed: `node --version`
- [ ] Visual Studio Build Tools 2022 installed
- [ ] Windows SDK installed (check in Visual Studio Installer)
- [ ] Spectre-mitigated libraries installed (check in Visual Studio Installer)
- [ ] Python 3.x installed

### 2. Clean Install
```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### 3. Rebuild Native Modules
```powershell
npm rebuild @vscode/sqlite3
npm rebuild @vscode/spdlog
npm rebuild @vscode/policy-watcher
npm rebuild @vscode/windows-registry
npm rebuild @vscode/windows-mutex
npm rebuild @vscode/windows-process-tree
npm rebuild @vscode/deviceid
npm rebuild @parcel/watcher
npm rebuild native-keymap
```

### 4. Verify Compilation
```powershell
npm run compile
# Wait for "Finished compilation with 0 errors"
```

### 5. Check Electron Binary
```powershell
Test-Path ".build\electron\VYBE.exe"  # Should return True
```

### 6. Launch with Logging
```powershell
$env:ELECTRON_ENABLE_LOGGING=1
.\scripts\code.bat
```

### 7. Check for Running Processes
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*VYBE*"}
```

## Getting Help

If you encounter issues:
1. Check the error message carefully
2. Verify Node version: `node --version` (must be >= 20.11.0)
3. Verify Visual Studio Build Tools is installed with required components
4. Try rebuilding native modules (see above)
5. Try a clean install:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item package-lock.json
   npm install
   ```
6. Check that you're on the `develop` branch: `git branch`
7. See `MERGE_STRATEGY.md` for information about merging upstream changes

## Common Error Messages and Solutions

| Error | Solution |
|-------|----------|
| `LNK1181: cannot open input file 'DelayImp.lib'` | Install Windows SDK in Visual Studio Installer |
| `MSB8040: Spectre-mitigated libraries are required` | Install Spectre libraries in Visual Studio Installer |
| `Cannot find module '../build/Release/vscode-sqlite3.node'` | Run: `npm rebuild @vscode/sqlite3` |
| `Cannot find module '../build/Release/spdlog.node'` | Run: `npm rebuild @vscode/spdlog` |
| `Cannot find module '../build/Release/winregistry.node'` | Run: `npm rebuild @vscode/windows-registry` |
| `Cannot find module '../build/Release/windows-mutex.node'` | Run: `npm rebuild @vscode/windows-mutex` |
| `Cannot find module '../build/Release/windows-process-tree.node'` | Run: `npm rebuild @vscode/windows-process-tree` |
| `Cannot find module '../build/Release/deviceid.node'` | Run: `npm rebuild @vscode/deviceid` |
| `No prebuild or local build of @parcel/watcher found` | Rebuild @parcel/watcher (see Native Module Build Errors section) |
| App shows blank window | Check DevTools (F12) for errors, rebuild native modules |
| App crashes immediately | Check terminal output, rebuild all native modules |





