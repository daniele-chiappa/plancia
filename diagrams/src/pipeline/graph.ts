import type { Graph, GraphEdge, GraphNode } from '../layout/graph'
import { TRIGGER_ID, type Pipeline } from './types'

/**
 * A pipeline as a graph for the layout: the trigger first, then each node,
 * an edge from each node it waits for, and from the trigger to each node
 * that starts at once (after: [], or the first). A node's label is its id
 * over its type, which sizes its box.
 */
export function pipelineGraph(p: Pipeline): Graph {
  const nodes: GraphNode[] = [
    { id: TRIGGER_ID, label: `${TRIGGER_ID}\n${p.trigger.on}`, shape: 'pill', cls: '', link: '', group: '', depth: 0 },
  ]
  const ids = new Set<string>()
  for (const n of p.nodes) {
    if (!n.id || ids.has(n.id) || n.id === TRIGGER_ID) continue
    ids.add(n.id)
    nodes.push({ id: n.id, label: `${n.id}\n${n.use || '?'}`, shape: 'box', cls: '', link: '', group: '', depth: 1 })
  }
  const edges: GraphEdge[] = []
  const edge = (from: string, to: string) =>
    edges.push({ id: `${from}->${to}`, from, to, label: '', style: 'solid', nth: 0 })
  for (const n of p.nodes) {
    if (!ids.has(n.id)) continue
    const after = n.after.filter((a) => ids.has(a) && a !== n.id)
    if (after.length === 0) edge(TRIGGER_ID, n.id)
    for (const a of after) edge(a, n.id)
  }
  return { direction: 'TB', nodes, edges, groups: [] }
}
