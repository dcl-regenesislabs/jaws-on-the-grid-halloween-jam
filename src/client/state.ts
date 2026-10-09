import { PlayerIdentityData, engine } from '@dcl/sdk/ecs'

import { GameState, PlayerSlot, Shark } from '../shared/components'

// Client-side shared state: synced-slot accessors, the local phase clock and
// my pick for the coming execution (shown at once, server confirms).
//
// NOTE: no getPlayer() anywhere — its internal getUserData promise rejects with
// 'channel closed' on scene reloads and kills the scene's update loop. The
// local address comes straight from PlayerIdentityData instead.

function myAddress(): string {
  return (PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? '').toLowerCase()
}

// My slot by wallet address. Without a known address (guest/review mode,
// where the server may key slots by entity), a lone slot is mine.
export function mySlot(): ReturnType<typeof PlayerSlot.getOrNull> {
  const address = myAddress()
  let only: ReturnType<typeof PlayerSlot.getOrNull> = null
  let count = 0
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (address && slot.address === address) return slot
    only = slot
    count++
  }
  return !address && count === 1 ? only : null
}

export function gameState(): { phase: string; turn: number } {
  for (const [_e, state] of engine.getEntitiesWith(GameState)) return state
  return { phase: 'players', turn: 0 }
}

export function myCell(): { i: number; j: number } | null {
  const slot = mySlot()
  return slot ? { i: slot.cellI, j: slot.cellJ } : null
}

// --- my pick: shown on tap; the server's echo (planDi/planDj) takes over ---
export const pendingPick = { active: false, di: 0, dj: 0, at: 0 }

export function myPick(): { di: number; dj: number } {
  const slot = mySlot()
  if (pendingPick.active) return { di: pendingPick.di, dj: pendingPick.dj }
  return slot ? { di: slot.planDi, dj: slot.planDj } : { di: 0, dj: 0 }
}

// Where I'll be after the coming execution.
export function myTarget(): { i: number; j: number } | null {
  const cell = myCell()
  if (!cell) return null
  const pick = myPick()
  return { i: cell.i + pick.di, j: cell.j + pick.dj }
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

// Will I end the coming execution on a shark's lane?
export function myTargetInDanger(): boolean {
  const slot = mySlot()
  const cell = myTarget()
  if (!slot || slot.dead || !cell) return false
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (!s.active || s.phase !== 'plan' || s.len <= 0) continue
    for (let k = 0; k <= s.len; k++) {
      if (s.cellI + s.dirX * k === cell.i && s.cellJ + s.dirZ * k === cell.j) return true
    }
  }
  return false
}
