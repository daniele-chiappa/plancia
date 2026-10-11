// plancia-diagrams — diagrams for Vue 3 from a YAML source (ADR-006).
import './style.css'

export * from './model/types'
export { parseDiagram, diagramLinks } from './model/parse'
export { diagramText } from './model/text'
export { default as diagramSchema } from './model/diagram.schema.json'

export { default as DiagramView } from './components/DiagramView.vue'
export { DEFAULT_DIAGRAM_LABELS, type DiagramLabels } from './labels'
export { linkTarget, type DiagramLinkEvent } from './links'

export { flowGraph, treeGraph, type Graph, type GraphNode, type GraphEdge, type GraphGroup } from './layout/graph'
export { layoutGraph, edgePath, type Laid, type LaidNode, type LaidEdge, type LaidGroup, type Box, type Point } from './layout/layout'
export { createMeasure, wrapLabel, nodeSize, shapePaths, type Measure } from './layout/shapes'
export { toMermaid, mermaidText, MERMAID_KINDS } from './mermaid/convert'
export { flowToSVG } from './svg/flowSvg'
export { readPalette, DEFAULT_PALETTE, type Palette } from './theme'
