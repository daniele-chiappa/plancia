import type { DiagramKind } from './model/types'

/** The words of the templates; a consumer passes its own language. */
export interface TemplateWords {
  start: string
  step: string
  end: string
  root: string
  branch: string
  leaf: string
  effect: string
  /** The six categories of a fishbone (the 6M). */
  categories: [string, string, string, string, string, string]
  cause: string
  sets: [string, string]
  both: string
  x: string
  y: string
  low: string
  high: string
  /** Top left, top right, bottom left, bottom right. */
  quadrants: [string, string, string, string]
  task: string
}

export const DEFAULT_TEMPLATE_WORDS: TemplateWords = {
  start: 'Start',
  step: 'Step',
  end: 'End',
  root: 'Topic',
  branch: 'Branch',
  leaf: 'Leaf',
  effect: 'The effect',
  categories: ['Methods', 'Machines', 'Materials', 'Manpower', 'Measurement', 'Environment'],
  cause: 'A cause',
  sets: ['A', 'B'],
  both: 'Both',
  x: 'Urgency',
  y: 'Importance',
  low: 'Low',
  high: 'High',
  quadrants: ['Plan', 'Do now', 'Drop', 'Delegate'],
  task: 'A task',
}

/** YAML-safe in a flow collection: quoted when plain text would not read. */
const q = (s: string) => (/^[\p{L}\p{N} _.'-]+$/u.test(s) && !/^[-.]/.test(s) ? s : JSON.stringify(s))

/**
 * A small diagram of a kind to start from: valid, in the short forms an
 * agent would write. `today` (YYYY-MM-DD) dates a Gantt's first task.
 */
export function diagramTemplate(kind: DiagramKind, words: Partial<TemplateWords> = {}, today = new Date().toISOString().slice(0, 10)): string {
  const w = { ...DEFAULT_TEMPLATE_WORDS, ...words }
  switch (kind) {
    case 'flow':
      return `kind: flow\ndirection: TB\nnodes:\n  - {id: start, label: ${q(w.start)}, shape: pill}\n  - {id: step, label: ${q(w.step)}}\n  - {id: end, label: ${q(w.end)}, shape: pill}\nedges:\n  - "start -> step"\n  - "step -> end"\n`
    case 'tree':
    case 'mindmap':
      return `kind: ${kind}\nroot: ${q(w.root)}\nchildren:\n  - ${q(w.branch)}: [${q(w.leaf)}]\n`
    case 'fishbone':
      return `kind: fishbone\nroot: ${q(w.effect)}\nchildren:\n${w.categories.map((c) => `  - ${q(c)}: [${q(w.cause)}]\n`).join('')}`
    case 'venn':
      return `kind: venn\nsets: [${q(w.sets[0])}, ${q(w.sets[1])}]\nareas:\n  - {sets: [${q(w.sets[0])}, ${q(w.sets[1])}], label: ${q(w.both)}}\n`
    case 'matrix':
      return `kind: matrix\nx: {label: ${q(w.x)}, low: ${q(w.low)}, high: ${q(w.high)}}\ny: {label: ${q(w.y)}, low: ${q(w.low)}, high: ${q(w.high)}}\nquadrants: [${w.quadrants.map(q).join(', ')}]\nitems: []\n`
    case 'gantt':
      return `kind: gantt\ntasks:\n  - {id: t1, label: ${q(w.task)}, start: ${today}, days: 1}\n`
  }
}
