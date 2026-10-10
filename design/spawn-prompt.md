# Prompt for spawn.co — "Shark Board" (JAWS-style turn-based survival)

Paste everything below the line into spawn.co.

---

Build a complete, polished, playable browser game called **SHARK BOARD** (working subtitle: "Don't Go In The Water"). It is a tense, turn-based, grid survival game set in an endless ocean full of sharks, inspired by the feel of the movie JAWS. Mobile-first (touch only must be fully playable), also works on desktop with keyboard. Single HTML5 app, 3D or 2.5D top-down view (your choice, but the camera is a fixed top-down/steep-angle view that follows the player).

**IMPORTANT — NO EXTERNAL ASSETS.** Do not use or download any images, models, textures, fonts files or audio files. Everything must be generated in code: geometry from primitives, procedural/shader water, canvas-drawn icons or emoji-free vector icons, system fonts only, and ALL audio synthesized with WebAudio (oscillators, noise, filters, envelopes). Do not use any copyrighted music. Any "heartbeat" or "dread" music must be an original synthesized pattern (e.g. a two-note low cello-like pulse that speeds up as danger rises, in the spirit of tension, but not the famous theme).

## 1. Core concept

The player is a swimmer on an endless grid of ocean cells. The game is played in **global rounds** split into two phases:

1. **PLAN phase (3 seconds)** — everyone secretly-but-visibly picks where to swim. The player plans a path of up to **2 cell steps** (up/down/left/right, no diagonals; can also stay still). Sharks simultaneously **telegraph** their next attack by drawing a red/orange "lunge lane" on the water: a straight line starting at the shark's own cell and extending up to 3 cells ahead.
2. **EXECUTE phase (1 second)** — all swimmers glide along their planned path while sharks dash along their lanes. When the dash ends, **anyone standing on a shark's cell or lane cell is bitten and dies** ("CHOMPED!"). Bite is checked ONLY on the final cell (crossing a lane mid-path is fine), but see "lanes are walls" below.

Then the next round starts. A thin timer bar at the top shows the phase and time left ("PICK A MOVE" during plan, "GO!" during execute). During execute, flash a subtle red wash on the screen edges.

Survival is the score engine: the further from the safe raft you swim, the more danger and the more reward.

## 2. The board and the raft

- Board: a 200×200 cell grid (cells are square, treat as 4 m). Effectively endless; hard edge at the border (cannot swim beyond it).
- **Safe raft**: a 6×6-cell wooden raft at the center. Player spawns here. Sharks never enter it, nothing scores while on it, and no bites can happen on it. It's the tutorial/practice area: show a "PRACTICE RAFT — Swim off the raft to start!" panel with short hints ("Pick up to 2 steps, then wait for GO!", "Red lanes = shark attack zones").
- Draw the raft with plank boxes and a few buoys at its corners.
- Grid lines are only drawn in a radius of 9 cells around the player (fade out with distance) to keep it light.
- The ocean: a large animated water plane with a procedural shader (scrolling noise, subtle foam, darker deep blue with depth), semi-transparent so shapes beneath read slightly. Moody Halloween/JAWS palette: teal-black water, pale moon-ish light, sickly fog at the horizon, stars/dark sky.

## 3. Depth tiers

Depth = Chebyshev distance (in cells) from the raft center. **Tier = floor(depth / 12)**. HUD shows "PRACTICE RAFT" on the raft and "DEPTH n" (tier+1) in the water.
Deeper tiers mean: more sharks nearby, richer coins, more survival points per round, and smarter/ruder sharks.
- Sharks near player: base 3, +1 per tier, max 9.
- Pickups near player: ~7.

## 4. Scoring

- Coin: 10 × (1 + tier) points.
- Survival: each round you finish alive **out in open water (not on raft)**, you get a small survival bonus that grows with tier (e.g. 5 × (1+tier)).
- Mine kill on a shark: +75 bounty. Harpoon-sink kill: +75 bounty.
- Contract rewards (see §8).
- Life jacket save: +25.
- Score is KEPT on death (you can respawn and keep playing). Gear is lost on death.
- Keep a **local leaderboard** (top 10, localStorage) with an opt-in "SAVE SCORE" button that asks for a name. Show best score per name. Also show a mini leaderboard on the death screen.

