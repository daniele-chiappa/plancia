# plancia

Componente **tiling window-manager in stile [niri](https://github.com/YaLTeR/niri)** (finestre affiancate, scrolling orizzontale, larghezza a step, minimizzazione a footer) per **Vue 3**, distribuito come libreria riusabile.

Astratto da due implementazioni parallele già in produzione su questo server:

- **gosidian** — `src/web/src/components/plancia/` + `stores/windows.ts`
- **products-dc** — `frontend/src/admin/` (`components/windows/`, `stores/windows.ts`)

Obiettivo: una sola sorgente di verità content-agnostic (lo store + la chrome non sanno *cosa* contengono le finestre: lo decide un `registry` tipo→componente passato dall'app ospite).

## Stack

Vue 3.5 · TypeScript · Pinia (peer dep) · Vite (build in library mode).

## Stato

Libreria funzionante: store + `Plancia`/`WindowFrame` + `usePlanciaSync`, build ESM + `.d.ts`, test verdi. Pre-go-live (repo ancora privato; le dipendenze sono già state verificate compatibili con gosidian e products-dc).

## Documentazione

Guida d'uso (in inglese): **[`docs/en/`](docs/en/README.md)** — getting started, concetti, componenti, store, sync URL, theming, recipes.

## Sviluppo

```bash
npm install
npm run dev        # playground in src/playground/
npm run build      # bundle ESM + .d.ts in dist/
npm run typecheck
npm test
```

## Uso (target)

```ts
import { Plancia, useWindowsStore } from 'plancia'
import 'plancia/style.css'
```

> Nota: `CLAUDE.md` (istruzioni agent) **non** è versionato di proposito.
