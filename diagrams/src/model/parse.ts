import {
  LineCounter,
  parseAllDocuments,
  isAlias,
  isMap,
  isPair,
  isScalar,
  isSeq,
  type Node as YamlNode,
} from 'yaml'
import {
  DIAGRAM_KINDS,
  DIAGRAM_VERSION,
  DIRECTIONS,
  EDGE_STYLES,
  MAX_BYTES,
  MAX_DEPTH,
  MAX_ITEMS,
  NODE_CLASSES,
  NODE_SHAPES,
  TASK_STATUSES,
  type Diagram,
  type DiagramBranch,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramKind,
  type DiagramNode,
  type DiagramProblem,
  type DiagramSet,
  type Direction,
  type GanttTask,
  type LayoutPoint,
  type MatrixAxis,
  type MatrixItem,
  type MatrixSpec,
  type NodeClass,
  type NodeShape,
  type EdgeStyle,
  type ParseResult,
  type TaskStatus,
} from './types'

// The reader of the diagram format, a port of gosidian's
// internal/diagram/parse.go: the same checks, the same messages, the same
// lines. The examples of gosidian's docs/diagrams/examples are the contract
// of the two readers (test/fixtures holds a copy); a change here goes there
// too, and the other way round.

const idRe = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/
const edgeRe = /^\s*([^\s:>-][^\s>]*?)\s*->\s*([^\s:]+)\s*(?::\s*(.*))?$/
const wikiLinkRe = /\[\[([^\]]+)\]\]/g
const floatRe = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|inf(?:inity)?|nan)$/i
const intRe = /^[+-]?\d+$/
const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A node of the YAML as gosidian's reader sees it (yaml.v3's Node): its
 * kind, its line, its text when it is a scalar, its pairs or items.
 */
interface YNode {
  kind: 'scalar' | 'map' | 'seq' | 'alias'
  line: number
  /** The scalar's text as written (a number stays as typed), '' otherwise. */
  text: string
  /** A scalar whose value is null: empty, ~ or null. */
  isNull: boolean
  pairs: { key: YNode; val: YNode }[]
  items: YNode[]
}

function convert(n: YamlNode | null | undefined, lc: LineCounter, fallbackLine: number): YNode {
  const line = n?.range ? lc.linePos(n.range[0]).line : fallbackLine
  const out: YNode = { kind: 'scalar', line, text: '', isNull: true, pairs: [], items: [] }
  if (!n) return out
  if (isScalar(n)) {
    out.isNull = n.value === null || n.value === undefined
    out.text = typeof n.value === 'string' ? n.value : out.isNull ? (n.source ?? '') : (n.source ?? String(n.value))
    return out
  }
  out.isNull = false
  if (isMap(n)) {
    out.kind = 'map'
    for (const p of n.items) {
      if (!isPair(p)) continue
      const key = convert(p.key as YamlNode | null, lc, line)
      out.pairs.push({ key, val: convert(p.value as YamlNode | null, lc, key.line) })
    }
  } else if (isSeq(n)) {
    out.kind = 'seq'
    for (const it of n.items) out.items.push(convert(it as YamlNode | null, lc, line))
  } else if (isAlias(n)) {
    out.kind = 'alias'
  }
  return out
}

/** Go's %q, for the messages: a double-quoted string. */
function q(s: string): string {
  return JSON.stringify(s)
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length
}

const kindFields: Record<DiagramKind, string[]> = {
  flow: ['direction', 'nodes', 'edges', 'groups'],
  tree: ['direction', 'root', 'children'],
  mindmap: ['root', 'children'],
  fishbone: ['root', 'children'],
  venn: ['sets', 'areas'],
  matrix: ['x', 'y', 'quadrants', 'items', 'rows', 'columns', 'cells'],
  gantt: ['sections', 'tasks'],
}

const branchFields = ['id', 'label', 'link', 'children']

function oneOf<T extends string>(v: string, allowed: readonly T[]): v is T {
  return (allowed as readonly string[]).includes(v)
}

function emptyDiagram(): Diagram {
  return {
    version: DIAGRAM_VERSION,
    kind: 'flow',
    title: '',
    description: '',
    direction: 'TB',
    nodes: [],
    edges: [],
    groups: [],
    sets: [],
    areas: [],
    sections: [],
  }
}

