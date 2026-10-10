# Shark ending - exploratory build, 2026-10-10

Owner request: recreate the thumbnail/poster composition on losing: lone swimmer,
shark rising from below, transparent water, deliberate camera transition, no
actions or turn counting for the losing player. No registered experiment.

Implementation: `src/client/cinematic.ts`, integrated with avatars, camera, audio,
phase clock and UI. Agent staging choice: a local ocean cross-section above the
death cell provides depth without moving the shared board or its collision floor.
The actual player remains immobilized; their existing AvatarShape is reused.
Other avatars are hidden locally. Shared turns continue for survivors. Shark
deaths play the sequence; mine deaths keep their explosion/results ending.

Current timing proposal: 0.55 s fade out, 0.95 s reveal, slow approach, accelerated
strike at 6.6 s, fade to black, results at 8.8 s.

Owner follow-up: full-screen ocean instead of black water, continuous swimming,
lower shark start; retain 60-degree camera because the mobile FOV issue is known.
No duplicate SDK report filed. Generated image provenance/prompt is in
`../../cinematic-ocean-prompt.txt`; runtime image is `assets/images/cinematic-ocean.png`.
An unlit camera-parented plane gives the water cross-section, not physical transparent
water. Moving it to 20 m avoids clipping its bottom below the scene floor.

AvatarShape scene emotes have no loop flag on this client. Re-trigger the 1.2 s
swim at 1.1 s during the cinematic, respecting the existing trigger gap. Derived
`shark-cinematic.glb` adds an animated mouth to the original shark (unaltered).
Authoring script: `../../animations/build_cinematic_shark.py`; revised model has
4,024 triangles, 12 material primitives, 2 mesh objects, no Draco, one Bite clip. Staged at 1.15
scale above the board; position clamped inside the scene.

Phone observation, Motorola Edge 60 Pro: final capture shows the full-screen blue
ocean without exposed bottom/side edges, horizontal swimmer throughout sampled
frames, shark entering from below and reaching the swimmer, then delayed results.
Swim Again restored the normal camera, avatar, HUD and touch controls on the raft.
Evidence: `cinematic-phone.jpg`, local ignored `cinematic-proof.mp4` (13 s).
Raw exploratory recordings moved to `%TEMP%/jaws-cinematic`.

Validation: cinematic state-machine harness passes (routing, fades, one bite,
delayed results, repeat death, long frame and cleanup). Server endgame harness
passed eight scenarios earlier, including rejected early respawn/actions and
continued survivor turns. Full build/type-check and both harnesses passed on the
mouth/video/spray revision. The gameplay import mismatch from the previous pass
is resolved; unrelated gameplay changes continue in this shared working tree.
git diff --check passes.

Owner follow-up: circular mouth rejected as unrealistic; requested moving ocean
(suggested a 2-4 s looping video) and swimmer splash particles. Revision replaces
the radial tooth ring with an actual skin opening, recessed throat, horseshoe
upper teeth and a hinged lower jaw. Original gameplay shark remains untouched.
Owner then requested a smaller jaw or larger shark: reduced the jaw footprint
20%, rebuilt a fuller snout, and cut through the ventral skin to expose the
cavity. Gentle emissive fill preserves teeth/body separation at night.
The scene's low-poly body is retained; this is anatomical improvement, not a
photoreal replacement. Blender rendered audit bounds: x [-2.961, 2.959],
y [-7.620, 7.983], z [-2.813, 3.641] in authoring coordinates.

`../../animations/build_ocean_loop.py` makes a four-second 1280x556 H.264 loop,
24 fps, about 375 KB, from the existing image with periodic wave refraction and
light shimmer. One muted VideoPlayer runs only during the cinematic. Still image
remains until a playing event and returns on error. Two small cone emitters with a dedicated 64px droplet sprite
(32 particles cap each) alternate with the swim cadence and stop at results or
respawn. Harness now covers video fallback and effect cleanup too.

Debug control requested by owner: TEST SHARK ENDING inside the practice-raft
panel invokes the same cinematic with a local slot snapshot. BACK TO RAFT ends
it without changing server score, inventory or survival state. Saving a score
is disabled during this preview. It only starts from the safe raft. Authoring
switch ENDING_DEBUG_ENABLED in state.ts is currently true; disable after review.
Phone tap confirmed transition, the debug result card, BACK TO RAFT restoration,
and the test button becoming available again. Latest cavity-normal correction
was checked in a Blender render; its updated phone close-up remains to review. Source imports were
reconciled by concurrent gameplay work, so temporary compatibility constants
were removed again; no gameplay tuning changes remain from this pass.

Next: owner reviews the smaller jaw using the raft button; PC/mobile and
desktop visual checks remain pending. No human pacing verdict or multiplayer visual playtest;
not deployed.

Water artifact fix: black/magenta speckles reproduced in decoded MP4 frames,
independent of Explorer. The authored geq shimmer multiplied 8-bit highlights
above 255 without clamping, causing channel wraparound. Added RGB range clamps
and bounded sampling coordinates in `build_ocean_loop.py`, then regenerated the
same runtime MP4 at CRF 18. Four matching before/after frames in `water-check/`
show the affected surface pixels removed (dark pixels in rows 80..209 dropped
from 10/135/6/3 to zero in all four samples). Same four-second wave motion and
24 fps retained. This is a source-video fix, not an SDK workaround. Corrected
video inspected offline; updated phone playback not separately captured.
