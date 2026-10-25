# Changelog — plancia-diagrams

All notable changes to this package. It follows [Semantic Versioning](https://semver.org);
its tags are `diagrams-vX.Y.Z`.

## [0.6.1] - unreleased

### Fixed

- The node types of `<PipelineEditor>` ("Add a node") wrote over each
  other: the menu sits in the toolbar, whose buttons are 28px high, and
  its entries took that height whatever their text. They are as high as
  their text now, and a description shows two lines (the rest in its
  title); the menu is wider and fits the window.

### Added

- A search on top of the node types, by type or description, case
  aside: a server with its plugins gives dozens (77 in gosidian's lab).
  It takes the focus when the menu opens; Enter adds the first type
  found, Escape closes, and so does a click outside the menu.
  `PipelineLabels` has `searchNodes` and `noNodes`.

## [0.6.0] - 2026-10-22

### Added

- The `chat`, `commit` and `run` triggers of gosidian's pipelines (its
  IMP-207): `TRIGGER_KINDS` lists the eight its server knows. The trigger
  panel sets the folder, the name glob (`match`) and the pipelines whose
  writes do not start it (`skip`) of `commit`, and the ends (`status`) and
  the pipelines (`pipelines`, a glob) of `run`; `chat` has no fields.
- `<PipelineEditor>` takes `triggerKinds`, the triggers the menu offers
  (default `TRIGGER_KINDS`): a consumer can pass its server's list. A
  pipeline's trigger that the menu does not list stays in it, by its name,
  instead of leaving the menu empty.

### Changed

- `PipelineTrigger` has `skip`, `status` and `pipelines`; `setTrigger`
  writes them, and takes them away from a trigger that has none.
  `PipelineLabels.triggers` is keyed by the eight `TriggerKind`s, and the
  labels have `skip`, `runEnds` and `pipelines`: a consumer passing its own
  words adds them.

## [0.5.0] - 2026-10-11

### Added

- The `in` trigger of gosidian's pipelines (its IMP-172): the files of a
  project's IN folder, one run per file or, with `batch: true`, per batch.
  The editor's trigger panel sets its kinds, folder, name glob (`match`)
  and batch; its texts offer `{{ trigger.file }}`, `name`, `dir`, `sha256`
  and the rest, or, for a batch, `batch`, `count`, `bytes` and `files`.

### Changed

- `PipelineTrigger` has `match` and `batch`; `PipelineLabels.triggers` is
  keyed by every `TriggerKind`, `in` with it, and the labels have `match`
  and `batch`: a consumer passing its own words adds the three.

## [0.4.0] - 2026-10-11

### Added

- The pipelines of gosidian (its ADR-035): `<PipelineEditor>` and
  `<PipelineView>` for a ```` ```pipeline ```` block. The trigger and the
  nodes are drawn with Vue Flow, top to bottom, laid out by dagre or at the
  places of `layout:`. A node is added from the page's node types
  (`catalog`), dragged, joined to the node it waits for, and set in a panel
  whose form comes from the JSON Schema of its type; its texts offer the
  `{{ }}` references of the trigger, the run and the nodes before it. A
  run (`run`) colours each node by how it went, its error and output in
  the panel; the page's `problems` are listed with the package's own.
- `readPipeline`, `editPipeline` (on the yaml library's Document: what it
  does not touch stays as written; a new node is written on one line or
  several like the node before it; a node taken away hands what waited for
  it to what it waited for), `exprSuggestions`, `completeExpr`,
  `pipelineGraph`.

## [0.3.0] - 2026-10-11

### Added

- Venn and Gantt drawn by Mermaid (`venn-beta`, `gantt`) in the page's
  colours, light or dark, their links listed under the drawing; a matrix
  drawn in the package's own SVG (`matrixToSVG`): quadrants with their axes
  and points, or a grid as a table. Every kind is drawn now, and exported as
  SVG.
- The editor's forms: a Venn's sets and shared parts; a matrix's axes,
  quadrants and points, a point also dragged on the drawing; a grid as a
  table of rows, columns and cells; a Gantt's sections and tasks, a task
  starting on a date or after another and lasting days or until its last
  day. `editDiagram` has their operations (`addSet`, `updateArea`,
  `setAxis`, `updateItem`, `setCell`, `addRow`, `addTask`, `updateTask`,
  `moveTask`, `addSection`…), which keep what they do not touch as written.
- Conversions: `toMermaid` for every kind (`{portable: true}` for any
  Mermaid 11), `fromMermaid` for a flowchart, a mind map, a Gantt and a
  quadrant chart (read by Mermaid's own parser, with warnings for what is
  left out), `toCanvas` and `fromCanvas` between a flow and an Obsidian
  canvas. **Import** in the editor puts a pasted Mermaid or canvas in place
  of the diagram.
- The twin: a ```` ```mermaid ```` block after a diagram's block, marked with
  the hash of its YAML (`diagramHash`, `twinText`, `findTwin`,
  `writeDiagramBlock`).
- `readyTemplates(words)`: ten diagrams to start from.
- `diagramToSVG(d)`: any diagram's drawing as an SVG file without a view on
  the page, and `exportSVG()` on the editor.

### Changed

- A Gantt's `end` is its last day, included (as gosidian's docs say): the
  Mermaid of a task from the 8th to the 9th ends on the 10th.

### Removed

- The editor's word `yamlOnly`: no kind is edited in the YAML alone.

## [0.2.0] - 2026-10-11

### Added

- `<DiagramEditor>`: edits a diagram's YAML (`v-model:source`). A flow on its
  drawing: drag (the first drag fixes every node), add, join from a node's
  dot or onto its box, delete, a panel for a node's label, shape, class, link
  and group and an edge's label and line, groups, lay out again. A tree, a
  mind map or a fishbone as indented lines beside their drawing. A YAML tab
  for every kind, the problems listed line by line, undo and redo, and link
  suggestions from the page (`linkSuggest`).
- `editDiagram(source, ops)`: the editor's changes as functions, on the
  yaml library's Document. What they do not touch stays as written
  (comments, short forms, flow or block collections); what they add is in
  the full form; without a change the text is the one given.
- `findDiagramBlocks` and `replaceDiagramBlock`: the diagram blocks of a
  markdown text, found as gosidian's server finds them, and one replaced.
- `diagramTemplate(kind, words)`: a diagram of each kind to start from.

### Changed

- An edge between nodes placed by hand curves from the side of one that
  faces the other to the side facing back, instead of a straight line; two
  edges between the same nodes bend apart.

## [0.1.0] - 2026-10-11

### Added

- The reader of the diagram format, version 1 (`parseDiagram`): the seven kinds
  (flow, tree, mind map, fishbone, Venn, matrix, Gantt), their short forms, and
  the problems on their lines, as gosidian's Go reader gives them on the same
  examples.
- `diagramText`: the diagram in words, the drawing's text alternative.
- `diagramSchema`: the JSON Schema of the format as written.
- `<DiagramView>`: flows and trees drawn with Vue Flow and dagre (shapes,
  classes, groups, edge styles and labels, `layout:` positions), mind maps and
  fishbones with Mermaid 11.17.2, loaded only when one is drawn. Links are
  events; the problems are listed above the drawing; the other kinds show
  their text.
- The SVG export (`exportSVG()`), with the page's colours resolved.
- Colours from CSS variables, taking plancia's `--plancia-*` when the page has
  them, light and dark.
