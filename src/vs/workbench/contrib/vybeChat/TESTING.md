# VYBE Chat Testing Guide

## How to Test

1. **Build and Run:**
   ```bash
   npm run watch
   # Then launch VYBE from the out directory
   ```

2. **What to Expect:**
   - On startup, a default "New Chat" tab should appear in the secondary sidebar (Auxiliary Bar)
   - The tab should be labeled "New Chat"
   - The tab should persist even if you try to close it (if it's the only one)
   - You can create additional chat tabs using the "New Chat" action button
   - Each tab has its own actions container with: New Chat, History, Settings, and Close buttons

3. **Testing the Default Tab:**
   - The default tab should always be visible
   - Try closing it - it should either prevent closing (if it's the only one) or immediately create a new default tab
   - The pane can be empty for now - that's expected

## Disabling Copilot Chat and Agent (Optional)

If you want to disable the built-in Copilot Chat and Agent tabs to focus on VYBE Chat:

### Option 1: Configuration
Add to your settings:
```json
{
  "chat.disableAIFeatures": true
}
```

### Option 2: Hide Secondary Sidebar Default Views
The secondary sidebar will show VYBE Chat as the default since we set `isDefault: true` in the view container registration.

## Current Implementation Status

✅ **Completed:**
- View container registration in Auxiliary Bar
- Dynamic view registration for chat sessions
- Default "New Chat" tab that always exists
- Actions container with New Chat, History, Settings, Close buttons
- Close button functionality in composite bar tabs
- Tab styling matching Cursor design

🚧 **In Progress:**
- Chat widget rendering (pane is currently empty - placeholder)
- Session activation on first prompt
- History dropdown functionality
- Settings functionality

## Next Steps

1. Build the chat widget/pane content
2. Implement session activation (create actual session on first prompt)
3. Add history dropdown
4. Add settings functionality
5. Implement AI-generated name replacement for "New Chat"


