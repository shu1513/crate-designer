# Synthetic test parts (not committed)

Made of boxes, in millimetres, Z up, with a parts.json that says so. Drop parts.json together with a .glb.

- SYN-001-l-bracket.glb: L bracket 400×200, 20 mm plate, 9.5 kg, suggested 1/4/6. tall end at one side: tests the one-way loading cue.
- SYN-002-stepped-shaft.glb: Stepped shaft 1200 long, 60/120/90 steps, 32 kg, suggested 1/2/5. collars: stations should land on them.
- SYN-003-flange-disc.glb: Flanged disc 500 wide, hub 180 tall, 24 kg, suggested 1/3. wide flat base with a tall hub.
- SYN-004-tall-post.glb: Tall post 120×120×1100, 18 kg, suggested 2/6. taller than 1.5× its footprint: the app lays it on its side.
- SYN-005-thin-fin.glb: Thin fin 350×10×240, 2.2 kg, suggested 3/10. very thin: narrow deep pockets.
- SYN-006-housing-with-bosses.glb: Housing 380×300×160 with four corner bosses, 14 kg, suggested 1/4. open box with bosses sticking out at the corners: station search should avoid the bosses.
- SYN-007-wedge-ish.glb: Wedge: narrow bottom 60, wide top 260, 7 kg, suggested 1/2. wider at the top than the bottom: pocket must be as wide as the top so it drops in.
- SYN-008-two-lumps-gap.glb: Two lumps joined by a thin bar, 11 kg, suggested 1. a thin bar in the middle: stations should prefer the lumps.
- SYN-009-plate-stack.glb: Flat plate 700×500×12, 33 kg, suggested 10/20. many flat plates: single layer, wide crate, tier promotion.
- SYN-010-heavy-block.glb: Heavy block 600×450×350, 480 kg, suggested 1/2/4. 480 kg each: top size class; 4 of them is refused as over 1800 kg.
- SYN-011-tiny-pin.glb: Tiny pin 40×12×12, 0.03 kg, suggested 100. shorter than two cradle boards: refused with a plain message.
- SYN-012-huge-beam.glb: Huge beam 4500×200×200, 420 kg, suggested 1. longer than a plywood sheet: cut list notes the join.
- SYN-013-stepped-shaft-Y-up.glb: the stepped shaft written Y up (drop it WITHOUT parts.json: the app should guess Y up from... it cannot, this file's writer is unknown, so switch "Which way is up" to Y if it looks tipped).
- SYN-014-stepped-shaft-inches.glb: the stepped shaft in inches (drop WITHOUT parts.json: the app should guess inches from the size).
