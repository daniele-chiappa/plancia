# Changelog — plancia-diagrams

All notable changes to this package. It follows [Semantic Versioning](https://semver.org);
its tags are `diagrams-vX.Y.Z`.

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
