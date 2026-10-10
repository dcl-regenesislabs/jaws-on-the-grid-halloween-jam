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
(400, 2.52, 404), yaw 180; between cell centers, facing the overhead camera.

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
  Z 402.729–405.252. Inside the existing 800x800 scene. Native model origins are
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
