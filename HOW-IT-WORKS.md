# How the Crate Designer works, and why it is built this way

A two-page explanation in plain English. The full rules are in `SPEC.md`; every number with its source is in `DESIGN-BASIS.md`; how to run it is in `README.md`.

## What it does

A box builder drops a part's 3D file (`.glb`) on the page, types how many parts go in the crate and what one part weighs, and presses Design crate. The app answers with a complete build package: every wooden piece with its cut size, the screws, and 50 to 70 numbered one-action steps with a drawing each, which the builder prints and follows. Each design gets an ID that is saved with the part file, so a crate built a year ago can be looked up again. If the app cannot design a crate, it says so in one sentence and shows nothing else.

No AI runs inside the app. Every rule is deterministic and written down, so the same part always gives the same crate and every number can be traced to a rule.

## How a crate is designed, in eight steps

1. **Read the part.** The app reads the `.glb` itself (no 3D library), merges every body into one triangle list, and measures length, width, height. It guesses the file's unit from the size (a 1.5 reads as metres, a 1500 as millimetres) and the up axis from the program that wrote the file, or takes both from the shop's `parts.json`.
2. **Lay the part down.** Right-angle turns only, so the builder can picture it: a tall thin part is laid on its side; the longer footprint side runs along the crate.
3. **Pick the wood from the weight.** Four tiers by total load (up to 45, 200, 500, 1800 kg): plywood 10 to 18 mm, cleats 1x3 to 2x4, matching screws. Over 1800 kg the app refuses, which is the ASTM wood-crate limit. The tier moves up one step when the crate is wider than 1.2 m.
4. **Arrange the copies.** One layer, in a grid, chosen to make the crate as square as possible. Parts are 50 mm of wood apart and 25 mm above the floor and below the lid. Nothing ever sits on a part.
5. **Find where to cradle it.** Two or more stations along the part, 20 to 80 percent of its length, no more than 600 mm apart. At each station the app slices the part and looks for the widest flat seat, moving the station up to 10 percent of the length to find one. It refuses stations where the part would rest only on something outside the board, or where the widest point is at the floor (no pocket depth).
6. **Cut the pockets.** Each station gets a bottom board and a top board spanning the crate, with a rectangular pocket per part: the slice's width plus 3 mm each side, cut straight down to where the part rests. End stops close the two ends. This is what Hadrian's own crates in the photos do: straight-cut blocks, not curved saddles.
7. **Build the box around it.** Cleated plywood panels as in the photos: skin inside, cleats outside, built flat on a bench and stood up, a framed base inside the skins, skids when the crate is heavy or long. Screws only, counted from the actual wood thicknesses.
8. **Write the steps and check itself.** Fifty-odd one-action sentences, each under 20 words, each with a drawing; panels built upside down so every screw goes through the face that is up; L and F marks so nothing goes in backwards. Before showing a design, the app checks that no two pieces overlap and no board cuts into the part. If that check ever fails, it refuses rather than guess.

## The choices that mattered, and why

- **Rectangular pockets, not curved ones.** Curved saddles fit a shaft better, but need templates and a jigsaw. Hadrian's photos showed straight-cut blocks. Straight pockets are two saw cuts and a chisel, two numbers per pocket, and still follow the part station by station.
- **Weight is typed, never computed.** The 3D file has no material. The box builder knows the weight from the work order.
- **One part type per crate, one layer.** Confirmed with the interviewer. Stacking would put load on precision parts.
- **Single page, one command.** A local web app served by one small Node service that also keeps the records in a SQLite file. Chosen over browser-only storage because records must survive a browser reset and a year of time.
- **No login, on purpose.** The app runs on the packing station's own computer and talks only to its own local service; anyone at that station can design and look up crates. Accounts would add a sign-in screen, password handling, and a server to protect, none of which help a box builder, and they would get in the way of showing the tool in a demo. If Hadrian later wants to know who built which crate, the smallest step is a name typed with each design, not a login system.
- **Records hold the minimum.** The part file and the design output, nothing else. The design already contains its inputs and the version of the rules, so an old record reopens exactly as it was made, never regenerated.
- **Refuse rather than guess.** Flat file, unknown unit, too heavy, nothing to cradle, a piece that would be zero size, a failed self-check: each is one plain sentence and no design.
- **Conservative where it is cheap.** A part is called "one way round only" whenever its two ends differ at all where wood touches it, and the step says which way; a 6 mm gap is the shim threshold; a 1 mm felt limit is printed as 1/32 in, never rounded up.

## What it does not do, on purpose

No cardboard, no foam, no metal hardware, no shipping-size limits, no mixed parts, no stacking, no certified engineering. Pockets are straight cuts only. Parts over 1800 kg are refused.

## How it was built

Spec first: the brief and three rounds of questions to the interviewer became `SPEC.md` (36 recorded decisions, 30 testable requirements, each with a named test). Then one module per pull request, eleven in all, each reviewed by a second AI (Codex gpt-6-astra) and, for the core modules, by CodeRabbit, with every finding judged and either fixed or declined in writing. Finally a whole-repository audit, read line by line by both a second AI and me, fixed in one pull request with three more review rounds, and two cold reads of the printed instructions by AI readers playing a box builder. Ninety-five tests run in two seconds. The AI session logs are in `logs/`.

## What it cost

Claude Code's own cost meter for the main build session, which covers the spec, all twelve pull requests, the reviews I ran, the audit, and the hand-off documents, reads **$140.38** at Anthropic list prices (Claude Fable 5.1). The transcripts show where it went: about 188 million tokens of cached context re-read across 400-odd model turns (at $0.25 per million, roughly $47), 2.6 million tokens written to cache (about $33), and 0.9 million output tokens (about $45); fresh uncached input was negligible. The earlier short sessions for setup and sample inspection add a few dollars more. The Codex (gpt-6-astra) review and research runs ran on a separate Codex subscription and are not metered in their logs. CodeRabbit's included reviews were free. For scale: a careful engineer would take two to three weeks to build and document this by hand; the AI build took about two working days of one person's time plus the spend above.

## What I would do next

A real builder building one crate from the printout and telling us every question they had. Sign-off from Hadrian on the clearance and tier numbers, which come from public standards, not from Hadrian. Then shimming guidance for very light parts, and a second part type per crate if the work orders need it.