/** A valid calendar date, YYYY-MM-DD; its time, or null. */
function parseDate(s: string): number | null {
  const m = dateRe.exec(s)
  if (!m) return null
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3])
  // setUTCFullYear, not Date.UTC, which reads the years 0 to 99 as 1900 to 1999.
  const back = new Date(0)
  back.setUTCFullYear(y, mo - 1, d)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null
  return back.getTime()
}

class Reader {
  problems: DiagramProblem[] = []
  items = 0
  /** id → line of its first use */
  ids = new Map<string, number>()

  bad(n: YNode | undefined, message: string) {
    this.problems.push({ line: n?.line ?? 0, message })
  }

  /** Adds n items, and says false once the diagram is too large. */
  count(at: YNode | undefined, n: number): boolean {
    this.items += n
    if (this.items > MAX_ITEMS) {
      if (this.items - n <= MAX_ITEMS) this.bad(at, `the diagram has more than ${MAX_ITEMS} elements`)
      return false
    }
    return true
  }

  /** Checks an id and that it is the only one of its name. */
  id(n: YNode, id: string) {
    if (!idRe.test(id)) {
      this.bad(n, `${q(id)} is not an id: a letter, then letters, digits, - and _ (at most 40)`)
      return
    }
    const first = this.ids.get(id)
    if (first !== undefined) {
      this.bad(n, `id ${q(id)} is used twice (first at line ${first})`)
      return
    }
    this.ids.set(id, n.line)
  }

  link(n: YNode | undefined, raw: string): string {
    const link = raw.trim()
    if (link === '' || link.startsWith('http://') || link.startsWith('https://')) return link
    if (link.startsWith('[[') && link.endsWith(']]') && (link.match(wikiLinkRe)?.length ?? 0) === 1) return link
    this.bad(n, `link ${q(link)} is a [[note]] or an http(s) address`)
    return link
  }

  /** Reads the link field of a mapping. */
  linkOf(f: Map<string, YNode>): string {
    return this.link(f.get('link'), this.str(f.get('link'), 'link'))
  }

  /** Reads a mapping whose keys must be in allowed. */
  fields(n: YNode, what: string, ...allowed: string[]): Map<string, YNode> {
    const out = new Map<string, YNode>()
    if (n.kind !== 'map') {
      this.bad(n, `${what} is a mapping (key: value)`)
      return out
    }
    for (const p of n.pairs) {
      const k = p.key.text
      if (!allowed.includes(k)) {
        this.bad(p.key, `${what} has no field ${q(k)} (it has ${allowed.join(', ')})`)
        continue
      }
      out.set(k, p.val)
    }
    return out
  }

  str(n: YNode | undefined, what: string): string {
    if (!n) return ''
    if (n.kind !== 'scalar') {
      this.bad(n, `${what} is a text`)
      return ''
    }
    return n.isNull ? '' : n.text
  }

  num(n: YNode | undefined, what: string): number | null {
    if (!n) return null
    if (n.kind !== 'scalar' || !floatRe.test(n.text)) {
      this.bad(n, `${what} is a number`)
      return null
    }
    const t = n.text.toLowerCase().replace(/^\+/, '')
    if (t.endsWith('inf') || t.endsWith('infinity')) return t.startsWith('-') ? -Infinity : Infinity
    if (t === 'nan') return NaN
    return Number(n.text)
  }

  seq(n: YNode | undefined, what: string): YNode[] {
    if (!n || (n.kind === 'scalar' && n.isNull)) return []
    if (n.kind !== 'seq') {
      this.bad(n, `${what} is a list`)
      return []
    }
    return n.items
  }

  strs(n: YNode | undefined, what: string): string[] {
    return this.seq(n, what).map((e) => this.str(e, `${what} item`))
  }

  direction(d: Diagram, n: YNode | undefined) {
    d.direction = 'TB'
    if (!n) return
    const v = this.str(n, 'direction').toUpperCase()
    if (!oneOf(v, DIRECTIONS)) {
      this.bad(n, `direction ${q(v)} is one of ${DIRECTIONS.join(', ')}`)
      return
    }
    d.direction = v as Direction
  }

  // --- flow ---

