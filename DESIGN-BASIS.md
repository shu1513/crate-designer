# Design basis: every rule, its value, and where it came from

One line per rule the app applies. "Status" says how much weight the source carries:
**standard** = taken from a published crate standard; **Hadrian** = from the interviewer's answers or the photos of Hadrian's own crates; **pick** = my own choice from general practice, reasoned below and needing Hadrian's sign-off.
The documents were read in full during the spec phase (see the Claude Code transcripts in `logs/`; the Codex research passes are recorded as decisions D29 and D32 in `SPEC.md`). Section numbers refer to those documents.

## Clearances and restraint

| Rule | Value | Source | Status |
|---|---|---|---|
| Gap between part and pocket wall, each side, each end, and above | 3 mm | Rigid-board cavity practice (foam-insert and wooden-saddle vendors): about 1/16 in (1.6 mm) per side around the item's maximum outline. 3 mm adds a hand-cutting allowance (A9, ±2 mm). No wood-crate standard gives a pocket clearance. | pick |
| Gap under the part | 0 (seated) | The part rests on the pocket floor so gravity does not use up the clearance (Codex research pass, D29). | pick |
| Solid wood between pockets and at board ends; part to side skin | 50 mm | USDA Wood Crate Design Manual, Agriculture Handbook 252, §5.1: 1 to 3 in (25 to 75 mm) between item and frame. Middle of that range. | standard |
| Floor to lowest point of part; highest point to lid | 25 mm each | Handbook 252 §5.1, low end of the 1 to 3 in range. | standard |
| Stations along the part | 2 or more, 20 to 80 % of the length, never more than 600 mm apart | ASTM D6256 limits floor joists to 24 in (610 mm); ASTM D6039 limits cleats to 36 in (914 mm). 600 mm is the stricter one rounded down. The 20 to 80 % band keeps stations off end bosses and flanges (the housing sample showed this). | standard (spacing), pick (band) |
| Station search | ±10 % of the length, widest seat wins, seat required on both board faces | Codex research pass on pocket failure modes (D29, D32): a board straddling a step, or resting on something only in the sampling margin, is a false seat. | pick |
| Pocket shape | Rectangular, straight cuts, to the slice's extremes | Hadrian's photos (2026-11-09): straight-cut blocks flat under the part and upright beside it, not curved saddles (D31). | Hadrian |
| Free travel with the lid closed | 6 mm sideways, 6 mm lengthwise, 3 mm up | Follows from the 3 mm gaps; stated as a design value, not a certified guarantee (R10). | pick |
| Shim threshold | 6 mm | Two gaps' worth (2 × 3 mm): a gap this large means a cut is off by the whole allowance (R12). | pick |
| Felt lining | ≤ 1 mm | Two linings (floor and lid) must stay under the 3 mm top clearance. | pick |

## Structure

| Rule | Value | Source | Status |
|---|---|---|---|
| Load limit | 1800 kg net, refuse above | ASTM D6039 §1.1 covers crates to 4000 lb (1814 kg) net. | standard |
| Tiers by net load | ≤ 45, ≤ 200, ≤ 500, ≤ 1800 kg | The break points are my picks to give four plywood thicknesses a sensible range each; the stock in each tier follows the rows below. | pick |
| Plywood thickness | 10, 12, 15, 18 mm by tier | ASTM D6256 §6.1.2: plywood never thinner than 3/8 in (9.5 mm). The steps up are standard sheet thicknesses. | standard (minimum), pick (steps) |
| Cleat stock | 1x3, 1x4, 2x4, 2x4 by tier | ASTM D6256 Table 3: 1x4 members to 36 in widths, 2x4 to 60 in. 1x3 for the lightest tier is my pick. | standard, pick (1x3) |
| Promote one tier when the cavity is wider than 1200 mm | 1200 mm | ASTM D6256 Table 3 moves from 1x4 to 2x4 members between 36 and 60 in; 1200 mm (47 in) sits in that band. | pick, anchored to standard |
| Skids required | gross ≥ 91 kg or any outer size ≥ 1524 mm | Lockheed Martin Space packaging standard P-52 §3.1.4: skids at 200 lb or 60 in. | standard |
| Two or three skids | three when the crate is wider than 914 mm | ASTM D6256 §6.2 and Handbook 252 §6.1.1: three skids when the outer skids would be more than 36 in apart. | standard |
| Skid stock | 2x4, 2x4, 2x6, 4x4 by tier | Standard lumber sizes, stepping up with load. | pick |
| Joists under the floor | one every 600 mm | ASTM D6256: joists no more than 24 in apart. | standard |
| Crate style | cleated plywood panels, skin inside, cleats outside, built flat on a bench | Hadrian's photos (D19): this is what Hadrian builds today. | Hadrian |
| Base inside the skins, walls hang down over it | | Hadrian's photos; also avoids a 90 mm screw no tier carries (D33). | Hadrian |
| Lid screwed down, no hinges | | Interviewer confirmed a screwed lid is fine; hinges are excluded hardware (D20). | Hadrian |
| Wood and screws only, no metal brackets or straps | | The brief and the interviewer (D2). | Hadrian |
| Single layer, nothing stacked on a part | | Interviewer; precision parts carry no load (D18, D24). | Hadrian |

## Fasteners

