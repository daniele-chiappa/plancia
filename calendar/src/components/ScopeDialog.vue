<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue'
import type { EditScope } from '../edit/edit'
import type { CalendarLabels } from '../labels'

const props = defineProps<{
  action: 'save' | 'delete' | 'move'
  allowed: Record<EditScope, boolean>
  labels: CalendarLabels
}>()

const emit = defineEmits<{ choose: [scope: EditScope | null] }>()

const order: EditScope[] = ['this', 'following', 'all']
const choice = ref<EditScope>(order.find((s) => props.allowed[s]) ?? 'all')
const box = ref<HTMLElement | null>(null)
const id = `plancia-calendar-scope-${useId()}`

const heading = computed(() =>
  props.action === 'delete' ? props.labels.scopeDelete : props.action === 'move' ? props.labels.scopeMove : props.labels.scopeSave,
)

function why(s: EditScope): string {
  return s === 'this' ? props.labels.scopeNoThis : s === 'following' ? props.labels.scopeNoFollowing : props.labels.scopeNoAll
}

onMounted(() => {
  void nextTick(() => box.value?.querySelector<HTMLInputElement>('input:checked')?.focus())
})

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    emit('choose', null)
  }
}
</script>

<template>
  <div class="plancia-calendar__overlay" @keydown="onKey">
    <div ref="box" class="plancia-calendar__dialog plancia-calendar__dialog--small" role="dialog" aria-modal="true" :aria-labelledby="id">
      <h3 :id="id" class="plancia-calendar__dialog-title">{{ heading }}</h3>
      <fieldset class="plancia-calendar__scopes">
        <legend class="plancia-calendar__alt">{{ heading }}</legend>
        <label v-for="s in order" :key="s" class="plancia-calendar__scope" :class="{ 'plancia-calendar__scope--off': !allowed[s] }">
          <input v-model="choice" type="radio" :name="id" :value="s" :disabled="!allowed[s]" />
          <span>{{ labels.scopes[s] }}</span>
          <small v-if="!allowed[s]">{{ why(s) }}</small>
        </label>
      </fieldset>
      <div class="plancia-calendar__actions">
        <button type="button" class="plancia-calendar__button" @click="emit('choose', null)">{{ labels.cancel }}</button>
        <button
          type="button"
          class="plancia-calendar__button plancia-calendar__button--primary"
          :disabled="!allowed[choice]"
          @click="emit('choose', choice)"
        >
          {{ labels.ok }}
        </button>
      </div>
    </div>
  </div>
</template>
