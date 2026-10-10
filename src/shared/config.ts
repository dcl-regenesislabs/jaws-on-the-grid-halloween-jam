// Board config, shared by server (game logic) and client (presentation).
export const CELL = 4 // meters per cell
export const GRID = 200 // cells per side: 50 parcels × 16 m / 4 m
export const BOARD_SIZE = GRID * CELL // 800 m, the whole scene
// Water sits above the real avatars' heads (floor collider at y=0) so they
// are hidden underwater; the AvatarShape copies swim at AVATAR_Y instead.
export const WATER_Y = 2.4
export const AVATAR_Y = WATER_Y - 1.2 // neck-deep
export const SHARK_ENDING_TIME = 8.8 // seconds before the losing player can respawn
export const CENTER_CELL = GRID / 2

// Safe harbor: a fixed 6×6-cell raft at the center where players spawn and
// practise the turn rhythm. Sharks never enter, nothing scores; the game
// starts when you swim off it.
export const HARBOR_SIZE = 6
export const HARBOR_MIN = CENTER_CELL - HARBOR_SIZE / 2 // first raft cell (both axes)
export const HARBOR_MAX = HARBOR_MIN + HARBOR_SIZE - 1 // last raft cell
export const RAFT_Y = WATER_Y + 0.12 // deck height; avatars stand on it

// Global turns (seconds). Server is the authority; clients only use these
// for presentation (timer bar, glide/lunge animation).
// PLAYERS_TIME: everyone picks a neighbouring cell (or stays).
// SHARKS_TIME: execution — players swim to their picks while sharks dash.
export const PLAYERS_TIME = 3
export const SHARKS_TIME = 1

// Steps a player may plan per turn. Per-player in PlayerSlot.maxSteps so a
// future BOOST pickup can raise it; this is the starting value.
export const BASE_STEPS = 2
export const BOOST_STEPS = 4
export const BOOST_ROUNDS = 5
export const MINE_ROUNDS = 2
export const MAX_MINES = 24
export const MINE_CAPACITY = 3
export const JACKET_CAPACITY = 2
export const SHARK_BOUNTY = 75

