/**
 * Public types for the modal/dialog family. Kept separate from the window-manager
 * and sidebar types; re-exported from the library barrel (`src/index.ts`).
 */

/** UI strings for <PlanciaModal>. Injectable via the `labels` prop. */
export interface ModalLabels {
  close: string
}

export const DEFAULT_MODAL_LABELS: ModalLabels = {
  close: 'Close',
}

/** Scoped-slot payload passed to <PlanciaModal> slots. */
export interface ModalSlotProps {
  /** Request close (drives `v-model:open` + emits `close`). */
  close: () => void
}

/** Options for the imperative confirm()/alert(). */
export interface ConfirmOptions {
  message: string
  title?: string
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

/** Options for the imperative prompt(). */
export interface PromptOptions extends ConfirmOptions {
  /** Initial input value. */
  value?: string
  placeholder?: string
}

/** A queued dialog request held (serializably) in the store. The Promise
 *  resolver lives outside the store (module-level Map), keyed by `id`. */
export interface DialogRequest {
  id: number
  kind: 'confirm' | 'alert' | 'prompt'
  options: ConfirmOptions | PromptOptions
}
