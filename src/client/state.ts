import { PlayerIdentityData, engine } from '@dcl/sdk/ecs'

import { GameState, Mine, PlayerSlot, Shark } from '../shared/components'
import { LANES_BLOCK_PATHS, blastCells, inHarbor, pathCells, sharkCells } from '../shared/config'

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
export const endingPreview = { active: false }
// Authoring toggle: turn off when the cinematic review is finished.
const ENDING_DEBUG_ENABLED = true
let previewSlot: ReturnType<typeof PlayerSlot.getOrNull> = null

export function canPreviewEnding(): boolean {
  const slot = mySlot()
  return ENDING_DEBUG_ENABLED && !endingPreview.active && !!slot && !slot.dead && inHarbor(slot.cellI, slot.cellJ)
}

export function previewEnding(): void {
  if (!canPreviewEnding()) return
  const slot = mySlot()!
  previewSlot = { ...slot, dead: true, deathCause: 'shark', path: [] }
  pendingPlan.active = false
  endingPreview.active = true
}

export function finishEndingPreview(): void {
  endingPreview.active = false
  previewSlot = null
}

export function mySlot(): ReturnType<typeof PlayerSlot.getOrNull> {
  if (endingPreview.active) return previewSlot
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
  // The global round continues for survivors; a dead player's clock stops.
  if (mySlot()?.dead) return
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

export function myTargetInBlast(): boolean {
  const cell = myTarget()
  if (!cell) return false
  for (const [_e, mine] of engine.getEntitiesWith(Mine)) {
    if (!mine.active || mine.exploded || mine.detonateTurn > gameState().turn + 1) continue
    if (blastCells(mine.cellI, mine.cellJ).some(([i, j]) => i === cell.i && j === cell.j)) return true
  }
  return false
}

// With LANES_BLOCK_PATHS, sharks and their lanes are walls for my path.
export function isWall(i: number, j: number): boolean {
  if (!LANES_BLOCK_PATHS) return false
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (!s.active) continue
    for (const [ci, cj] of sharkCells(s)) if (ci === i && cj === j) return true
  }
  return false
}

// Sharks hunting me right now (my pack), and how close the nearest one is.
export function myHunters(): { count: number; nearest: number } {
  const slot = mySlot()
  let count = 0
  let nearest = Infinity
  if (!slot || slot.dead) return { count, nearest }
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (!s.active || s.role <= 0 || s.target !== slot.address) continue
    count++
    nearest = Math.min(nearest, Math.max(Math.abs(s.cellI - slot.cellI), Math.abs(s.cellJ - slot.cellJ)))
  }
  return { count, nearest }
}
