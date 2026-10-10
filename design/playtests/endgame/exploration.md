# End-game exploration — 2026-10-09

Owner request: collectible sea mines, two-round fuse, lethal cardinal-cross blast,
camera shake; mobile-only movement pad; four moves for five rounds (confirmed),
life-jacket art, more objectives; three-second planning phase. 2D generated assets
now, Meshy models after concept review. Existing scene, CLI only.

Agent implementation choices for this try: plant on current tile; raft protected;
jackets save shark bites, never blasts; no early mine chain reactions. Three
parallel contracts (coins, shark kills, depth), escalating after all complete.
Inventory resets on respawn; score and contract progress remain for the session.

Implemented: three-second planning, mine inventory/button/countdown/cross blast,
nearby camera shake, four-step five-round boost, jacket pickups, and three
escalating contracts. Mine/boost/jacket generated cutouts are 512px runtime PNGs;
full-size concepts and prompts are saved under design. No Meshy conversion yet.

Observed on the signed-in Motorola via real ADB taps:
- Collected and planted a mine at (108,103) on turn 8. It remained armed on turn 9
  and exploded on turn 10. Player escaped to (108,106); a shark died and the
  Shark Hunter contract awarded its bonus. [Recording](mine-proof.mp4),
  [countdown](phone-mine-countdown.jpg), [detonation](phone-mine-detonation.jpg).
- Boost collection showed four planning slots and five remaining rounds;
  subsequent telemetry showed expiry back to two moves. [HUD](phone-boost.jpg).
- The initial automated driver tapped before the client received the new phase;
  delaying taps 0.55 seconds corrected it. This was test-driver timing, not a
  change to gameplay. Temporary server telemetry was removed afterward.
- Pickup feedback overlapped the contracts card in these captures. Final code
  moves it below the card. That last positioning change still needs an in-game
  visual recheck. Screenshot counters were around 59–61 FPS during the mine pass;
  this is a short observation, not a sustained performance benchmark.
- A stationary self-blast attempt ended in a shark bite before the fuse expired;
  it does not establish player blast death on-device. No jacket collection was
  observed in the limited phone pass.

Validation: `npm run build`, `node scripts/test-endgame.cjs`, and
`git diff --check` pass. Seven real-server-module scenarios cover timing,
validation, blast geometry/player death/jacket bypass, shark bounty, harbor
protection, boost duration, inventory/respawn, and one-time contract rewards.
The harness mocks transport/ECS and is separate from the actual phone check.
Runtime assets total about 19.2 MiB; new sprites total under 0.8 MiB. Mines and
effects are pooled/camera-culled. The final [phone budget panel](phone-performance.jpg)
at the raft showed 54.2K triangles, 363 entities, 276 meshes, 183 materials, four
textures and five colliders, below the docs' soft limits. This is one viewpoint
with no active mines, not a worst-case scene/multiplayer measurement or proof of
the sustained FPS target.

PC mobile emulation: release c616fb7 built in an isolated worktree; initial
missing imports were resolved with Godot's headless import. Startup recording
did not reach playable verification and logs reported no wallet. Windows
Computer Use failed three connection attempts (native pipe missing). Desktop
Explorer visual testing remains pending; do not count either PC route as passed.

Next: signed-in final HUD check, jacket save and player blast on the phone, then
PC mobile/desktop visual checks and a human play pass for pacing. Existing guest
restriction is preserved. Raw local logs/captures are ignored by Git; selected
evidence above is retained. No human fun/readability verdict and no deployment.

Handoff: latest build reloaded on the signed-in phone; [raft HUD](phone-final.jpg).
Guest recovery worked by opening the normal app/lobby first, then the preview
link. The phone is left at the safe practice raft; PC test process is closed.

Follow-up PC check: owner selected bevy-web. Reused the existing preview server
at localhost:8000 in Chrome; stopped the phone client for the one-client test.
Saved web identity loaded successfully. Visually verified the desktop movement
pad is absent, keyboard input displays a planned step and moves into open water,
and the mine/slap controls and contracts render. Fixed header/mine-count wrapping
with explicit widths and added dark action-label backing. Owner then requested
global desktop margins: shared 24-unit inset on corner and centered HUD layers,
zero extra inset on mobile, no decorative border. [Final screenshot](bevy-desktop-margins.jpg).
Build/type-check and diff whitespace check pass. Browser left on the practice
raft. This completes the basic PC layout/input check, not every gear interaction;
PC mobile emulation and the remaining phone gear checks above remain unverified.

Animation source check (2026-10-10, agent; no runtime playtest): the local Godot
release checkout registers walk/idle in the avatar locomotion animation tree,
not in the default/utility emote IDs. Its emote controller rejects unknown IDs,
so expressionTriggerId = 'walk' or 'idle' is not a supported shortcut there.
Scene avatars.ts moves a parent mover and leaves the AvatarShape transform
fixed, intentionally avoiding client interpolation; deck movement therefore
has no explicit walking animation. Idle resumes naturally after an emote ends.
Suggested next try: use direct AvatarShape movement on the raft to exercise
native locomotion, checking alignment with the cell frame/camera on the phone.
No scene code changed; cross-client behavior and visual quality remain untested.
