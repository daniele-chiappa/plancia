<script setup lang="ts">
/**
 * PlanciaConfirm — a confirm dialog built on <PlanciaModal>. message + two
 * buttons; emits `confirm` / `cancel`. Any user dismissal (Esc, backdrop, the
 * header ✕ if titled) counts as `cancel`. Labels are English by default and
 * overridable. No Pinia — for the imperative `await confirm()` flow use the
 * dialog service (useDialogs / <PlanciaDialogHost>).
 */
import PlanciaModal from './PlanciaModal.vue'

const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    message: string
    title?: string
    danger?: boolean
    confirmLabel?: string
    cancelLabel?: string
    /** Hide the cancel button (turns the confirm into an alert/acknowledge). */
    hideCancel?: boolean
    closeOnBackdrop?: boolean
  }>(),
  {
    title: '',
    danger: false,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    hideCancel: false,
    closeOnBackdrop: true,
  },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

// `open = false` here is a SILENT close (no PlanciaModal `close` event), so the
// `@close → onCancel` path does not double-fire after a confirm.
function onConfirm() {
  open.value = false
  emit('confirm')
}
function onCancel() {
  open.value = false
  emit('cancel')
}
</script>

<template>
  <PlanciaModal
    v-model:open="open"
    :title="title"
    :close-on-backdrop="closeOnBackdrop"
    @close="onCancel"
  >
    <p class="plancia-confirm__message">{{ message }}</p>

    <template #footer>
      <button v-if="!hideCancel" type="button" class="plancia-btn-text" @click="onCancel">
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="plancia-btn-text"
        :class="danger ? 'plancia-btn-danger' : 'plancia-btn-primary'"
        @click="onConfirm"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </PlanciaModal>
</template>