  flow(d: Diagram, top: Map<string, YNode>) {
    this.direction(d, top.get('direction'))
    const nodes = this.seq(top.get('nodes'), 'nodes')
    if (nodes.length === 0) this.bad(top.get('nodes'), 'a flow has nodes: [{id, label}, …]')
    if (!this.count(top.get('nodes'), nodes.length)) return
    for (const n of nodes) {
      const node: DiagramNode = { id: '', label: '', shape: 'box', link: '', class: '', line: n.line }
      if (n.kind === 'scalar') {
        node.id = node.label = n.text
      } else {
        const f = this.fields(n, 'a node', 'id', 'label', 'shape', 'link', 'class')
        node.id = this.str(f.get('id'), 'id')
        node.label = this.str(f.get('label'), 'label')
        const s = this.str(f.get('shape'), 'shape')
        if (s !== '') {
          if (!oneOf(s, NODE_SHAPES)) this.bad(f.get('shape'), `shape ${q(s)} is one of ${NODE_SHAPES.join(', ')}`)
          node.shape = s as NodeShape
        }
        const c = this.str(f.get('class'), 'class')
        if (c !== '') {
          if (!oneOf(c, NODE_CLASSES)) this.bad(f.get('class'), `class ${q(c)} is one of ${NODE_CLASSES.join(', ')}`)
          node.class = c as NodeClass
        }
        node.link = this.linkOf(f)
        if (!f.has('id')) {
          this.bad(n, 'a node has an id')
          continue
        }
      }
      this.id(n, node.id)
      if (node.label === '') node.label = node.id
      d.nodes.push(node)
    }
    const groups = this.seq(top.get('groups'), 'groups')
    if (!this.count(top.get('groups'), groups.length)) return
    const inGroup = new Map<string, string>()
    const known = (id: string) => this.ids.has(id)
    for (const n of groups) {
      const f = this.fields(n, 'a group', 'id', 'label', 'nodes')
      const g: DiagramGroup = {
        id: this.str(f.get('id'), 'id'),
        label: this.str(f.get('label'), 'label'),
        nodes: [],
        line: n.line,
      }
      if (!f.has('id')) {
        this.bad(n, 'a group has an id')
        continue
      }
      this.id(n, g.id)
      for (const m of this.strs(f.get('nodes'), "a group's nodes")) {
        if (!known(m)) this.bad(f.get('nodes'), `group ${g.id} holds ${q(m)}, which is no node`)
        else if (inGroup.get(m))
          this.bad(f.get('nodes'), `node ${m} is in groups ${inGroup.get(m)} and ${g.id}: a node is in one group`)
        else inGroup.set(m, g.id)
        g.nodes.push(m)
      }
      d.groups.push(g)
    }
    const edges = this.seq(top.get('edges'), 'edges')
    if (!this.count(top.get('edges'), edges.length)) return
    for (const n of edges) {
      const e: DiagramEdge = { from: '', to: '', label: '', style: 'solid', line: n.line }
      if (n.kind === 'scalar') {
        const m = edgeRe.exec(n.text)
        if (!m) {
          this.bad(n, `edge ${q(n.text)} is "from -> to" or "from -> to: label"`)
          continue
        }
        e.from = m[1]!
        e.to = m[2]!
        e.label = (m[3] ?? '').trim()
      } else {
        const f = this.fields(n, 'an edge', 'from', 'to', 'label', 'style')
        e.from = this.str(f.get('from'), 'from')
        e.to = this.str(f.get('to'), 'to')
        e.label = this.str(f.get('label'), 'label')
        const s = this.str(f.get('style'), 'style')
        if (s !== '') {
          if (!oneOf(s, EDGE_STYLES)) this.bad(f.get('style'), `style ${q(s)} is one of ${EDGE_STYLES.join(', ')}`)
          e.style = s as EdgeStyle
        }
      }
      for (const end of [e.from, e.to]) {
        if (!known(end)) this.bad(n, `the edge ${e.from} -> ${e.to} names ${q(end)}, which is no node or group`)
      }
      d.edges.push(e)
    }
  }

  // --- tree, mind map, fishbone ---

