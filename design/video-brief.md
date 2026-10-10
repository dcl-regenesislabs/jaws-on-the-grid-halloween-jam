# JAWS ON THE GRID — Video brief

**Who this is for:** the agent/prompt that builds the presentation video (the music template already exists).
**What it does:** explains how the game works, then proposes what to record and what titles/slides/text go on screen.
**Authors:** Manu and Kuruk. Halloween Horror Jam, Decentraland, 2026-10-09/10.
**Rule for the agent:** only claim what is in this file. Where it says "not verified", do not present it as proven.

---

## 1. The game in one breath

> You are a swimmer in a dark ocean. Everyone plans their moves at the same time, then everyone swims at the same time, while the sharks lunge. Don't be on the red lane when the sharks come.

A **multiplayer, turn-based survival game on a grid**, playable on the **phone** (Decentraland mobile app) and on desktop. Horror comes from **dread and anticipation**, not gore: you can *see* where the shark will strike, and you still have to guess where to be.

**Title:** JAWS ON THE GRID · **Tagline options (pick one):**
- "Plan. Swim. Don't get bitten."
- "The sharks show you where they'll strike. Do you trust it?"
- "Last swimmer standing."

## 2. The world

- A huge open ocean: a 200×200 grid of 4 m cells (800 m per side, the whole scene, 50×50 parcels).
- Camera is **top-down**, fixed above you. You see the water, grid lines around you, fins, coins.
- You spawn on the **Practice Raft** in the middle (6×6 cells): a **safe harbor**. No sharks, no points. Swim off it and the game starts.
- It feels endless: sharks and pickups only exist near players. They surface just outside your view and sink when nobody is close.
- **Depth tiers:** every 12 cells away from the raft the water is *deeper*: more sharks near you (3 at the raft edge, up to 9), coins worth more, more survival points.
- The soundtrack changes with depth: Jaws-style loops from calm (raft) → tension → danger → climax (deepest).

## 3. How one round works (the core loop)

Everyone shares the same clock. A round has two phases:

| Phase | Time | What happens |
|---|---|---|
| **PLANNING** | 3 s | Every player picks their path: **2 steps** (up/down/left/right), tapped on the on-screen pad. Meanwhile each shark **shows a red lane** on the water: its own cell + up to 3 cells ahead. This is the warning. |
| **SWIM / SHARKS** | 1 s | Nobody can change anything. Players glide along their planned path. Sharks **dash down their red lanes**. The screen washes red. |

**The kill rule (key sentence for the video):** *If you end the round standing on a shark's lane, you're bitten.* Only your final cell counts.

Sharks come in two kinds: **wanderers** (move randomly) and **hunters** (darker red; chase the nearest player within 8 cells). So the lane tells you *where*, not *why*. A hunter's lane is probably aimed at you.

**Why it is tense:** the lanes are visible but you only have 3 seconds, everyone moves at once, and other swimmers are also in your way.

## 4. Things to pick up (swim over them)

| Item | Effect |
|---|---|
| **Coin** | Points. Worth more the deeper you are (10 × (1 + depth tier)). |
| **Life jacket** | Saves you from **one shark bite** (holds up to 2). Does *not* protect from mine blasts. |
| **Swim boost** | **4 steps per round instead of 2, for 5 rounds.** Go farther, escape faster. |
| **Sea mine** | Carry up to 3. Plant on your tile; it **explodes after 2 rounds** in a **plus shape** (center + 4 cardinal neighbors). Kills **sharks and players**, including you. The camera shakes. The raft is never blasted. |

Mines flip the game: you are not only prey; you can **hunt**. Killing a shark gives a **+75 bounty**.

## 5. Player vs player

- **STUN NEARBY** button (4 s cooldown): stuns a nearby swimmer so they miss their planning. A stunned player can't swim away, so being stunned near a lane is deadly. (Design note from the owner's ideas file: "stun leaves you vulnerable, probably yes = the fun".)
- Mines can also kill other players. Everyone shares the same ocean.

