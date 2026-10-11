import type { Diagram, DiagramBranch, Direction, EdgeStyle, NodeClass, NodeShape } from '../model/types'

/**
 * A diagram drawn as boxes and arrows: a flow as it is, a tree as its
 * branches joined to their parents. Both are laid out by dagre and drawn by
 * the same components, so they look the same and export the same.
 */
export interface GraphNode {
  id: string
  label: string
  shape: NodeShape
  cls: NodeClass | ''
  link: string
  /** The group the node is in, '' when none. */
  group: string
  /** How deep in a tree (the root is 0); 0 in a flow. */
  depth: number
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  label: string
  style: EdgeStyle
  /** Among the edges with the same ends, this one's order (0 first): how an edit names it. */
  nth: number
}

export interface GraphGroup {
  id: string
  label: string
  nodes: string[]
}

export interface Graph {
  direction: Direction
  nodes: GraphNode[]
  edges: GraphEdge[]
  groups: GraphGroup[]
  /** Siblings keep the order they are written in (a tree); a flow's order is the layout's. */
  ordered?: boolean
}

/**
 * The graph of a flow. What the reader found wrong is left out rather than
 * drawn wrong: a second node of an id, an edge to no node or group, a
 * group's member that is no node or already in a group.
 */
export function flowGraph(d: Diagram): Graph {
  const nodes: GraphNode[] = []
  const seen = new Set<string>()
  for (const n of d.nodes) {
    if (n.id === '' || seen.has(n.id)) continue
    seen.add(n.id)
    nodes.push({ id: n.id, label: n.label, shape: n.shape, cls: n.class, link: n.link, group: '', depth: 0 })
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const groups: GraphGroup[] = []
  for (const g of d.groups) {
    if (g.id === '' || seen.has(g.id)) continue
    seen.add(g.id)
    const members = g.nodes.filter((m) => byId.get(m)?.group === '')
    for (const m of members) byId.get(m)!.group = g.id
    groups.push({ id: g.id, label: g.label, nodes: members })
  }
  const edges: GraphEdge[] = []
  const ends = new Map<string, number>()
  d.edges.forEach((e, i) => {
    const key = `${e.from}\u0000${e.to}`
    const nth = ends.get(key) ?? 0
    ends.set(key, nth + 1)
    if (seen.has(e.from) && seen.has(e.to)) {
      edges.push({ id: `e${i}`, from: e.from, to: e.to, label: e.label, style: e.style, nth })
    }
  })
  return { direction: d.direction, nodes, edges, groups }
}

/**
 * The graph of a tree: one node per branch, an edge from each branch to its
 * children. A branch without an id gets one that no id of the format can be
 * (they start with a letter).
 */
export function treeGraph(d: Diagram): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const used = new Set<string>()
  let seq = 0
  const walk = (b: DiagramBranch, depth: number, parent: string) => {
    let id = b.id
    if (id === '' || used.has(id)) id = `_${seq++}`
    used.add(id)
    nodes.push({
      id,
      label: b.label,
      shape: depth === 0 ? 'pill' : 'box',
      cls: '',
      link: b.link,
      group: '',
      depth,
    })
    if (parent !== '') edges.push({ id: `e${edges.length}`, from: parent, to: id, label: '', style: 'solid', nth: 0 })
    for (const c of b.children) walk(c, depth + 1, id)
  }
  if (d.root) walk(d.root, 0, '')
  return { direction: d.direction, nodes, edges, groups: [], ordered: true }
}
