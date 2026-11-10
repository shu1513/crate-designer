# Crate Designer

A local web app that designs a wooden shipping crate, with straight-cut wooden cradles fitted to the part, for one or more copies of a machined part given as a GLB model. It produces a cut list, a fastener list, and numbered build steps with drawings that a shop-floor box builder can follow. No AI runs inside the app; every rule is deterministic and written down in [`SPEC.md`](SPEC.md).

## Launch

Requires Node.js 23.6 or newer (the service runs TypeScript directly and uses Node's built-in SQLite).

```sh
npm install
npm start
```

Then open http://localhost:8787. Everything runs on your machine. No internet connection is needed after `npm install`.

The first start creates `data/crate-designer.sqlite`, where every design is saved. The path is printed at startup; back it up by copying the file, or use History → Export.

Options: `PORT=9000 npm start` changes the port; `DB_PATH=/some/where.sqlite npm start` moves the database.

## Use it

1. Drop a `.glb` file on the left panel (or click Choose file). The part's size appears. If it looks wrong, change **Model units** (the sample files are in meters) or **Up axis** (the samples are Z up; most glTF exports are Y up).
2. Type the **quantity** going in the crate and the **weight of one part**.
3. Press **Design crate**. The 3D view shows the crate with the parts inside; the right panel shows the overview, pieces to cut, screws, and the build steps with a drawing per step. The design is saved with an ID like `CR-20261109-001`.
4. Press **Print the build package** for the paper: overview, pieces to cut, screws, cradle board drawings with pocket tables, then the steps two to a page, with the design ID on every sheet.
5. **mm / in** switches every number on screen and on paper.
6. **Past designs** (the section under the current design on the right) lists saved designs, filters by part file or date, reopens or reprints any of them exactly as saved, and exports or imports the whole set as one JSON file. While a saved design is open, each step has a *Report a problem* link that records a note against that step.

## Demo script

With the three sample parts in `samples/` (see `samples/README.md`):

| Part | Quantity | Weight | What to look at |
|---|---|---|---|
| PART-002 long steel shaft | 1 | 27 kg | Cradle boards land on the two collars; skids because the crate is over 1524 mm; outer 1632 × 336 × 414 mm |
| PART-001 machined steel bracket | 8 | 21.5 kg | 2 × 4 layout, shared end stop between rows, tier T2 |
| PART-003 aluminum housing | 4 | 11.8 kg | Part turned 90° so the long side runs along the crate; three skids because the crate is wider than 914 mm |
| any `.txt` renamed to `.glb` | | | Exact E1 message, no design |
| PART-002 | 100 | 27 kg | E5: over 1800 kg, refused |
| PART-001 | 1 | 21.5 kg, with "The file's numbers are in" set to millimeters | E2: says what the part would measure and that the file is probably in meters |

Toggle **mm / in** on any of these, print one, then open **History** and reopen it.

## Develop

```sh
npm run dev      # web app with live reload on :5173 (API proxied), service on :8787
npm run check    # typecheck + tests + production build
npm test         # tests only
```

## Layout

- `src/core/` pure design rules (no browser or Node APIs), run inside a Web Worker. Entry point: `design.ts` → `designFromPart`.
  - `glb.ts` reads the model, `part.ts` scales and measures it, `orientation.ts` and `layout.ts` place the copies, `tier.ts` picks the structure, `restraint.ts` finds the cradle stations and pockets, `crate.ts` lists every piece with its position, `fasteners.ts` counts screws, `steps.ts` writes the one-action build steps, `drawings.ts` draws them, `checks.ts` proves nothing overlaps.
- `src/worker/` the worker and its client
- `src/ui/` React screens, print styles, records client
- `server/` the local Node service: serves the built app, keeps records in SQLite, answers `/api/*`
- `tests/` Vitest unit tests, named after the spec requirement they prove (`T-R8`, `T-R17`, ...)
- `samples/`, `logs/` local-only folders (see their READMEs)

## Limits (by design, see SPEC.md section 6)

Binary glTF 2.0 only, uncompressed, up to 500,000 triangles. One part type per crate, single layer. Net load up to 1800 kg. Straight saw cuts only; curved saddles are not produced.
