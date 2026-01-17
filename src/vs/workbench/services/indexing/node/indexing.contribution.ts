/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

import { ILanguageAdapterService } from '../common/languageAdapter.js';
import { LanguageAdapterService } from '../common/languageAdapterService.js';
import { IIndexService } from '../common/indexService.js';
import { CompositeIndexService } from '../browser/compositeIndexService.js';
import { ISemanticSearchService } from '../common/semanticSearchService.js';
import { CompositeSemanticSearchService } from '../browser/compositeSemanticSearchService.js';
import { IContextBundlerService } from '../common/contextBundlerService.js';
import { ContextBundlerService } from './contextBundlerService.js';
import { CONFIG_SECTION, indexingConfigurationProperties } from '../common/indexingConfiguration.js';
import '../browser/cloudIndexing.contribution.js'; // Register cloud indexing services

// Service registrations
registerSingleton(ILanguageAdapterService, LanguageAdapterService, InstantiationType.Delayed);

// Register composite index service (always uses CloudIndexService now - local indexing removed)
registerSingleton(IIndexService, CompositeIndexService, InstantiationType.Delayed);
// Register composite semantic search service (always uses CloudSemanticSearchService now - local indexing removed)
registerSingleton(ISemanticSearchService, CompositeSemanticSearchService, InstantiationType.Delayed);
registerSingleton(IContextBundlerService, ContextBundlerService, InstantiationType.Delayed);
// Note: IPineconeVectorStore is registered in browser/cloudIndexing.contribution.ts as PineconeVectorStoreProxy
// The actual PineconeVectorStoreImpl runs in the extension host and is accessed via RPC

// Local indexing services removed:
// - ITextShardStore, IEmbeddingStore, IGraphService (local-only, no longer used)
// - LocalEmbeddingRuntimeContribution (local-only, no longer used)

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

