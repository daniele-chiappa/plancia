# Configurator (dev tool)

A small visual editor for `PlanciaConfig` — appearance + behavior — with a live
preview. **Not** part of the published package; it lives in `tools/configurator/`
and runs in a container.

```bash
docker compose up configurator     # → http://172.16.0.80:5181
# or locally:
npx vite --config tools/configurator/vite.config.ts
```

## What it does

- **Appearance knobs are auto-derived** from `src/style.css`: every `--plancia-*`
  variable becomes a control (a color picker for colors, a text field for the
  rest), grouped by family. Add a variable to the stylesheet and it appears
  automatically — no list to maintain. Derived tokens (`color-mix()` / `var()`)
  are hidden, since they follow the core.
- **Behavior knobs** come from `tools/configurator/behaviorManifest.ts` (sidebar
  `mode` / `defaultState` / `responsive`, dialog `closeOnEsc` / `closeOnBackdrop`,
  default window width).
- **Live preview**: real components inside `<PlanciaConfigProvider>` re-theme as
  you edit.
- **Presets**: load/save under `plancia.config/presets/`, set as `current.json`,
  or copy the JSON. The files are plain JSON — hand-edit them too.

## How it's wired

A Vite dev-server middleware exposes a tiny file API over `plancia.config/`
(`/api/manifest`, `/api/presets[/:name]`, `/api/current`). The appearance
auto-derivation uses the library's exported `parseThemeManifest(css)`.

See **[Config](./config.md)** for the runtime that consumes these files.
