<script setup lang="ts">
/**
 * PlanciaModal — content-agnostic dialog primitive. Teleports to <body>, opens
 * via `v-model:open`, and ships the a11y you expect (focus trap, Esc, body
 * scroll-lock, focus restore, `role=dialog`/`aria-modal`). Stacking-aware: only
 * the topmost modal handles Esc / traps focus, and the scroll-lock is
 * ref-counted across stacked modals. Themed with `--plancia-dialog-*` CSS
 * variables (no Tailwind); no Pinia. See ADR-002.
 */
import { computed, nextTick, onBeforeUnmount, ref, useId, useSlots, watch } from 'vue'
import '../style.css'
import { isTopModal, popModal, pushModal } from '../dialog/modalStack'
import { DEFAULT_MODAL_LABELS, type ModalLabels, type ModalSlotProps } from '../dialog/types'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    title?: string
    closeOnBackdrop?: boolean
    closeOnEsc?: boolean
    /** CSS selector for the element to focus first (default: first focusable). */
    initialFocus?: string
    ariaLabel?: string
    labels?: Partial<ModalLabels>
  }>(),
  {
    title: '',
    closeOnBackdrop: true,
    closeOnEsc: true,
    initialFocus: '',
    ariaLabel: '',
    labels: undefined,
  },
)

const emit = defineEmits<{ close: [] }>()

const slots = useSlots()
const labels = computed<ModalLabels>(() => ({ ...DEFAULT_MODAL_LABELS, ...props.labels }))
const uid = useId()
const titleId = `plancia-modal-${uid}-title`
const bodyId = `plancia-modal-${uid}-body`

const hasHeader = computed(() => !!(props.title || slots.title))
const ariaLabelledby = computed(() => (hasHeader.value ? titleId : undefined))
const ariaLabelAttr = computed(() => (hasHeader.value ? undefined : props.ariaLabel || undefined))

const panelRef = ref<HTMLElement | null>(null)
let stackId: symbol | null = null
let opener: Element | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function requestClose() {
  open.value = false
  emit('close')
}
function onBackdrop(e: MouseEvent) {
  if (props.closeOnBackdrop && e.target === e.currentTarget) requestClose()
}
function focusInitial() {
  const root = panelRef.value
  if (!root) return
  const el =
    (props.initialFocus && root.querySelector<HTMLElement>(props.initialFocus)) ||
    root.querySelector<HTMLElement>(FOCUSABLE) ||
    root
  el?.focus?.()
}
function trapFocus(e: KeyboardEvent) {
  const root = panelRef.value
  if (!root) return
  const f = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (!f.length) {
    e.preventDefault()
    root.focus?.()
    return
  }
  const first = f[0]!
  const last = f[f.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
function onKeydown(e: KeyboardEvent) {
  if (!stackId || !isTopModal(stackId)) return
  if (e.key === 'Escape' && props.closeOnEsc) {
    e.stopPropagation()
    requestClose()
    return
  }
  if (e.key === 'Tab') trapFocus(e)
}

function activate() {
  if (stackId) return
  opener = typeof document !== 'undefined' ? document.activeElement : null
  stackId = pushModal()
  if (typeof document !== 'undefined') document.addEventListener('keydown', onKeydown, true)
  nextTick(focusInitial)
}
function deactivate() {
  if (!stackId) return
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown, true)
  popModal(stackId)
  stackId = null
  ;(opener as HTMLElement | null)?.focus?.()
  opener = null
}

watch(open, (o) => (o ? activate() : deactivate()), { immediate: true })
onBeforeUnmount(deactivate)

const slotProps = computed<ModalSlotProps>(() => ({ close: requestClose }))
</script>

<template>
  <Teleport to="body">
    <Transition name="plancia-modal">
      <div v-if="open" class="plancia-modal" role="presentation" @mousedown="onBackdrop">
        <div
          ref="panelRef"
          class="plancia-modal__panel"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabelAttr"
          :aria-labelledby="ariaLabelledby"
          :aria-describedby="bodyId"
          tabindex="-1"
        >
          <header v-if="hasHeader" class="plancia-modal__header">
            <h2 :id="titleId" class="plancia-modal__title">
              <slot name="title">{{ title }}</slot>
            </h2>
            <button
              type="button"
              class="plancia-btn plancia-modal__close"
              :title="labels.close"
              :aria-label="labels.close"
              @click="requestClose"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div :id="bodyId" class="plancia-modal__body">
            <slot v-bind="slotProps" />
          </div>

          <footer v-if="$slots.footer" class="plancia-modal__footer">
            <slot name="footer" v-bind="slotProps" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
