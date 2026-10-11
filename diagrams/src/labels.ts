import type { TriggerKind } from './pipeline/types'

/** The words of the component, English by default; a consumer passes its own. */
export interface DiagramLabels {
  problems: string
  line: string
  pending: string
  loading: string
  failed: string
  links: string
  zoomIn: string
  zoomOut: string
  fit: string
  open: string
}

export const DEFAULT_DIAGRAM_LABELS: DiagramLabels = {
  problems: 'This diagram has problems:',
  line: 'line',
  pending: 'This kind of diagram is not drawn yet; it reads:',
  loading: 'Drawing…',
  failed: 'The diagram could not be drawn:',
  links: 'Links:',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  open: 'Open',
}

/** The words of the editor, English by default. */
export interface DiagramEditorLabels extends DiagramLabels {
  drawing: string
  yaml: string
  undo: string
  redo: string
  addNode: string
  addGroup: string
  remove: string
  relayout: string
  newNode: string
  newGroup: string
  newBranch: string
  node: string
  edge: string
  group: string
  label: string
  shape: string
  class: string
  link: string
  linkHint: string
  style: string
  none: string
  connectHint: string
  addChild: string
  addSibling: string
  indent: string
  outdent: string
  moveUp: string
  moveDown: string
  outlineHint: string
  broken: string
  noProblems: string
  shapes: Record<'box' | 'pill' | 'decision' | 'data' | 'doc' | 'db' | 'circle' | 'note', string>
  classes: Record<'user' | 'data' | 'ext' | 'planned' | 'off', string>
  styles: Record<'solid' | 'dashed' | 'dotted', string>
  // A Venn.
  sets: string
  areas: string
  addSet: string
  addArea: string
  newSet: string
  size: string
  sizeHint: string
  // A matrix.
  axisX: string
  axisY: string
  axisName: string
  low: string
  high: string
  quadrants: string
  /** Top left, top right, bottom left, bottom right. */
  quadrantNames: [string, string, string, string]
  items: string
  addItem: string
  newItem: string
  dragHint: string
  rows: string
  columns: string
  addRow: string
  addColumn: string
  newRow: string
  newColumn: string
  removeRow: string
  removeColumn: string
  // A Gantt.
  sections: string
  addSection: string
  newSection: string
  addTask: string
  newTask: string
  task: string
  starts: string
  onDate: string
  afterTask: string
  lasts: string
  untilDate: string
  days: string
  status: string
  statuses: Record<'done' | 'active' | 'critical' | 'milestone', string>
  // Import.
  import: string
  importHint: string
  importApply: string
  importCancel: string
  importWarnings: string
}

