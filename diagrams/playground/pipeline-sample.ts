import type { NodeTypeInfo, RunState } from '../src'

// A pipeline, the node types a gosidian server would list, and a run: the
// playground's ?pipeline page.

export const PIPELINE = `# Converts each document that arrives, and files a note for it.
trigger: {on: ingest, kinds: [pdf, docx], folder: inbox}
nodes:
  - id: convert
    use: docling.convert
    with:
      file: "{{ trigger.file }}"
      ocr: true
  - id: summary
    use: llm.chat
    with:
      prompt: |
        Summarise in three sentences:

        {{ convert.markdown }}
  - id: file
    use: note.write
    with:
      path: "archive/{{ trigger.stem }}"
      body: |
        {{ summary.text }}

        {{ convert.markdown }}
`

const llmOut = {
  type: 'object',
  properties: { text: { type: 'string', description: 'The answer' }, json: { description: 'The answer read as JSON' }, model: { type: 'string' } },
}

export const CATALOG: NodeTypeInfo[] = [
  {
    type: 'note.read',
    group: 'base',
    description: 'Reads a note of the project',
    input_schema: { type: 'object', required: ['path'], properties: { path: { type: 'string', format: 'path' } } },
    output_schema: { type: 'object', properties: { path: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } } },
  },
  {
    type: 'note.write',
    group: 'base',
    description: 'Writes a note of the project',
    input_schema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', format: 'path', description: 'The note, inside the project' },
        title: { type: 'string' },
        body: { type: 'string', format: 'multiline' },
        frontmatter: { type: 'object', description: 'Fields of the frontmatter' },
        mode: { type: 'string', enum: ['upsert', 'create', 'replace'], default: 'upsert' },
      },
    },
    output_schema: { type: 'object', properties: { path: { type: 'string' }, etag: { type: 'string' }, created: { type: 'boolean' } } },
  },
  {
    type: 'starlark',
    group: 'base',
    description: 'Runs a short script that sets output',
    input_schema: { type: 'object', required: ['code'], properties: { code: { type: 'string', format: 'code' }, input: {} } },
  },
  {
    type: 'llm.chat',
    group: 'base',
    description: 'Asks a language model',
    input_schema: {
      type: 'object',
      required: ['prompt'],
      properties: { prompt: { type: 'string', format: 'multiline' }, system: { type: 'string', format: 'multiline' }, max_tokens: { type: 'integer', default: 1024 }, json: { type: 'boolean' } },
    },
    output_schema: llmOut,
  },
  { type: 'wait.call', group: 'base', description: 'Waits for a service to resume the run', input_schema: { type: 'object', properties: { timeout: { type: 'string', format: 'duration', default: '24h' } } } },
  {
    type: 'docling.convert',
    group: 'docling',
    status: 'ok',
    description: 'A document to markdown',
    files: ['file'],
    input_schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', description: 'The document, a vault path' },
        ocr: { type: 'boolean', default: true },
        max_pages: { type: 'integer' },
      },
    },
    output_schema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'The document' },
        pages: { type: 'integer' },
        files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' } } } },
      },
    },
  },
]

export const RUN: RunState = {
  id: 'r1',
  status: 'running',
  steps: {
    convert: { status: 'done', started: '2026-10-11T10:00:00Z', finished: '2026-10-11T10:00:42Z', output: { markdown: '# Report\n\nThe text.', pages: 3 } },
    summary: { status: 'failed', attempt: 2, error: 'the LLM did not answer in 5m', started: '2026-10-11T10:00:42Z', finished: '2026-10-11T10:05:42Z' },
    file: { status: 'canceled' },
  },
}
