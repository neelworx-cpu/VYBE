/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

import { ILanguageAdapterService } from '../common/languageAdapter.js';
import { LanguageAdapterService } from '../common/languageAdapterService.js';
import { IIndexService } from '../common/indexService.js';
import { IndexServiceProxy } from '../browser/indexServiceProxy.js';
import { ITextShardStore } from '../common/textShardStore.js';
import { TextShardStore } from './textShardStore.js';
import { IEmbeddingStore } from '../common/embeddingStore.js';
import { EmbeddingStore } from './embeddingStore.js';
import { IGraphService } from '../common/graphService.js';
import { GraphService } from './graphService.js';
import { ISemanticSearchService } from '../common/semanticSearchService.js';
import { SemanticSearchService } from './semanticSearchService.js';
import { IContextBundlerService } from '../common/contextBundlerService.js';
import { ContextBundlerService } from './contextBundlerService.js';
import { CONFIG_SECTION, indexingConfigurationProperties } from '../common/indexingConfiguration.js';
import { LocalEmbeddingRuntimeContribution } from './localEmbeddingRuntimeContribution.js';

// Service registrations (all inert until feature flags are enabled).
registerSingleton(ILanguageAdapterService, LanguageAdapterService, InstantiationType.Delayed);
registerSingleton(IIndexService, IndexServiceProxy, InstantiationType.Delayed);
registerSingleton(ITextShardStore, TextShardStore, InstantiationType.Delayed);
registerSingleton(IEmbeddingStore, EmbeddingStore, InstantiationType.Delayed);
registerSingleton(IGraphService, GraphService, InstantiationType.Delayed);
registerSingleton(ISemanticSearchService, SemanticSearchService, InstantiationType.Delayed);
registerSingleton(IContextBundlerService, ContextBundlerService, InstantiationType.Delayed);

// Local embedding runtime wiring (provider registration for IAiEmbeddingVectorService).
registerWorkbenchContribution2('vybeLocalEmbeddingRuntime', LocalEmbeddingRuntimeContribution, WorkbenchPhase.AfterRestored);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: CONFIG_SECTION,
	order: 100,
	title: 'VYBE',
	properties: {
		...indexingConfigurationProperties
	}
});

