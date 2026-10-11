import { ancestors } from './read'
import type { JsonSchema, NodeTypeInfo, Pipeline } from './types'

// What a node's expressions may read (docs/pipelines.md of gosidian):
// trigger, run, the outputs of the nodes that run before it, and item and
// index inside an each. Offered as {{ name.field }} by the editor's text
// fields, from the output schemas of the node types.

export interface ExprSuggestion {
  /** What goes between {{ and }}: describe.text, trigger.file. */
  ref: string
  detail: string
}

/** The fields trigger holds, by the trigger's kind. */
const TRIGGER_FIELDS: Record<string, [string, string][]> = {
  ingest: [
    ['file', 'the attachment that arrived'],
    ['name', 'its file name'],
    ['stem', 'its name without the extension'],
    ['ext', 'its extension'],
    ['folder', 'the folder it arrived in'],
    ['note', 'the note made with it'],
    ['project', 'its project'],
  ],
  schedule: [['slot', 'the time slot of the run']],
  // A file of the project's IN folder (gosidian IMP-172), one run each.
  in: [
    ['file', 'the file, its vault path'],
    ['name', 'its file name'],
    ['stem', 'its name without the extension'],
    ['ext', 'its extension'],
    ['dir', 'its folder, in the IN folder'],
    ['size', 'its size, in bytes'],
    ['sha256', 'its SHA-256'],
    ['source', 'where it came from'],
    ['project', 'its project'],
  ],
  // A batch of files of the IN folder, one run for all (batch: true).
  'in:batch': [
    ['batch', 'the batch: in.list reads its files with batch'],
    ['dir', 'its folder, in the IN folder'],
    ['count', 'how many files'],
    ['bytes', 'their size, in bytes'],
    ['files', 'the files, when they fit in the input'],
    ['files.0.file', 'a file, its vault path'],
    ['files.0.name', 'a file\'s name'],
    ['files_listed', 'whether files holds them all'],
    ['project', 'its project'],
  ],
}

const RUN_FIELDS: [string, string][] = [
  ['id', 'the run'],
  ['pipeline', 'the pipeline note'],
  ['project', 'the project'],
  ['resume_url', 'where a service resumes a waiting step'],
  ['resume_key', 'the key in resume_url'],
]

/** The fields of a schema, two levels down, as paths. */
function fields(s: JsonSchema | undefined, prefix: string, depth = 2): ExprSuggestion[] {
  if (!s || depth === 0) return []
  const out: ExprSuggestion[] = []
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    const path = `${prefix}.${k}`
    out.push({ ref: path, detail: v.description ?? (Array.isArray(v.type) ? v.type.join(' | ') : (v.type ?? '')) })
    if (v.properties) out.push(...fields(v, path, depth - 1))
    if (v.items?.properties) out.push(...fields(v.items, `${path}.0`, depth - 1))
  }
  return out
}

/**
 * The references a node's expressions may use: the trigger's fields (its
 * input for a manual or external one), the run's, those of the output of
 * each node that runs before it, and item and index with an each.
 */
export function exprSuggestions(p: Pipeline, nodeId: string, catalog: NodeTypeInfo[] = []): ExprSuggestion[] {
  const out: ExprSuggestion[] = []
  const tf = TRIGGER_FIELDS[p.trigger.on === 'in' && p.trigger.batch ? 'in:batch' : p.trigger.on]
  if (tf) for (const [k, d] of tf) out.push({ ref: `trigger.${k}`, detail: d })
  else out.push({ ref: 'trigger', detail: 'the input the run was started with' })
  for (const [k, d] of RUN_FIELDS) out.push({ ref: `run.${k}`, detail: d })
  const node = p.nodes.find((n) => n.id === nodeId)
  if (node?.each) {
    out.push({ ref: 'item', detail: 'the element of each' }, { ref: 'index', detail: 'its place in the list, from 0' })
  }
  const before = ancestors(p, nodeId)
  const types = new Map(catalog.map((t) => [t.type, t]))
  for (const n of p.nodes) {
    if (!before.has(n.id)) continue
    const t = types.get(n.use)
    out.push({ ref: n.id, detail: `the output of ${n.use}` })
    out.push(...fields(t?.output_schema, n.id))
  }
  return out
}

/** The {{ … }} being typed just before the cursor, or null: what to complete, and where it starts. */
export function exprAt(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor)
  const m = /\{\{\s*([\w.]*)$/.exec(before)
  if (!m) return null
  return { query: m[1]!, start: cursor - m[1]!.length }
}

/** The text with the reference ref put in place of the one typed at the cursor, and the cursor after it. */
export function completeExpr(text: string, cursor: number, ref: string): { text: string; cursor: number } {
  const at = exprAt(text, cursor)
  if (!at) return { text, cursor }
  const rest = text.slice(cursor)
  const closed = /^[\w.]*\s*\}\}/.exec(rest)
  const tail = closed ? rest.slice(closed[0].length) : rest
  const head = text.slice(0, at.start)
  const pad = /\{\{$/.test(head) ? ' ' : ''
  const insert = `${pad}${ref} }}`
  return { text: head + insert + tail, cursor: head.length + insert.length }
}