## 6. Goals and score

- **Points:** survive each round at depth, collect coins, shark bounties.
- **Three contracts ("Expedition N")** shown on the HUD. Finish all three and a harder expedition starts:
  - SALVAGE RUN: collect coins (5 + 3×level)
  - SHARK HUNTER: blast sharks (1 + level)
  - DEEP DIVER: reach a deeper tier (2 + level, max 8)
- **Death = "LOST AT SEA":** a short shark-bite cinematic (about 8 s, underwater shark mouth), then respawn on the raft. **Score and contract progress are kept; gear is lost.**
- **Leaderboard:** top 10, opt-in via a SAVE SCORE button (stored per world, keeps each name's best).

## 7. Under the hood (for a "how we built it" slide)

- Decentraland **SDK7** scene, published to our **World**; built only with the CLI.
- **Authoritative multiplayer server:** a headless server decides sharks, pickups, turns, deaths, scores. Clients only send *intentions* (move, plant mine, stun, respawn) and the server validates them.
- **Mobile-first:** custom touch controls (d-pad, mine and stun buttons), no keyboard needed, HUD inside the phone's safe area. Desktop gets keyboard (WASD/arrows) as an extra.
- Sign-in required (guest accounts are blocked).
- Assets: Quaternius CC0 animated shark, Kenney CC0 interface sounds, generated 2D item art, Jaws-style music loops (see caveats).

## 8. Recommended video structure (~60-90 s)

Match cuts to the music template. Suggested timings are proposals, adapt to the beat.

| # | Time | On-screen title / text | What to show (record) | Voice / caption idea |
|---|---|---|---|---|
| 1 | 0-5 s | **JAWS ON THE GRID** (huge, fade in from black) + tagline | Black → slow reveal of the ocean from above; a single fin crossing the frame. Or `assets/images/jaws-on-the-grid-thumbnail-en.png` as the title card. | "There's something in the water." |
| 2 | 5-12 s | **A HORROR TURN-BASED GAME** · "Phone-first · Multiplayer · Decentraland" | Phone in hand (or screen recording) at the raft: the swimmer on the Practice Raft, buoys, ocean ambience. | "Everyone moves at once. So do the sharks." |
| 3 | 12-24 s | **1. PLAN** (3 s) → **2. SWIM** (1 s) | Screen record one full round: tap two steps on the pad, show the timer bar, red lanes visible, then red wash as the sharks dash. Slow-mo the dash. Add a big "3...2...1" overlay on the planning bar. | "Three seconds to plan. The sharks tell you where they'll strike." |
| 4 | 24-30 s | **IF YOU END ON THE RED LANE, YOU'RE BITTEN** | Zoom on a red lane; player ends on it; or dodges at the last cell. Use a diagram overlay: arrow of path, red lane crossing. | "Only your last tile matters." |
| 5 | 30-38 s | **THE DEEPER YOU GO, THE MORE SHARKS. THE MORE POINTS.** | Swim away from the raft; show depth tier change, coin value increase, music getting tense. | "Deeper water. Bigger risk. Bigger reward." |
| 6 | 38-52 s | **GEAR**: 🪙 Coin · 🦺 Life jacket · ⚡ Swim boost (4 moves, 5 rounds) · 💣 Sea mine | Four quick pickups, one per beat. Then the money shot: **plant a mine → wait 2 rounds → explosion in a plus shape, camera shake, shark dies, +75**. (Existing proof footage below.) | "Pick up gear. Plant a mine. Become the hunter." |
| 7 | 52-60 s | **STUN NEARBY** · "Other swimmers can ruin your day" | Two players near each other; one stuns the other next to a lane. (Needs a 2-client capture, see §10.) | "Friends are fun. Friends are also bait." |
| 8 | 60-68 s | **LOST AT SEA** | The death cinematic: underwater shark closing in, bite, black, full-screen LOST AT SEA, respawn on raft. "Score and contracts kept." | "You'll be back." |
| 9 | 68-76 s | **3 CONTRACTS · EXPEDITIONS · LEADERBOARD** | HUD close-up: SALVAGE RUN / SHARK HUNTER / DEEP DIVER cards, score, SAVE SCORE. | "Finish the contracts. Go deeper." |
| 10 | 76-90 s | **PLAY NOW** · "On your phone · Decentraland app" + World name/link + credits | Team names (Manu, Kuruk), tech line ("Authoritative multiplayer · SDK7"), credits for CC0 assets. Final shot: a fin slowly turning toward the camera. | "Swim off the raft." |

**Style notes**
- Short punchy titles, white/coral on dark navy water; red used only for danger (lanes, wash, LOST AT SEA), gold for score/contracts. The in-game HUD already uses mint/gold/coral.
- Show the phone as the primary device; desktop footage is optional B-roll.
- Keep text on screen ≤ 6 words per card. Let the red lane + sound do the scaring.
- Use hit-stops and silence before the shark dash (match the music's quiet gaps).

## 9. Footage and images already in the repo

Under `design/playtests/endgame/` (phone = Motorola Edge 60 Pro, via ADB):
- `mine-proof.mp4`, `adb-mine.mp4`: **plant → armed → detonation** and a shark killed (best clip for step 6).
- `adb-suicide.mp4` and `adb-suicide-death.png`: death sequence.
- `pc-mobile.avi`: PC mobile-emulation recording.
- Stills: `phone-boost.jpg` (4 slots / 5 rounds HUD), `phone-mine-countdown.jpg`, `phone-mine-detonation.jpg`, `phone-final.jpg`, `phone-game.png`, `phone-performance.jpg`, `bevy-desktop-margins.jpg`, `cinema-check.png`.
- `mine-frame-01…32.png`: frame sequence of the mine blast (usable as a frame-by-frame animation).

Game art: `assets/images/jaws-on-the-grid-thumbnail-en.png` (title card), `assets/images/items/` (shark fins, bite, coin, mine, boost, life jacket, trophy, bait), `design/concepts/endgame/` (full-size concept art).

## 10. What still needs recording (new capture list)

1. **Full-round screen recording on the phone**: planning bar, red lanes, red wash, sharks dashing (slow-mo version too).
2. **Depth progression**: swim from the raft outward through two tiers; capture music/shark density change.
3. **Coin / jacket / boost pickups** with their HUD feedback.
4. **Two-player moment** (needs two clients, e.g. phone + desktop browser at `https://decentraland.org/bevy-web/?preview=true&realm=http://localhost:8000&position=0,0`): stun and mine kills.
5. **Death cinematic → respawn on the raft**, full-screen.
6. **Contracts card completing** (EXPEDITION 1 → 2), and the leaderboard/SAVE SCORE.
7. A clean **raft opening shot** with ocean ambience, for the intro.

## 11. Honest caveats (do not hide these on screen)

- The game has been **smoke-tested by an agent on the phone, not yet playtested by humans for fun/pacing**. Don't claim "players love it".
- The Jaws music loops are **used as a reference/jam piece; game-use permission is unresolved**. Check before publishing the video or scene with that track; the video template's own music is separate.
- Some details are tunable and may have changed: 1 s swim phase (was 0.5 s), 2 base steps, lane length 3.
- The attack-splash sound license wording is unconfirmed (CC0 with a CC BY note). Credit it.
- The latest phone-side swim/float animation fixes were not confirmed on device yet.

## 12. One-paragraph pitch (for voice-over or description)

> JAWS ON THE GRID is a multiplayer horror game on a grid in Decentraland, built for the phone. In the dark ocean every swimmer plans their route in three seconds while the sharks mark their strike lanes in red; then everyone swims at once as the sharks dash. End your move on a lane and you're bitten. Go deeper for more sharks and bigger rewards, grab life jackets and swim boosts, plant sea mines to hunt the sharks, stun your friends, finish expedition contracts, and climb the leaderboard. Swim off the raft if you dare.
