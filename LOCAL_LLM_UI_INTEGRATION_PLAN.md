# Local LLM UI Integration Plan

## Goal

Make local LLM models (Ollama, vLLM, LM Studio) appear in:
1. **Vybe Settings** - Cloud Models page
2. **Chat Composer** - Model dropdown

## Current State

- ✅ LLM transport layer implemented (`IVybeLLMMessageService`)
- ✅ Model listing works (`listModels()` method)
- ❌ Models are hardcoded in `modelDropdown.ts` (lines 37-44)
- ❌ Settings view is placeholder only
- ❌ No service to aggregate models from all providers

## Implementation Plan

### Phase 1: Create Model Aggregation Service

**File**: `src/vs/workbench/contrib/vybeLLM/common/vybeLLMModelService.ts`

```typescript
export interface VybeModel {
    id: string; // Format: "provider:modelName" (e.g., "ollama:llama2")
    label: string; // Display name (e.g., "Llama 2")
    provider: VybeLLMProviderName;
    providerLabel: string; // "Ollama", "vLLM", "LM Studio"
    isLocal: boolean;
    hasThinking?: boolean; // For future reasoning support
}

export interface IVybeLLMModelService {
    getAllModels(): Promise<VybeModel[]>;
    getModelsByProvider(provider: VybeLLMProviderName): Promise<VybeModel[]>;
    refreshModels(): Promise<void>;
    onDidModelsChange: Event<void>;
}
```

**Responsibilities**:
- Aggregates models from all providers (Ollama, vLLM, LM Studio)
- Caches model list
- Emits events when models change
- Handles errors gracefully (provider offline, etc.)

### Phase 2: Integrate with Model Dropdown

**File**: `src/vs/workbench/contrib/vybeChat/browser/components/composer/modelDropdown.ts`

**Changes**:
1. Inject `IVybeLLMModelService` in constructor
2. Replace hardcoded `models` array with dynamic loading
3. Load models on dropdown open
4. Show loading state while fetching
5. Group models by provider in dropdown
6. Show provider badges (e.g., "Ollama", "vLLM")

**Model ID Format**:
- Local: `"ollama:llama2"`, `"vllm:mistral-7b"`, `"lmstudio:codellama"`
- Cloud: Keep existing format (e.g., `"composer-1"`, `"opus-4.5"`)

### Phase 3: Create Settings UI

**File**: `src/vs/workbench/contrib/vybeLLM/browser/vybeLLMSettingsView.ts`

**Features**:
1. **Provider Configuration Section**
   - Ollama endpoint input
   - vLLM endpoint input
   - LM Studio endpoint input
   - Test connection buttons
   - Status indicators (connected/disconnected)

2. **Models List Section**
   - Table/list of all available models
   - Columns: Model Name, Provider, Status, Actions
   - Refresh button
   - Filter by provider
   - Search models

3. **Model Details**
   - Click model to see details
   - Model size, parameters, etc.

### Phase 4: Register Settings View

**File**: `src/vs/workbench/contrib/vybeLLM/browser/contribution/vybeLLMSettingsContribution.ts`

- Register settings view in workbench
- Add to settings navigation
- Link from existing Vybe Settings view

### Phase 5: Persist Model Selection

**File**: `src/vs/workbench/contrib/vybeLLM/common/vybeLLMModelSelectionService.ts`

**Responsibilities**:
- Store selected model per session/feature
- Persist to storage
- Provide default model selection logic
- Handle model availability changes

## File Structure

```
src/vs/workbench/contrib/vybeLLM/
├── common/
│   ├── vybeLLMModelService.ts          # NEW: Model aggregation
│   ├── vybeLLMModelSelectionService.ts # NEW: Selection persistence
│   └── ... (existing files)
├── browser/
│   ├── vybeLLMSettingsView.ts          # NEW: Settings UI
│   └── contribution/
│       └── vybeLLMSettingsContribution.ts # NEW: View registration
└── ... (existing files)

src/vs/workbench/contrib/vybeChat/
└── browser/
    └── components/
        └── composer/
            └── modelDropdown.ts        # MODIFY: Use dynamic models
```

## Implementation Details

### Model Service Implementation