  hierarchy(d: Diagram, root: YNode, top: Map<string, YNode>) {
    if (d.kind === 'tree') this.direction(d, top.get('direction'))
    const rn = top.get('root')
    if (!rn) {
      const what = { tree: 'top', mindmap: 'centre', fishbone: 'effect, the problem' }[d.kind as 'tree']
      this.bad(root, `a ${d.kind} has a root: its ${what}`)
      return
    }
    const b = this.branch(rn, 0)
    if (!b) return
    d.root = b
    const c = top.get('children')
    if (c) b.children.push(...this.children(c, 1))
    if (d.kind === 'fishbone' && b.children.length === 0) {
      this.bad(
        rn,
        'a fishbone has categories under its root (the 6M: methods, machines, materials…), and causes under them',
      )
    }
  }

  branch(n: YNode, depth: number): DiagramBranch | null {
    if (depth > MAX_DEPTH) {
      this.bad(n, `the tree is deeper than ${MAX_DEPTH} levels`)
      return null
    }
    if (!this.count(n, 1)) return null
    const b: DiagramBranch = { id: '', label: '', link: '', children: [], line: n.line }
    if (n.kind === 'scalar') {
      b.label = n.text
    } else if (n.kind === 'map') {
      const full = n.pairs.some((p) => branchFields.includes(p.key.text))
      if (!full && n.pairs.length === 1) {
        // {Label: [children]}
        b.label = n.pairs[0]!.key.text
        b.children = this.children(n.pairs[0]!.val, depth + 1)
      } else {
        const f = this.fields(n, 'a branch', ...branchFields)
        b.label = this.str(f.get('label'), 'label')
        b.link = this.linkOf(f)
        const idn = f.get('id')
        if (idn) {
          b.id = this.str(idn, 'id')
          this.id(idn, b.id)
        }
        b.children = this.children(f.get('children'), depth + 1)
      }
    } else {
      this.bad(n, 'a branch is a text, {label, children} or {Label: [children]}')
      return null
    }
    if (b.label.trim() === '') this.bad(n, 'a branch has a label')
    return b
  }

  children(n: YNode | undefined, depth: number): DiagramBranch[] {
    if (!n || (n.kind === 'scalar' && n.isNull)) return []
    if (n.kind === 'scalar') {
      const b = this.branch(n, depth)
      return b ? [b] : []
    }
    const out: DiagramBranch[] = []
    for (const c of this.seq(n, 'children')) {
      const b = this.branch(c, depth)
      if (b) out.push(b)
    }
    return out
  }

  // --- venn ---

  venn(d: Diagram, root: YNode, top: Map<string, YNode>) {
    const sets = this.seq(top.get('sets'), 'sets')
    if (sets.length < 2 || sets.length > 5) {
      this.bad(top.get('sets') ?? root, `a Venn has 2 to 5 sets, it has ${sets.length}`)
    }
    if (!this.count(top.get('sets'), sets.length)) return
    for (const n of sets) {
      const s: DiagramSet = { id: '', label: '', link: '', line: n.line }
      if (n.kind === 'scalar') {
        s.id = s.label = n.text
      } else {
        const f = this.fields(n, 'a set', 'id', 'label', 'link')
        s.id = this.str(f.get('id'), 'id')
        s.label = this.str(f.get('label'), 'label')
        s.link = this.linkOf(f)
        if (!f.has('id')) {
          this.bad(n, 'a set has an id')
          continue
        }
      }
      this.id(n, s.id)
      if (s.label === '') s.label = s.id
      d.sets.push(s)
    }
    const isSet = new Set(d.sets.map((s) => s.id))
    const areas = this.seq(top.get('areas'), 'areas')
    if (!this.count(top.get('areas'), areas.length)) return
    const seen = new Map<string, number>()
    for (const n of areas) {
      const f = this.fields(n, 'an area', 'sets', 'label', 'size')
      const a = { sets: this.strs(f.get('sets'), "an area's sets"), label: this.str(f.get('label'), 'label'), size: 0, line: n.line }
      if (a.sets.length === 0) this.bad(n, 'an area names its sets: {sets: [a, b], label}')
      const inArea = new Set<string>()
      for (const s of a.sets) {
        if (!isSet.has(s)) this.bad(f.get('sets'), `the area names ${q(s)}, which is no set`)
        else if (inArea.has(s)) this.bad(f.get('sets'), `the area names ${s} twice`)
        inArea.add(s)
      }
      const key = [...a.sets].sort().join('+')
      const first = seen.get(key)
      if (first !== undefined) this.bad(n, `the area of ${a.sets.join(', ')} is there twice (first at line ${first})`)
      seen.set(key, n.line)
      const sn = f.get('size')
      if (sn) {
        const v = this.num(sn, 'size')
        if (v !== null) {
          if (v < 0) this.bad(sn, 'size is not negative')
          a.size = v
        }
      }
      d.areas.push(a)
    }
  }

