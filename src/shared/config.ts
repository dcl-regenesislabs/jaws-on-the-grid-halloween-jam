// Board config, shared by server (game logic) and client (presentation).
export const CELL = 4 // meters per cell
export const GRID = 200 // cells per side: 50 parcels × 16 m / 4 m
export const BOARD_SIZE = GRID * CELL // 800 m, the whole scene
// Water sits above the real avatars' heads (floor collider at y=0) so they
// are hidden underwater; the AvatarShape copies swim at AVATAR_Y instead.
export const WATER_Y = 2.4
export const AVATAR_Y = WATER_Y - 1.2 // neck-deep
export const CENTER_CELL = GRID / 2

// Safe harbor around the spawn: sharks never enter, no points either.
export const HARBOR_RADIUS = 2 // Chebyshev cells → a 5×5 square

// Global turns (seconds). Server is the authority; clients only use these
// for presentation (timer bar, glide/lunge animation).
// PLAYERS_TIME: everyone picks a neighbouring cell (or stays).
// SHARKS_TIME: execution — players swim to their picks while sharks dash.
export const PLAYERS_TIME = 2
export const SHARKS_TIME = 0.5

// Steps a player may plan per turn. Per-player in PlayerSlot.maxSteps so a
// future BOOST pickup can raise it; this is the starting value.
export const BASE_STEPS = 2

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
export const HUNT_RADIUS = 8 // cells; closer than this a shark hunts you
export const HUNT_CHANCE = 0.75

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
export const PICKUPS_NEAR = 5

export const COIN_POINTS = 10 // × (1 + tier)
export const SURVIVAL_BONUS = 25 // life buoy saves you
export const LIFE_DROP_CHANCE = 0.12
export const ATTACK_COOLDOWN = 4 // seconds

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
  return depthOf(i, j) <= HARBOR_RADIUS
}

export function inBoard(i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < GRID && j < GRID
}
