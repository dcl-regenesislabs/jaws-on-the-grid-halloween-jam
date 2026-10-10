# Smart sharks: exploratory try (2026-10-10)

Owner choices: [decisions.md](../decisions.md) (2026-10-10, smart sharks). No
registered criterion; this is an exploratory build for Kuruk to play.

## What is built

- **Packs.** Each hunted player gets a chaser ("Bruce": longest lane straight through
  you, overshooting) and blockers ("the Tiger": the lane that removes the most of your
  safe end cells, favouring your escape direction and nearby pickups, from the side
  opposite Bruce). Hunter cap: 1 at tier 0, 2 deeper, +1 with 4+ players in open
  water, +1 while bleeding; max 3. Assignments stick, with a leash of 12 cells; roles
  only swap when the other shark is a full turn quicker.
- **Wanderers** circle 4-9 cells out and stay out of reach below tier 3. Freshly
  surfaced sharks get one turn where you can see them before they can hunt, and spawn
  at least 5 cells from every player.
- **Lanes are walls** (`LANES_BLOCK_PATHS`): server rejects paths through a shark or
  lane; d-pad arrows into them are disabled.
- **Fairness floor.** No lane may cut a player's safe end cells below
  `SAFE_FLOOR_BY_TIER` (it counts walls, lanes and due mine blasts). Holding still is
  always allowed. This removes the old board-edge and corner traps.
- **Gear and extras.** Yellow barrels (pickup + HARPOON within 2 cells: short lunges,
  no hunting for 3 rounds, 3 barrels sink it for the bounty). Chum (pickup + DROP:
  up to 3 sharks within 6 cells go for it for 2 rounds). Blood in the water (a jacket
  save makes you the priority target for 2 rounds). Named deaths. Lock-on sting and a
  heartbeat pulse that quickens with your pack (original synthesized WAVs).
- **Readability.** The fin snaps to where the lunge ended. Lane colour is decided per
  viewer: red = hunting you, orange = in your reach, grey-blue = out of reach.
  Bruce's lane ends in a fang, the Tiger's in a crossbar, and your pack's fins are
  bigger. A HUNTED xN pill and your hunters on the radar.
- **SLAP removed.**

## Checks so far (mechanical, not playtests)

- `npm run build`: passes.
- `node scripts/test-sharks.cjs` (also with `LANES_OFF=1`): 10 scenarios pass.
  - Covered: cap per tier and crowd, one chaser per player, Bruce lines up through you,
    wall validation, fresh-shark grace, harpoon/sink, chum lure and expiry, blood and
    named deaths, plus regressions from the review (a resurfaced shark can't carry over
    an old hunt; chum takes lured sharks off the dropper's pack).
  - Fuzz: 5 seeds × 120 rounds × 6 players, including corners and edges. Every round
    the floor holds, there are no lane overlaps, and the server accepts every
    wall-aware plan.
- Model numbers from that fuzz, with a scripted 80%-careful random swimmer: these are
  not human results.

  | Lanes | Bites per 100 player-rounds | On Bruce's line | Avg safe end cells |
  |---|---|---|---|
  | walls on | 2.0 | 49% of rounds | 6.7 |
  | walls off | 1.2 | 51% | 7.9 |

- `node scripts/test-endgame.cjs`: 8 scenarios still pass (slap asserts removed).
- An agent code review found 5 issues in this change set; all are fixed. A sixth,
  the phase clock pausing while dead (in `state.ts`, from other work), was left for
  the owner.

## Not yet done

No phone, PC-mobile or desktop pass of this build. The barrel icon is a placeholder
(`assets/images/items/barrel.png`, drawn in code).

## Questions to answer by playing

- Can you tell which sharks are after you within 1-2 turns? Do Bruce and the Tiger
  read as different?
- Do lane walls make the 3 s planning feel tense-but-fair, or cramped?
- Can you explain each death? Does any feel unfair?
- Do roles flicker? Do sharks get stuck at the raft or the edge?
- Is the heartbeat a useful warning or noise? Are HARPOON and CHUM worth a tap?

## Next step

Suggested (not chosen): Kuruk plays it on the phone. Fix the phone first, then the
PC mobile client, then desktop.
