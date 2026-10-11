# plancia-diagrams

> Diagrams for Vue 3 from a YAML source: flows and trees drawn with
> [Vue Flow](https://vueflow.dev) and [dagre](https://github.com/dagrejs/dagre),
> mind maps and fishbones with [Mermaid](https://mermaid.js.org), each with its
> text alternative and an SVG export.

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
npm install https://github.com/daniele-chiappa/plancia/releases/download/diagrams-v0.1.0/plancia-diagrams-0.1.0.tgz
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
| `venn`, `matrix`, `gantt` | not yet: their text is shown | read and checked already |

`layout:` (optional) places ids where an editor put them: `id: {x, y, w, h}`,
`x` and `y` being the top left corner in px. Without it the drawing lays itself
out.

`src/model/diagram.schema.json` is the JSON Schema of the format as written,
short forms included (`diagramSchema` in the package). The reader checks what a
schema cannot: ids used once, edges to nodes that exist, a Gantt's dates.

## API

| Export | |
|---|---|
| `<DiagramView>` | props `source` (the YAML) or `diagram` (already read), `labels` (the component's words, English by default), `maxHeight`; event `link`; `exportSVG()` and `text` through a template ref |
| `parseDiagram(src)` | `{diagram, problems}`: the diagram as far as it reads, and what is wrong in it, each problem on its line |
| `diagramText(d)` | the diagram in words, the drawing's text alternative |
| `diagramLinks(d)` | the links of a diagram |
| `toMermaid(d)` | Mermaid source of a mind map or a fishbone |
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
