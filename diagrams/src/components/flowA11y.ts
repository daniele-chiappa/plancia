import { nextTick, onMounted, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { FlowA11yLabels } from '../labels'

/**
 * Puts the labels' words in the hidden help Vue Flow points its nodes and
 * edges to, which it writes in English and has no option for. Its own
 * help names Enter and the arrow keys, which do nothing here: these
 * components select with a click (elements-selectable is off).
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