  // --- matrix ---

  matrix(d: Diagram, root: YNode, top: Map<string, YNode>) {
    const has = (k: string) => top.has(k)
    const quad = has('x') || has('y') || has('quadrants') || has('items')
    const grid = has('rows') || has('columns') || has('cells')
    const m: MatrixSpec = { quadrants: [], items: [], rows: [], columns: [], cells: [] }
    d.matrix = m
    if (quad && grid) {
      this.bad(root, 'a matrix is quadrants (x, y, quadrants, items) or a grid (rows, columns, cells), not both')
      return
    }
    if (!quad && !grid) {
      this.bad(root, 'a matrix has x, y and quadrants, or rows, columns and cells')
      return
    }
    if (grid) {
      m.rows = this.strs(top.get('rows'), 'rows')
      m.columns = this.strs(top.get('columns'), 'columns')
      if (m.rows.length === 0 || m.columns.length === 0) this.bad(root, 'a grid has rows and columns')
      const cells = this.seq(top.get('cells'), 'cells')
      if (cells.length > m.rows.length) this.bad(top.get('cells'), `cells has ${cells.length} rows, the grid ${m.rows.length}`)
      for (const row of cells) {
        const vals = this.strs(row, 'a row of cells')
        if (!this.count(row, vals.length)) return
        if (vals.length > m.columns.length)
          this.bad(row, `the row has ${vals.length} cells, the grid ${m.columns.length} columns`)
        m.cells.push(vals)
      }
      return
    }
    const axis = (n: YNode | undefined, name: string): MatrixAxis | undefined => {
      if (!n) {
        this.bad(root, `a quadrant matrix has ${name}: {label, low, high}`)
        return undefined
      }
      if (n.kind === 'scalar') return { label: n.text, low: '', high: '' }
      const f = this.fields(n, name, 'label', 'low', 'high')
      return {
        label: this.str(f.get('label'), 'label'),
        low: this.str(f.get('low'), 'low'),
        high: this.str(f.get('high'), 'high'),
      }
    }
    m.x = axis(top.get('x'), 'x')
    m.y = axis(top.get('y'), 'y')
    const qn = top.get('quadrants')
    if (qn) {
      m.quadrants = this.strs(qn, 'quadrants')
      if (m.quadrants.length !== 4) {
        this.bad(
          qn,
          `quadrants has 4 labels (top left, top right, bottom left, bottom right), it has ${m.quadrants.length}`,
        )
      }
    }
    const items = this.seq(top.get('items'), 'items')
    if (!this.count(top.get('items'), items.length)) return
    for (const n of items) {
      const f = this.fields(n, 'an item', 'label', 'x', 'y', 'link')
      const it: MatrixItem = { label: this.str(f.get('label'), 'label'), x: 0, y: 0, link: '', line: n.line }
      it.link = this.linkOf(f)
      for (const name of ['x', 'y'] as const) {
        const vn = f.get(name)
        const v = this.num(vn, name)
        if (v === null) {
          if (!vn) this.bad(n, `an item has ${name}, from 0 to 1`)
          continue
        }
        if (v < 0 || v > 1) this.bad(vn, `${name} is from 0 to 1`)
        it[name] = v
      }
      if (it.label === '') this.bad(n, 'an item has a label')
      m.items.push(it)
    }
  }

  // --- gantt ---

