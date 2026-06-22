<script setup lang="ts">
/**
 * PlanciaPrompt — a text-input dialog on <PlanciaModal>. Internal to the dialog
 * service (rendered by <PlanciaDialogHost> for `prompt()`); emits `confirm`
 * (the entered string) or `cancel`. Any dismissal counts as cancel.
 */
import { ref } from 'vue'
import PlanciaModal from './PlanciaModal.vue'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    message: string
    title?: string
    value?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
  }>(),
  { title: '', value: '', placeholder: '', confirmLabel: 'OK', cancelLabel: 'Cancel' },
)

const emit = defineEmits<{ confirm: [string]; cancel: [] }>()

const text = ref(props.value)

function onConfirm() {
  open.value = false
  emit('confirm', text.value)
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
    initial-focus=".plancia-prompt__input"
    @close="onCancel"
  >
    <p class="plancia-confirm__message">{{ message }}</p>
    <input
      v-model="text"
      class="plancia-prompt__input"
      type="text"
      :placeholder="placeholder"
      @keydown.enter="onConfirm"
    />

    <template #footer>
      <button type="button" class="plancia-btn-text" @click="onCancel">{{ cancelLabel }}</button>
      <button type="button" class="plancia-btn-text plancia-btn-primary" @click="onConfirm">
        {{ confirmLabel }}
      </button>
    </template>
  </PlanciaModal>
</template>
