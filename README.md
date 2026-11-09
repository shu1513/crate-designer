# Crate Designer

A local web app that designs a wooden shipping crate, with shape-fitted wooden cradles, for one or more copies of a machined part given as a GLB model. It produces a cut list, a fastener list, and numbered build steps with drawings that a shop-floor box builder can follow.

The design document is [`SPEC.md`](SPEC.md).

## Launch

Requires Node.js 23.6 or newer (the service runs TypeScript directly and uses Node's built-in SQLite).

```sh
npm install
npm start
```

Then open http://localhost:8787. Everything runs on your machine; no internet connection is needed after `npm install`.

## Develop

```sh
npm run dev      # web app with live reload on :5173, service on :8787
npm run check    # typecheck + tests + production build
```

## Layout

- `src/core/` pure design rules (no browser or Node APIs), run inside a Web Worker
- `src/worker/` the worker and its client
- `src/ui/` React screens and print styles
- `server/` the local Node service: serves the built app and the records API
- `tests/` Vitest unit tests, named after the spec requirement they prove
- `samples/`, `logs/` local-only folders (see their READMEs)
