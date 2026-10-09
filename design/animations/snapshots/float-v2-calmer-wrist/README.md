# float v2 — calmer wrist (2026-10-09)

Author: "good enough for now". Same clip as v1 (`../float-v1-circular-hands`) but the wrists no longer half-turn:
palm roll limited to ~80 deg (palm mostly down, turns slightly outward on the rise), fingers follow the forearm only 65%
(blended with a relaxed forward-down direction). Hand rotation per loop ~260 deg (v1 ~430), max ~15 deg per frame (v1 ~27).

- `float_v2_calmer_wrist.glb` = `assets/animations/float_emote.glb` at snapshot time (1.6 s loop, 48 frames, 30 fps).
- `scripts/`: same run order as v1 (`dclrig` -> `build_swim` -> `build_chill` -> `build_chill3` -> `build_chill4`), then key frames
  1..49 step 3 with `chill4_pose` and export with `export_clip.py`. Knobs: `C3` (circle, legs) and `H` (wrist).
- Not tested in-scene or on the phone.
