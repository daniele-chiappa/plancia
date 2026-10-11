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

/** The words of the ready templates; a consumer passes its own language. */
export interface ReadyTemplateWords {
  start: string
  collect: string
  complete: string
  yes: string
  no: string
  process: string
  ask: string
  end: string
  user: string
  webUi: string
  api: string
  database: string
  service: string
  server: string
  board: string
  admin: string
  accounts: string
  people: string
  production: string
  teamA: string
  teamB: string
  sales: string
  idea: string
  goals: string
  resources: string
  risks: string
  nextSteps: string
  setA: string
  setB: string
  setC: string
  all: string
  effort: string
  impact: string
  /** Top left, top right, bottom left, bottom right: much impact for little effort, ... */
  effortQuadrants: [string, string, string, string]
  internal: string
  external: string
  helpful: string
  harmful: string
  swot: [string, string, string, string]
  analysis: string
  requirements: string
  development: string
  build: string
  test: string
  launch: string
  golive: string
}

export const DEFAULT_READY_WORDS: ReadyTemplateWords = {
  start: 'Start',
  collect: 'Collect the data',
  complete: 'Complete?',
  yes: 'yes',
  no: 'no',
  process: 'Process',
  ask: 'Ask for what is missing',
  end: 'End',
  user: 'User',
  webUi: 'Web UI',
  api: 'API',
  database: 'Database',
  service: 'Outside service',
  server: 'Server',
  board: 'Board',
  admin: 'Administration',
  accounts: 'Accounts',
  people: 'People',
  production: 'Production',
  teamA: 'Team A',
  teamB: 'Team B',
  sales: 'Sales',
  idea: 'The idea',
  goals: 'Goals',
  resources: 'Resources',
  risks: 'Risks',
  nextSteps: 'Next steps',
  setA: 'A',
  setB: 'B',
  setC: 'C',
  all: 'All three',
  effort: 'Effort',
  impact: 'Impact',
  effortQuadrants: ['Quick wins', 'Big projects', 'Fill-ins', 'Not worth it'],
  internal: 'Internal',
  external: 'External',
  helpful: 'Helpful',
  harmful: 'Harmful',
  swot: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'],
  analysis: 'Analysis',
  requirements: 'Requirements',
  development: 'Development',
  build: 'Build',
  test: 'Test',
  launch: 'Launch',
  golive: 'Go live',
}

/** A ready template: what it is, its kind and its YAML. */
export interface ReadyTemplate {
  id: 'process' | 'architecture' | 'org' | 'brainstorm' | 'sixm' | 'three-sets' | 'eisenhower' | 'impact-effort' | 'swot' | 'project'
  kind: DiagramKind
  source: string
}

/** The kind of each ready template, in their order. */
export const READY_TEMPLATE_KINDS: Record<ReadyTemplate['id'], DiagramKind> = {
  process: 'flow',
  architecture: 'flow',
  org: 'tree',
  brainstorm: 'mindmap',
  sixm: 'fishbone',
  'three-sets': 'venn',
  eisenhower: 'matrix',
  'impact-effort': 'matrix',
  swot: 'matrix',
  project: 'gantt',
}

/**
 * Diagrams to start from, a few for each kind, in the words given (the
 * template words of diagramTemplate too, for the 6M and the Eisenhower).
 * All valid; `today` (YYYY-MM-DD) starts the project's first task.
 */