  gantt(d: Diagram, root: YNode, top: Map<string, YNode>) {
    if (top.has('sections') && top.has('tasks')) {
      this.bad(root, 'a Gantt has sections, or tasks without sections, not both')
      return
    }
    const tasksAt: (YNode | undefined)[] = []
    const t = top.get('tasks')
    if (t) {
      d.sections = [{ label: '', tasks: [] }]
      tasksAt.push(t)
    } else {
      for (const n of this.seq(top.get('sections'), 'sections')) {
        const f = this.fields(n, 'a section', 'label', 'tasks')
        d.sections.push({ label: this.str(f.get('label'), 'label'), tasks: [] })
        tasksAt.push(f.get('tasks'))
      }
    }
    if (d.sections.length === 0) {
      this.bad(root, 'a Gantt has tasks, or sections with tasks')
      return
    }
    for (let i = 0; i < tasksAt.length; i++) {
      const tn = tasksAt[i]
      const tasks = this.seq(tn, 'tasks')
      if (!this.count(tn, tasks.length)) return
      for (const n of tasks) d.sections[i]!.tasks.push(this.task(n))
    }
    // after names a task that exists, and no chain comes back.
    const byID = new Map<string, GanttTask>()
    for (const s of d.sections) for (const task of s.tasks) if (task.id !== '') byID.set(task.id, task)
    for (const s of d.sections) {
      for (const task of s.tasks) {
        if (task.after === '') continue
        if (!byID.has(task.after)) {
          this.problems.push({ line: task.line, message: `task ${q(task.label)} comes after ${q(task.after)}, which is no task` })
          continue
        }
        const seen = new Set([task.id])
        for (let cur = task.after; cur !== ''; cur = byID.get(cur)?.after ?? '') {
          if (seen.has(cur)) {
            this.problems.push({ line: task.line, message: `task ${q(task.label)} waits for itself through after` })
            break
          }
          seen.add(cur)
        }
      }
    }
  }

  task(n: YNode): GanttTask {
    const f = this.fields(n, 'a task', 'id', 'label', 'link', 'start', 'end', 'after', 'days', 'status')
    const t: GanttTask = {
      id: '',
      label: this.str(f.get('label'), 'label'),
      link: '',
      start: '',
      end: '',
      after: '',
      days: 0,
      status: '',
      line: n.line,
    }
    if (t.label === '') this.bad(n, 'a task has a label')
    const idn = f.get('id')
    if (idn) {
      t.id = this.str(idn, 'id')
      this.id(idn, t.id)
    }
    t.link = this.linkOf(f)
    const s = this.str(f.get('status'), 'status')
    if (s !== '') {
      if (!oneOf(s, TASK_STATUSES)) this.bad(f.get('status'), `status ${q(s)} is one of ${TASK_STATUSES.join(', ')}`)
      t.status = s as TaskStatus
    }
    t.start = this.str(f.get('start'), 'start')
    t.end = this.str(f.get('end'), 'end')
    t.after = this.str(f.get('after'), 'after')
    let start: number | null = null
    if (t.start !== '' && t.after !== '') this.bad(n, 'a task has start or after, not both')
    else if (t.start === '' && t.after === '') this.bad(n, "a task has start (YYYY-MM-DD) or after (a task's id)")
    else if (t.start !== '') {
      start = parseDate(t.start)
      if (start === null) this.bad(f.get('start'), `start ${q(t.start)} is a date, YYYY-MM-DD`)
    }
    const dn = f.get('days')
    if (dn) {
      const v = this.num(dn, 'days')
      if (v !== null && (v < 1 || !Number.isInteger(v))) this.bad(dn, 'days is a whole number of days, at least 1')
      t.days = v === null || !Number.isFinite(v) ? 0 : Math.trunc(v)
    }
    if (t.end !== '' && dn) this.bad(n, 'a task has end or days, not both')
    else if (t.end !== '') {
      const end = parseDate(t.end)
      if (end === null) this.bad(f.get('end'), `end ${q(t.end)} is a date, YYYY-MM-DD`)
      else if (start !== null && end < start) this.bad(f.get('end'), `end ${t.end} comes before start ${t.start}`)
    } else if (t.status !== 'milestone' && !dn) {
      this.bad(n, 'a task has end (YYYY-MM-DD) or days, unless it is a milestone')
    }
    return t
  }

  // --- layout ---

  layout(d: Diagram, n: YNode | undefined) {
    if (!n || (n.kind === 'scalar' && n.isNull)) return
    if (n.kind !== 'map') {
      this.bad(n, 'layout is a mapping: id: {x, y}')
      return
    }
    d.layout = {}
    for (const p of n.pairs) {
      const id = p.key.text
      if (!this.ids.has(id)) {
        this.bad(p.key, `layout places ${q(id)}, which is no id of the diagram`)
        continue
      }
      const f = this.fields(p.val, 'a position', 'x', 'y', 'w', 'h')
      const pt: LayoutPoint = { x: 0, y: 0, w: 0, h: 0 }
      for (const name of ['x', 'y', 'w', 'h'] as const) {
        const vn = f.get(name)
        if (vn) {
          const v = this.num(vn, name)
          if (v !== null) pt[name] = v
        }
      }
      if (!f.has('x') || !f.has('y')) this.bad(p.val, 'a position has x and y')
      d.layout[id] = pt
    }
  }
}

