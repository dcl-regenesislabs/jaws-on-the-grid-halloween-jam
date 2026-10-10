# Replacement cinematic shark

Owner rejected the patched mouth/body proportions and chose to try generated
concept art, Meshy modeling and a bite animation. Owner delegated the tool choice.

Reference `great-white-v1.png` generated with built-in image_gen; exact prompt in
`prompt.txt`. Proposed pipeline: Meshy 7 textured GLB, 2K texture, roughly 8,000
triangles, then a custom jaw/tail rig and Bite animation in Blender. No humanoid
auto-rigging. Inspect the mouth cavity and topology before committing the model
to the runtime scene. Current game model remains installed during generation.

Meshy MCP is available; it requires explicit cost confirmation. Asked owner for
30 credits for one Meshy 7 textured model (or 15-credit smart-topology alternative).
No Meshy generation has been submitted or charged.

Current direction: owner asked to work from the existing 3D model and set the
camera for iterative review. Blender MCP is now connected. Imported the runtime
shark into a separate `Cinematic Shark Review` scene, preserving the startup scene.
Saved `shark-camera-review-v1.blend`: front/underside perspective camera at 60
degrees, frame 130 of Bite. Broadened the torso and tapered the snout in this review
only; original mesh data retained as `SharkBody_before_proportion_review`.
Runtime GLB remains unchanged. `current-model-bite.png` is the earlier unmodified
model render, not the latest review.

Owner rejected the v1 realism. Saved `shark-anatomy-review-v2.blend`: replaced
duplicate teeth with single contoured rows, removed tubular white lips, rebuilt
the lower jaw as a closed rounded shell, shortened the snout, repositioned eyes,
and subdued the skin materials. Inspected open/closed frames 1, 130 and 207 plus
side view. Still visibly stylized: cheek topology and the head/body junction need
further sculpting. No runtime export or in-game validation of this draft.
`refine_shark_review.py` records the first refinement pass; subsequent jaw and
surface adjustments are preserved in the v2 blend. Next: refine the continuous
head/shoulder surface before treating this as a replacement runtime asset.

Owner rejected Blender refinement and chose image editing followed by Meshy.
Rendered `shark-for-image-edit.png` from the actual review camera, then generated
`shark-meshy-reference-v3.png` with built-in ChatGPT image_gen. Exact prompt and
tool provenance in `meshy-v3-prompt.txt`. The output preserves the frontal ventral
pose with a complete body and a mouth integrated into the head. Proposed next:
Meshy 7, textured 2K GLB, about 8,000 triangles, 30 credits. The connector requires
cost confirmation before submission. Owner approved 30 credits; task completed
successfully and consumed exactly 30. Task ID and settings in `meshy-v3-task.json`.
Downloaded `shark-meshy-v3.glb` (9.57 MiB), 8,306 triangles, one material,
three embedded images, no Draco or other required extensions, no rig/animations.
Imported into a separate `Meshy Shark Review` scene and saved
`shark-meshy-v3-review.blend`, with a 60-degree review camera. Inspected front,
side, top and underside: a continuous head/jaw silhouette and visible recessed
mouth are present. Teeth are somewhat fused/smoothed at this triangle budget;
animatable jaw topology still needs inspection. Native Blender dimensions are
1.077 x 1.903 x 0.876 m. Runtime model remains unchanged; no placement audit or
in-game validation yet. Next: assess jaw deformation for a custom bite rig on
this generated model, without another paid generation.

Owner requested textures visible and a bite animation. Material Preview enabled
persistently (the three 2K textures were already embedded). Created separate
`Meshy Bite Animation` scene, preserving the original generated mesh. Authoring
script: `../rig_meshy_shark.py`. Three bones: Body, Jaw, Tail; smoothly blended jaw
weights and subtle tail motion. All vertices weighted, sums within 3e-8 of one.
Saved `shark-meshy-bite-v1.blend` and exported `shark-meshy-bite-v1.glb` with
`Bite_Meshy` clip, 3 seconds at 30 fps. Slow opening, hold, six-frame snap at
frames 48-54, then settle. Inspected frames 1,43,54 from poster and close side
views: lower jaw closes against upper teeth without splitting the surface;
some throat/gill stretching remains in the first draft. GLB contains one mesh,
one skin with three joints, three images, no compression extensions. Blender
left playing the textured preview. Not yet installed or tested in the game;
the 3-second test clip needs timing adaptation to the 8.8-second cinematic.

Installed at owner's request: `assets/models/shark-meshy-cinematic.glb`, selected
by `src/client/cinematic.ts`. Active action exported as `CinematicBite`, 8.8 s;
contact at frame 198 / 6.6 s, aligned with existing splash/swallow. Authoring file
`shark-meshy-cinematic.blend`. Original short review remains separately saved.
Camera remains 60 degrees. Fresh scale 9.43 gives 17.94 m nose-to-tail from
native Blender dimensions 1.077 x 1.903 x 0.876 m (glTF 1.077 x .876 x 1.903).
Pivot is centered, native bounds approximately +/- half extents. Placement:
root (cinema.x,26.4,cinema.z), local (0,-17+5*rise+6.3*strike^2,3), rotation
(-78,180,0). Sampled all 265 posed frames with node transforms and DCL axis
conversion: overall envelope X 55.919..744.076, Y .248..30.168,
Z 36.657..771.179 across the allowed camera centers. Within scene
X/Z 0..800 and Y 0..330. No mesh colliders; collision masks remain zero.

Validation: build/typecheck, cinematic harness and eight endgame server scenarios
passed. Existing preview reused; Motorola phone screenshots
`../../playtests/endgame/meshy-actual.png` and `meshy-contact.png` show textured
approach and later closing jaw beneath swimmer. Return-to-raft and replay used.
Temporary centered test button removed after checking. Phone lighting gives a
pink cast; no lighting changes made. PC mobile and desktop visual checks pending.