## 5. Sharks

Pool of sharks (max ~48 active) that **surface in a ring 5–10 cells from the player (never closer than 5)** and **sink/despawn when beyond 15 cells from every player**, so the ocean feels endless. Sharks never enter the raft cells.
Visual: a dark grey fin (a curved triangular prism) cutting through the water with a V wake trail; when lunging, the fin speeds up and a bigger shark silhouette briefly shows under the surface. Hunters (see below) have bigger, darker fins.

Each shark each round has a **lane**: direction (N/E/S/W), length 0–3 cells (0 = wandering/just cruising, no bite danger). Lanes are drawn on the water as a strip of translucent colored tiles from the shark's cell forward, ending in a marker.

**Lane colors per viewer:**
- Red = a shark that is hunting YOU.
- Orange = lane inside your current reach (cells you could end on this turn).
- Grey-blue = lane out of your reach (harmless to you this round).
A freshly surfaced shark gets one round where it is visible but can't hunt.

### Wanderers vs. smart pack hunters

Most sharks are **wanderers**: they circle the nearest player at distance 4–9 cells and mostly stay out of the player's reach in tiers 0–2 (from tier 3 on they may also threaten reachable cells). 30% chance each round to change direction.

**Hunters (the smart sharks):** each player is hunted by a small **pack** whose size adapts:
- Max hunters per player: 1 at tier 0, 2 at deeper tiers, +1 if 4+ players are in open water, +1 while "bleeding" (see blood). Hard cap 3.
- A hunter is assigned to a player when within ~8 cells; it keeps the assignment until the player is more than 12 cells away (leash).
- Roles:
  - **Chaser ("Bruce")**: picks the lane that runs straight through the cell the player is most likely to be on (it predicts using the player's last movement heading), overshooting through them. Its lane ends in a fang marker.
  - **Blocker ("the Tiger")**: picks the lane that removes the MOST of the player's safe end cells, favouring the direction the player is heading and cells with pickups, from the side opposite the chaser (pincer). Its lane ends in a crossbar marker.
  - Roles are assigned to whoever can strike soonest; a sitting chaser keeps its role unless another shark is a full round quicker (avoid flickering).
- From tier 5, the chaser lunges 4 cells instead of 3.
- **Raft grace:** after leaving the raft, no one hunts you for 1 planning round.

**Fairness floor (very important):** the shark AI must never create an unwinnable round. The player has up to 13 reachable end cells (with 2 steps: stay, 4 one-step, 8 two-step minus blocked). The combined lanes may never reduce safe end cells below a floor depending on tier: `[6, 5, 4, 3, 3, 2]` for tiers 0..5+ (last repeats). Holding still must always be a valid move. Count walls, lanes and mines about to blast as dangerous cells. Players should feel squeezed but never trapped.

**Lanes are walls:** a planned path may not cross a shark's cell or any cell of any lane. The path planner UI should refuse those steps (disable the arrow into them) so the player must swim around. Server/game-logic also rejects such paths. (Keep this as a config flag `LANES_BLOCK_PATHS = true`.)

## 6. Input (mobile-first)

- **Touch:** a big on-screen d-pad (4 arrow buttons, each ≥ 96px) bottom-left, only shown on touch devices. Tap an arrow to add one step to your plan (up to max steps); show the planned path as glowing arrow/line cells on the grid and as small pips in the HUD ("●●" filled per step). A "CLEAR/UNDO" small button removes the last step. Tapping arrows into blocked cells is disabled (greyed).
- Plans can be changed freely until the PLAN timer ends; last plan wins. Moving is predicted client-side (swimmer glides visibly during EXECUTE).
- **Desktop:** WASD/arrow keys add steps, Backspace undoes, Space = stay, E = place mine, Q = harpoon, C = chum. Everything must also be clickable/tappable. Nothing required for play depends on keyboard, hover or right-click.
- All critical UI stays inside safe-area insets (use `env(safe-area-inset-*)`), large touch targets, readable at phone sizes, no hover reliance. Support portrait and landscape.

## 7. Pickups (spawn around the player, pooled ~40, rich near depth)

Draw all of them as procedurally generated vector/canvas icons floating on the water with a bobbing animation and a soft glow:
- **Coin** (gold disc): points as above.
- **Life Jacket** (orange vest): carry up to 2. If a shark bite would kill you, one jacket is consumed instead, you survive that bite, you get "+25 SAVED!", and you are **bleeding** for 2 rounds (priority target, see Blood).
- **Sea Mine** (spiked black ball, red light): carry up to 3. Tap SET MINE (open water only): drops a mine on your cell. Mines have a fuse of **2 round resolutions**; it blinks faster as it nears detonation. When it explodes it blasts the center cell + 4 cardinal neighbors (no diagonals, never on the raft). It kills players (including you!) and sharks in those cells; the owner gets +75 per shark. Show a "BLAST NEXT ROUND — MOVE OUT!" warning banner if you stand in a blast cell the next resolution. Camera shake + white flash + ring of foam on explosion. Pool of max 24 mines.
- **Swim Boost** (blue fin/wings icon): for the next 5 rounds you may plan **4 steps** instead of 2. HUD badge: "4 MOVES / n ROUNDS".
- **Yellow Barrel** (JAWS reference): carry up to 3. HARPOON button: if a shark is within 2 cells (Chebyshev), you harpoon the nearest — it lunges short (2 cells), will not hunt for 3 rounds. Hitting it with 3 barrels total sinks it for the 75 bounty. Button says "NO SHARK IN RANGE" when disabled.
- **Chum** (red bucket): carry up to 1. DROP CHUM on your cell: up to 3 sharks within 6 cells go for the chum (as a decoy target) for 2 rounds instead of players. Pool of 8 chum.
Pickups are collected automatically by passing through or ending on their cell, **including cells along the planned path**. Full capacity = can't collect that type.

## 8. Expedition contracts (objectives)

Three parallel contracts shown in a compact panel ("EXPEDITION n"), each with progress and reward:
1. **SALVAGE RUN** — Collect coins: target `5 + 3·level`, reward `100 + 50·level`.
2. **SHARK HUNTER** — Blast sharks (mines/harpoon kills): target `1 + level`, reward `150 + 75·level`.
3. **DEEP DIVER** — Reach depth tier: target `min(8, 2 + level)`, reward `125 + 50·level`.
Rewards are granted instantly when a contract completes (show "DONE +reward" in mint green). When all three are done, the expedition level increases by 1, progress for coins/kills resets, and a harder expedition begins.

## 9. Death and the cinematic

On a fatal bite:
- Play a short **shark-loss cinematic** (≈ 6–8 s): the camera tilts down to a lone swimmer treading water in a huge dark-blue empty ocean (full-screen procedural ocean gradient, waves and light shafts), a big shark silhouette rises from below through the translucent water and bursts up at the swimmer, spray particles, red tint, quick cut to black. No input during it (except allow tap-to-skip after 2 s). Camera FOV for this cinematic stays moderate (~60°).
- Then a **LOST AT SEA / CHOMPED! (or BLASTED! if a mine)** panel with a named death line (e.g. "Bruce got you." / "The Tiger cut you off." / "You walked into your own mine."), your score, best score, and buttons: **SWIM AGAIN** (respawn on the raft with score and contract progress kept, gear lost) and **SAVE SCORE**.
- Prevent respawning for ~8 seconds after the shark ending starts so the cinematic can finish.

## 10. Blood in the water

When a life jacket saves you, you "bleed" for 2 rounds: draw a red cloud blob that follows your cell on the water, show a "BLOOD IN THE WATER" pill, and make you the priority target (assignment cost bonus ≈ 3 rounds closer) so the pack comes for you.

## 11. Audio (all synthesized with WebAudio, no files)

- Ambient ocean bed: filtered noise with slow LFO swell, plus creaking raft wood on the raft.
- A tension **heartbeat** (two-thump pulse with low sine/kick) whose rate and volume rises with how many hunters are targeting you (0 = off or very slow, 3 = fast).
- **Lock-on sting**: when a new shark starts hunting you, a short sharp dissonant violin-like stab + low thump (original synth).
- Per-depth mood: calm on raft, ominous drone tiers 1–2, dissonant pulses at 3+, a driving low ostinato (original) at 5+. Crossfade with a master gain; don't swap tracks mid-phase.
- SFX: coin ding, pickup, mine plant beep, mine explosion (noise burst + sub), harpoon whoosh/thud, chomp, splash on respawn, UI taps.
- A global mute button; audio starts on first user gesture.

## 12. HUD (compact, clean, top safe area)

Top-left: score (gold), lives/jackets (`x2`), current depth ("DEPTH 3" or "PRACTICE RAFT"). Top-center: turn timer bar + "PICK A MOVE"/"GO!" + status line ("PLAN UP TO 2 STEPS — OR STAY", "STAYING", "CHOMPED"). Top-right: mute + leaderboard buttons, and a small radar (circle with dots: your hunters in red). A "HUNTED ×N" pill when hunted. Bottom-left: d-pad (touch). Bottom-right: stacked gear buttons: SET MINE (with count), HARPOON (count), DROP CHUM (count) — each shows the reason when disabled ("OPEN WATER ONLY", "FIND A MINE", "NO SHARK IN RANGE"). Contracts panel at left under the HUD, collapsible. Hint overlay when standing in danger: "YOUR SPOT IS ON A SHARK LANE".
Use a consistent palette: dark navy/teal UI backgrounds, gold for score, coral/red for danger, aqua for info, mint for success. Use clean system sans-serif fonts. No emoji (they may not render on some phones): draw icons with SVG/canvas.

## 13. Multiplayer (nice-to-have, make it optional)

First make the game fully playable single-player with simulated AI-free rounds (the only other actors are sharks). If the platform supports real-time multiplayer, then make it **server-authoritative**: the server owns round clock, sharks, pickups, mines, scores; clients send only intents (plan steps, plant mine, harpoon, drop chum, respawn, save score). Multiple players share the same ocean, can see each other's swimmers (colored buoy-heads with names), and packs adapt (+1 hunter when 4+ players are in open water). If the connection to the server doesn't respond for ~12 s, show a modal "LOST AT SEA — No multiplayer server. Reload to retry." Keep one codebase for game logic so the single-player mode simply runs the server logic locally.

## 14. Performance and quality

- Target a steady 60 FPS on a mid-range Android phone: pool everything (sharks, pickups, mines, FX), cap draw calls, no heavy post-processing, use InstancedMesh/batched geometry for grid and lanes, low-poly shapes, and cheap shader water.
- Draw grid only around the player; only update visible entities.
- Load fast (< 3 s), no external requests. Handle tab-hidden pause (round clock pauses) and window resize.

## 15. Deliverable and structure

Deliver a single runnable web project (index.html + JS modules or one bundled file) with clear separate modules: `config` (all tunables in one object: grid size, cell size, plan time 3, execute time 1, base steps 2, boost steps 4/5 rounds, mine fuse 2, capacities, lane length 3, depth step 12, spawn ring 5–10, despawn 15, pools, fairness floor, wander chance, hunter caps, all the numbers above), `game logic` (round state machine, sharks AI, pickups, mines, scoring, contracts), `render` (scene, water, sharks, lanes, effects, camera), `audio` (WebAudio synth), `ui` (HUD, menus, death panel, leaderboard), `input` (touch + keyboard).
Include a short README-style note at the top of the code explaining how to tweak the config.

## 16. First-minute experience (must be great)

1. Game loads straight onto the raft at dusk with calm ocean sounds, a title "SHARK BOARD — Don't go in the water", and a "TAP TO START" (this also unlocks audio).
2. The practice raft panel teaches the 3-second plan / 1-second go rhythm with a safe visible shark circling far off, lanes visible but harmless.
3. As soon as the player swims off the raft, the first shark lane appears and the heartbeat starts. The first death should be fast, fair and cinematic — and make the player instantly want to tap SWIM AGAIN.

Make it feel scary, readable and snappy. Prioritise clear telegraphing (lane colors), fair-but-tense AI, and satisfying feedback (shake, flashes, sounds) over extra features. If time-limited, cut in this order: multiplayer → chum → harpoon → contracts, but keep the raft, sharks with telegraphed lanes, coins, depth tiers, life jackets, mines, boost, death cinematic and leaderboard.
