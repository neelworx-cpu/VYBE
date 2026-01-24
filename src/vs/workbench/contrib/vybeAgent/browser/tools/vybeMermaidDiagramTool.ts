/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VYBE Mermaid Diagram Tool
 *
 * Creates Mermaid diagrams (flowchart, sequence, class, state, etc.) to visualize concepts.
 */

import type { VybeTool, ToolContext } from './vybeToolRegistry.js';

export function createMermaidDiagramTool(): VybeTool {
	return {
		name: 'create_mermaid_diagram',
		description: 'Create a Mermaid diagram (flowchart, sequence, class, state, etc.) to visualize concepts, processes, or relationships. Returns the diagram code that will be rendered visually.',
		parameters: {
			type: 'object',
			properties: {
				diagram_type: {
					type: 'string',
					enum: ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'gitgraph', 'journey', 'requirement'],
					description: 'Type of Mermaid diagram to create'
				},
				diagram_code: {
					type: 'string',
					description: 'The Mermaid diagram syntax/code. Must be valid Mermaid syntax for the specified diagram_type.'
				}
			},
			required: ['diagram_type', 'diagram_code']
		},
		parallelizable: true,
		cacheable: false, // Diagrams are usually unique, don't cache

		async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
			const diagramType = args.diagram_type as string;
			const diagramCode = args.diagram_code as string;

			if (!diagramType || !diagramCode) {
				throw new Error('create_mermaid_diagram requires both "diagram_type" and "diagram_code" parameters');
			}

			// Validate diagram type
			const validTypes = ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'gitgraph', 'journey', 'requirement'];
			if (!validTypes.includes(diagramType)) {
				throw new Error(`Invalid diagram_type: ${diagramType}. Must be one of: ${validTypes.join(', ')}`);
			}

			// Basic validation - check if code is not empty
			if (!diagramCode.trim()) {
				throw new Error('diagram_code cannot be empty');
			}

			// Note: Full Mermaid syntax validation would require loading the Mermaid library,
			// which is expensive. We'll do basic validation here and let the content part
			// handle rendering errors gracefully.

			return {
				diagram_type: diagramType,
				diagram_code: diagramCode
			};
		},
	};
}
