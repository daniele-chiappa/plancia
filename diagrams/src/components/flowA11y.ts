import { nextTick, onMounted, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { FlowA11yLabels } from '../labels'

/**
 * Puts the labels' words in the hidden help Vue Flow points its nodes and
 * edges to, which it writes in English and has no option for. Its own
 * help names the arrow keys, which do nothing here: these components keep
 * their own selection (elements-selectable is off).
 */
export function useFlowA11y(flowId: string, labels: () => FlowA11yLabels): void {
  const { onNodesInitialized } = useVueFlow(flowId)

  function describe() {
    const l = labels()
    for (const [id, text] of [
      [`vue-flow__node-desc-${flowId}`, l.nodeHelp],
      [`vue-flow__edge-desc-${flowId}`, l.edgeHelp],
    ] as const) {
      const el = document.getElementById(id)
      if (el && el.textContent !== text) el.textContent = text
    }
  }
  onMounted(() => void nextTick(describe))
  onNodesInitialized(describe)
  watch(() => [labels().nodeHelp, labels().edgeHelp], describe, { flush: 'post' })
}

/** What a screen reader says a node or a link is: its name and what it is called. */
export function named(name: string, role: string) {
  return { ariaLabel: name, domAttributes: { 'aria-roledescription': role } }
}

/**
 * A node or a link the keyboard reaches, named. Vue Flow writes tabIndex,
 * which an SVG element does not read: a link took no focus, so the
 * attribute is written as SVG reads it too.
 */
export function reachable(name: string, role: string) {
  return { focusable: true, ariaLabel: name, domAttributes: { 'aria-roledescription': role, tabindex: 0 } }
}

/** A node the keyboard does not reach: nothing to call it or to say about it. */
export const unreachable = {
  focusable: false,
  domAttributes: { 'aria-roledescription': undefined, 'aria-describedby': undefined },
}

/**
 * The node or the link an Enter or a Space was pressed on: Vue Flow
 * selects from the keyboard only what it selects itself, so a click was
 * the only way to select one here.
 */
export function pressedOn(e: KeyboardEvent): { kind: 'node' | 'edge'; id: string } | null {
  if (e.key !== 'Enter' && e.key !== ' ') return null
  const el = e.target instanceof Element ? e.target : null
  const kind = el?.classList.contains('vue-flow__node') ? 'node' : el?.classList.contains('vue-flow__edge') ? 'edge' : null
  const id = el?.getAttribute('data-id')
  if (!kind || !id) return null
  e.preventDefault()
  return { kind, id }
}
