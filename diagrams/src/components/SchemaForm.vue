<script setup lang="ts">
import { computed, ref } from 'vue'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import ExprInput from './ExprInput.vue'
import type { ExprSuggestion } from '../pipeline/expr'
import type { JsonSchema } from '../pipeline/types'
import type { PipelineLabels } from '../labels'

// The settings of a pipeline node (its `with`) as a form, from the JSON
// Schema of its type: a text (one line, several, a script) with the {{ }}
// references offered, a choice for an enum, yes or no for a boolean, a
// number that may be a reference too, and YAML for a list or a mapping.
// A setting the schema does not name is shown too, as text. Each change is
// `set(key, value)`, undefined taking the setting away.
const props = defineProps<{
  schema?: JsonSchema
  value: Record<string, unknown>
  suggestions: ExprSuggestion[]
  labels: PipelineLabels
}>()
const emit = defineEmits<{ set: [key: string, value: unknown] }>()

interface Field {
  key: string
  schema: JsonSchema
  required: boolean
  known: boolean
}

const fields = computed<Field[]>(() => {
  const props_ = props.schema?.properties ?? {}
  const req = new Set(props.schema?.required ?? [])
  const out: Field[] = Object.entries(props_).map(([key, schema]) => ({ key, schema, required: req.has(key), known: true }))
  for (const key of Object.keys(props.value)) {
    if (!(key in props_)) out.push({ key, schema: {}, required: false, known: false })
  }
  return out
})

const typeOf = (s: JsonSchema): string => (Array.isArray(s.type) ? (s.type.find((t) => t !== 'null') ?? '') : (s.type ?? ''))

function kind(f: Field): 'enum' | 'boolean' | 'number' | 'text' | 'multiline' | 'code' | 'structured' {
  const s = f.schema
  if (s.enum?.length) return 'enum'
  const t = typeOf(s)
  if (t === 'boolean') return 'boolean'
  if (t === 'integer' || t === 'number') return 'number'
  if (t === 'string' || (!t && !f.known)) {
    if (s.format === 'code') return 'code'
    if (s.format === 'multiline' || (typeof props.value[f.key] === 'string' && String(props.value[f.key]).includes('\n'))) return 'multiline'
    return 'text'
  }
  return 'structured'
}

const asText = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v))

function setText(key: string, v: string) {
  emit('set', key, v === '' ? undefined : v)
}

function setNumber(key: string, v: string, integer: boolean) {
  const t = v.trim()
  if (t === '') return emit('set', key, undefined)
  const n = Number(t)
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t)) emit('set', key, integer ? Math.trunc(n) : n)
  else emit('set', key, t)
}

function setBoolean(key: string, v: string) {
  emit('set', key, v === '' ? undefined : v === 'true' ? true : v === 'false' ? false : v)
}

// A list or a mapping is edited as YAML (JSON is YAML too), read when the field is left.
const structuredText = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : stringifyYaml(v).trimEnd())
const errors = ref<Record<string, string>>({})
function setStructured(key: string, text: string) {
  if (text.trim() === '') {
    errors.value = { ...errors.value, [key]: '' }
    return emit('set', key, undefined)
  }
  try {
    const v: unknown = parseYaml(text)
    errors.value = { ...errors.value, [key]: '' }
    emit('set', key, v)
  } catch (e) {
    errors.value = { ...errors.value, [key]: `${props.labels.invalidValue} ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` }
  }
}

const hint = (f: Field) => [f.schema.description, f.schema.default !== undefined ? `(${JSON.stringify(f.schema.default)})` : ''].filter(Boolean).join(' ')
</script>

<template>
  <div class="pd-schema-form">
    <label v-for="f in fields" :key="f.key" class="pd-schema-form__field" :data-key="f.key">
      <span class="pd-schema-form__name">
        <code>{{ f.key }}</code>
        <em v-if="f.required">{{ labels.required }}</em>
        <em v-if="!f.known">{{ labels.otherSettings }}</em>
      </span>
      <select
        v-if="kind(f) === 'enum'"
        :data-field="`with-${f.key}`"
        :value="asText(value[f.key])"
        @change="setText(f.key, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ labels.none }}</option>
        <option v-for="o in f.schema.enum" :key="String(o)" :value="String(o)">{{ o }}</option>
        <option v-if="value[f.key] !== undefined && !f.schema.enum!.map(String).includes(asText(value[f.key]))" :value="asText(value[f.key])">
          {{ value[f.key] }}
        </option>
      </select>
      <select
        v-else-if="kind(f) === 'boolean'"
        :data-field="`with-${f.key}`"
        :value="asText(value[f.key])"
        @change="setBoolean(f.key, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ labels.none }}</option>
        <option value="true">{{ labels.yes }}</option>
        <option value="false">{{ labels.no }}</option>
      </select>
      <ExprInput
        v-else-if="kind(f) === 'number'"
        :field="`with-${f.key}`"
        :value="asText(value[f.key])"
        :suggestions="suggestions"
        :label="f.key"
        :placeholder="f.schema.default !== undefined ? String(f.schema.default) : ''"
        @commit="(v) => setNumber(f.key, v, typeOf(f.schema) === 'integer')"
      />
      <ExprInput
        v-else-if="kind(f) !== 'structured'"
        :field="`with-${f.key}`"
        :value="asText(value[f.key])"
        :suggestions="suggestions"
        :multiline="kind(f) === 'multiline'"
        :code="kind(f) === 'code'"
        :label="f.key"
        :placeholder="f.schema.default !== undefined ? String(f.schema.default) : ''"
        @input="(v) => setText(f.key, v)"
      />
      <textarea
        v-else
        class="pd-expr__input pd-expr__input--code"
        :data-field="`with-${f.key}`"
        rows="3"
        spellcheck="false"
        :value="structuredText(value[f.key])"
        :placeholder="labels.structured"
        :aria-label="f.key"
        @change="setStructured(f.key, ($event.target as HTMLTextAreaElement).value)"
      />
      <small v-if="errors[f.key]" class="pd-schema-form__error" role="alert">{{ errors[f.key] }}</small>
      <small v-else-if="hint(f)" class="pd-schema-form__hint">{{ hint(f) }}</small>
    </label>
  </div>
</template>