```typescript
export class VybeLLMModelService extends Disposable implements IVybeLLMModelService {
    private readonly _onDidModelsChange = this._register(new Emitter<void>());
    readonly onDidModelsChange = this._onDidModelsChange.event;

    private modelsCache: VybeModel[] = [];
    private isLoading = false;

    constructor(
        @IVybeLLMMessageService private readonly llmService: IVybeLLMMessageService
    ) {
        super();
    }

    async getAllModels(): Promise<VybeModel[]> {
        if (this.modelsCache.length > 0 && !this.isLoading) {
            return this.modelsCache;
        }

        await this.refreshModels();
        return this.modelsCache;
    }

    async refreshModels(): Promise<void> {
        this.isLoading = true;
        const allModels: VybeModel[] = [];

        // Fetch from each provider
        for (const provider of ['ollama', 'vLLM', 'lmStudio'] as const) {
            try {
                const models = await this.llmService.listModels(provider);
                const vybeModels = models.map(model => this.convertToVybeModel(model, provider));
                allModels.push(...vybeModels);
            } catch (error) {
                // Provider offline or error - skip
                console.warn(`Failed to fetch models from ${provider}:`, error);
            }
        }

        this.modelsCache = allModels;
        this.isLoading = false;
        this._onDidModelsChange.fire();
    }

    private convertToVybeModel(
        model: OllamaModelResponse | OpenaiCompatibleModelResponse,
        provider: VybeLLMProviderName
    ): VybeModel {
        if ('name' in model) {
            // Ollama model
            return {
                id: `ollama:${model.name}`,
                label: model.name,
                provider: 'ollama',
                providerLabel: 'Ollama',
                isLocal: true,
            };
        } else {
            // OpenAI-compatible model
            return {
                id: `${provider.toLowerCase()}:${model.id}`,
                label: model.id,
                provider,
                providerLabel: provider === 'vLLM' ? 'vLLM' : 'LM Studio',
                isLocal: true,
            };
        }
    }
}
```

### Model Dropdown Integration

```typescript
// In modelDropdown.ts constructor
constructor(
    private anchorElement: HTMLElement,
    @IVybeLLMModelService private readonly modelService: IVybeLLMModelService
) {
    super();

    // Listen for model changes
    this._register(this.modelService.onDidModelsChange(() => {
        if (this.dropdownContainer) {
            this.renderContent(); // Re-render if open
        }
    }));
}

// Replace hardcoded models with:
private async loadModels(): Promise<ModelItem[]> {
    const vybeModels = await this.modelService.getAllModels();

    // Convert to ModelItem format
    return vybeModels.map(model => ({
        id: model.id,
        label: `${model.label} (${model.providerLabel})`,
        hasThinking: model.hasThinking,
    }));
}

// Update renderContent to be async
private async renderContent(): Promise<void> {
    // ... existing toggle code ...

    if (!this.state.isAutoEnabled) {
        // Load models dynamically
        const models = await this.loadModels();
        models.forEach(model => {
            this.renderModelItem(modelsSection, model, hoverBg);
        });
    }
}
```

### Settings View Implementation

```typescript
export class VybeLLMSettingsView extends ViewPane {
    private modelService: IVybeLLMModelService;
    private settingsService: IVybeLLMMessageService; // For endpoint config

    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);

        // Provider configuration section
        this.renderProviderConfig(container);

        // Models list section
        this.renderModelsList(container);
    }

    private renderProviderConfig(container: HTMLElement): void {
        // Ollama endpoint input
        // vLLM endpoint input
        // LM Studio endpoint input
        // Test buttons
    }

    private async renderModelsList(container: HTMLElement): Promise<void> {
        const models = await this.modelService.getAllModels();
        // Render table/list
    }
}
```

## Integration Points

### 1. Model Dropdown
- **File**: `modelDropdown.ts`
- **Change**: Load models from `IVybeLLMModelService` instead of hardcoded array
- **When**: On dropdown open, or on model change event

### 2. Settings View
- **File**: `vybeLLMSettingsView.ts` (new)
- **Features**: Provider config + models list
- **Registration**: Add to workbench views

### 3. Model Selection
- **File**: `vybeLLMModelSelectionService.ts` (new)
- **Purpose**: Persist selected model, handle availability

## Testing Checklist

- [ ] Models appear in dropdown after provider is configured
- [ ] Models refresh when provider endpoint changes
- [ ] Offline providers don't break dropdown
- [ ] Settings view shows all available models
- [ ] Settings view allows endpoint configuration
- [ ] Test connection buttons work
- [ ] Model selection persists across sessions
- [ ] Model IDs are unique across providers

## Dependencies

- `IVybeLLMMessageService` - Already implemented ✅
- Model listing methods - Already implemented ✅
- Settings storage - Already implemented ✅

## Next Steps

1. Create `VybeLLMModelService` to aggregate models
2. Modify `ModelDropdown` to use dynamic models
3. Create settings view UI
4. Register settings view
5. Test end-to-end


