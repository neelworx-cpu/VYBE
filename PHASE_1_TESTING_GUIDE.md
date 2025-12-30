# Phase 1 Testing Guide

## Prerequisites

1. **Build VYBE-MCP**:
   ```bash
   cd /Users/neel/VYBE-MCP
   npm run build
   ```
   This creates `build/index.js` which the IDE will spawn.

2. **Ensure Ollama is running**:
   ```bash
   ollama serve
   # In another terminal, verify a model is available:
   ollama list
   ```

3. **Set environment variable** (for IDE to find MCP):
   ```bash
   export VYBE_MCP_COMMAND="node /Users/neel/VYBE-MCP/build/index.js"
   # Or set VYBE_MCP_CWD if MCP needs a specific working directory
   ```

## Test Plan

### Test 1: IDE Launches MCP Process

**Goal**: Verify IDE spawns MCP subprocess when configured.

**Steps**:
1. Start VYBE IDE with `VYBE_MCP_COMMAND` environment variable set
2. Check IDE logs (View → Output → "VYBE MCP Stdio") for:
   - "Launching MCP process: ..."
   - "MCP process spawned"
   - "VYBE stdio tool host initialized"

**Expected Result**:
- MCP process is spawned
- No console errors
- Logger shows successful initialization

**If it fails**:
- Check `VYBE_MCP_COMMAND` is set correctly
- Verify MCP build exists at the path
- Check IDE logs for error messages

---

### Test 2: MCP Client Connects to IDE

**Goal**: Verify MCP client detects IDE stdio connection.

**Steps**:
1. With IDE running and MCP spawned, check MCP logs
2. Look for:
   - "Using stdio transport for IDE connection"
   - "Connected to IDE MCP server"

**Expected Result**:
- MCP client uses stdio transport (not HTTP/SSE)
- Connection succeeds
- `mcpClient.isAvailable()` returns `true`

**How to verify**:
- Add temporary logging in `VYBE-MCP/src/core/mcp_client.ts`:
  ```typescript
  async isAvailable(): Promise<boolean> {
      const available = process.env.VYBE_IDE_STDIO === '1';
      logger.info(`IDE available check: ${available} (VYBE_IDE_STDIO=${process.env.VYBE_IDE_STDIO})`);
      return available;
  }
  ```

---

### Test 3: Tool Registration

**Goal**: Verify IDE tools are registered and discoverable.

**Steps**:
1. In IDE, check logs for:
   - "Registered stdio tool: vybe.send_llm_message"
   - "Registered stdio tool: vybe.list_models"
   - "Registered stdio tool: vybe.abort_llm_request"

2. From MCP side, verify tools are listed:
   - Add test code in MCP to call `mcpClient.callTool({ name: 'vybe.list_models', ... })`

**Expected Result**:
- All 3 tools are registered
- Tools are callable from MCP

---

### Test 4: List Models Tool

**Goal**: Verify `vybe.list_models` works end-to-end.

**Steps**:
1. From MCP, call:
   ```typescript
   const result = await mcpClient.callTool({
       name: 'vybe.list_models',
       arguments: {}
   });
   console.log('Models:', result);
   ```

2. Or test via L1 agent (if it calls this):
   - The agent should be able to list available models

**Expected Result**:
- Returns list of Ollama/LM Studio models
- Models have correct format: `{ id, label, provider }`

---

### Test 5: Send LLM Message Tool (Basic)

**Goal**: Verify `vybe.send_llm_message` works for simple prompts.

**Steps**:
1. From MCP, call:
   ```typescript
   const result = await mcpClient.callTool({
       name: 'vybe.send_llm_message',
       arguments: {
           messages: [
               { role: 'user', content: 'Say hello' }
           ]
       }
   });
   ```

**Expected Result**:
- LLM call succeeds
- Response is streamed back
- Content appears in result

---

### Test 6: L1 Agent with IDE Adapter

**Goal**: Verify L1 agent uses IDE LLM transport via stdio.

**Steps**:
1. Ensure `VYBE_IDE_STDIO=1` is set (IDE sets this automatically)
2. Run L1 agent with a simple task
3. Check logs:
   - MCP: "Using IDE adapter for LLM calls"
   - IDE: LLM service receives request
   - Ollama: Request is sent to Ollama

**Expected Result**:
- L1 agent uses IDE adapter (not cloud)
- LLM calls route through IDE → Ollama
- Agent completes task successfully

**How to run L1 agent**:
- Check `VYBE-MCP/src/agents/agent_l1.ts` for entry point
- Or check if there's a CLI/test script

---

### Test 7: Streaming Behavior

**Goal**: Verify streaming works correctly through stdio.

**Steps**:
1. Send a longer prompt that generates multiple tokens
2. Observe:
   - Tokens arrive incrementally (not all at once)
   - No flickering in code blocks (if displayed)
   - Final message is complete

**Expected Result**:
- Smooth streaming
- No duplicate or missing tokens
- Final message is correct

---

### Test 8: Abort Tool

**Goal**: Verify `vybe.abort_llm_request` works.

**Steps**:
1. Start a long-running LLM request
2. Call abort tool with the request ID
3. Verify request stops

**Expected Result**:
- Request is aborted
- No further tokens arrive
- Clean shutdown

---

## Debugging Tips

### Check IDE Logs
- View → Output → Select "VYBE MCP Stdio" channel
- Look for errors or warnings

### Check MCP Logs
- MCP logs to stderr (visible in IDE if process is spawned)
- Or check MCP's own logging

### Verify Environment Variables
```bash
# In IDE process, these should be set:
echo $VYBE_MCP_COMMAND
echo $VYBE_IDE_STDIO  # Should be "1" in MCP process
```

### Test MCP Client Directly
Create a test script in `VYBE-MCP`:
```typescript
// test-ide-connection.ts
import { mcpClient } from './src/core/mcp_client.js';

async function test() {
    console.log('Testing IDE connection...');
    const available = await mcpClient.isAvailable();
    console.log('IDE available:', available);

    if (available) {
        const models = await mcpClient.callTool({
            name: 'vybe.list_models',
            arguments: {}
        });
        console.log('Models:', models);
    }
}

test();
```

---

## Known Limitations (Phase 1)

- **No file operations**: File tools are Phase 2
- **No diff tools**: Diff tools are Phase 2
- **No execution tools**: Execution tools are Phase 3
- **Manual configuration**: MCP path must be set via env var (settings UI is Phase 2+)

---

## Success Criteria

Phase 1 is successful if:
1. ✅ IDE spawns MCP process without errors
2. ✅ MCP client connects to IDE via stdio
3. ✅ `vybe.list_models` returns models from Ollama
4. ✅ `vybe.send_llm_message` successfully calls Ollama
5. ✅ L1 agent can use IDE adapter for LLM calls
6. ✅ Streaming works correctly
7. ✅ No console errors in IDE

---

## Next Steps After Phase 1

Once Phase 1 is validated:
- Proceed to Phase 2: File operations and diff tools
- Add settings UI for MCP configuration
- Test with more complex agent scenarios


