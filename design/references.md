# Audio asset shortlist

Research date: 2026-10-09. The user requested effects and the original Jaws music; another teammate owns grid logic. The user subsequently selected Kenney Interface Sounds and supplied the ocean and splash WAV files for import. These three sources are now prepared locally as MP3 assets, not integrated or playtested. Remaining entries are research candidates. Suggested event mappings below are assistant proposals.

| Proposed use | Candidate / creator | Source license shown |
| --- | --- | --- |
| Ocean ambience | [Ocean Waves.wav — Noted451](https://freesound.org/people/Noted451/sounds/531015/) | CC0 |
| Movement splash | [Swimming.wav — 13FPanska_Marval_Lukas](https://freesound.org/people/13FPanska_Marval_Lukas/sounds/379334/) | CC0 |
| Shark attack splash | [Big Water Splash — qubodup](https://freesound.org/people/qubodup/sounds/442773/) | Page license is CC0, but description also mentions CC BY profile requirements. User supplied the file for conversion; attribution retained here, wording remains unconfirmed. |
| Submerge / elimination texture | [underwater — yosarrian](https://freesound.org/people/yosarrian/sounds/179927/) | CC0 |
| Selection / phase-change cue | [Interface Sounds — Kenney](https://kenney.nl/assets/interface-sounds) | CC0; 100 sounds, individual cue not selected |

## Requested music

- [Jaws — Main Title, John Williams, official artist upload](https://www.youtube.com/watch?v=BePfzCOMRZQ): listening reference for the requested original theme; upload credits UMG Recordings, 1975. No game-use permission established. User subsequently supplied a local MP3 for loop editing (see below).
- [UMG licensing FAQ](https://www.umgsync.com/faqs/): explains recording and composition permissions and the recording-license request route.
- [UMPG Film, TV & Media](https://www.umusicpub.com/us/film-tv-and-media): publishing sync contact, umpg.licensing@umusic.com. Specific composition ownership/clearance remains to be confirmed.

## Next step

Audition the prepared assets and select short cues for movement, attack and elimination. Keep ocean ambience quiet enough for attack warnings. Confirm the attack-splash license wording and resolve the original theme's game-use permission before deployment. No grid logic changed.

## Prepared audio assets

- `assets/sounds/ocean-waves.mp3`: full original recording, 44.1 kHz, 160 kbps MP3.
- `assets/sounds/big-water-splash.mp3`: full original recording, 44.1 kHz, 128 kbps MP3.
- `assets/sounds/kenney-interface/`: all 100 cues extracted from the supplied ZIP and converted from OGG to 44.1 kHz, 128 kbps MP3; original cue basenames retained.
- Source channel counts and levels preserved; no trimming, normalization or seamless-loop editing performed. Source WAV files and the original ZIP remain unchanged in Downloads.
- Kenney's supplied CC0 license is preserved in `design/licenses/kenney-interface-license.txt`.
- Format choice: [DCL Sounds documentation](https://docs.decentraland.org/creator/scenes-sdk7/3d-content-essentials/sounds) recommends MP3 and notes WAV's larger size. Bitrates above are project encoding choices, not DCL requirements.
- Verification: all 102 MP3 files fully decoded with FFmpeg without errors; combined size 2,048,573 bytes. This is file validation, not an audio audition or mobile playtest.
- For integration, use these project-relative paths with `AudioSource`. Audition and test the ambience loop boundary before enabling continuous looping.

## Jaws music loop candidates — v3, 2026-10-09

User supplied `C:\Users\mateo\Downloads\Main Title.mp3` for asset editing only. User chose four approximate sections (0–21, 21–44, 44–60, 90–100 seconds), then reported v2 cut through spikes and requested v3 cuts after decays in quieter gaps, with EQ allowed if useful. Current boundaries are assistant refinements pending listening approval. No gameplay changes; original source untouched.

| Asset in `assets/sounds/music/` | Source interval | Loop duration |
| --- | --- | --- |
| `jaws-calm-loop.mp3` | 0.000-17.892 s | 17.892 s |
| `jaws-tension-loop.mp3` | 17.892-44.664 s | 26.772 s |
| `jaws-danger-loop.mp3` | 44.664-60.312 s | 15.648 s |
| `jaws-climax-loop.mp3` | 89.841-100.570 s | 10.729 s |

Deeper analysis used stereo energy (avoiding mono phase cancellation), 10 ms RMS, and 150/300/600 ms smoothed envelopes. The opening's substantial quiet gap is around 17.9 s, before the busier section begins near 18 s; 21 s was already inside it. The second cut is in the 44.66 s trough. The almost-climax and climax tails now decay to 60.31 and 100.57 s. The climax entry near 89.84 s is only a brief inter-pulse dip, not silence. Final cuts snap within 5 ms to low-amplitude stereo samples. These are signal-analysis observations, not confirmed musical bar boundaries or auditory approval.

V3 preserves source chronology and complete selected tails. Removed v2's tail-over-head splice. Applied only 15 ms cosine fade-in/out click guards inside the boundary regions. No overlap shortening, EQ, compression, or normalization; EQ was unnecessary for the identified boundary issue. Original dynamics remain, including builds and pauses within each section.

Compared with v2 exports, unprocessed v3 final-150-ms RMS is approximately 31 dB quieter for calm, 14 dB quieter for almost-climax, and 21 dB quieter for climax; tension is similar. This supports decay preservation, not musical seamlessness. All four 44.1 kHz stereo 192 kbps MP3s decode, preserve master sample counts with FFmpeg, have finite samples and no clipping; decoded seam steps are below 0.00013 full scale. Client looping and listening remain untested.

Review: `C:\Users\mateo\Downloads\Jaws-loop-review\v3\`. Contains unblended CUT WAVs, lossless loop masters, MP3s, three-repeat CHECK WAVs (decoded MP3 concatenation without hidden crossfades), six-second JOIN close-ups, a four-level transition audition using illustrative one-second crossfades, `cuts.json`, and `boundary-analysis.png`. Source scripts live in the parent folder: `analyze_v3.py`, `plot_v3.py`, `prepare_loops_v3.py`. V2 is backed up in `v2/`; older parent-folder auditions are superseded. Runtime filenames retain calm/tension/danger/climax; danger means almost climax.

Next step: audition v3 JOIN and CHECK files for phrase completion and repetition, especially tension's return to its quiet start and the climax entrance. No listening test, client test, or deployment performed. Prototype skill was unavailable in user skill folders. Previously recorded game-use permission uncertainty is unchanged.

## Shark model (2026-10-09)

- `assets/models/shark.glb`: "Shark" by Quaternius, Animated Fish Bundle on
  poly.pizza (https://poly.pizza/bundle/Animated-Fish-Bundle-ZkGbjS8m8g), CC0.
  Swim clip: `Armature|Swim`. Downloaded from static.poly.pizza.

## Walk and idle scene emotes (2026-10-10)

Official Decentraland unity-explorer assets, downloaded from
https://github.com/decentraland/unity-explorer/tree/main/avatar-preview-renderer/Assets/StreamingAssets
(`walk.glb`, `idle.glb`). Copied unchanged as `walk_emote.glb` and
`idle_emote.glb` under assets/animations. Repository Apache-2.0 license retained
in assets/animations/LICENSE-unity-explorer.txt. Each file has one animation,
63 nodes, 186 animation channels and no meshes. Walk: 1.067 s, 90,784 bytes;
idle: 3.033 s, 135,080 bytes. These are the repository's Walk_Male/Idle_Male
clips; identical appearance across body shapes/clients has not been verified.
