# Shipping Crate Designer — SPEC

Status: draft v1.7, 2026-11-09. Stack (D23) and storage (D28) confirmed. Clearances and construction rules tied to USDA Handbook 252, ASTM D6039, ASTM D6256, and Lockheed Martin P-52 (A7). Twenty consistency fixes from the final Codex review applied (D30). Open: Q5 only (1:1 templates vs. dimensioned drawing; spec does both).
Sources: Hadrian "Shipping Crate Designer (FDE Builder Interview)" PDF, `Sample Parts/` folder (3 GLB files, `parts.json`, `README.md`), interviewer notes relayed 2026-11-09 (three rounds), and public crate-design references listed under Assumptions.

## 1. Problem

- **Who:** The box builder on Hadrian's shop floor. After a precision metal part is machined and inspected, the builder must build a wooden crate for it. A crate may hold one part, several identical parts, or a whole work-order batch.
- **Today:** There is no tool. The builder has to understand the part's size, shape, and weight and work out a crate design by hand. Each new part means a new design.
- **Why it matters:** These are precision parts, so the crate must hold each one still and apart from the others. A crate that is oversized or overbuilt wastes wood and freight. A design that is unclear wastes the builder's time and leads to mistakes. Today there is also no record of which parts went into which crate or how it was built.

## 2. Goals and non-goals

Goals:
- G1. From a part model (GLB), a quantity, and a per-part weight typed in by the builder, produce a complete crate build package: every wooden piece with exact dimensions, the fasteners, and numbered steps with a drawing for each step. The builder needs nothing else to build the crate.
- G2. Design wooden blocking and cradles cut to the part's shape so no part can move more than 6 mm in any direction, and no part can touch another part or a crate wall.
- G3. Run as a local web app in a browser, served by one small local service on the same machine that also keeps the records. No AI calls at runtime. No internet needed.
- G4. Print cleanly to paper.
- G5. Show dimensions in millimeters or inches, switchable at any time.
- G6. When the app cannot design a crate, say so and say why. Never output a guess.
- G7. Every design gets an ID that is printed on the build package and stored locally with the part model and the design output, so there is a record of which parts, in what quantity, went into which crate and how it was built. The builder can record which step had a problem, so the instructions can be improved.

Non-goals:
- Cardboard boxes. Everything in scope ships in a wooden crate (interviewer).
- Disposable packing material (bubble wrap, foam) is not modeled (brief).
- Metal brackets, straps, or any hardware beyond basic fasteners (brief).
- Per-step check measurements during assembly. The builder is assumed to cut precisely (interviewer).
- Shipping limits (truck, pallet, container sizes). None apply (interviewer).
- Certified structural engineering. Structure sizes follow general practice, see Assumptions.
- Mixed parts in one crate (assumed out, see A2).
- User accounts, cloud sync, or any remote server. (Local record keeping for traceability is in scope, see R25–R27.)

## 3. Users and scenarios

User: the box builder. Works at a packing station with a computer, a browser, and a printer. Not an engineer. Reads plain English, follows numbered steps.

**Flow chart: what happens when the builder uses the app**

```
  BUILDER                         APP (all in the browser, no network, no AI)
  ───────                         ──────────────────────────────────────────
  1. Drop .glb file   ─────────►  Read model, merge meshes, measure L x W x H
                                           │
  2. Check size looks  ◄────────  Show part in 3D + size (mm or in)
     right; fix units if not               │
  3. Type quantity + weight ────►  Validate (whole number ≥ 1, weight > 0)
                                           │
  4. Press "Design crate" ──────►  ┌───────▼────────────────────────────────┐
                                   │ a. Orient part (Z up, long side on X)  │
                                   │ b. Lay out N parts in a single-layer   │
                                   │    grid (smallest footprint)           │
                                   │ c. Slice part at stations → hull       │
                                   │    pockets for bottom + top cradles    │
                                   │ d. Add end stops                       │
                                   │ e. Pick tier from total weight         │
                                   │    (plywood, lumber, screws, skids)    │
                                   │ f. Size frame, skins, lid, base        │
                                   │ g. Count screws, estimate wood weight  │
                                   │ h. Write 11 numbered steps + drawings  │
                                   └───────┬───────────────┬────────────────┘
                                      ok   │               │ problem
                                           ▼               ▼
  5. Review on screen  ◄──────  3D crate preview,    "Cannot design a crate:
     (hide lid / walls)         summary, cut list,     <plain reason>"
                                fasteners, steps        (no partial design)
                                           │
  6. Press "Print"  ───────────►  Paper package: summary → cut list →
                                  screws → pocket templates → steps
                                           │
  7. Build crate from printout.  Last step: any gap > 6 mm → add a wood shim.
```

**S1. Design a crate for a work order (main flow)**
1. Builder opens the app in the browser.
2. Builder drops a `.glb` file on the page (or picks it with a file button).
3. App shows the part in a 3D view and its measured size (L × W × H) in the current units. If the size looks wrong, the builder changes the "model units" selector (meters / millimeters / inches). Default is meters.
4. Builder types quantity (whole number, 1 or more) and weight of one part (number greater than 0, in current units: kg or lb).
5. Builder presses "Design crate".
6. Within 5 seconds the app shows: a 3D preview of the crate with parts inside (lid can be hidden), the crate summary, the cut list, the fastener list, and the numbered build steps with drawings.
7. Builder presses "Print". The browser's print dialog opens and the build package prints as described in Design 5.6.
8. Builder builds the crate from the printout.

**S2. Toggle units**
At any time the builder clicks "mm / in". Every number on screen and in the printout switches. Typed inputs keep their value and show in the new unit.

**S3. The app cannot design a crate**
After "Design crate", the app shows a red box: "Cannot design a crate for this input" plus one plain-English reason per problem (see section 6). No partial design is shown.

**S4. The builder finds a problem while building**
The printout's last step tells the builder the maximum allowed gap between the part and each cradle pocket (see R12). If a gap is larger, the step says to add a wood shim strip. No other on-the-fly checks exist.

## 4. Requirements

Inputs and validation
- R1. The app accepts a single `.glb` file (glTF 2.0 binary) by drag-and-drop or file picker, loads the default scene, applies all node transforms, merges every mesh instance into one triangle list, and computes the part's axis-aligned bounding box. All bodies are treated as one rigid part. Files over 500,000 triangles are refused (E8).
- R2. The app shows the part's L, W, H within 2 seconds of loading, in the current units, rounded to 1 mm or 1/16 in.
- R3. The app accepts a quantity (integer ≥ 1) and a per-part weight (number > 0). Both are required before "Design crate" is enabled.
- R4. The app provides a model-units selector (m, mm, in; default m) and an up-axis selector (Z up, default per the sample README; or Y up, the glTF default). Changing either updates R2 immediately and clears any existing design.