export const DEFAULT_EDITOR_LABELS: DiagramEditorLabels = {
  ...DEFAULT_DIAGRAM_LABELS,
  drawing: 'Drawing',
  yaml: 'YAML',
  undo: 'Undo',
  redo: 'Redo',
  addNode: 'Add a node',
  addGroup: 'Add a group',
  remove: 'Delete',
  relayout: 'Lay out again',
  newNode: 'New node',
  newGroup: 'New group',
  newBranch: 'New branch',
  node: 'Node',
  edge: 'Edge',
  group: 'Group',
  label: 'Label',
  shape: 'Shape',
  class: 'Stands for',
  link: 'Link',
  linkHint: '[[note]] or https://…',
  style: 'Line',
  none: 'None',
  connectHint: 'Drag from the dot of a node to another node to join them. Delete removes what is selected.',
  addChild: 'Add a child',
  addSibling: 'Add after',
  indent: 'Indent',
  outdent: 'Outdent',
  moveUp: 'Move up',
  moveDown: 'Move down',
  outlineHint: 'Enter adds a branch after, Tab and Shift+Tab change its level, Alt+↑ and Alt+↓ move it.',
  broken: 'The YAML does not read: fix it in the YAML tab to edit the drawing.',
  noProblems: 'No problems.',
  shapes: { box: 'Box', pill: 'Pill', decision: 'Decision', data: 'Data', doc: 'Document', db: 'Database', circle: 'Circle', note: 'Note' },
  classes: { user: 'A person', data: 'Data', ext: 'An outside system', planned: 'Planned', off: 'Off' },
  styles: { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' },
  sets: 'Sets',
  areas: 'Shared parts',
  addSet: 'Add a set',
  addArea: 'Add a shared part',
  newSet: 'New set',
  size: 'Size',
  sizeHint: 'How large, against the others (empty: as it comes)',
  axisX: 'Across',
  axisY: 'Up',
  axisName: 'Name',
  low: 'Low end',
  high: 'High end',
  quadrants: 'Quadrants',
  quadrantNames: ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
  items: 'Points',
  addItem: 'Add a point',
  newItem: 'New point',
  dragHint: 'Drag a point on the drawing to move it.',
  rows: 'Rows',
  columns: 'Columns',
  addRow: 'Add a row',
  addColumn: 'Add a column',
  newRow: 'New row',
  newColumn: 'New column',
  removeRow: 'Delete the row',
  removeColumn: 'Delete the column',
  sections: 'Sections',
  addSection: 'Add a section',
  newSection: 'New section',
  addTask: 'Add a task',
  newTask: 'New task',
  task: 'Task',
  starts: 'Starts',
  onDate: 'on',
  afterTask: 'after',
  lasts: 'Lasts',
  untilDate: 'until',
  days: 'days',
  status: 'Status',
  statuses: { done: 'Done', active: 'Under way', critical: 'Critical', milestone: 'Milestone' },
  import: 'Import…',
  importHint: 'Paste Mermaid (a flowchart, a mind map, a Gantt, a quadrant chart) or the JSON of an Obsidian canvas: it takes the place of this diagram.',
  importApply: 'Convert',
  importCancel: 'Cancel',
  importWarnings: 'Converted. Left out:',
}

/** The words of the pipeline drawing and editor, English by default. */
export interface PipelineLabels {
  trigger: string
  triggers: Record<TriggerKind, string>
  statuses: Record<'pending' | 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped' | 'canceled', string>
  drawing: string
  yaml: string
  undo: string
  redo: string
  addNode: string
  remove: string
  relayout: string
  fit: string
  zoomIn: string
  zoomOut: string
  palette: string
  base: string
  node: string
  id: string
  type: string
  settings: string
  more: string
  when: string
  unless: string
  each: string
  attempts: string
  backoff: string
  timeout: string
  onError: string
  onErrorStop: string
  onErrorContinue: string
  waitsFor: string
  startsAtOnce: string
  edge: string
  edgeHint: string
  triggerOn: string
  kinds: string
  folder: string
  every: string
  match: string
  batch: string
  required: string
  structured: string
  invalidValue: string
  unknownType: string
  otherSettings: string
  problems: string
  serverProblem: string
  line: string
  noProblems: string
  broken: string
  connectHint: string
  run: string
  status: string
  duration: string
  attempt: string
  error: string
  output: string
  outputTruncated: string
  waitingUntil: string
  none: string
  yes: string
  no: string
  exprHint: string
}

export const DEFAULT_PIPELINE_LABELS: PipelineLabels = {
  trigger: 'Start',
  triggers: { manual: 'By hand', external: 'From outside', ingest: 'On arrival', schedule: 'On schedule', in: 'In the IN folder' },
  statuses: {
    pending: 'Pending',
    queued: 'Queued',
    running: 'Running',
    waiting: 'Waiting',
    done: 'Done',
    failed: 'Failed',
    skipped: 'Skipped',
    canceled: 'Canceled',
  },
  drawing: 'Drawing',
  yaml: 'YAML',
  undo: 'Undo',
  redo: 'Redo',
  addNode: 'Add a node',
  remove: 'Delete',
  relayout: 'Lay out again',
  fit: 'Fit',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  palette: 'Node types',
  base: 'Base',
  node: 'Node',
  id: 'Id',
  type: 'Type',
  settings: 'Settings',
  more: 'When and how',
  when: 'Only when',
  unless: 'Skip when',
  each: 'For each',
  attempts: 'Attempts',
  backoff: 'Wait before trying again',
  timeout: 'Timeout',
  onError: 'On error',
  onErrorStop: 'Stop the run',
  onErrorContinue: 'Go on',
  waitsFor: 'Waits for',
  startsAtOnce: 'Starts with the run',
  edge: 'Wait',
  edgeHint: 'Delete takes this wait away: the second node no longer waits for the first.',
  triggerOn: 'Starts',
  kinds: 'File extensions',
  folder: 'Folder',
  every: 'Every',
  match: 'Name matching',
  batch: 'One run per batch',
  required: 'needed',
  structured: 'YAML or JSON',
  invalidValue: 'Not valid YAML:',
  unknownType: 'This server has no such node type.',
  otherSettings: 'Other settings',
  problems: 'This pipeline has problems:',
  serverProblem: 'The server would not run it:',
  line: 'line',
  noProblems: 'No problems.',
  broken: 'The YAML does not read: fix it in the YAML tab to edit the drawing.',
  connectHint: 'Drag from the dot under a node to another node: the second waits for the first. Delete removes what is selected.',
  run: 'Run',
  status: 'Status',
  duration: 'Duration',
  attempt: 'Attempt',
  error: 'Error',
  output: 'Output',
  outputTruncated: 'cut: the output is longer',
  waitingUntil: 'Waiting until',
  none: 'None',
  yes: 'Yes',
  no: 'No',
  exprHint: 'Type {{ for the values of the trigger, the run and the nodes before this one.',
}
