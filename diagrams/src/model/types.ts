/**
 * The diagram format, version 1 (ADR-036 of gosidian): a block of YAML with
 * a `kind` and its content, and the positions an editor sets on the side
 * (`layout`). These are the types of a diagram as read, its short forms made
 * full; the reader is `parseDiagram`.
 */

/** The format this package reads. */
export const DIAGRAM_VERSION = 1
/** A diagram's YAML is at most this many bytes. */
export const MAX_BYTES = 256 << 10
/** At most this many nodes, edges, branches, sets, cells and tasks. */
export const MAX_ITEMS = 2000
/** A tree is at most this deep. */
export const MAX_DEPTH = 20

export type DiagramKind = 'flow' | 'tree' | 'mindmap' | 'fishbone' | 'venn' | 'matrix' | 'gantt'

/** The kinds, in the order of the docs. */
export const DIAGRAM_KINDS: readonly DiagramKind[] = [
  'flow',
  'tree',
  'mindmap',
  'fishbone',
  'venn',
  'matrix',
  'gantt',
]

export type Direction = 'TB' | 'LR' | 'BT' | 'RL'
export const DIRECTIONS: readonly Direction[] = ['TB', 'LR', 'BT', 'RL']

export type NodeShape = 'box' | 'pill' | 'decision' | 'data' | 'doc' | 'db' | 'circle' | 'note'
export const NODE_SHAPES: readonly NodeShape[] = [
  'box',
  'pill',
  'decision',
  'data',
  'doc',
  'db',
  'circle',
  'note',
]

/** What a box stands for: a person, data, an outside system, planned, off. */
export type NodeClass = 'user' | 'data' | 'ext' | 'planned' | 'off'
export const NODE_CLASSES: readonly NodeClass[] = ['user', 'data', 'ext', 'planned', 'off']

export type EdgeStyle = 'solid' | 'dashed' | 'dotted'
export const EDGE_STYLES: readonly EdgeStyle[] = ['solid', 'dashed', 'dotted']

export type TaskStatus = 'done' | 'active' | 'critical' | 'milestone'
export const TASK_STATUSES: readonly TaskStatus[] = ['done', 'active', 'critical', 'milestone']

/** Every element keeps the line of the YAML it was read from (1-based; 0 when unknown). */
interface Located {
  line: number
}

export interface DiagramNode extends Located {
  id: string
  label: string
  shape: NodeShape
  /** A `[[note]]` or an http(s) address; '' when none. */
  link: string
  class: NodeClass | ''
}

export interface DiagramEdge extends Located {
  from: string
  to: string
  label: string
  style: EdgeStyle
}

export interface DiagramGroup extends Located {
  id: string
  label: string
  nodes: string[]
}

/** A branch of a tree, a mind map or a fishbone; the root is one too. */
export interface DiagramBranch extends Located {
  id: string
  label: string
  link: string
  children: DiagramBranch[]
}

export interface DiagramSet extends Located {
  id: string
  label: string
  link: string
}

export interface DiagramArea extends Located {
  sets: string[]
  label: string
  size: number
}

export interface MatrixAxis {
  label: string
  low: string
  high: string
}

export interface MatrixItem extends Located {
  label: string
  x: number
  y: number
  link: string
}

/** A quadrant matrix (x, y, quadrants, items) or a grid (rows, columns, cells). */
export interface MatrixSpec {
  x?: MatrixAxis
  y?: MatrixAxis
  quadrants: string[]
  items: MatrixItem[]
  rows: string[]
  columns: string[]
  cells: string[][]
}

export interface GanttTask extends Located {
  id: string
  label: string
  link: string
  /** YYYY-MM-DD, or '' when the task comes after another. */
  start: string
  end: string
  after: string
  days: number
  status: TaskStatus | ''
}

export interface GanttSection {
  label: string
  tasks: GanttTask[]
}

/** A position an editor set, by id. */
export interface LayoutPoint {
  x: number
  y: number
  w: number
  h: number
}

export interface Diagram {
  version: number
  kind: DiagramKind
  title: string
  description: string
  /** flow and tree; TB otherwise. */
  direction: Direction
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  groups: DiagramGroup[]
  root?: DiagramBranch
  sets: DiagramSet[]
  areas: DiagramArea[]
  matrix?: MatrixSpec
  sections: GanttSection[]
  layout?: Record<string, LayoutPoint>
}

/** Something wrong in a diagram, on its line of the YAML (0 when unknown). */
export interface DiagramProblem {
  line: number
  message: string
}

export interface ParseResult {
  /** The diagram as far as it reads; null when it does not read at all. */
  diagram: Diagram | null
  problems: DiagramProblem[]
}
