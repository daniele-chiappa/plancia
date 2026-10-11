import type { LayoutPoint } from '../model/types'

/**
 * A pipeline of gosidian (ADR-035): a ```pipeline block of YAML with a
 * trigger and nodes, each with its type (`use`), its settings (`with`) and
 * the nodes it waits for (`after`; unset, the node before it). The server
 * runs it; this package reads, draws and edits it, and keeps the positions
 * an editor sets in `layout:`, which the server ignores.
 */

export type TriggerKind = 'manual' | 'external' | 'ingest' | 'schedule' | 'in'
export const TRIGGER_KINDS: readonly TriggerKind[] = ['manual', 'external', 'ingest', 'schedule', 'in']

export interface PipelineTrigger {
  on: string
  /** ingest, in: the file extensions it takes. */
  kinds: string[]
  /** ingest: the folder of the note a document comes with; in: a folder of the IN folder. */
  folder: string
  /** schedule: "monday 09:00". */
  every: string
  /** in: a glob on the file name. */
  match: string
  /** in: one run per batch of files, instead of one per file. */
  batch: boolean
}

export interface PipelineRetry {
  attempts?: number
  backoff?: string
}

export interface PipelineNode {
  id: string
  use: string
  with: Record<string, unknown>
  /** The nodes it waits for, as the server reads them: the node before it when `after` is unset. */
  after: string[]
  /** Whether `after` is written, or comes from the order. */
  afterWritten: boolean
  when: string
  unless: string
  each: string
  retry?: PipelineRetry
  timeout: string
  onError: string
  /** The line of the YAML it starts on (1-based). */
  line: number
}

export interface Pipeline {
  trigger: PipelineTrigger
  nodes: PipelineNode[]
  layout?: Record<string, LayoutPoint>
  /** Nodes written as a list ([{id, use}]) or as a map ({id: {use}}). */
  form: 'list' | 'map'
}

export interface PipelineProblem {
  line: number
  message: string
}

/** A JSON Schema, as far as the forms read it. */
export interface JsonSchema {
  type?: string | string[]
  title?: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  default?: unknown
  /** multiline, code, path, attachment, duration: how to edit a text. */
  format?: string
}

/** A node type the pipelines may use, with the schemas of its settings and output. */
export interface NodeTypeInfo {
  type: string
  /** "base", or the plugin it comes from. */
  group: string
  description?: string
  /** A plugin's: ok, unaccepted, changed, down, unknown. */
  status?: string
  /** The settings that name a file of the project. */
  files?: string[]
  input_schema?: JsonSchema
  output_schema?: JsonSchema
}

export type StepStatus = 'pending' | 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped' | 'canceled'

/** How a node went in a run. */
export interface StepState {
  status: StepStatus
  attempt?: number
  error?: string
  output?: unknown
  outputTruncated?: boolean
  started?: string
  finished?: string
  waitUntil?: string
}

/** A run of the pipeline, its steps by node id. */
export interface RunState {
  id?: string
  status: StepStatus
  error?: string
  steps: Record<string, StepState>
}

/** The id a trigger has in layout: and on the drawing; no node may have it. */
export const TRIGGER_ID = 'trigger'
