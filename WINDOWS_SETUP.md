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
- May be needed for some native dependencies

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
- Run preinstall/postinstall scripts
- Install all npm packages
- Set up the build environment

**Note:** This may take 5-10 minutes on first run.

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
- Ensure you're using Node 20.11.0 exactly
- Check with: `node --version`
- If using nvm-windows: `nvm use 20.11.0`

### "ERR_UNKNOWN_FILE_EXTENSION" or TypeScript errors
- Make sure you ran `npm install` completely
- Check that `tsx` is installed: `npm list tsx`
- Try deleting `node_modules` and `package-lock.json`, then `npm install` again

### "Electron not found" or launch fails
- Run: `npm run electron`
- Check that `.build\electron\` folder exists
- On Windows, the Electron app will be in `.build\electron\VYBE.exe` (or similar)

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

## Next Steps

Once setup is complete:
1. ✅ Node 20.11.0 installed
2. ✅ Dependencies installed (`npm install`)
3. ✅ Electron downloaded (`npm run electron`)
4. ✅ Code compiled (`npm run compile`)
5. ✅ Application launches (`.\scripts\code.bat`)

You're ready to develop! Start with `npm run watch` in one terminal and `.\scripts\code.bat` in another.

## Getting Help

If you encounter issues:
1. Check the error message carefully
2. Verify Node version: `node --version` (must be 20.11.0)
3. Try a clean install:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item package-lock.json
   npm install
   ```
4. Check that you're on the `develop` branch: `git branch`