/**
 * Reads a diagram's YAML. The diagram comes back as far as it reads, with
 * what is wrong in it; null when it does not read at all. Lines are 1-based
 * in the YAML given.
 */
export function parseDiagram(src: string): ParseResult {
  const size = utf8Length(src)
  if (size > MAX_BYTES) {
    return { diagram: null, problems: [{ line: 0, message: `the diagram is ${size} bytes, at most ${MAX_BYTES}` }] }
  }
  const lc = new LineCounter()
  const docs = parseAllDocuments(src, { lineCounter: lc, prettyErrors: true })
  const doc = Array.isArray(docs) ? docs[0] : undefined
  const err = doc?.errors[0]
  if (err) {
    const line = err.linePos?.[0]?.line ?? 0
    const msg = err.message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, '')
    return { diagram: null, problems: [{ line, message: `not valid YAML: ${msg}` }] }
  }
  if (!doc || doc.contents === null || doc.contents === undefined) {
    return {
      diagram: null,
      problems: [{ line: 0, message: 'the block is empty: a diagram has kind and its content (docs/diagrams.md)' }],
    }
  }
  const root = convert(doc.contents as YamlNode, lc, 0)
  const r = new Reader()
  if (root.kind !== 'map') {
    r.bad(root, 'a diagram is a mapping: kind, then its content')
    return { diagram: null, problems: r.problems }
  }
  const d = emptyDiagram()
  const top = new Map<string, YNode>()
  for (const p of root.pairs) top.set(p.key.text, p.val)
  const v = top.get('diagram')
  if (v) {
    if (!intRe.test(v.text) || Number(v.text) !== DIAGRAM_VERSION) {
      r.bad(v, `diagram: ${v.text} is a format this server does not read (it reads ${DIAGRAM_VERSION})`)
      return { diagram: null, problems: r.problems }
    }
  }
  const kn = top.get('kind')
  const kind = r.str(kn, 'kind')
  if (!oneOf(kind, DIAGRAM_KINDS)) {
    if (!kn) r.bad(root, `kind is missing: one of ${DIAGRAM_KINDS.join(', ')}`)
    else r.bad(kn, `kind ${q(kind)} is not one of ${DIAGRAM_KINDS.join(', ')}`)
    return { diagram: null, problems: r.problems }
  }
  d.kind = kind
  const allowed = kindFields[kind]
  for (const p of root.pairs) {
    const k = p.key.text
    if (!['diagram', 'kind', 'title', 'description', 'layout'].includes(k) && !allowed.includes(k)) {
      r.bad(p.key, `a ${kind} diagram has no field ${q(k)} (it has ${allowed.join(', ')})`)
    }
  }
  d.title = r.str(top.get('title'), 'title')
  d.description = r.str(top.get('description'), 'description')
  switch (kind) {
    case 'flow':
      r.flow(d, top)
      break
    case 'tree':
    case 'mindmap':
    case 'fishbone':
      r.hierarchy(d, root, top)
      break
    case 'venn':
      r.venn(d, root, top)
      break
    case 'matrix':
      r.matrix(d, root, top)
      break
    case 'gantt':
      r.gantt(d, root, top)
      break
  }
  r.layout(d, top.get('layout'))
  return { diagram: d, problems: r.problems }
}

/** The [[links]] of a diagram, as written, in order. */
export function diagramLinks(d: Diagram | null): string[] {
  if (!d) return []
  const out: string[] = []
  const add = (link: string) => {
    if (link !== '') out.push(link)
  }
  d.nodes.forEach((n) => add(n.link))
  const walk = (b: DiagramBranch | undefined) => {
    if (!b) return
    add(b.link)
    b.children.forEach(walk)
  }
  walk(d.root)
  d.sets.forEach((s) => add(s.link))
  d.matrix?.items.forEach((it) => add(it.link))
  d.sections.forEach((s) => s.tasks.forEach((t) => add(t.link)))
  return out
}
