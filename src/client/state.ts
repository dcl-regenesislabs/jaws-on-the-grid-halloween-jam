import { engine } from '@dcl/sdk/ecs'

import { GameState, PlayerSlot } from '../shared/components'
import { BOARD_SIZE, cellCenter } from '../shared/config'

// Client-side shared state: synced-slot accessors, own-slot identity, and the
// world-shift / player-hop animation state for the infinite-board illusion.
//
// NOTE: no getPlayer() anywhere — its internal getUserData promise rejects with
// 'channel closed' on scene reloads and kills the scene's update loop.

// Own slot = the one that confirmed one of our predicted moves (server echoed
// the cell we predicted). Before that, a single connected player is us.
let ownAddress = ''

export function noteOwnSlot(address: string): void {
  ownAddress = address
}

export function mySlot(): ReturnType<typeof PlayerSlot.getOrNull> {
  let only: ReturnType<typeof PlayerSlot.getOrNull> = null
  let count = 0
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (ownAddress && slot.address === ownAddress) return slot
    only = slot
    count++
  }
  return count === 1 ? only : null
}

export function gamePhase(): string {
  for (const [_e, state] of engine.getEntitiesWith(GameState)) return state.phase
  return 'players'
}

// --- world shift + player hop ---
// The avatar is parked at the board center; on each step the world slides the
// other way (worldOffset) while the fake avatar hops one cell and returns
// (hopOffset). Tiling makes the world wrap invisible.
export const worldOffset = { x: 0, z: 0 }
export const worldTarget = { x: 0, z: 0 }

export function setWorldTarget(cellI: number, cellJ: number): void {
  worldTarget.x = BOARD_SIZE / 2 - cellCenter(cellI)
  worldTarget.z = BOARD_SIZE / 2 - cellCenter(cellJ)
}

export const HOP_TIME = 0.25
export const hop = { active: false, k: 0, dx: 0, dz: 0 }

export function startHop(di: number, dj: number): void {
  hop.active = true
  hop.k = 0
  hop.dx = di
  hop.dz = dj
}

// Triangle offset: out one cell and back over HOP_TIME.
export function hopOffset(): { x: number; z: number } {
  if (!hop.active) return { x: 0, z: 0 }
  const s = Math.sin(hop.k * Math.PI)
  return { x: hop.dx * s * 4, z: hop.dz * s * 4 } // CELL = 4
}