export function readyTemplates(
  words: Partial<ReadyTemplateWords> = {},
  base: Partial<TemplateWords> = {},
  today = new Date().toISOString().slice(0, 10),
): ReadyTemplate[] {
  const w = { ...DEFAULT_READY_WORDS, ...words }
  const t = { ...DEFAULT_TEMPLATE_WORDS, ...base }
  const [qw, bp, fi, nw] = w.effortQuadrants.map(q)
  const [st, we, op, th] = w.swot.map(q)
  const source: Record<ReadyTemplate['id'], string> = {
    process:
      `kind: flow\ndirection: TB\nnodes:\n  - {id: start, label: ${q(w.start)}, shape: pill}\n  - {id: collect, label: ${q(w.collect)}}\n` +
      `  - {id: check, label: ${q(w.complete)}, shape: decision}\n  - {id: process, label: ${q(w.process)}}\n  - {id: ask, label: ${q(w.ask)}, class: user}\n` +
      `  - {id: done, label: ${q(w.end)}, shape: pill}\nedges:\n  - "start -> collect"\n  - "collect -> check"\n  - "check -> process: ${w.yes.replace(/"/g, "'")}"\n` +
      `  - "check -> ask: ${w.no.replace(/"/g, "'")}"\n  - "ask -> collect"\n  - "process -> done"\n`,
    architecture:
      `kind: flow\ndirection: LR\nnodes:\n  - {id: user, label: ${q(w.user)}, shape: pill, class: user}\n  - {id: web, label: ${q(w.webUi)}}\n` +
      `  - {id: api, label: ${q(w.api)}}\n  - {id: db, label: ${q(w.database)}, shape: db, class: data}\n  - {id: ext, label: ${q(w.service)}, class: ext}\n` +
      `edges:\n  - "user -> web"\n  - "web -> api"\n  - "api -> db"\n  - {from: api, to: ext, style: dashed}\ngroups:\n  - {id: server, label: ${q(w.server)}, nodes: [api, db]}\n`,
    org:
      `kind: tree\nroot: ${q(w.board)}\nchildren:\n  - ${q(w.admin)}: [${q(w.accounts)}, ${q(w.people)}]\n` +
      `  - ${q(w.production)}: [${q(w.teamA)}, ${q(w.teamB)}]\n  - ${q(w.sales)}\n`,
    brainstorm: `kind: mindmap\nroot: ${q(w.idea)}\nchildren: [${[w.goals, w.resources, w.risks, w.nextSteps].map(q).join(', ')}]\n`,
    sixm: diagramTemplate('fishbone', base),
    'three-sets':
      `kind: venn\nsets:\n  - {id: a, label: ${q(w.setA)}}\n  - {id: b, label: ${q(w.setB)}}\n  - {id: c, label: ${q(w.setC)}}\n` +
      `areas:\n  - {sets: [a, b, c], label: ${q(w.all)}}\n`,
    eisenhower:
      `kind: matrix\nx: {label: ${q(t.x)}, low: ${q(t.low)}, high: ${q(t.high)}}\ny: {label: ${q(t.y)}, low: ${q(t.low)}, high: ${q(t.high)}}\n` +
      `quadrants: [${t.quadrants.map(q).join(', ')}]\nitems: []\n`,
    'impact-effort':
      `kind: matrix\nx: {label: ${q(w.effort)}, low: ${q(t.low)}, high: ${q(t.high)}}\ny: {label: ${q(w.impact)}, low: ${q(t.low)}, high: ${q(t.high)}}\n` +
      `quadrants: [${qw}, ${bp}, ${fi}, ${nw}]\nitems: []\n`,
    swot:
      `kind: matrix\ntitle: SWOT\nrows: [${q(w.internal)}, ${q(w.external)}]\ncolumns: [${q(w.helpful)}, ${q(w.harmful)}]\n` +
      `cells:\n  - [${st}, ${we}]\n  - [${op}, ${th}]\n`,
    project:
      `kind: gantt\nsections:\n  - label: ${q(w.analysis)}\n    tasks:\n      - {id: req, label: ${q(w.requirements)}, start: ${today}, days: 3}\n` +
      `  - label: ${q(w.development)}\n    tasks:\n      - {id: build, label: ${q(w.build)}, after: req, days: 10}\n      - {id: test, label: ${q(w.test)}, after: build, days: 5}\n` +
      `  - label: ${q(w.launch)}\n    tasks:\n      - {id: live, label: ${q(w.golive)}, after: test, status: milestone}\n`,
  }
  return (Object.keys(READY_TEMPLATE_KINDS) as ReadyTemplate['id'][]).map((id) => ({ id, kind: READY_TEMPLATE_KINDS[id], source: source[id] }))
}
