# @parcel/watcher Build Issue - Workaround

## Problem

The `@parcel/watcher` native module fails to build during `npm install` with C++ compilation errors:

```
error: no template named 'optional' in namespace 'std'
error: incompatible pointer types assigning to '__shared_weak_count *'
```

This is a C++ standard library compatibility issue when building from source.

## Impact

- **File watching may be slower** (falls back to polling)
- **Remote package installation fails** (but postinstall now continues)
- **App still works** - this is not a blocking issue

## Solution

The postinstall script has been updated to **continue even if remote package installation fails**. This allows you to:

1. ✅ Install all other dependencies
2. ✅ Build and run the application
3. ⚠️  File watching may use fallback methods

## If You Need File Watching

### Option 1: Try Installing Remote Package Separately

```bash
cd remote
npm install
```

If it still fails, try with different compiler flags:

```bash
# macOS
export CXXFLAGS="-std=c++17"
cd remote
npm install

# Windows (PowerShell)
$env:CXXFLAGS="-std=c++17"
cd remote
npm install
```

### Option 2: Use Prebuilt Binary (if available)

The postinstall script removes prebuilt binaries to force building from source. You can try:

1. Comment out the `removeParcelWatcherPrebuild` call in `build/npm/postinstall.ts`
2. Run `npm install` again
3. It may use a prebuilt binary if available for your platform

### Option 3: Skip Remote Package (Development Only)

For development, you can work without the remote package if you don't need:
- Remote development features
- Advanced file watching

The app will still work, just with reduced file watching performance.

## Why This Happens

- `@parcel/watcher` is a git dependency that builds from source
- C++ compilation requires specific compiler flags and C++ standard library versions
- Different platforms/compilers may have compatibility issues
- The module uses C++17 features that may not be available with default compiler settings

## Status

✅ **Fixed**: Postinstall script now continues on remote package failure
⚠️  **Workaround**: File watching may use fallback methods
🔧 **Future**: Consider using a published npm version instead of git dependency

## Related Files

- `build/npm/postinstall.ts` - Postinstall script (now allows failures)
- `remote/package.json` - Contains `@parcel/watcher` dependency
- `package.json` - Also contains `@parcel/watcher` dependency