// Harbor is always safe. No diagonal damage or expanding blast radius.
export function blastCells(i: number, j: number): [number, number][] {
  return ([[i, j], [i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as [number, number][])
    .filter(([x, z]) => inBoard(x, z) && !inHarbor(x, z))
}

// Step codes used in planned paths.
export const STEP_DIRS: [number, number][] = [
  [0, 1], // 0 up
  [0, -1], // 1 down
  [-1, 0], // 2 left
  [1, 0] // 3 right
]

// Cells visited by a path of step codes from (i, j), excluding the start.
export function pathCells(i: number, j: number, steps: readonly number[]): [number, number][] {
  const out: [number, number][] = []
  for (const code of steps) {
    const d = STEP_DIRS[code]
    if (!d) break
    i += d[0]
    j += d[1]
    out.push([i, j])
  }
  return out
}

// Sharks: each one shows its lunge lane during the players' turn, then
// dashes along it during the sharks' turn. Anyone on the lane is bitten.
export const LUNGE_CELLS = 3
export const HUNT_RADIUS = 8 // cells; a free shark this close can be assigned to hunt you

// Endless feel: sharks and pickups live only around players. They surface
// in a ring just outside view and sink once nobody is near.
export const VIEW_CELLS = 9 // grid drawn around you (client)
export const SPAWN_MIN = 5
export const SPAWN_MAX = 10
export const DESPAWN_CELLS = 15
export const MAX_SHARKS = 48 // synced pool
export const MAX_PICKUPS = 40 // synced pool

// Deeper water (farther from the harbor) = more sharks and richer coins.
export const DEPTH_STEP = 12 // cells per depth tier
export const SHARKS_NEAR_BASE = 3
export const SHARKS_PER_TIER = 1
export const SHARKS_NEAR_MAX = 9
export const PICKUPS_NEAR = 7

export const COIN_POINTS = 10 // × (1 + tier)
export const SURVIVAL_BONUS = 25 // life buoy saves you
export const LIFE_DROP_CHANCE = 0.12

// Lanes are walls: a planned path may not cross a shark or its lane, so you
// swim around them. false = old rule (only your final cell is checked).
export const LANES_BLOCK_PATHS = true

// Smart sharks. STARTING TUNABLES, not validated: tune by playtest.
// Each player is hunted by a small pack: a chaser ("Bruce") that runs its
// lane straight through you and blockers ("the Tiger") that cut off where
// you're heading. Every other shark ignores players and circles.
export const HUNTERS_BY_TIER = [1, 2] // hunters per player by depth tier; last value repeats
export const CROWD_PLAYERS = 4 // this many players out in open water...
export const CROWD_BONUS = 1 // ...add this many hunters per player
export const MAX_HUNTERS = 3
export const HUNT_LEASH = 12 // chebyshev; a hunter farther than this lets go
export const ROLE_SWAP_TURNS = 1 // a blocker becomes chaser only if it can strike this much sooner
export const RAFT_GRACE = 1 // planning turns after leaving the raft before anyone hunts you
export const SAFE_FLOOR_BY_TIER = [6, 5, 4, 3, 3, 2] // min safe end cells (per 13 reachable)
export const WANDER_BITE_TIER = 3 // below this, non-hunters never touch a player's reachable cells
export const WANDER_TURN_CHANCE = 0.3
export const CIRCLE_MIN = 4 // wanderers orbit the nearest player between these distances
export const CIRCLE_MAX = 9
export const ELROY_TIER = 5 // from this tier the chaser lunges ELROY_LUNGE cells
export const ELROY_LUNGE = 4
export const W_AHEAD = 1 // blocker: extra weight for cells along the player's escape direction
export const W_PICKUP = 1 // blocker: extra weight for cells holding a pickup
export const S_PINCER = 4 // blocker: bonus for ending opposite the chaser (half for an L)
export const S_PARK = 0.5 // blocker: cost per cell of distance from where you're running to

// Blood in the water: a jacket save makes you the priority target.
export const BLOOD_TURNS = 2
export const BLOOD_PULL = 30 // assignment cost bonus (≈ 3 turns closer)

// Yellow barrels: harpoon a shark within reach; it lunges short and stops
// hunting for a while. Enough barrels and it sinks for the bounty.
export const BARREL_CAPACITY = 3
export const BARREL_RANGE = 2 // chebyshev
export const BARREL_TURNS = 3
export const BARREL_LUNGE = 2
export const BARRELS_TO_SINK = 3

// Chum: dropped on your cell, it pulls nearby sharks to it for a few turns.
export const CHUM_CAPACITY = 1
export const CHUM_TURNS = 2
export const CHUM_RADIUS = 6
export const CHUM_SHARKS = 3
export const MAX_CHUM = 8 // synced pool

// Bots: server-run players with a made-up name and random base wearables.
// Same slot, avatar, rules and actions as a real player (src/server/bots.ts);
// nothing on the client tells them apart. Each bot takes a share of the
// shark and pickup pools like a player does (MAX_SHARKS, MAX_PICKUPS).
export const BOT_COUNT = 2 // bots kept in the world; 0 turns them off
export const BOT_PLAY_SECONDS = 300 // a bot plays this long, then lets the sharks get it
export const BOT_PLAY_JITTER = 20 // ± seconds, so bots don't all lose on the same turn
export const BOT_LEAVE_CHANCE = 0.4 // after losing: leave (a new bot joins later) instead of swimming again
export const BOT_SAVE_SCORES = false // true: bots press SAVE SCORE on the leaderboard like players
export const BOT_MAX_DEPTH = 10 // cells from the raft's centre (its edge is 3); bots stay in sight of the raft

export function cellCenter(i: number): number {
  return (i + 0.5) * CELL
}

// Chebyshev distance from the harbor center.
export function depthOf(i: number, j: number): number {
  return Math.max(Math.abs(i - CENTER_CELL), Math.abs(j - CENTER_CELL))
}

export function tierOf(i: number, j: number): number {
  return Math.floor(depthOf(i, j) / DEPTH_STEP)
}

export function inHarbor(i: number, j: number): boolean {
  return i >= HARBOR_MIN && i <= HARBOR_MAX && j >= HARBOR_MIN && j <= HARBOR_MAX
}

export function inBoard(i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < GRID && j < GRID
}

// Cells a shark occupies this turn: its own cell plus its lane. With
// LANES_BLOCK_PATHS these are walls for planned paths.
export function sharkCells(s: { cellI: number; cellJ: number; dirX: number; dirZ: number; len: number }): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k <= s.len; k++) out.push([s.cellI + s.dirX * k, s.cellJ + s.dirZ * k])
  return out
}
