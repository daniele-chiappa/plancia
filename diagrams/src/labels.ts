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
  yamlOnly: string
  noProblems: string
  shapes: Record<'box' | 'pill' | 'decision' | 'data' | 'doc' | 'db' | 'circle' | 'note', string>
  classes: Record<'user' | 'data' | 'ext' | 'planned' | 'off', string>
  styles: Record<'solid' | 'dashed' | 'dotted', string>
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
  yamlOnly: 'This kind is edited in the YAML for now.',
  noProblems: 'No problems.',
  shapes: { box: 'Box', pill: 'Pill', decision: 'Decision', data: 'Data', doc: 'Document', db: 'Database', circle: 'Circle', note: 'Note' },
  classes: { user: 'A person', data: 'Data', ext: 'An outside system', planned: 'Planned', off: 'Off' },
  styles: { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' },
}
