# History Dropdown Color Requirements

## Command Palette Colors Used

The command palette uses these theme variables:

1. **`quickInput.background`** - Main background color
   - VYBE Light: `#f3f4f5`
   - VYBE Dark: `#202124`

2. **`quickInput.foreground`** - Primary text color
   - VYBE Light: `#3B3B3B`
   - VYBE Dark: `#CCCCCC`

3. **`quickInputList.focusBackground`** - Hover/focus background (falls back to `list.activeSelectionBackground`)
   - VYBE Light: Falls back to `list.activeSelectionBackground` = `#dfe3e6`
   - VYBE Dark: Falls back to `list.activeSelectionBackground` = `#2f3033`

4. **`pickerGroup.foreground`** - Section header text color
   - VYBE Light: `#8B949E`
   - VYBE Dark: Not defined (inherits from dark_plus.json, default: `#3794FF`)

5. **`pickerGroup.border`** - Divider border color
   - VYBE Light: `#E5E5E5`
   - VYBE Dark: `#3C3C3C`

6. **`widget.border`** - Main container border
   - VYBE Light: `#E5E5E5`
   - VYBE Dark: `#313131`

## History Dropdown Color Requirements

The dropdown needs these colors:

1. **Background** - `quickInput.background`
2. **Border** - `widget.border`
3. **Primary Text** - `quickInput.foreground`
4. **Hover Background** - `quickInputList.focusBackground` (or `list.activeSelectionBackground` as fallback)
5. **Section Header Text** - `pickerGroup.foreground`
6. **Divider Border** - `pickerGroup.border`
7. **Secondary Text** (icons, timestamps) - Opacity variation of `quickInput.foreground` (60% opacity)
8. **Tertiary Text** ("New Chat" placeholder) - Opacity variation of `quickInput.foreground` (40% opacity)

## Current Implementation

The dropdown currently uses:
- `quickInputBackground` ✅
- `quickInputForeground` ✅
- `quickInputListFocusBackground` ✅ (but falls back to hardcoded colors)
- `pickerGroupForeground` ✅
- `pickerGroupBorder` ✅
- `widgetBorder` ✅

## Issue

The fallback colors in the code are hardcoded and don't match VYBE themes:
- Fallback for `quickInputListFocusBackground`: `rgba(255, 255, 255, 0.1)` / `rgba(0, 0, 0, 0.05)`
- Should use: `list.activeSelectionBackground` from theme

## Solution

The dropdown should use `listActiveSelectionBackground` as a fallback for `quickInputListFocusBackground` since that's what the command palette does. This will ensure VYBE theme colors are used correctly.

### Required Theme Variables for History Dropdown:

1. **Background**: `quickInput.background`
   - VYBE Light: `#f3f4f5`
   - VYBE Dark: `#202124`

2. **Border**: `widget.border`
   - VYBE Light: `#E5E5E5`
   - VYBE Dark: `#313131`

3. **Primary Text**: `quickInput.foreground`
   - VYBE Light: `#3B3B3B`
   - VYBE Dark: `#CCCCCC`

4. **Hover Background**: `quickInputList.focusBackground` (falls back to `list.activeSelectionBackground`)
   - VYBE Light: `#dfe3e6` (from `list.activeSelectionBackground`)
   - VYBE Dark: `#2f3033` (from `list.activeSelectionBackground`)

5. **Section Header Text**: `pickerGroup.foreground`
   - VYBE Light: `#8B949E`
   - VYBE Dark: Not defined (needs to be added or will use default)

6. **Divider Border**: `pickerGroup.border`
   - VYBE Light: `#E5E5E5`
   - VYBE Dark: `#3C3C3C`

7. **Secondary Text** (icons, timestamps): Opacity variation of `quickInput.foreground` (60% opacity)
8. **Tertiary Text** ("New Chat" placeholder): Opacity variation of `quickInput.foreground` (40% opacity)

