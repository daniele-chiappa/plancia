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
export { toMermaid, mermaidText, MERMAID_KINDS, type MermaidOptions } from './mermaid/convert'
export { fromMermaid, DiagramConvertError, type ConvertResult } from './mermaid/import'
export { toCanvas, fromCanvas } from './canvas'
export { flowToSVG } from './svg/flowSvg'
export { matrixToSVG } from './svg/matrixSvg'
export { diagramToSVG } from './svg/export'
export { readPalette, DEFAULT_PALETTE, type Palette } from './theme'

export { editDiagram, DiagramEditError, type DiagramOp, type EditResult, type EdgeRef, type BranchPath, type LayoutPosition, type TaskRef, type TaskFields } from './edit/edit'
export {
  findDiagramBlocks,
  replaceDiagramBlock,
  writeDiagramBlock,
  findTwin,
  twinText,
  twinHash,
  diagramHash,
  TWIN_MARK,
  type MarkdownDiagramBlock,
} from './markdown'
export { default as DiagramEditor } from './components/DiagramEditor.vue'
export { DEFAULT_EDITOR_LABELS, type DiagramEditorLabels } from './labels'
export {
  diagramTemplate,
  DEFAULT_TEMPLATE_WORDS,
  readyTemplates,
  DEFAULT_READY_WORDS,
  READY_TEMPLATE_KINDS,
  type TemplateWords,
  type ReadyTemplateWords,
  type ReadyTemplate,
} from './templates'
export { curved } from './layout/layout'

// Pipelines of gosidian (ADR-035): read, drawn and edited (IMP-169, F4).
export * from './pipeline/types'
export { readPipeline, ancestors, type PipelineReadResult } from './pipeline/read'
export { editPipeline, PipelineEditError, type PipelineOp, type PipelineEditResult } from './pipeline/edit'
export { exprSuggestions, exprAt, completeExpr, type ExprSuggestion } from './pipeline/expr'
export { pipelineGraph } from './pipeline/graph'
export { default as PipelineView } from './components/PipelineView.vue'
export { default as PipelineEditor } from './components/PipelineEditor.vue'
export type { PipelineSelection } from './components/PipelineCanvas.vue'
export { DEFAULT_PIPELINE_LABELS, type PipelineLabels } from './labels'
