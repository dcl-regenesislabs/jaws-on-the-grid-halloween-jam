import { PlayerIdentityData, engine } from '@dcl/sdk/ecs'

import { GameState, PlayerSlot, Shark } from '../shared/components'
import { pathCells } from '../shared/config'

// Client-side shared state: synced-slot accessors, the local phase clock and
// my planned path for the coming execution (shown at once, server confirms).
//
// NOTE: no getPlayer() anywhere — its internal getUserData promise rejects with
// 'channel closed' on scene reloads and kills the scene's update loop. The
// local address comes straight from PlayerIdentityData instead.

function myAddress(): string {
  return (PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? '').toLowerCase()
}

// Ephemeral guest account (no wallet / social login)? Guests can't play.
export function isGuest(): boolean {
  return PlayerIdentityData.getOrNull(engine.PlayerEntity)?.isGuest === true
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

// --- my plan: shown on tap; the server's echo (slot.path) takes over ---
export const pendingPlan = { active: false, steps: [] as number[], at: 0 }

// Planned step codes while picking; empty during execution (slot.path then
// holds the path being swum, not a plan).
export function myPlan(): number[] {
  const slot = mySlot()
  if (!slot || gameState().phase !== 'players') return []
  if (pendingPlan.active) return pendingPlan.steps
  return Array.from(slot.path)
}

export function myMaxSteps(): number {
  return mySlot()?.maxSteps ?? 0
}

// Cells I'll swim through, last one = where I'll end the execution.
export function myPlanCells(): [number, number][] {
  const cell = myCell()
  return cell ? pathCells(cell.i, cell.j, myPlan()) : []
}

export function myTarget(): { i: number; j: number } | null {
  const cell = myCell()
  if (!cell) return null
  const cells = myPlanCells()
  const last = cells[cells.length - 1]
  return last ? { i: last[0], j: last[1] } : cell
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
