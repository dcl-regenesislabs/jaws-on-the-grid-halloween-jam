// Board config, shared by server (game logic) and client (presentation).
export const GRID = 8 // cells per side
export const CELL = 4 // meters per cell
export const BOARD_SIZE = GRID * CELL // 32 m
export const WATER_Y = 1.2 // chest height; floor collider stays at y=0
export const CENTER_CELL = Math.floor(GRID / 2)

// Turn timing (seconds). Server is the authority; client uses these only for
// local presentation (countdowns, animations).
export const PLAYERS_TIME = 2
export const STEP_TIME = 0.6
export const TELEGRAPH_TIME = 0.9
export const ATTACK_TIME = 1.0
export const SHARKS_MOVE_TIME = 3 * STEP_TIME // 1.8
export const SHARKS_ATTACK_TIME = TELEGRAPH_TIME + ATTACK_TIME // 1.9

export const SHARK_SPOTS: [number, number][] = [
  [1, 1],
  [6, 1],
  [3, 3],
  [1, 6],
  [6, 6]
]

export const COIN_POINTS = 10
export const SURVIVAL_BONUS = 25
export const LIFE_DROP_CHANCE = 0.15
export const PICKUP_INTERVAL = 5
export const MAX_PICKUPS = 8
export const STUN_SECONDS = 3
export const ATTACK_COOLDOWN = 3

export function cellCenter(i: number): number {
  return (i + 0.5) * CELL
}
