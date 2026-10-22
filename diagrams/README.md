# plancia-diagrams

> Diagrams for Vue 3 from a YAML source: flows and trees drawn with
> [Vue Flow](https://vueflow.dev) and [dagre](https://github.com/dagrejs/dagre),
> mind maps, fishbones, Venns and Gantts with [Mermaid](https://mermaid.js.org),
> matrices in an SVG of its own; each with its text alternative, an SVG export,
> an editor, and conversions to and from Mermaid and Obsidian canvases.

A diagram is a small YAML document: what it shows (nodes, branches, sets, tasks),
with the positions an editor sets kept on the side. The YAML stays the source:
a person or a language model writes it as text, and this package reads it,
checks it and draws it. It lives in the [plancia](../README.md) repository but
is a package of its own: plancia does not need it, and it does not need plancia
(it takes plancia's `--plancia-*` colours when the page has them).

```yaml
kind: flow
title: Arrival of a document
nodes:
  - {id: upload, label: Upload, shape: pill}
  - {id: convert, label: docling.convert, link: "[[team/pipelines/arrivals]]"}
  - {id: note, label: The note, shape: doc}
edges:
  - "upload -> convert"
  - "convert -> note: markdown"
```

## Install

```bash
npm install https://github.com/daniele-chiappa/plancia/releases/download/diagrams-v0.4.0/plancia-diagrams-0.4.0.tgz
# peer: vue ^3.5
```

Each `diagrams-vX.Y.Z` tag attaches the package to its GitHub release.

```vue
<script setup lang="ts">
import { DiagramView, type DiagramLinkEvent } from 'plancia-diagrams'
import 'plancia-diagrams/style.css'

const source = `kind: tree
root: Lead
children: [Backend, Frontend]`

function open(link: DiagramLinkEvent) {
  // link.kind is 'note' for a [[note]], 'url' for an address: the page decides.
}
</script>

<template>
  <DiagramView :source="source" @link="open" />
</template>
```

## The format

Version 1, the same as gosidian's (its `docs/diagrams.md` is the reference).
Seven kinds: `flow`, `tree`, `mindmap`, `fishbone`, `venn`, `matrix`, `gantt`.

| Kind | Drawn by | Content |
|---|---|---|
| `flow` | Vue Flow + dagre | `direction`, `nodes` (`id`, `label`, `shape`, `link`, `class`), `edges` (`"a -> b: label"` or `{from, to, label, style}`), `groups` |
| `tree` | Vue Flow + dagre | `root` and `children`, a branch being a text, `{Label: [children]}` or `{id, label, link, children}` |
| `mindmap` | Mermaid | as a tree |
| `fishbone` | Mermaid | as a tree: the root is the effect, the first level the categories, the levels below the causes |
| `venn` | Mermaid | `sets` (`id`, `label`, `link`) and `areas` (`sets`, `label`, `size`) |
| `matrix` | the package's SVG | quadrants (`x`, `y`, `quadrants`, `items` from 0 to 1) or a grid (`rows`, `columns`, `cells`) |
| `gantt` | Mermaid | `sections` of `tasks` (or `tasks` alone): `start` or `after`, then `end` (the last day) or `days`, and `status` |

`layout:` (optional) places ids where an editor put them: `id: {x, y, w, h}`,
`x` and `y` being the top left corner in px. Without it the drawing lays itself
out.

`src/model/diagram.schema.json` is the JSON Schema of the format as written,
short forms included (`diagramSchema` in the package). The reader checks what a
schema cannot: ids used once, edges to nodes that exist, a Gantt's dates.

## The editor

```vue
<DiagramEditor v-model:source="yaml" :link-suggest="suggest" />
```

`<DiagramEditor>` edits the YAML, and only what changes in it: comments,
short forms and the order of the fields stay as written, what it adds is in
the full form, positions go to `layout:`. Its Drawing tab edits a flow on
its drawing (drag, add, join from a node's dot, delete, a panel for the
label, shape, class, link and group of a node and the label and line of an
edge, groups, lay out again), a tree, a mind map or a fishbone as
indented lines beside their drawing (Enter, Tab, Shift+Tab, Alt+↑↓, drag),
and a Venn, a matrix or a Gantt as a form beside theirs: sets and shared
parts; axes, quadrants and points, which are also dragged on the drawing;
a grid as a table; a Gantt's sections and tasks, a task starting on a date
or after another and lasting days or until a date. Its YAML tab edits the
text, every kind included. **Import** puts a pasted Mermaid (a flowchart, a
mind map, a Gantt, a quadrant chart) or an Obsidian canvas in place of the
diagram, and says what it left out. Ctrl+Z and Ctrl+Shift+Z undo and redo.
`linkSuggest(query)` gives the `{label, link}` the link fields offer: the
page knows its notes, the package does not.

The same changes are functions, for a page or a script: `editDiagram(source,
ops)` applies operations (`move`, `addNode`, `updateEdge`, `moveBranch`…)
and gives the new text, the same text when nothing changed.
`findDiagramBlocks(markdown)` finds the ```` ```diagram ```` blocks of a
markdown note as gosidian's server does, and `replaceDiagramBlock` puts one
back. `diagramTemplate(kind, words)` is a small diagram of a kind to start
from, `readyTemplates(words)` ten more to start from (a process, an
architecture, an organisation chart, a brainstorm, the 6M, three sets,
Eisenhower, impact and effort, SWOT, a project in phases).

## Conversions and the twin

- `toMermaid(d)` writes any kind as Mermaid: a flow and a tree as a
  `flowchart`, then `mindmap`, `ishikawa`, `venn-beta`, `quadrantChart`,
  `block-beta` for a grid, and `gantt`. With `{portable: true}` it uses only
  what any Mermaid 11 draws (a fishbone becomes a mind map).
- `fromMermaid(text)` reads Mermaid with Mermaid's own parser and gives the
  YAML of a flowchart, a mind map, a Gantt or a quadrant chart, with
  `warnings` for what the format has no place for (styles, nested
  subgraphs, excluded days).
- `toCanvas(d)` writes a flow as an Obsidian canvas (JSON Canvas 1.0): text
  cards where the drawing puts the nodes, group cards around their nodes,
  connections between the facing sides. `fromCanvas(json)` reads one back:
  cards as nodes at their places, a card inside a group card in that group.
- A **twin** is a ```` ```mermaid ```` block right after a diagram's block,
  for apps that draw Mermaid and not this format (Obsidian). Its first line is
  `%% diagram-twin <hash>`, the hash of the YAML it was made from
  (`diagramHash`, FNV-1a on 32 bits, which gosidian's server computes too), so
  a twin left behind by a change is found. `twinText(yaml, mermaid)` makes
  one, `findTwin(md, block)` finds it, and `writeDiagramBlock(md, block,
  yaml, twin)` writes the block with its twin made, written again or taken
  away.

## Pipelines

The package also reads, draws and edits the pipelines of gosidian (its
ADR-035): a ```` ```pipeline ```` block of YAML with a `trigger` and `nodes`,
each with its type (`use`), its settings (`with`) and the nodes it waits for
(`after`; unset, the node before it).

```vue
<PipelineEditor v-model:source="yaml" :catalog="nodeTypes" :run="run" :problems="serverProblems" />
<PipelineView :source="yaml" :catalog="nodeTypes" :run="run" />
```

- `catalog` is the node types the page's server has, with the JSON Schemas
  of their settings and output (`{type, group, description, input_schema,
  output_schema}`): the package knows no server. A node's settings are a
  form from its schema; `format` in a text says how to edit it (multiline,
  code). The texts offer the `{{ }}` references a node may read: the
  trigger's fields, the run's, and the outputs of the nodes before it.
- On the drawing a node is added from the types, dragged (the first drag
  fixes them all, in `layout:`, which the server ignores), joined to the
  node it waits for, and deleted with its waits handed on. The trigger is
  a node too, and its panel sets its kind and fields: the kinds and folder
  of `ingest` and `in`, the name glob and batch of `in`, the time of
  `schedule`, the folder, glob and pipelines left out (`skip`) of `commit`,
  the ends (`status`) and pipelines of `run`. The menu offers
  `TRIGGER_KINDS`, or the server's own list in `triggerKinds`; a trigger
  that is neither stays in it by its name.
- `run` (`{status, steps: {id: {status, error, output, …}}}`) colours each
  node by how it went, and a node's panel shows its error and output.
- `problems` are the page's (the server's checks of the text as it is);
  the package lists what it reads wrong itself, on its lines.
- `editPipeline(source, ops)` (`addNode`, `connect`, `removeNode`,
  `renameNode`, `setWith`, `setTrigger`, `move`…) keeps what it does not
  touch as written, as `editDiagram` does; `readPipeline`,
  `exprSuggestions` and `pipelineGraph` are the steps.

## API

| Export | |
|---|---|
| `<DiagramView>` | props `source` (the YAML) or `diagram` (already read), `labels` (the component's words, English by default), `maxHeight`; event `link`; `exportSVG()` and `text` through a template ref |
| `parseDiagram(src)` | `{diagram, problems}`: the diagram as far as it reads, and what is wrong in it, each problem on its line |
| `diagramText(d)` | the diagram in words, the drawing's text alternative |
| `diagramLinks(d)` | the links of a diagram |
| `toMermaid(d, opts?)`, `fromMermaid(text)` | a diagram as Mermaid, and Mermaid as a diagram (`{source, warnings}`, async) |
| `toCanvas(d)`, `fromCanvas(json)` | a flow as an Obsidian canvas, and a canvas as a flow |
| `<PipelineEditor>`, `<PipelineView>` | a ```` ```pipeline ```` block edited and drawn, with `catalog`, `run` and `problems` |
| `readPipeline`, `editPipeline`, `exprSuggestions`, `pipelineGraph` | a pipeline read, changed, its references, its graph |
| `diagramToSVG(d, at?)` | any diagram's drawing as an SVG file, without a view (async: Mermaid's kinds load Mermaid) |
| `matrixToSVG(m, palette, measure)` | a matrix's drawing as an SVG file |
| `<DiagramEditor>` | props `source` (`v-model:source`), `labels`, `linkSuggest`, `height`; `undo()`, `redo()` and `exportSVG()` (async) through a template ref |
| `editDiagram(source, ops)` | `{source, changed, ids}`: the YAML with the operations applied, the ids given to what they added |
| `findDiagramBlocks(md)`, `replaceDiagramBlock(md, block, yaml)` | the diagram blocks of a markdown text, and one replaced |
| `writeDiagramBlock`, `findTwin`, `twinText`, `twinHash`, `diagramHash` | a block written with its twin, and the twin's parts |
| `diagramTemplate(kind, words?, today?)`, `readyTemplates(words?, base?, today?)` | diagrams to start from |
| `flowGraph`, `treeGraph`, `layoutGraph`, `flowToSVG` | the steps of a flow's drawing, for a page that draws it itself |

## Theme

Every colour is a CSS variable: `--plancia-diagram-*` when set, else plancia's
core (`--plancia-surface`, `--plancia-text`, `--plancia-text-muted`,
`--plancia-border`, `--plancia-accent`), else a value of its own. Light and dark
follow the page. Mermaid and the SVG export read the same variables, resolved.

## Development

```bash
cd diagrams
npm install
npm run typecheck && npm test && npm run build
npm run dev        # the playground: every example, light and dark
```

`test/fixtures` is a copy of gosidian's `docs/diagrams/examples`, the format's
contract: every valid example reads, every invalid one has the problem its
first line names, and `expected.json` (written by gosidian's Go reader) has the
same problems on the same lines and the same text. A change to the format goes
to both readers.

## License

MIT. Vue Flow, dagre, Mermaid and yaml are MIT or ISC.