| Rule | Value | Source | Status |
|---|---|---|---|
| Skin-to-cleat screws | every 100 mm (4 in) on centres | ASTM D6039 §7.1.10: plywood-to-cleat fasteners no more than 4 in apart. | standard |
| Two staggered rows on wide cleats | cleats 82 mm or wider, rows at least 44 mm apart, 19 mm from any edge | ASTM D6039 §7.1.10: staggered rows at least 1¾ in apart and ¾ in from the cleat edge; 19 + 44 + 19 = 82 mm is the narrowest cleat that allows two such rows. | standard |
| Screw length | at least 25 mm, never longer than the two pieces joined; t + c − 3 mm rounded down to a stock length | ASTM D6039 §7.1.2 (nail length at least 1 in and not more than the combined thickness), applied to screws. | standard |
| Screws, not nails | | Interviewer (D20): reopenable, one tool, mistakes removable. | Hadrian |
| Floor-panel and skid screws | every 300 mm | Handbook 252: sheathing nails about 10 in apart on 1-in frames; 300 mm (12 in) rounded to a tape-friendly number. | standard, rounded |
| Board screws | one per solid web, three per end stop, never under a pocket | Follows from the geometry: a web is the only full-height wood. | pick |
| Pilot holes into end grain and cleat edges | 3 mm bit | Cold read of the printout (T-R18b): #10 × 75 mm into a 19 mm cleat edge splits it without one. | pick |
| Counts rounded up to the next 10 | | So the builder has spares. | pick |

## Materials and weights

| Rule | Value | Source | Status |
|---|---|---|---|
| Wood weight | plywood 600 kg/m³, lumber 500 kg/m³ | Typical densities for softwood plywood and construction lumber; reported, never used to choose a tier (D21). | pick |
| Gross weight | parts + wood | Used only for the skid decision. | pick |

## Reading the part and placing it

| Rule | Value | Source | Status |
|---|---|---|---|
| Which way is up in a `.glb` | Y up unless the file was written by trimesh (then Z up), or `parts.json` says | The glTF 2.0 specification defines Y as up; Hadrian's `parts.json` and its trimesh-written files are Z up. | standard (glTF), Hadrian (parts.json) |
| Which unit the file is in | 0.03 to 20 → metres, 30 to 20000 → millimetres, 20 to 30 → inches, or `parts.json` says | Machined parts are between about 30 mm and 20 m, so the raw size usually settles it; the 20 to 30 band is ambiguous and inches is the likelier reading there. The user can override. | pick |
| Lay a tall part on its side | when height > 1.5 × the larger footprint side | A shaft modelled standing up should ship lying down; 1.5 keeps upright parts upright (D22). | pick |
| Right-angle turns only | | So the builder can picture every pose; no centre-of-mass or convex-hull orientation search (declined in D29). | pick |
| Grid layout | one layer, rows along the length, the squarest crate wins | Smallest longest side means the least awkward crate to move; ties broken by area, then fewer rows. | pick |
| Minimum cavity side | 2 × cleat width + 100 mm | So every short cleat is at least one screw pitch long and its two screws keep their edge distance (whole-repository audit, D36). | pick |

## Instructions and drawings

| Rule | Value | Source | Status |
|---|---|---|---|
| One action per step, verb first, at most 20 words | | ASD-STE100 (Simplified Technical English): procedural sentences of 20 words or fewer, one instruction per sentence. | standard |
| One drawing per step, same viewpoint, new pieces highlighted, pieces in place greyed, a turn arrow on every flip | | Agrawala et al., "Designing Effective Step-by-Step Assembly Instructions", SIGGRAPH 2003: stable viewpoint, highlight the new parts, show significant reorientations explicitly. | research paper |
| Exact screw size and tool named in the step that uses them | | ASD-STE100 practice and the interviewer's "the builder needs a printout". | standard, Hadrian |
| Every screw driven through the face that is up | | Codex review of module 6 (D34): panels built cleats-down, floor and lid turned over before their boards are fastened. | pick |
| L and F marks on floor, lid, and every board | | Codex review of module 6: a lopsided part puts a pocket off-centre, so boards need an orientation reference (CodeRabbit finding, PR #6). | pick |
| Positions as a small table, measured from a named edge | | Keeps the sentence under 20 words however many boards there are (5.6). | pick |
| The printout ends with the design ID to write on the lid | | Traceability (R25); the user's question about completion (2026-11-10). | Hadrian |

## Records

| Rule | Value | Source | Status |
|---|---|---|---|
| What is stored | the part's `.glb`, the design output, problem marks; nothing else | User decision (D28): minimal data. | Hadrian |
| Where | one SQLite file on the packing-station computer, served by one local Node process | User decision (D28): records must survive a browser reset and a year of time; no cloud. | Hadrian |
| ID format | CR-YYYYMMDD-NNN | Date-first so records sort by day; printed on every page. | pick |
| No login | | User decision (2026-11-10): one shared station computer, nothing to protect, clearer in a demo. | Hadrian |

## What is not backed by any document

The pocket clearance (3 mm), the tier break points, the 1.5 ratio for laying a part down, the 1200 mm promotion width, the unit-guess bands, and the wood densities are mine. Each is stated in `SPEC.md` as an assumption needing Hadrian's sign-off (A7, A9), and each is one constant in `src/core/constants.ts` or `src/core/tier.ts`.

## Documents

ASTM D6039/D6039M (open and covered wood crates); ASTM D6256/D6256M (wood-cleated boxes with skidded bases); USDA Forest Products Laboratory, Wood Crate Design Manual, Agriculture Handbook 252 (https://www.fpl.fs.usda.gov/documnts/usda/ah252.pdf); Lockheed Martin Space supplier packaging standard P-52; ASD-STE100 Simplified Technical English; Agrawala, Phan, Heiser, Haymaker, Klingner, Hanrahan, Tversky, "Designing Effective Step-by-Step Assembly Instructions", SIGGRAPH 2003; the Khronos glTF 2.0 specification; Hadrian's interview brief, `parts.json`, three sample files, and three crate photos (2026-11-09).
