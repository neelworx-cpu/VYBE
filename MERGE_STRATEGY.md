# Upstream Merge Strategy for VYBE

This document outlines how to safely merge upstream changes from VS Code while preserving VYBE-specific customizations.

## Overview

VYBE is a fork of VS Code with AI intelligence features. When merging upstream changes, we need to:
1. Preserve VYBE-specific code and configurations
2. Update to latest VS Code features and fixes
3. Maintain compatibility with our customizations

## Files Modified for VYBE

The following files have been modified from upstream and should be carefully handled during merges:

### Configuration Files (Low Conflict Risk)
- **`package.json`**: Added `engines` field for Node.js version enforcement
  - **Merge Strategy**: If upstream adds `engines`, merge both. Our version is: `"node": ">=20.11.0 <21.0.0"`

- **`.npmrc`**: Added `package-lock=true` and `save-exact=false` for consistent installs
  - **Merge Strategy**: Append our settings after upstream settings (they're additive)

- **`.nvmrc`**: Specifies Node.js 20.11.0
  - **Merge Strategy**: If upstream updates this, update ours to match, then ensure both developers use the same version

### VYBE-Specific Code (High Conflict Risk)
- All files in `src/vs/workbench/contrib/vybeChat/` - **DO NOT MERGE** (VYBE-specific)
- All files in `src/vs/workbench/contrib/vybeSettings/` - **DO NOT MERGE** (VYBE-specific)
- Any other `vybe*` prefixed files/directories - **DO NOT MERGE** (VYBE-specific)

### Documentation (Low Conflict Risk)
- **`WINDOWS_SETUP.md`**: VYBE-specific setup guide
  - **Merge Strategy**: Keep VYBE version, but check if upstream adds new prerequisites

- **`MERGE_STRATEGY.md`**: This file (VYBE-specific)
  - **Merge Strategy**: Keep VYBE version

## Merge Process

### 1. Before Merging
```bash
# Ensure you're on your develop branch
git checkout develop

# Fetch latest from upstream
git fetch upstream

# Create a backup branch (optional but recommended)
git branch backup-before-merge-$(date +%Y%m%d)
```

### 2. Merge Upstream
```bash
# Merge upstream/main into your develop branch
git merge upstream/main

# Or if you prefer rebase:
git rebase upstream/main
```

### 3. Handle Conflicts

#### Configuration Files (package.json, .npmrc, .nvmrc)
- **If conflict in `package.json` `engines` field**: Keep both if possible, or use the more restrictive version
- **If conflict in `.npmrc`**: Merge both sets of settings
- **If conflict in `.nvmrc`**: Use upstream version, then update both developers

#### VYBE-Specific Files
- **If upstream modified a file we also modified**:
  - Check if the upstream change is needed for our features
  - If yes, manually merge the changes
  - If no, keep VYBE version and document why

#### Core VS Code Files
- **If conflict in core VS Code files**:
  - Accept upstream changes for bug fixes
  - Manually merge if upstream changes affect our customizations
  - Test thoroughly after merging

### 4. After Merging
```bash
# Verify Node version matches .nvmrc
node --version  # Should be 20.11.0

# Clean install to ensure consistency
rm -rf node_modules package-lock.json
npm install

# Compile to check for errors
npm run compile

# Run tests (if available)
npm test
```

### 5. Update Both Developers
After a successful merge:
1. Both developers should pull the latest changes
2. Both should run `npm install` to sync dependencies
3. Both should verify Node version matches `.nvmrc`
4. Both should compile and test

## Node.js Version Management

### Current Version
- **Required**: Node.js 20.11.0 (specified in `.nvmrc`)
- **Enforced by**:
  - `.nvmrc` file (for nvm users)
  - `package.json` `engines` field (npm warning)
  - `build/npm/preinstall.ts` (hard check during install)

### When Upstream Updates Node Version
1. Update `.nvmrc` to match upstream
2. Update `package.json` `engines` field if needed
3. Both developers install the new version:
   ```bash
   nvm install <new-version>
   nvm use <new-version>
   ```
4. Both developers run `npm install` to regenerate `package-lock.json`
5. Commit the updated lock file

## Package Lock File Strategy

### Always Commit `package-lock.json`
- Ensures both developers get exact same dependency versions
- Prevents "works on my machine" issues
- Required for reproducible builds

### After Merging Upstream
1. Delete `node_modules` and `package-lock.json`
2. Run `npm install` to regenerate lock file
3. Commit the new lock file
4. Both developers pull and run `npm install`

## Testing After Merge

### Checklist
- [ ] Code compiles without errors (`npm run compile`)
- [ ] Application launches (`./scripts/code.sh` or `.\scripts\code.bat`)
- [ ] VYBE-specific features still work
- [ ] No new console errors
- [ ] Both Mac and Windows developers can build successfully

## Common Merge Scenarios

### Scenario 1: Upstream Updates Dependencies
**Action**: Accept upstream `package.json` changes, then run `npm install` to update `package-lock.json`

### Scenario 2: Upstream Updates Node Version
**Action**:
1. Update `.nvmrc` to match upstream
2. Update `engines` in `package.json` if needed
3. Both developers install new Node version
4. Regenerate `package-lock.json`

### Scenario 3: Upstream Modifies File We Also Modified
**Action**:
1. Check git diff to see what changed
2. Manually merge if both changes are needed
3. Test thoroughly
4. Document the merge in commit message

### Scenario 4: Upstream Adds New File That Conflicts with VYBE
**Action**:
1. Check if the new file is needed
2. If yes, rename VYBE version or merge functionality
3. If no, keep VYBE version

## Best Practices

1. **Merge Frequently**: Don't let too many changes accumulate
2. **Test Immediately**: After merge, compile and test right away
3. **Communicate**: Let team know when you're merging upstream
4. **Document Conflicts**: Note any tricky merges in commit messages
5. **Keep Backups**: Create backup branches before major merges

## Troubleshooting Merge Issues

### "Node version mismatch" after merge
```bash
# Check .nvmrc
cat .nvmrc

# Switch to correct version
nvm use

# Reinstall packages
rm -rf node_modules package-lock.json
npm install
```

### "Package installation fails" after merge
```bash
# Clear npm cache
npm cache clean --force

# Remove lock file and node_modules
rm -rf node_modules package-lock.json

# Fresh install
npm install
```

### "Compilation errors" after merge
1. Check if TypeScript version changed
2. Check if new dependencies are needed
3. Review error messages for breaking changes
4. Check VS Code release notes for breaking changes

## Resources

- [VS Code Release Notes](https://code.visualstudio.com/updates)
- [VS Code Contributing Guide](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [Git Merge Strategies](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging)

