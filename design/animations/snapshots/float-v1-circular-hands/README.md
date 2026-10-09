# float v1 — circular hands (2026-10-09)

Snapshot of `assets/animations/float_emote.glb` the author liked, taken before further iteration.
Neck-deep tread: 1.6 s loop (48 frames, 30 fps), ~20 deg forward lean, hands trace a frontal-plane circle
(down through the middle, out at the bottom, up the outside), palms follow the stroke, slow bicycle legs.

- `float_v1_circular_hands.glb`: exported clip (1 animation, 63 nodes, 62 channels per path, 1.600 s).
- `scripts/`: bpy build + export + verify scripts. Rebuild: open the official `Avatar_File.blend`
  (https://raw.githubusercontent.com/decentraland/docs/main/creator/images/emotes/Avatar_File.blend),
  exec `dclrig.py`, `build_swim.py` (helpers + sign detection), `build_chill.py`, `build_chill3.py`, `build_chill4.py`
  in one namespace, run `chill4_pose(theta, S, S2)` for frames 1..49 step 3 and key each, then `export_clip.py`.
- Main knobs: `C3` (circle size/height, leg angles) and `H` in the scripts.
- Not tested in-scene or on the phone at the time of the snapshot.
- Run order matters: `dclrig.py` -> `build_swim.py` -> `build_chill.py` (needs `detect_signs_upright`, `upright_prep`) -> `build_chill3.py` -> `build_chill4.py`.
  The saved `C3` values are the final ones (circle cx 0.36, r 0.28, zc 1.16, forward -0.34).
