import { LineCounter, parseDocument, isMap, isScalar, isSeq, type Node as YamlNode, type YAMLMap } from 'yaml'
import type { LayoutPoint } from '../model/types'
import { TRIGGER_ID, type Pipeline, type PipelineNode, type PipelineProblem } from './types'

// A ```pipeline block read for its drawing and its editor: the trigger, the
// nodes with their after (the node before when it is unset, as the server
// reads it), the layout. The checks are those a drawing needs, each on its
// line: the server's (types, references, cycles) come from the consumer,
// which asks the server (gosidian's POST /api/v1/pipeline-check).

const idRe = /^[a-z][a-z0-9_]*$/
const RESERVED = ['trigger', 'run', 'item', 'index']

export interface PipelineReadResult {
  /** The pipeline as far as it reads; null when it does not read at all. */
  pipeline: Pipeline | null
  problems: PipelineProblem[]
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v.trim() : String(v))

/** Reads the YAML of a ```pipeline block. */
export function readPipeline(source: string): PipelineReadResult {
  const lc = new LineCounter()
  const doc = parseDocument(source, { lineCounter: lc, prettyErrors: false })
  const problems: PipelineProblem[] = []
  const lineOf = (n: unknown): number => {
    const r = (n as YamlNode | undefined)?.range
    return r ? lc.linePos(r[0]).line : 0
  }
  if (doc.errors.length) {
    const e = doc.errors[0]!
    return { pipeline: null, problems: [{ line: e.linePos?.[0]?.line ?? 0, message: `not valid YAML: ${e.message.split('\n')[0]}` }] }
  }
  const root = doc.contents
  if (!isMap(root)) {
    return { pipeline: null, problems: [{ line: lineOf(root), message: 'a pipeline is a mapping: trigger, then nodes' }] }
  }
  const t = root.get('trigger', true)
  const trig = (isMap(t) ? (t.toJSON() as Record<string, unknown>) : {}) ?? {}
  const kinds = Array.isArray(trig.kinds) ? trig.kinds.map(str).filter(Boolean) : []
  const pipeline: Pipeline = {
    trigger: {
      on: str(trig.on) || 'manual',
      kinds,
      folder: str(trig.folder),
      every: str(trig.every),
      match: str(trig.match),
      batch: trig.batch === true,
    },
    nodes: [],
    form: 'list',
  }
  const nodesNode = root.get('nodes', true)
  const raw: { id: string; map: YAMLMap | null; at: unknown }[] = []
  if (isSeq(nodesNode)) {
    for (const it of nodesNode.items) {
      raw.push({ id: isMap(it) ? str(it.get('id')) : '', map: isMap(it) ? it : null, at: it })
    }
  } else if (isMap(nodesNode)) {
    pipeline.form = 'map'
    for (const p of nodesNode.items) {
      const v = p.value
      raw.push({ id: str(isScalar(p.key) ? p.key.value : p.key), map: isMap(v) ? v : null, at: p.key })
    }
  } else if (nodesNode !== undefined && nodesNode !== null) {
    problems.push({ line: lineOf(nodesNode), message: 'nodes is a list of nodes, or a map from id to node' })
  }
  if (raw.length === 0) problems.push({ line: lineOf(nodesNode ?? root), message: 'the pipeline has no nodes' })

  const seen = new Set<string>()
  raw.forEach((r, i) => {
    const line = lineOf(r.at)
    const label = r.id || `#${i + 1}`
    if (!r.map) {
      problems.push({ line, message: `node ${label}: a node is a mapping with id and use` })
      return
    }
    const o = r.map.toJSON() as Record<string, unknown>
    if (!idRe.test(r.id)) problems.push({ line, message: `node ${label}: the id is lowercase letters, digits and _, starting with a letter` })
    else if (RESERVED.includes(r.id)) problems.push({ line, message: `node ${label}: "${r.id}" is a reserved name` })
    else if (seen.has(r.id)) problems.push({ line, message: `node ${label}: the id is used twice` })
    seen.add(r.id)
    if (!str(o.use)) problems.push({ line, message: `node ${label}: use names the node type` })
    const written = r.map.has('after')
    const after = written
      ? Array.isArray(o.after)
        ? o.after.map(str).filter(Boolean)
        : str(o.after)
          ? [str(o.after)]
          : []
      : i > 0
        ? [raw[i - 1]!.id]
        : []
    const retry = o.retry && typeof o.retry === 'object' ? (o.retry as Record<string, unknown>) : undefined
    const node: PipelineNode = {
      id: r.id,
      use: str(o.use),
      with: o.with && typeof o.with === 'object' && !Array.isArray(o.with) ? (o.with as Record<string, unknown>) : {},
      after,
      afterWritten: written,
      when: str(o.when),
      unless: str(o.unless),
      each: str(o.each),
      retry: retry ? { attempts: typeof retry.attempts === 'number' ? retry.attempts : undefined, backoff: retry.backoff ? str(retry.backoff) : undefined } : undefined,
      timeout: str(o.timeout),
      onError: str(o.on_error),
      line,
    }
    pipeline.nodes.push(node)
  })
  const ids = new Set(pipeline.nodes.map((n) => n.id))
  for (const n of pipeline.nodes) {
    for (const a of n.after) {
      if (!ids.has(a)) problems.push({ line: n.line, message: `node ${n.id}: after names "${a}", which is not a node` })
      else if (a === n.id) problems.push({ line: n.line, message: `node ${n.id}: it cannot come after itself` })
    }
  }

  const lay = root.get('layout', true)
  if (isMap(lay)) {
    pipeline.layout = {}
    for (const p of lay.items) {
      const id = str(isScalar(p.key) ? p.key.value : p.key)
      const v = isMap(p.value) ? (p.value.toJSON() as Record<string, unknown>) : null
      if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') continue
      if (id !== TRIGGER_ID && !ids.has(id)) continue
      const pt: LayoutPoint = { x: v.x, y: v.y, w: typeof v.w === 'number' ? v.w : 0, h: typeof v.h === 'number' ? v.h : 0 }
      pipeline.layout[id] = pt
    }
  }
  return { pipeline, problems }
}

/** The nodes that run before a node: what it waits for, and what those wait for. */
export function ancestors(p: Pipeline, id: string): Set<string> {
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const out = new Set<string>()
  const walk = (x: string) => {
    for (const a of byId.get(x)?.after ?? []) {
      if (out.has(a)) continue
      out.add(a)
      walk(a)
    }
  }
  walk(id)
  out.delete(id)
  return out
}
