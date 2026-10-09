import { PlayerIdentityData, engine } from '@dcl/sdk/ecs'

import { GameState, PlayerSlot, Shark } from '../shared/components'

// Client-side shared state: synced-slot accessors, the local phase clock and
// the predicted cell (input.ts) that the presentation follows.
//
// NOTE: no getPlayer() anywhere — its internal getUserData promise rejects with
// 'channel closed' on scene reloads and kills the scene's update loop. The
// local address comes straight from PlayerIdentityData instead.

function myAddress(): string {
  return (PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? '').toLowerCase()
}

// My slot by wallet address. A lone slot is mine too (guest/review mode,
// where the server may key slots by entity instead of address).
export function mySlot(): ReturnType<typeof PlayerSlot.getOrNull> {
  const address = myAddress()
  let only: ReturnType<typeof PlayerSlot.getOrNull> = null
  let count = 0
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (address && slot.address === address) return slot
    only = slot
    count++
  }
  return count === 1 ? only : null
}

export function gameState(): { phase: string; turn: number } {
  for (const [_e, state] of engine.getEntitiesWith(GameState)) return state
  return { phase: 'players', turn: 0 }
}

// --- prediction: the hop shows on tap; the server confirms or we snap back ---
export const predicted = { active: false, i: 0, j: 0, at: 0 }

// The cell the presentation shows as mine: predicted if pending, else synced.
export function myCell(): { i: number; j: number } | null {
  const slot = mySlot()
  if (!slot) return null
  return predicted.active ? { i: predicted.i, j: predicted.j } : { i: slot.cellI, j: slot.cellJ }
}

// --- local phase clock: seconds since the current phase started ---
let phaseKey = ''
let phaseClock = 0
const phaseListeners: ((phase: string) => void)[] = []

export function phaseElapsed(): number {
  return phaseClock
}

export function onPhaseStart(cb: (phase: string) => void): void {
  phaseListeners.push(cb)
}

export function phaseClockSystem(dt: number): void {
  const state = gameState()
  const key = `${state.phase}:${state.turn}`
  if (key !== phaseKey) {
    phaseKey = key
    phaseClock = 0
    for (const cb of phaseListeners) cb(state.phase)
  } else {
    phaseClock += dt
  }
}

// Is my (shown) cell on a shark's lane right now?
export function myCellInDanger(): boolean {
  const slot = mySlot()
  const cell = myCell()
  if (!slot || slot.dead || !cell) return false
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (!s.active || s.phase !== 'plan' || s.len <= 0) continue
    for (let k = 0; k <= s.len; k++) {
      if (s.cellI + s.dirX * k === cell.i && s.cellJ + s.dirZ * k === cell.j) return true
    }
  }
  return false
}
