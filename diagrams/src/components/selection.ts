import type { EdgeRef, BranchPath } from '../edit/edit'

/** What is selected in the flow editor. */
export type FlowSelection = { kind: 'node'; id: string } | { kind: 'group'; id: string } | { kind: 'edge'; edge: EdgeRef } | null

/** The selected branch of the outline editor, by its path. */
export type BranchSelection = BranchPath | null
