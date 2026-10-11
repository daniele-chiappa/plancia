# Changelog — plancia-diagrams

All notable changes to this package. It follows [Semantic Versioning](https://semver.org);
its tags are `diagrams-vX.Y.Z`.

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
