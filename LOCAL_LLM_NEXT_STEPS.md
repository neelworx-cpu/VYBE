# Local LLM Integration - Next Steps to Production

## ✅ Completed

1. **LLM Transport Layer** - `IVybeLLMMessageService` with streaming, abort, model listing
2. **Model Aggregation** - `VybeLLMModelService` as single source of truth
3. **Settings UI** - Provider configuration and model listing in Vybe Settings
4. **Model Dropdown** - Dynamic model loading in chat composer
5. **Service Registration** - All contributions registered and working
6. **MCP Integration Plan** - Option C (Hybrid Adapter Pattern) documented

## 🎯 Next Steps to Make It Real

### Phase 1: Connect Chat Composer to LLM Service (Critical)

**Goal**: Make the chat composer actually send messages to local LLM providers

**Tasks**:
1. **Wire up `IVybeLLMMessageService` in chat composer**
   - File: `vybeChatViewPane.ts` or wherever messages are sent
   - Replace placeholder/cloud-only logic with LLM service calls
   - Use selected model from `ModelDropdownState`

2. **Handle model selection**
   - Parse model ID format: `"ollama:llama2"` → provider + model name
   - Map to `VybeLLMProviderName` and model name
   - Pass to `sendChat()` method

3. **Stream responses to UI**
   - Connect `onText` callback to update message page
   - Connect `onFinalMessage` to finalize message
   - Handle `onError` for connection failures

**Files to modify**:
- `src/vs/workbench/contrib/vybeChat/browser/vybeChatViewPane.ts` - Main chat view
- Potentially create a chat service adapter that uses `IVybeLLMMessageService`

### Phase 2: Model Selection Persistence (Important)

**Goal**: Remember selected model across sessions

**Tasks**:
1. **Create `VybeLLMModelSelectionService`**
   - Store selected model ID per session/feature
   - Persist to `IStorageService`
   - Provide default model selection logic

2. **Integrate with Model Dropdown**
   - Load saved selection on dropdown open
   - Save selection when user changes model

**Files to create**:
- `src/vs/workbench/contrib/vybeLLM/common/vybeLLMModelSelectionService.ts`
- `src/vs/workbench/contrib/vybeLLM/browser/contribution/vybeLLMModelSelectionService.contribution.ts`

### Phase 3: Error Handling & UX (Important)

**Goal**: Better user experience when providers are offline or misconfigured

**Tasks**:
1. **Connection status indicators**
   - Show provider status (online/offline) in settings
   - Visual indicators in model dropdown (gray out unavailable models)

2. **Error messages**
   - User-friendly error messages for common failures:
     - Provider not running
     - Connection refused
     - Invalid endpoint
     - Model not found

3. **Retry logic**
   - Auto-retry on transient failures
   - Manual retry button in error states

**Files to modify**:
- `src/vs/workbench/contrib/vybeLLM/common/vybeLLMModelService.ts` - Add status tracking
- `src/vs/workbench/contrib/vybeSettings/browser/tabs/vybeSettingsModelsTab.ts` - Show status

### Phase 4: Testing & Validation (Critical)

**Goal**: Verify everything works with real providers

**Tasks**:
1. **Test with Ollama**
   - Install Ollama locally
   - Pull a model (e.g., `ollama pull llama2`)
   - Test endpoint configuration
   - Test model listing
   - Test streaming chat

2. **Test with vLLM**
   - Start vLLM server locally
   - Test OpenAI-compatible endpoint
   - Test model listing
   - Test streaming chat

3. **Test with LM Studio**
   - Start LM Studio server
   - Test OpenAI-compatible endpoint
   - Test model listing
   - Test streaming chat

4. **Test error cases**
   - Provider offline
   - Wrong endpoint
   - Invalid model name
   - Network timeout

**Test commands**:
- Use existing dev commands: `vybe.llm.pingOrListModels`, `vybe.llm.streamTest`
- Or create integration tests

### Phase 5: MCP Integration (Future)

**Goal**: Connect MCP to use local LLM providers

**Tasks**:
1. **Implement IDE Adapter**
   - File: `VYBE-MCP/src/core/adapters/ideLLMAdapter.ts`
   - Bridge MCP tool calls to `IVybeLLMMessageService`
   - Handle streaming via MCP events

2. **Implement Adapter Router**
   - File: `VYBE-MCP/src/core/llmRouter.ts`
   - Route local providers → IDE adapter
   - Route cloud providers → Cloud adapter

3. **Update LLMService**
   - Refactor to use adapter pattern
   - Support runtime adapter switching

**Files to create** (in VYBE-MCP repo):
- `src/core/llmAdapter.ts` - Interface
- `src/core/adapters/ideLLMAdapter.ts` - IDE adapter
- `src/core/adapters/cloudLLMAdapter.ts` - Cloud adapter
- `src/core/llmRouter.ts` - Router

### Phase 6: Cloud Provider Integration (Future)

**Goal**: Add cloud providers (OpenAI, Anthropic, etc.) to same system

**Tasks**:
1. **Extend provider settings**
   - Add cloud provider endpoints
   - Add API key storage (secure)
   - Add provider selection logic

2. **Unified model list**
   - Show local + cloud models together
   - Indicate which are local vs cloud
   - Handle different authentication

3. **Hybrid routing**
   - MCP decides local vs cloud
   - IDE executes via appropriate adapter

## 🚀 Immediate Action Items (Priority Order)

### 1. **Connect Chat to LLM Service** (Highest Priority)
   - This is the critical path - nothing works until this is done
   - Estimated: 2-4 hours
   - **File**: `vybeChatViewPane.ts` or create adapter service

### 2. **Test with Real Providers** (High Priority)
   - Verify the entire stack works end-to-end
   - Catch any bugs before building more features
   - Estimated: 1-2 hours per provider

### 3. **Model Selection Persistence** (Medium Priority)
   - Improves UX significantly
   - Estimated: 1-2 hours

### 4. **Error Handling** (Medium Priority)
   - Makes it production-ready
   - Estimated: 2-3 hours

### 5. **MCP Integration** (Lower Priority)
   - Can be done after core functionality works
   - Estimated: 4-6 hours

## 📋 Quick Start Checklist

- [ ] Wire `IVybeLLMMessageService` into chat message handler
- [ ] Parse model ID from dropdown selection
- [ ] Stream responses to message page
- [ ] Test with Ollama (install + pull model)
- [ ] Test with vLLM (if available)
- [ ] Test with LM Studio (if available)
- [ ] Add model selection persistence
- [ ] Add connection status indicators
- [ ] Improve error messages
- [ ] Document usage for end users

## 🔍 Key Files to Investigate

1. **Where messages are sent**:
   - Search for `handleSendMessage` in `vybeChatViewPane.ts`
   - Check if there's a chat service that needs updating

2. **Message page streaming**:
   - Check `MessagePage` class for streaming update methods
   - Ensure it can handle incremental text updates

3. **Model selection state**:
   - Check how `ModelDropdownState` is used
   - Ensure model ID is accessible when sending messages

## 💡 Implementation Tips

1. **Start simple**: Just connect Ollama first, then add others
2. **Use existing dev commands**: Test with `vybe.llm.streamTest` first
3. **Incremental testing**: Test each piece (listing, streaming, abort) separately
4. **Error handling**: Start with basic error messages, refine later
5. **MCP can wait**: Get core functionality working first

## 🎯 Success Criteria

The integration is "real" when:
- ✅ User can select a local model from dropdown
- ✅ User can send a message in chat
- ✅ Message streams back from local LLM provider
- ✅ User can abort streaming
- ✅ Settings persist across restarts
- ✅ Errors are user-friendly


