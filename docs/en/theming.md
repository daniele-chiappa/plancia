# Theming

plancia ships plain CSS — no Tailwind, no design-token assumptions. Every visual
knob is a **CSS custom property** with a sane default. Import the stylesheet once,
then override the variables on `:root` (or any ancestor of the plancia) to match
your app.

```ts
import 'plancia/style.css'
```

## CSS variables

```css
:root {
  /* sizing */
  --plancia-w-s: 32rem;          /* 's' window width */
  --plancia-w-m: 44rem;          /* 'm' window width ('full' is always 100%) */
  --plancia-gap: 0.75rem;        /* gap between windows */
  --plancia-padding: 0.75rem;    /* strip padding */
  --plancia-radius: 0.5rem;

  /* colours */
  --plancia-bg: transparent;     /* strip background */
  --plancia-surface: #ffffff;    /* window background */
  --plancia-header-bg: rgba(0,0,0,.03);
  --plancia-footer-bg: rgba(0,0,0,.03);
  --plancia-border: #e2e8f0;
  --plancia-accent: #3b82f6;     /* focused window / hovers */
  --plancia-accent-soft: rgba(59,130,246,.12);
  --plancia-text: #0f172a;
  --plancia-text-muted: #64748b;
  --plancia-danger: #dc2626;     /* close hover / unknown type */
  --plancia-warning: #d97706;    /* dirty marker */
  --plancia-shadow: 0 1px 2px rgba(0,0,0,.06);

  /* header tags */
  --plancia-tag-bg: rgba(100,116,139,.14);
  --plancia-tag-fg: var(--plancia-text-muted);
}
```

### Example: dark-ish theme scoped to your app

```css
.my-app {
  --plancia-surface: #1e293b;
  --plancia-bg: #0f172a;
  --plancia-border: #334155;
  --plancia-text: #e2e8f0;
  --plancia-text-muted: #94a3b8;
  --plancia-accent: #38bdf8;
  --plancia-accent-soft: rgba(56,189,248,.15);
  --plancia-header-bg: rgba(255,255,255,.04);
  --plancia-footer-bg: rgba(255,255,255,.04);
}
```

### Window sizes

`s` and `m` are arbitrary — set them to whatever fits your content. `full` always
means 100% of the strip. On viewports ≤ 768px every window is capped to the
viewport width automatically.

## Class hooks

If variables aren't enough, the markup exposes stable classes you can target:
`.plancia`, `.plancia__strip`, `.plancia__footer`, `.plancia__chip`,
`.plancia-window` (+ `.plancia-window--focused`, `[data-width]`),
`.plancia-window__header`, `.plancia-window__title`, `.plancia-window__body`,
`.plancia-btn` (header icon buttons), `.plancia-tag` (+ `[data-tone]`).

Reuse `.plancia-btn` for buttons you add via the `window-actions` slot so they
match the built-in header buttons.

## Tag tones

Header tags carry their `tone` as a `data-tone` attribute, and you can return an
extra class from the `resolveTone` prop:

```vue
<Plancia :registry="registry" :resolve-tone="(t) => (t ? `tone-${t}` : '')" />
```

```css
.tone-accent { background: rgba(59,130,246,.15); color: #1d4ed8; }
/* or target the attribute directly: */
.plancia-tag[data-tone='warning'] { background: #fef3c7; color: #92400e; }
```

## Labels / i18n

plancia has no i18n dependency. Pass a `labels` object (merged over the English
defaults) to localize every string:

```ts
import type { PlanciaLabels } from 'plancia'

const labels: Partial<PlanciaLabels> = {
  empty: 'Nessuna finestra aperta.',
  openHint: 'Apri una finestra dalla barra laterale.',
  minimizedHint: (n) => `${n} ridotte nel footer ↓`,
  minimizedLabel: 'Ridotte:',
  resize: 'Larghezza',
  minimize: 'Riduci',
  close: 'Chiudi',
  restore: 'Ripristina',
  dirty: 'Modifiche non salvate',
  unsavedClose: 'Modifiche non salvate. Chiudere comunque?',
  openTag: 'Apri',
  unknownType: (type) => `Tipo finestra sconosciuto: ${type}`,
}
```

```vue
<Plancia :registry="registry" :labels="labels" />
```

Full `PlanciaLabels` shape (note the two interpolating functions
`minimizedHint(n)` and `unknownType(type)`):

```ts
interface PlanciaLabels {
  empty: string
  openHint: string
  minimizedHint: (n: number) => string
  minimizedLabel: string
  unknownType: (type: string) => string
  resize: string
  minimize: string
  close: string
  restore: string
  dirty: string
  unsavedClose: string
  openTag: string
}
```

`DEFAULT_LABELS` is exported if you want to build on top of it.
