# Crate Designer

By Shu Yang, for the Hadrian FDE builder interview, November 2026.

**Working version: https://crate-designer.crate-designer.workers.dev** (no sign-in; drop a `.glb` from `samples/synthetic/`). Source: https://github.com/shu1513/crate-designer.

A local web app that designs a wooden shipping crate, with straight-cut wooden cradles fitted to the part, for one or more copies of a machined part given as a GLB model. It produces a cut list, a fastener list, and numbered build steps with drawings that a shop-floor box builder can follow. No AI runs inside the app; every rule is deterministic and written down in [`SPEC.md`](SPEC.md). For a two-page plain-English explanation of how it works and why, see [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md); for every number and rule with its source (standard, Hadrian practice, or my own pick), see [`DESIGN-BASIS.md`](DESIGN-BASIS.md).

## Try it online

A live copy runs at **https://crate-designer.crate-designer.workers.dev** (Cloudflare static hosting). Everything works there except record keeping: the online copy has no record service, so designs are not saved and there is no Past designs section; a one-line notice says so. The samples to drop on it are in `samples/synthetic/` here. For the full app with records, launch it locally as below. Redeploy with `npm run deploy` (needs `npx wrangler login` once).

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

1. Drop a `.glb` file on the left panel (or click **Choose files**), together with the shop's `parts.json` if you have it. The part's size appears. The app guesses the file's unit from its size and the up axis from the program that wrote it, or takes both from `parts.json`. If the part looks wrong, open **Only if the part looks wrong** and change **The file's numbers are in** (the sample files are in meters) or **Which way is up in the file** (the samples are Z up; most other glTF exports are Y up).
2. Type the **quantity** going in the crate and the **weight of one part** (both prefilled when `parts.json` knows the part).
3. Press **Design crate**. The 3D view shows the crate with the parts inside; the right panel shows the overview, pieces to cut, cradle boards (one drawing and pocket table each), screws, and the build steps with a drawing per step. The design is saved with an ID like `CR-20261109-001`.
4. Press **Print the build package** for the paper: overview, pieces to cut, screws, cradle board drawings with pocket tables, then the steps two to a page (the pocket-cutting steps repeat the board drawing beside the action), with the design ID on every sheet.
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
| `samples/synthetic/` (14 made-up shapes, see its README) | | | L-bracket, bosses, Y-up and inch files, a tiny pin (E10), a heavy block (E5) |

Toggle **mm / in** on any of these, print one, then open **Past designs** and reopen it.

## Develop

```sh
npm run dev      # web app with live reload on :5173 (API proxied), service on :8787
npm run check    # typecheck + tests + production build
npm test         # tests only
```

## Layout

- `src/core/` pure design rules (no browser or Node APIs), run inside a Web Worker. Entry point: `design.ts` → `designFromPart`.
  - `glb.ts` reads the model, `part.ts` scales and measures it, `orientation.ts` and `layout.ts` place the copies, `tier.ts` picks the structure, `restraint.ts` finds the cradle stations and pockets, `crate.ts` lists every piece with its position, `fasteners.ts` counts screws, `steps.ts` writes the one-action build steps, `drawings.ts` draws them, `checks.ts` holds the geometry checks (piece overlap, part-to-wood intersection) that every design runs on itself and the tests run on every fixture.
- `src/worker/` the worker and its client
- `src/ui/` React screens, print styles, records client
- `server/` the local Node service: serves the built app, keeps records in SQLite, answers `/api/*`
- `tests/` Vitest unit tests, named after the spec requirement they prove (`T-R8`, `T-R17`, ...)
- `samples/`, `logs/` local-only folders (see their READMEs)

## Limits (by design, see SPEC.md section 6)

Binary glTF 2.0 only, uncompressed, up to 500,000 triangles. One part type per crate, single layer. Net load up to 1800 kg. Straight saw cuts only; curved saddles are not produced. Designs whose GLB is over 20 MB still work and print but are not saved to Past designs (the screen says so); a records export file must stay under 256 MB to import.
