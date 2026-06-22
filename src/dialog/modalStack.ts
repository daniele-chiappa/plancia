/**
 * Module-level coordination for stacked modals:
 * - a **ref-counted body scroll-lock** (locked on the first open modal, restored
 *   on the last), so N stacked dialogs share a single lock;
 * - **top detection**, so only the topmost modal handles Esc / traps focus.
 *
 * Non-reactive on purpose: this is cross-instance bookkeeping, not UI state.
 */
const stack: symbol[] = []
let savedOverflow: string | null = null

function hasDoc(): boolean {
  return typeof document !== 'undefined'
}

/** Register a newly-opened modal; returns its stack id. Locks scroll on the first. */
export function pushModal(): symbol {
  const id = Symbol('plancia-modal')
  stack.push(id)
  if (hasDoc() && stack.length === 1) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  return id
}

/** Unregister a modal; restores scroll when the last one closes. */
export function popModal(id: symbol): void {
  const i = stack.lastIndexOf(id)
  if (i >= 0) stack.splice(i, 1)
  if (hasDoc() && stack.length === 0 && savedOverflow !== null) {
    document.body.style.overflow = savedOverflow
    savedOverflow = null
  }
}

/** Whether `id` is the topmost (most-recently-opened) modal. */
export function isTopModal(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id
}