Layout
- R5. The app chooses part orientation by the rule in 5.2 with no user input. The same file always gives the same orientation.
- R6. For quantity N, the app lays parts in a single layer grid (rows along X, columns along Y) chosen by the rule in 5.2. Parts never stack.
- R7. In the design, the distance between any two parts and between any part and a side skin is at least 50 mm (one cradle web). On the ends the part is g_c from a solid stop board that sits against the end skin, so part-to-end-skin distance is g_c + c (22 mm at T1/T2, 41 mm at T3/T4). Clearance values in 5.3.

Restraint (blocking and cradles)
- R8. For each part, the app produces at least 2 bottom cradle boards and the same number of top cradle boards at stations along the part's X axis (rule in 5.4). Each board has one pocket per column. The pocket is the vertical sweep of the convex hull of the part's cross-section through the full board thickness at that station, offset outward by the cradle clearance g_c = 3 mm, so the part can be lowered straight in.
- R9. Each row of parts has an end-stop board at each X extreme plus g_c. Adjacent rows share one stop board between them.
- R10. The part rests on the bottom pocket (zero gap underneath). Design clearance is g_c = 3 mm on each side, each end, and above. With the lid closed the designed free travel is 6 mm sideways, 6 mm lengthwise, and 3 mm upward (see 5.4). This is a design value, not a certified guarantee; T-R10 checks it as a diagnostic. Rotation of a body of revolution about its own axis (a shaft turning in its cradle) is allowed; for other shapes the pocket outline limits rotation.
- R11. Every unique cradle pocket is delivered as a dimensioned drawing (overall width, depth, and the board's top-edge reference) and, when it fits on one printed page at 1:1, as a full-scale cut-out template. Pockets larger than a page print at a stated scale with a scale bar.
- R12. The part-loading step (step 10 in 5.6, before the lid goes on) states the gap threshold: "Any gap between a part and a cradle pocket larger than 6 mm must be shimmed with a wood strip." The threshold is printed as a number in current units.

Structure
- R13. The app selects plywood thickness, frame stock size, skid stock, and screw sizes from the tier table in 5.5 using net load = N × weight, then promotes one tier if W_in exceeds 1200 mm (long cradle spans).
- R14. The app refuses to design when net load exceeds 1800 kg (3968 lb), with the message in section 6.
- R15. Every wooden piece has an ID, a count, a material (plywood thickness or lumber stock), and exact cut dimensions. Every piece appears in at least one build step.
- R16. The app lists fasteners: type, size, and count, computed by the rule in 5.5. Only wood screws appear. No metal brackets or straps.
- R17. The app reports outer crate dimensions (L × W × H), inner cavity dimensions, estimated wood weight (formula in 5.5), and estimated gross weight = net + wood.

Instructions and output
- R18. The build steps are numbered, in the order in 5.6, each with one line drawing (SVG) and plain text of at most 3 sentences. Every step names the piece IDs it uses and where each piece goes (measured from a named reference edge).
- R19. "Print" produces a paper package in the page order of 5.6 with no cut-off content on A4 or US Letter.
- R20. The mm/in toggle switches every displayed and printed number, including weights (kg to lb) and templates, with no re-upload. Internal values never change; only display rounding does.

Errors
- R21. For each error case in section 6 (E1–E6, E8, E10) the app shows the exact message listed there and shows no design. E7 and E9 are warnings: the design stays and prints.
- R22. The app makes no network requests except to its own local service on localhost (verifiable in browser dev tools).
- R23. Changing the file, model units, up-axis, quantity, or weight after a design is shown clears the design and disables Print until "Design crate" is pressed again. The mm/in toggle is display only and never clears the design.
- R24. No two wooden pieces in the design overlap in 3D, and no wooden piece intersects any part (checked geometrically, see T-R24).

Traceability
- R25. Every successful design is saved by the local service in a SQLite database file as one record holding only: a unique ID (format CR-YYYYMMDD-NNN), the date and time, the part's GLB file (name and bytes), and the complete `Design` output (which already contains the inputs it was made from: quantity, weight, units, orientation settings, and an algorithm version). Nothing else is stored. When the save succeeds, the ID appears on every printed page; after E9 the printout shows "not saved" instead.
- R26. A "History" view lists saved designs (ID, date, part file, quantity, outer size), can be filtered by part file name and by date range, and reopens any of them read-only, including print and 3D preview. A reopened design is shown exactly as saved; it is never regenerated with newer rules. A record from a year ago opens the same way as one from today.
- R27. For a saved design, the builder can mark a step "problem" with an optional note of up to 200 characters. Marks are saved inside the record with a timestamp and shown in History.
- R28. The database is a single file whose path is printed when the service starts, so it can be backed up by copying. History can also be exported to a single JSON file and imported from one. Import never overwrites an existing ID.

## 5. Design

### 5.1 Interfaces

Screen layout (one page, desktop browser, minimum width 1200 px):
- Left column: inputs. File drop zone, model-units selector, measured part size, quantity, weight, unit toggle, "Design crate" button, "Print" button.
- Center: 3D view (part alone before design; crate with parts after design; checkbox "Hide lid"; checkbox "Hide walls").
- Right column: tabs "Summary", "Cut list", "Fasteners", "Steps". Steps show drawing + text per step.
- Error state: red box above the right column replaces the tabs.

Data model (internal, language-neutral):
```
PartInput  { fileName, triangles[], unitsScale, quantity, weightKg }
PartFrame  { rotation (one of 6 axis permutations), L, W, H (mm), minZ }
Layout     { rows, cols, pitchX, pitchY, partOrigins[] }
Tier       { name, plyT, stockC, stockD, skidStock|null, screwWall, screwFrame }
Piece      { id, kind, count, material, length, width, thickness, position (x,y,z of a named corner), orientation, notes, pockets[] }
Pocket     { stationX, columnIndex, polyline[] (mm, board-local), equatorZ }
Fastener   { type, size, count, usedIn[] }
Step       { number, title, text, pieceIds[], svg }
Design     { algorithmVersion, inputs, tier, layout, pieces[], fasteners[], steps[], inner{L,W,H}, outer{L,W,H}, woodKg, grossKg }
DesignRecord { id, createdAt, glb: { fileName, bytes }, design: Design, problems: [{ stepNumber, note, recordedAt }] }
Design carries `inputs { quantity, weightKg, displayUnit, upAxis, modelUnits }` and `algorithmVersion` so the record needs nothing else.

SQLite schema (two tables, nothing more):
```
designs  (id TEXT PRIMARY KEY, created_at TEXT, glb_name TEXT, glb_bytes BLOB, design_json TEXT)
problems (design_id TEXT REFERENCES designs(id), step_number INTEGER, note TEXT, recorded_at TEXT)
```
Local service API (all on localhost): `POST /api/designs` save; `GET /api/designs?part=&from=&to=` list; `GET /api/designs/:id` fetch one incl. GLB; `POST /api/designs/:id/problems` add a mark; `GET /api/export` and `POST /api/import` JSON. The same service serves the built app pages, so starting the app is one command.
```
All internal math is in millimeters and kilograms. Units conversion happens only at display time.

### 5.2 Orientation and layout rules

Orientation (R5):
1. Apply the up-axis selection (R4) so Z is up, then start from that frame.
2. If H > 1.5 × max(L, W) (a tall, thin part), rotate so the longest axis lies along X. Otherwise keep Z up.
3. Rotate about Z so the longer footprint side lies along X.
Result for samples: PART-001 keeps native (360 along X). PART-002 keeps native (1530 along X). PART-003 rotates 90° about Z so 445 is along X.

Layout (R6):
- Enumerate all (rows, cols) with rows × cols ≥ N and rows × cols − N < cols (no empty row).
- Inner length L_in = rows × L + (rows − 1) × s_p + 2 × e_stop, where e_stop = g_c + c (end gap plus end-stop thickness).
- Inner width W_in = cols × (W + 2 g_c) + (cols + 1) × web, where web = 50 mm (solid wood between pockets and at board ends).
- Pick the layout that minimizes max(L_in, W_in). Tie-break: minimum L_in × W_in. Tie-break: fewer rows.
Example: PART-002 × 4 → 1 row × 4 cols. PART-001 × 8 → 2 rows × 4 cols.

### 5.3 Clearances (fixed constants)

| Symbol | Value | Meaning |
|---|---|---|
| g_c | 3 mm | gap between part surface and pocket on the sides, ends, and top; zero gap at the bottom bearing. Source: rigid-board cavity practice is about 1/16 in (1.6 mm) per side around the part's maximum dimensions; 3 mm adds a hand-cutting allowance (A9) |
| web | 50 mm | solid wood between pockets, and from a pocket to the board end (also the part-to-side-wall clearance). Source: USDA Handbook 252 §5.1 says add 1 to 3 in (25 to 75 mm) clearance between item and frame |
| s_p | c + 2 g_c | spacing between rows along X: one shared stop board plus a gap each side |
| c_floor | 25 mm | floor panel top to lowest point of part. Source: low end of the Handbook 252 range (1 in) |
| c_top | 25 mm | highest point of part to lid underside. Source: same |
| max station spacing | 600 mm | along X between cradle boards. Source: ASTM D6256 limits floor joists to 24 in (610 mm) apart; ASTM D6039 limits cleats to 36 in (914 mm) |
| slice band | c + 4 mm | thickness of the mesh slab sampled per station (board thickness plus 2 mm each side) |
| gap threshold | 6 mm (2 g_c) | shim if a measured gap exceeds this |

Part-to-side-skin distance is web (50 mm); part-to-end-skin distance is e_stop = g_c + c, filled by the stop board. R7 is satisfied by construction for all tiers. Cutting tolerance (A9, ±2 mm) is on top of these values; the 6 mm shim threshold in R12 is the design gap, not a measured maximum travel.

### 5.4 Restraint geometry

Stations (R8): n_st = max(2, ceil(0.6 L / 600) + 1). Nominal stations are evenly spaced from 0.20 L to 0.80 L along the part (the end 20% often holds bosses and flanges rather than the main body; the housing sample showed this). Each station then moves to the best candidate among nominal + 10k mm for integer k with |10k| ≤ 0.10 L: the candidate whose slab hull has the widest bearing (Y width of the hull within 5 mm of its lowest Z). Ties go to the candidate nearest the nominal, then to the lower X. Stations are chosen in increasing X; a candidate is skipped if it would put adjacent stations closer than 100 mm or farther than 600 mm apart. If no candidate works, fail with E6. Example: L = 1530 → 3 stations at 306, 765, 1224 mm from the part's X start. L = 360 → 2 stations at 72 and 288 mm. L = 445 → 2 stations at 89 and 356 mm.

Pocket at a station: take the slab X = station ± (c/2 + 2 mm). Collect every triangle vertex inside the slab and every triangle-edge crossing of the slab's two faces, project them to the YZ plane, take the 2D convex hull, offset outward by g_c. If the slab has no geometry (a hollow or gap), move the station in 10 mm steps toward the part center until it has geometry, keeping at least 100 mm between stations; if that is impossible, fail with E6.
- Equator z_eq = the highest Z at which the unoffset hull reaches its maximum width (tie-break for rectangular profiles; gives z_eq = 28 for the bracket).
- Bottom cradle board: thickness c, spans W_in, height h_b = c_floor + (z_eq − minZ). Pocket per column = the upward sweep of the offset hull's lower contour, raised by g_c so the part rests on the pocket bottom (seated datum): at any height z, the pocket spans the full Y extent of the offset hull at all heights ≤ z. The part lowers straight in without snagging because the pocket is never narrower above than below. All other pieces are positioned from this seated datum.
- Top cradle board: thickness c, spans W_in, height h_t = H_in − h_b. Pocket = the downward sweep of the hull's upper contour (offset), mirror of the bottom rule. Fastened to the lid underside at the same stations. Top pockets cannot be inspected once the lid is on; they rely on cut accuracy (A9).
- End stop boards (R9): thickness c, span W_in, placed g_c beyond the part's X extremes. Height = c_floor + the highest Z of the part within the last 20 mm at that end (so the stop reaches the actual end face, including a raised stub), capped at H_in. One board is shared between adjacent rows.
- H_in = max(c_floor + H + c_top, 2d + 20) so top and bottom cleats never overlap on thin parts.

Why the pocket is a conservative envelope: a convex hull never cuts into the part, bridges holes and recesses with wood rather than trying to fill them, and matches how commercial foam-insert and wooden-saddle makers work (cavity drawn around the item's maximum outline, saddles custom-fit to the diameter, finished surfaces protected by a thin felt or carpet lining). Packing material is not modeled, but step 10 tells the builder to line pockets when the part has finished surfaces.

Why this meets R10: the part sits on the bottom pockets; in Y it is enclosed by pocket walls at g_c each side; above it by the top pockets at g_c; in X by end stops at g_c. Designed travel: 6 mm in Y, 6 mm in X, 3 mm in Z. Supported envelope: parts whose convex hull at each station has a widest chord above the floor contact (true for all solid machined parts). Hollow or open parts are cradled on their hull, which may rest on a rim or flange; this is accepted for the prototype and noted on the printout.

Shaft example (PART-002, station at 306 mm, native X = −434): slab catches the 172 mm collar (dia 172, native X −439..−401). Hull = circle dia 172. z_eq = shaft axis. Bottom pocket = arc of radius 89 mm whose centre is 3 mm above the board's top edge (seated datum), 86 mm deep and 178 mm wide at the top edge. Board height h_b = 25 + 86 = 111 mm. Stations 2 and 3 (native X 25 and 484) catch the 88 mm main shaft: arc of radius 47 mm, 44 mm deep.
Bracket example (PART-001, station at 72 mm, native X = −108): slab catches the base plate (220 × 28) and the edge of the upright (native X −142..−108, 258 tall, 200 wide). Hull = base plate rectangle plus the upright, widest chord is the base plate at z 0–28, so z_eq = 28. Bottom pocket = rectangle 226 wide × 28 deep (plate bottom rests on the pocket floor; the upright is above the equator). Top pocket follows the upper hull of the upright and stiffeners.

### 5.5 Crate structure

Style: cleated plywood panels, as in the interviewer's photo (2026-11-09): plywood skin on the inside, lumber cleats on the outside, flat cleated lid that lifts off, skids under a framed base. Each wall is built flat on a bench as a panel, then the four panels are stood on the floor panel and screwed together at the corners. Stock: c × d is lumber (thickness × width), t is plywood thickness. No hinges or metal hardware; the photo's hinges are replaced by a screwed-down lid (D20).

Tier table (R13), by net load N × weight. Nominal lumber names in brackets.

| Tier | Net load | Plywood t | Frame stock c × d | Skids | Wall screw | Frame screw |
|---|---|---|---|---|---|---|
| T1 | ≤ 45 kg | 10 mm (3/8") | 19 × 64 (1x3) | 2 × 38 × 89 (2x4) on edge, only when the skid rule applies | #8 × 25 mm | #8 × 38 mm |
| T2 | 45–200 kg | 12 mm (1/2") | 19 × 89 (1x4) | 2 × 38 × 89 (2x4) on edge | #8 × 25 mm | #8 × 50 mm |
| T3 | 200–500 kg | 15 mm (5/8") | 38 × 89 (2x4) | 2 × 38 × 140 (2x6) on edge | #8 × 50 mm | #10 × 75 mm |
| T4 | 500–1800 kg | 18 mm (3/4") | 38 × 89 (2x4) | 2 × 89 × 89 (4x4) | #10 × 50 mm | #10 × 75 mm |
| — | > 1800 kg | refuse (E5) | | | | |

Skid rule (from the Lockheed Martin Space crate standard P-52 §3.1.4): skids are required when gross weight is 91 kg (200 lb) or more, or when any outer dimension is 1524 mm (60 in) or more. ASTM D6256 §6.2: two skids when W_out ≤ 914 mm (36 in), three when wider. The skid decision uses gross weight and outer size computed without skids; once skids are added their weight and height are included and the decision is not revisited. Skids run along X, flush with the side walls. Plywood is never thinner than 10 mm (ASTM D6256 minimum 3/8 in).

Piece formulas. Cavity L_in × W_in × H_in from 5.2 and 5.4.

Wall thickness w = t + c. L_out = L_in + 2w. W_out = W_in + 2w. End panels fit between side panels; side skins overlap the end panels' edges.

| ID | Piece | Count | Size |
|---|---|---|---|
| SK | Skid (if tier has skids) | 2 or 3 | skid stock, length L_out |
| BF-L | Base frame long rail, on edge | 2 | c × d × L_out |
| BF-S | Base frame short rail, on edge | 2 | c × d × (W_out − 2c) |
| BF-J | Base frame joist, on edge | ceil(L_in / 600) − 1 | c × d × (W_out − 2c), evenly spaced |
| FP | Floor panel | 1 | plywood t, L_out × W_out |
| SS | Side skin | 2 | plywood t, L_out × H_in |
| SC-V | Side cleat, vertical edge | 4 | c × d × H_in |
| SC-H | Side cleat, horizontal (top and bottom) | 4 | c × d × (L_out − 2d) |
| SC-M | Side cleat, intermediate vertical | 2 × (ceil(L_out / 600) − 1) | c × d × (H_in − 2d) |
| ES | End skin | 2 | plywood t, W_in × H_in |
| EC-V | End cleat, vertical edge | 4 | c × d × H_in |
| EC-H | End cleat, horizontal (top and bottom) | 4 | c × d × (W_in − 2d) |
| EC-M | End cleat, intermediate vertical | 2 × (ceil(W_in / 600) − 1) | c × d × (H_in − 2d) |
| LP | Lid panel | 1 | plywood t, L_out × W_out |
| LC-L | Lid cleat long, flat | 2 | c × d × L_out |
| LC-S | Lid cleat short, flat | 2 | c × d × (W_out − 2d) |
| LC-M | Lid cleat middle, flat | ceil(L_out / 1200) − 1 | c × d × (W_out − 2d) |
| BC-n | Bottom cradle at station n | rows × n_st | c × h_b × W_in, with cols pockets |
| TC-n | Top cradle at station n | rows × n_st | c × h_t × W_in, with cols pockets |
| EB | End stop | rows + 1 | c × h_eb × W_in, h_eb per 5.4; a stop shared by two rows uses the larger of its two heights |

Outer size: L_out = L_in + 2(t + c). W_out = W_in + 2(t + c). H_out = d + t + H_in + t + c, plus skid height when present.

Corner joint: at each corner the side skin covers the end panel's edge (end skin t plus end cleat c). Screws go through the side vertical cleat and side skin into the end vertical cleat, every 100 mm. Wall panels are fastened down through their bottom horizontal cleats into the floor panel and base frame rails.

Fasteners (R16), following ASTM D6039 §7.1.10 nailing rules applied to screws: skin-to-cleat screws every 100 mm (4 in) on centers, in two staggered rows at least 44 mm apart for cleats 82 mm or wider (19 + 44 + 19 mm), one centred row for narrower cleats, never closer than 19 mm to a cleat edge, driven from the skin side while the panel lies flat, minimum 2 per cleat. Screw length is at least 25 mm and never more than the two thicknesses joined (§7.1.2); the app uses t + c − 3 mm rounded down to a stock length. Frame screws: wall corner joints every 100 mm, 2 per base-frame corner, floor panel into base frame every 300 mm around the perimeter, bottom cleats into the base every 300 mm, lid panel into lid cleats per the skin-to-cleat rule, lid closure into the top wall cleats every 100 mm, 2 per joist end, 3 per cradle or end stop (driven up through the floor panel into the board's bottom edge, or down through the lid into top cradles), 2 per skid per base frame rail crossing. Counts are rounded up to the next 10 and shown as "about N".

Wood weight (R17): plywood 600 kg/m³, lumber 500 kg/m³, summed over all pieces, rounded to 0.5 kg.

**Worked example (acceptance fixture): PART-002 × 1, weight 27 kg.**
Tier T1 (t 10, c 19, d 64, w = 29). Orientation native. Layout 1 × 1. L_in = 1530 + 2 × (3 + 19) = 1574. W_in = (172 + 6) + 2 × 50 = 278. H_in = 25 + 172 + 25 = 222. L_out = 1574 + 58 = 1632. W_out = 278 + 58 = 336. Skids required (L_out ≥ 1524): 2 × 2x4 on edge, 89 mm tall. H_out = 89 + 64 + 10 + 222 + 10 + 19 = 414. Stations: 3 (306, 765, 1224). h_b = 111, h_t = 111.
Cut list: SK 2 × 38×89×1632; BF-L 2 × 19×64×1632; BF-S 2 × 19×64×298; BF-J 2 × 19×64×298; FP 1 × 10 ply 1632×336; SS 2 × 10 ply 1632×222; SC-V 4 × 19×64×222; SC-H 4 × 19×64×1504; SC-M 4 × 19×64×94; ES 2 × 10 ply 278×222; EC-V 4 × 19×64×222; EC-H 4 × 19×64×150; LP 1 × 10 ply 1632×336; LC-L 2 × 19×64×1632; LC-S 2 × 19×64×208; LC-M 1 × 19×64×208; BC-1..3 and TC-1..3 each 19×111×278 with one pocket; EB 1 × 19×155×278 and 1 × 19×161×278. Wood weight about 30 kg. Gross about 57 kg. Pocket at station 1 (on the 172 mm collar): arc of radius 89 mm, 86 mm deep below the board's top edge. Stations 2 and 3 (88 mm main shaft): arc of radius 47 mm, 44 mm deep; the station that catches the key feature gets a slightly wider hull. End stops: 155 mm tall at the −X end (shaft radius 44) and 161 mm at the +X end (stub radius 50), per the 5.4 end-stop rule.

### 5.6 Build steps and print package

Step order (R18). The list below is the order; the count may change if a step is empty (for example no skids). Each step has an SVG drawing showing the pieces added in that step highlighted, the rest gray, with the position of each new piece dimensioned from a named reference edge.
1. Cut list check: lay out all pieces by ID (drawing: all pieces labeled).
2. Cut cradle pockets using the templates (one sub-step per unique pocket shape).
3. Mark station lines on the floor panel FP. Place bottom cradles BC-n and end stops EB on the lines, flip the panel, and screw up through FP into each board (nothing is under the panel yet, so every screw position is reachable).
4. Build the base frame: BF-L, BF-S, BF-J. Screw. Fix skids SK underneath (if present).
5. Set FP (cradles up) onto the base frame and screw down around the edge.
6. Build the two end panels flat: ES skin with EC-V, EC-H, EC-M cleats. Screw through the skin into the cleats.
7. Build the two side panels flat: SS skin with SC-V, SC-H, SC-M cleats.
8. Stand the end panels on FP between the side panels. Screw corners (side cleat through side skin into end cleat), then screw all four bottom cleats down into the base.
9. Build the lid: LP with LC-L, LC-S, LC-M on top; TC-n on the underside at station lines.
10. If the part has finished surfaces, line each pocket with a felt or carpet strip. Place parts in the bottom cradles. Check gaps at each bottom pocket: any gap larger than 6 mm gets a wood shim. (R12) Top pockets cannot be checked after closing; cut them carefully.
11. Fit lid and screw down with wall screws every 100 mm.

Print package order (R19): page 1 summary (inputs, tier, outer and inner size, weights, date); page 2+ cut list; fastener list; pocket drawings and templates (1:1 when the pocket fits within 180 × 260 mm, otherwise scaled with a printed scale bar); then one step per half page. Print CSS hides the 3D view and inputs.

## 6. Edge cases and failure handling

Each case shows one of these messages and no design (R21).
- E1 File is not a valid GLB, or contains no triangles: "This file is not a readable 3D model (.glb). Try exporting it again."
- E2 Part has a zero or near-zero dimension (< 1 mm) after scaling: "The model is flat or empty in one direction. Check the model units."
- E3 Quantity is not a whole number ≥ 1: "Quantity must be a whole number, 1 or more."
- E4 Weight is not a number > 0: "Weight must be a number greater than 0."
- E5 Net load > 1800 kg: "Total weight is over 1800 kg. This needs an engineered crate design, which this app does not do."
- E6 No valid cradle station (part has no geometry anywhere near the stations): "Could not find solid cross-sections to cradle this part."
- E10 Any required piece would have a zero or negative dimension after all rules are applied: "This part is too small for the crate rules. Smallest piece would be <piece ID> at <dimension>."
- E8 File has more than 500,000 triangles: "This model is too detailed for the app (over 500,000 triangles). Export a simplified version."
- E7 Model dimensions suspicious (largest extent > 20 m or < 10 mm): warning, not an error. "This part measures X. If that is wrong, change the model units." The design still proceeds.
- Open or hollow parts (like PART-003's open top): the convex hull covers the opening; the cradle rests on the rim. Acceptable by design, noted in step 10.
- Multiple disconnected bodies in the GLB (all three samples): merged into one triangle list and treated as one rigid part. No algorithm requires a watertight solid; slicing and hulls work on raw triangles.
- Browser without WebGL: 3D view shows "3D preview unavailable in this browser"; all other outputs still work.
- Large quantity (e.g. 200): the app designs it. If L_out or W_out exceeds 2440 mm (a standard plywood sheet), the cut list notes "panel exceeds one sheet, join two sheets over a frame member" on that piece.
- Concurrency and permissions: one local service, any number of browser tabs on the same machine. SQLite serializes writes; IDs are issued by the service so two tabs never get the same ID. No login; anyone at the station can read and write.
- E9 Service unreachable or database write fails: the design still shows and prints, with a yellow warning "Could not save this design to history" and no ID on the printout (the ID comes from the service).
- Service stopped mid-session: next action shows E9; nothing already saved is lost.
- Units toggle mid-design: numbers re-render; no recompute.
- Input change after a design: design cleared, Print disabled (R23).
- Y-up model loaded with the default Z-up setting: the part shows lying on its side in the preview; the builder switches the up-axis selector. The design is not blocked.

## 7. Decisions

Each decision: options, cost, choice, reason. "Interviewer" means given directly; "Recommended" means my pick, open to change.

- D1 (interviewer) Cardboard out of scope. All crates.
- D2 (interviewer) Wood and basic fasteners only. No metal brackets.
- D3 (interviewer) No AI at runtime.
- D4 (interviewer) Quantity per crate comes from the work order; builder types it.
- D5 (interviewer) User is the box builder on the shop floor.
- D6 (interviewer) Builder types the weight. Never computed from the mesh.
- D7 (interviewer) App designs wooden blocking, cradles, dividers cut to the part's shape.
- D8 (interviewer) Any basic wood and fasteners available; app chooses stock sizes.
- D9 (interviewer) No per-step check measurements. Builder cuts precisely. Spec gives clearances and a gap threshold instead.
- D10 (interviewer) One simple drawing per step.
- D11 (interviewer) If a crate truly cannot be designed, say "cannot design, here is why."
- D12 (interviewer) Local web app in a browser, not a desktop app.
- D13 (interviewer) Toggle between millimeters and inches.
- D14 (interviewer) App chooses part orientation and layout.
- D15 (interviewer) No shipping limits.
- D16 (interviewer) Builder needs a printout.
- D17 (recommended) Restraint method. Options: (a) rectangular blocking boxes around each part's bounding box, cheapest to compute, loose fit on round or stepped parts; (b) cradle boards with convex-hull pockets at stations, fits any shape, medium effort; (c) full contour pockets following concavities, tight but fragile and hard to cut. Choice: (b). Reason: works for every shape with one rule, buildable with a jigsaw, meets D7.
- D18 (recommended) Single layer, no stacking. Options: stack parts in layers (smaller footprint, heavier top cradles bearing on parts) or single layer (larger footprint, nothing bears on a part). Choice: single layer. Reason: precision parts should carry no load.
- D19 (recommended, revised 2026-11-09 after the interviewer's photo) Crate style: cleated plywood panels, skin inside, cleats outside, built flat then joined at the corners. Options: frame inside the skin (smooth outside, but every piece is fitted in place inside the box) or cleats outside the skin (matches the photo, each wall is a panel built on a bench, corner screws hit 64 mm of cleat). Choice: cleats outside. Reason: matches what Hadrian builds today and is easier to assemble.
- D20 (confirmed by interviewer) Fasteners: wood screws only, lid screwed down and lifts off. Options: nails (faster), hinged lid as in the photo (needs metal hinges, which are excluded hardware), or screws (reopenable, removable mistakes, one tool). Choice: screws, no hinges. Reason: simplest, and the interviewer confirmed a screwed lid is fine.
- D21 (recommended) Structure sizes by tier table from net load, not gross, to avoid circular calculation. Wood weight is reported but does not change the tier.
- D26 (recommended, after Codex review 2026-11-09) Pocket shape is the vertical sweep of the convex hull, not the bare hull, so the part cannot snag while being lowered in. Options: restrict to symmetric profiles (rejects valid parts) or sweep (one extra step, no rejections). Choice: sweep.
- D29 (recommended, after second Codex review 2026-11-09) Adopted from Codex: stations search ±10% of L for the widest bearing instead of fixed percentages; the part rests on the bottom pocket (seated datum) so clearances are not consumed by gravity; end stops reach the actual end face height; records store the GLB bytes; compute in a Web Worker. Declined from Codex: Clipper2 for offsets (hulls are convex, a disk Minkowski sum is enough); extra keeper blocks (the pockets already enclose the part); a split-height search beyond the widest chord; form-closure analysis. Declined from my own research: choosing orientation by lowest center of mass, because the center of mass of an open or multi-body mesh is not reliable; the declared up-axis plus the tall-part rule stays (D22).
- D30 (2026-11-09) Final Codex review of v1.6 found 20 consistency and testability issues; all were adopted because each was a real error or gap fixable in a line or two: stale pocket numbers in the worked example, end-stop heights, seated-pocket depths, equator tie-break, station-search spacing bounds, screw-row width arithmetic (82 mm), T2 screw length (25 mm), missing fastener counts, non-positive piece guard (E10), seated-datum test fixture, up-axis applied before orientation, R12/R21/R23/R25 wording versus behaviour, build-plan order (tier before layout), task coverage, diagonal braces removed from T4, skid two-pass, Q1 closed.
- D27 (recommended, after Codex review) Declined ideas: separate restraint methods per shape family (one hull-pocket rule already yields flat pockets for flat parts and curved pockets for round ones); anti-rotation keepers for shafts (rotation about its own axis does not harm a shaft); span-based structural engineering (replaced by one rule: promote a tier when W_in > 1200 mm); splitting oversized plywood panels (D8, wood of any size is available). Reason: each adds code and pieces for cases the prototype does not need.
- D22 (recommended) Orientation rule: keep the model's Z-up unless the part is tall and thin. Reason: the modeled "up" is usually the part's natural resting pose; a simple threshold handles shafts modeled standing up.
- D24 (confirmed by interviewer) One crate holds copies of one part only. No mixed parts.
- D25 (confirmed by interviewer) The clearance constants in 5.3 and tier table in 5.5 are accepted as the starting point.
- D28 (user, 2026-11-09) Records hold minimal data only: the part's GLB and the design and instructions the app produced, plus any problem marks. No separate copies of inputs, hashes, or settings. Storage: user chose option 2, a small local SQLite service, because records must still be found a year later and must survive browser resets and computer swaps. Options considered: (1) browser IndexedDB with JSON export/import, no server, half a day, records stay on one machine; (2) small local Node service with a SQLite file, one to two days, durable and shareable across stations, two processes to run in the demo; (3) full server database, over-engineering. Choice: (2). The service is a small Node (TypeScript) program using Node's built-in SQLite module, serving both the records API and the built app pages, so the demo is still one command.
- D23 (confirmed by user 2026-11-09) Technology: TypeScript + Vite + React + Three.js, no CSG library, hand-written slicing and hull code, boards drawn by extruding a 2D outline, SVG drawings from the same data. Researched independently by me and by Codex (gpt-6-astra); both arrived at the same stack.
  - Language and framework. Options: (1) TypeScript + Vite + React, Vitest for tests; (2) TypeScript + Vite with plain DOM, fewer dependencies but hand-written state sync between units, tabs, and print; (3) Rust/WebAssembly geometry core, another build system and debugging path for no measured need (samples have about 400 to 1,000 triangles). Choice: (1). Reason: fastest path with AI coding tools, one language, geometry stays in plain testable functions.
  - 3D. Options: Three.js or Babylon.js for GLB loading and preview. Choice: Three.js with its GLTFLoader. No CSG library: every board is a 2D outline (rectangle with a notch) extruded to its thickness, which Three.js does natively, and the same outline is the paper template. Slab clipping, Andrew's monotone-chain convex hull, and offsetting a convex polygon are written in plain TypeScript (each under about 40 lines); three-mesh-bvh is added only if slicing a 500,000-triangle file measures over 1 second.
  - Computation runs in one Web Worker as a single pure function `designCrate(input) → Design`, so the screen never freezes and the function is unit-tested without a browser.
  - Drawings: SVG generated from the `Design` positions with one fixed isometric camera, new pieces highlighted, following the Stanford step-by-step assembly instruction conventions.
  - Storage: local Node service with a SQLite file (D28). Records are never regenerated.
  - Packaging: `vite build` to a static folder served by the same Node service on localhost; TypeScript strict checking runs before the demo; all assets bundled locally so nothing needs the internet.

## 8. Assumptions

- A1 (confirmed) The box builder is a shop-floor worker. Instructions must be plain and numbered.
- A2 (confirmed, now D24) One crate holds copies of one part only.
- A3 (confirmed) Parts must not touch each other or the walls; wood cradles hold them.
- A4 (confirmed) Weight is typed in by the builder.
- A5 (unconfirmed) The packing station has a desktop browser (min 1200 px wide) and a printer.
- A6 (unconfirmed) Sample GLB files are in meters, Z up, as `README.md` states; other files may differ, hence the model-units selector.
- A7 (confirmed, now D25, and checked against documents 2026-11-09) Clearance constants in 5.3 and the structure rules in 5.5 are accepted. Documented backing, from the full texts: USDA Wood Crate Design Manual (Agriculture Handbook 252) §5.1, item-to-frame clearance 1 to 3 in; §6.1.1, three skids when outside skids are more than 36 in apart; sheathing nails about 10 in apart on 1-in frames. ASTM D6039-18 §1.1, net load ≤ 4000 lb (1814 kg); §7.1.2, nail length ≥ 1 in and ≤ combined thickness; §7.1.10, plywood-to-cleat fasteners ≤ 4 in on centers in staggered rows ≥ 1¾ in apart and ≥ ¾ in from the cleat edge; cleats ≤ 36 in apart. ASTM D6256-99 §6.1.2, plywood ≥ 3/8 in; §6.2, two skids up to 36 in width, three above; joists ≤ 24 in apart; Table 3, no joists needed under 24 in width, 1x4 to 36 in, 2x4 to 60 in. Lockheed Martin Space packaging standard P-52 §3.1.4, skids at ≥ 200 lb gross or any dimension ≥ 60 in; §3.1.5, items secured to the base with bolts, straps, or blocking with clearance to the frame. Foam-insert and wooden-saddle vendor practice: cavity drawn to the item's maximum outline with about 1/16 in per side for rigid board cavities; saddles custom-fit and lined. Not found in any document: a rule for cradle pocket clearance in wood, so g_c = 3 mm remains my pick, justified above. They follow general practice from public references, not a Hadrian or customer standard: ASTM D6039 caps wood crates at 1814 kg net; one aerospace supplier packaging spec requires skids above about 90 kg gross and blocking to prevent movement; vendor guides call for rigid blocking anchored to the base and cradle fixtures for round items. Numbers like 600 mm station spacing, 150 mm screw spacing, and 25 mm clearances are my picks and need Hadrian's sign-off.
- A8 (confirmed, now D20) Lid screwed down is acceptable.
- A9 (unconfirmed) Pockets cut with a jigsaw to within ±2 mm count as "precise cuts" for D9.

Public references used (for A7): ASTM D6039/D6039M (open and covered wood crates), ASTM D6256/D6256M (wood-cleated boxes with skidded bases), USDA Wood Crate Design Manual, Agriculture Handbook 252 (https://www.fpl.fs.usda.gov/documnts/usda/ah252.pdf), Lockheed Martin space supplier packaging spec, Racklify export-crate guides. For the algorithm and instructions: Agrawala et al., "Designing Effective Step-by-Step Assembly Instructions" (SIGGRAPH 2003); CAD slicing (plane-triangle intersection as in 3D-printing slicers); Andrew's monotone chain convex hull; Modern Robotics ch. 12 on form closure (why enclosure with clearance is a design value, not a proof).

## 9. Open questions

- Q1 (user, answered 2026-11-09) Implementation language and framework: see D23. Closed.
- Q5 (interviewer) Does the builder need the pocket templates at 1:1 on paper, or is a dimensioned drawing enough? Spec does both when the template fits a page.
- Q6 (user, answered 2026-11-09) Typing quantity and weight is enough for v1. Closed.
- Q7 (user, answered 2026-11-09) Storage: local SQLite service. Closed.

## 10. Acceptance criteria and test plan

Unit tests run on the three sample files plus synthetic meshes. Each test is named for its requirement.
- T-R1: load each sample GLB; bounding box matches `parts.json` dimensions within 1 mm.
- T-R2: manual: load PART-001; dimensions appear within 2 s.
- T-R3: "Design crate" disabled until both quantity and weight are valid.
- T-R4: set model units to mm on PART-001; internal dimensions become 0.36 × 0.22 × 0.258 mm and E2 triggers. Set up-axis to Y on a synthetic Y-up box; measured L × W × H match the box as if it were Z-up.
- T-R5: orientation of the three samples matches 5.2; a synthetic 100 × 100 × 500 box rotates so 500 is along X. Running twice gives identical output.
- T-R6: PART-002 × 4 → 1 × 4; PART-001 × 8 → 2 × 4; PART-003 × 1 → 1 × 1. Never more than one layer.
- T-R7: for all sample inputs and quantities 1, 4, 8, computed minimum part-to-part and part-to-side-skin distances ≥ 50 mm and part-to-end-skin distance = g_c + c for the tier.
- T-R8: PART-002 × 1 yields 3 bottom and 3 top cradles; PART-001 × 1 yields 2 and 2. Station search on PART-002 keeps station 1 on the 172 mm collar (widest bearing within ±153 mm of the nominal); its pocket is an arc of radius 89 ± 0.5 mm, 86 ± 0.5 mm deep, with the part resting on the pocket floor. On PART-003 no station lands on an isolated boss (every slab hull has bearing width ≥ 200 mm). A synthetic slanted parallelogram prism yields a pocket whose width at the top edge equals the hull's full width (no snag).
- T-R9: rows + 1 end stops; each at a part extreme + 3 mm. PART-001 × 8 at tier T3 (weight 50 kg each) has no overlapping stop boards.
- T-R10 (diagnostic, not proof): with the part at the seated datum, translating by (±2, 0, 0), (0, ±2, 0), or (0, 0, +2) mm produces no positive-volume overlap with any wooden piece; translating by (±7, 0, 0), (0, ±7, 0), or (0, 0, +4) mm does. Surface contact at the seat counts as no overlap.
- T-R11: every unique pocket has a drawing with width and depth dimensions, and the 1:1 template flag matches the 180 × 260 mm rule.
- T-R12: the part-loading step text contains "6 mm" (or "1/4 in" in imperial mode).
- T-R13: net loads 27, 108, 300, 1000 kg select T1, T2, T3, T4. Boundary 45.0 → T1, 45.01 → T2. PART-003 × 8 (W_in > 1200) promotes one tier.
- T-R14: net 1801 kg → E5, no design.
- T-R15: every piece ID appears in ≥ 1 step; every piece has positive dimensions and a material.
- T-R16: fastener list contains only screws; counts are multiples of 10 and ≥ the computed minimum; every screw length is ≥ 25 mm and ≤ the two thicknesses it joins.
- T-R17: PART-002 × 1 → outer 1632 × 336 × 414 mm including skids, inner 1574 × 278 × 222 mm, wood 30 ± 3 kg. PART-003 × 1 (11.8 kg, all dimensions under 1524 mm) → no skids.
- T-R18: steps follow the order of 5.6; each has non-empty SVG, ≤ 3 sentences, and a position for every new piece.
- T-R19: manual: print to PDF on Letter and A4; inspect no clipped tables or drawings.
- T-R20: toggle to inches; the PART-002 outer length shows 64 1/4 in and weight 27 kg shows 59.5 lb; toggle back shows 1632 mm and 27 kg.
- T-R21: each E1–E6, E8, and E10 input shows the exact message and the design area is empty. E7 (a 30 m part) and E9 (service stopped) show a warning and the design remains, with Print enabled.
- T-R22: manual: dev tools network tab shows only localhost requests after load, through a full design, save, and print.
- T-R23: after a design, change quantity; the design area is empty and Print is disabled. Toggle mm/in instead; the design and Print remain.
- T-R24: for all three samples at quantities 1, 4, 8: no two piece boxes overlap (pocket cut-outs excluded) and no piece intersects the part mesh.

- T-R25: design PART-001 × 4; the `designs` table has one row with a CR- ID holding exactly the GLB name and bytes, the design JSON, and a timestamp; the printout shows the same ID on every page.
- T-R26: History lists the record; reopening it shows the same cut list and prints.
- T-R27: mark step 3 "problem" with a note; restart the service and reload; History shows the step number and note.
- T-R28: stop the service, copy the database file elsewhere, delete the original, start with the copy; all records present. Export then import into an empty database restores them; importing twice does not duplicate.
- T-R26b: save two designs with different part files on different dates (clock set in test); filter by part name returns one; filter by date range returns the right one.

Demo script for the on-site: load each sample at quantities 1, 4, 8; toggle units; print PART-002 × 4; show E1 with a `.txt` renamed to `.glb`; show E5 with weight 2000.

## 11. Build plan

Each task names input, output, and done check. Language per D23. Tasks run in order; each is small enough to finish and verify alone.

1. **Project skeleton.** Input: confirmed D23 and D28. Output: Vite + TypeScript (strict) + React app, a Node (TypeScript) service that serves the built pages and a `GET /api/health` route, Vitest runner, a Web Worker stub that echoes input, an empty page with the three-column layout. One command starts everything. Done: `tsc --noEmit` clean, tests run green (zero tests), page opens from `localhost` with the internet disconnected.
2. **GLB loader and bounds.** Input: `.glb` bytes. Output: merged triangle list in mm, bounding box, `PartFrame`. Done: T-R1, T-R4 pass on the three samples.
3. **Tier selection.** Input: N, weight. Output: `Tier` from the net-load table (promotion rule applied in task 4). Done: T-R13 base cases, T-R14 pass.
4. **Orientation and layout.** Input: `PartFrame`, N, `Tier` (for c, d). Output: rotated frame, `Layout`, L_in, W_in, H_in, promoted tier when W_in > 1200. Done: T-R5, T-R6, T-R7, T-R13 promotion case pass.
5. **Slicing and pockets.** Input: triangles, stations, c. Output: station search result, convex-hull polylines offset by g_c, equators, swept and seated `Pocket` list. Done: T-R8 passes; synthetic cylinder gives a clipped arc.
6. **Crate geometry, skids, fasteners, weights.** Input: layout, pockets, tier. Output: full `Piece` list per 5.5 table with positions, end-stop heights, skid decision (two-pass), `Fastener` list, wood and gross weight, outer size, E10 guard. Done: T-R9, T-R15, T-R16, T-R17 pass on the worked example.
7. **Geometry checks.** Input: part mesh, piece solids. Output: pass/fail for ±2 and ±6 mm translations and for wood-to-wood and wood-to-part overlap. Done: T-R10 and T-R24 pass on all three samples.
8. **Steps generator.** Input: `Design`. Output: `Step` objects in 5.6 order with text, piece IDs, and positions (SVG placeholder). Done: T-R18 text checks, T-R12 pass.
9. **SVG drawings.** Input: `Design`, step. Output: one SVG per step (orthographic exploded view, added pieces highlighted) and one per pocket template. Done: T-R11, T-R18 SVG non-empty; visual check of PART-002 steps.
10. **Inputs UI and errors.** Input: user events. Output: validation, E1–E8 and E10 messages, "Design crate" gating, design invalidation on input change. Done: T-R2, T-R3, T-R21, T-R23 pass.
11. **3D preview.** Input: `Design`. Output: WebGL view with part and pieces, hide lid/walls toggles, graceful fallback. Done: manual check on three samples; fallback text with WebGL disabled.
12. **Units toggle.** Input: display unit. Output: every number re-rendered, fractions to 1/16 in. Done: T-R20 passes.
13. **Print package.** Input: `Design`. Output: print CSS and page order per 5.6. Done: T-R19 manual check on Letter and A4.
14. **Design records.** Input: `Design`, GLB bytes. Output: SQLite schema and the API routes in 5.1 in the Node service, ID generation, History view with part and date filters, problem marks, JSON export/import, database path printed at startup, E9 warning path. Done: T-R25 to T-R28, T-R26b, and the E9 part of T-R21 pass.
15. **Offline, README, and logs.** Output: no network calls after load (T-R22); README with launch steps; the LLM session logs used during development saved alongside the source (required by the brief); demo script from section 10 runs end to end.
