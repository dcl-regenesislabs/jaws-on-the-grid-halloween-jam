# Starting raft and scoreboard — 2026-10-10

Owner request: improve the starting platform with simple Blender shapes, including
a physical SCORE BOARD that opens scoreboard UI when tapped/clicked.

Built in the existing scene. Agent choices: joined wooden planks, barrel floats,
corner mooring posts/rope, and a sloped wooden scoreboard. Live Blender MCP used;
the existing shark scenes were preserved. Editable source: `starting-raft.blend`;
repeatable authoring script: `../../scripts/build-raft.py` (creates a new scene).
Runtime models live in `assets/models/`, placed through `main.composite`.

Deck remains at RAFT_Y=2.52 and keeps the 6x6 safe-cell footprint. Decorative
geometry has no physics collisions because grid movement and the real avatar's
underwater floor remain authoritative. Board pointer collider uses the visible
mesh, with 40 m player reach and a local safe-harbor check. Its position is
(400, 2.52, 409.5), yaw 180; near the far/top edge, facing the overhead camera.

Board opens a safe-area top-ten panel. Gameplay UI/inputs are suppressed until
CLOSE; opening cancels a queued plan during planning. If a move already executing
leaves the harbor, the panel closes. Reads the existing world-storage leaderboard
through a server-owned synced component, including late joiners. Existing
name-based best-score semantics and opt-in SAVE SCORE remain. Empty/loading/error
states are explicit. Storage failures do not overwrite the existing board.

Checks:
- `npm run build`: passed, including composite compilation/type check.
- `node scripts/test-scoreboard.cjs`: passed empty/load, best score, ordering,
  concurrent saves, top-ten cap, storage failures, recovery, malformed stored data.
- `node scripts/test-bots.cjs 16 1`: passed. An initial 1-minute invocation was too
  short for the harness's five-minute death assertion; the full-duration run passed.
- Blender material viewport inspected. Exports audited: one mesh/material each,
  64x64 packed palette, no animations/collider meshes; raft 9,200 triangles / 608 KB,
  scoreboard 2,112 triangles / 99 KB. Export scoped to the active Blender scene.
- At scale 1: raft world bounds X 387.615–412.385, Y 1.185–3.78,
  Z 388–412. Board bounds X 397.25–402.75, Y 2.52–5.327,
  Z 408.229–410.752 (updated far-edge placement). Inside the existing 800x800 scene. Native model origins are
  the deck surface and scoreboard feet, respectively.
- Read-only phone screenshot `phone-current.png`: new raft and correctly oriented
  scoreboard visible after hot reload. This is visual evidence only; no tap or
  panel test yet. Owner confirmed an active phone playtest and asked to leave the
  client alone; no tap, movement, restart or additional client launch performed.

Owner follow-up: mobile opens the board on pointer hover-enter (point at it),
with no IA_POINTER press. Desktop retains click-to-open. After closing on mobile,
point away before pointing back to reopen; modal-generated hover exits do not
rearm it. Interaction registration follows asynchronous platform detection.
Build/type check passed; mobile hover behavior has not been playtested, and the
owner's instruction to leave the active client alone remains in effect.

Next check (agent-suggested): when the phone is free, point at the physical board,
check empty/saved rows and CLOSE, then move off the raft. Check the same flow on
the PC mobile client and desktop after the phone. No owner playtest feedback yet.

Owner follow-up: ropes had floating ends; connect the corners, and move the board
to the far/top edge (owner clarified screen-space placement, not overhead height).
Replaced four short dangling rope meshes with four complete sagging perimeter
spans. All eight endpoints meet post centers at the 0.62 m lashing height.
Raft now 9,968 triangles; bounds and decorative-only collisions unchanged.
Updated GLB, editable Blender source, authoring script and composite placement.
Blender material preview inspected; build/type check passed. Active client left
alone; the new geometry and placement still need an in-world owner check.

Owner refinement: board was too near the edge. Nudged it 1 m inward (Z 409.5),
keeping it near the far edge. Composite, Blender source and script agree.

2026-10-10: cells shrank to 3.2 m. Raft scaled (0.8, 1, 0.8) in the composite so
the 24 m deck covers the 19.2 m harbor (plank seams still on cell lines); board
moved to Z 407.6. Barrel floats read slightly oval; rebuilding the GLB at 3.2 m
would fix that. See ../decisions.md.

2026-10-10 - Owner: TAP TO VIEW on the scoreboard does nothing on the phone.
Cause (read in godot-explorer release c616fb7, not yet confirmed on the phone): with a
scene VirtualCamera active the client sets `raycast_use_cursor_position`; a tap moves
the cursor to the finger and presses `ia_pointer` (mobile_camera_input.gd
`_handle_cinematic`). The board only listened for hover-enter on mobile. Fix: the board
opens on IA_POINTER pointer-down on every platform (desktop keeps the hover text); the
hover/rearm logic is gone. Owner confirmed on the phone: tapping the board now opens it.

2026-10-10 - Owner: show the list on the 3D board too, and keep TAP TO VIEW even if small.
Board GLB rebuilt headless (Blender 5.2, `--background` with a scratch runner that reuses
the default scene, since the script switches the window scene for live Blender): baked
TOP SURVIVORS and the podium removed; title smaller (.4) at the top, TAP TO VIEW small
(.22) at the bottom; 1,368 triangles. Raft GLB left byte-identical. The live top 5 (rank,
name up to 16 chars, score) is SDK TextShape laid on the chalk face from the synced
Leaderboard, with a one-line note while loading/empty/error (`src/client/harbor.ts`).
Phone: reads correctly and is the right way round, one saved row so far,
[board-live-list-phone.jpg](board-live-list-phone.jpg). A full 5-row board has not been seen yet.

2026-10-10 - Owner: tapping the board should ZOOM the camera onto the 3D board (smaller
letters, more scores) with an EXIT; transition in and out. Agent choices: the 2D panel is
replaced. Tap -> a fixed VirtualCamera in front of the face (0.8 s Time transition, fov 50,
4.3 m out, aimed 0.45 m below the face centre so the board sits clear of EXIT); the board
switches from the top 5 in big letters to the top 10 in small letters; HUD and all nametags
hidden; EXIT (bottom, touch-sized) or tapping the board again zooms back out with the same
glide. Leaving the raft or the cinematic also ends the zoom.
Phone: zoom in, 10-row layout, EXIT and zoom out all worked
([board-zoom-phone.jpg](board-zoom-phone.jpg)); only one saved score so far.
Observed: from mid-raft the HUD (stats and turn pills) covers most of the board, so it is
hard to tap from there; it is easy from the cells next to it. The baked TAP TO VIEW is
still visible while zoomed. Neither changed yet.
