import { InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'

import { ATTACK_COOLDOWN, PLAYERS_TIME, STEP_DIRS, inBoard, pathCells } from '../shared/config'
import { room } from '../shared/messages'
import { gameState, myMaxSteps, myPlan, mySlot, pendingPlan, phaseElapsed } from './state'

// Input. During the players' turn you plan a path of up to maxSteps cells:
// each arrow adds a step, the opposite of the last step undoes it, CANCEL
// clears it. Execution moves everyone at once. Touch d-pad/slap/cancel come
// from ui.tsx; desktop keys are an optional extra (WASD/arrows, E slap, F cancel).

let clock = 0
let lastSlapAt = -999

// Plans this close to the end of the turn would reach the server too late.
const LATE_TAP = 0.15

// Desktop keys → step codes (STEP_DIRS order: up, down, left, right).
const KEYS: [InputAction, number][] = [
  [InputAction.IA_FORWARD, 0],
  [InputAction.IA_BACKWARD, 1],
  [InputAction.IA_LEFT, 2],
  [InputAction.IA_RIGHT, 3]
]

const OPPOSITE = [1, 0, 3, 2]

export function canPlanNow(): boolean {
  const slot = mySlot()
  return (
    !!slot &&
    !slot.dead &&
    !slot.stunned &&
    gameState().phase === 'players' &&
    phaseElapsed() < PLAYERS_TIME - LATE_TAP
  )
}

function sendPlan(steps: number[]): void {
  pendingPlan.active = true
  pendingPlan.steps = steps
  pendingPlan.at = clock
  room.send('plan', { steps })
}

// Can this arrow add a step (or undo the last one) right now?
export function canStep(code: number): boolean {
  if (!canPlanNow()) return false
  const plan = myPlan()
  if (plan.length > 0 && plan[plan.length - 1] === OPPOSITE[code]) return true
  if (plan.length >= myMaxSteps()) return false
  const slot = mySlot()!
  const cells = pathCells(slot.cellI, slot.cellJ, [...plan, code])
  const [i, j] = cells[cells.length - 1]
  return inBoard(i, j)
}

export function requestStep(code: number): void {
  if (!canStep(code) || !STEP_DIRS[code]) return
  const plan = myPlan()
  if (plan.length > 0 && plan[plan.length - 1] === OPPOSITE[code]) sendPlan(plan.slice(0, -1))
  else sendPlan([...plan, code])
}

export function requestCancel(): void {
  if (!canPlanNow() || myPlan().length === 0) return
  sendPlan([])
}

export function slapCooldownLeft(): number {
  return Math.max(0, ATTACK_COOLDOWN - (clock - lastSlapAt))
}

export function canSlapNow(): boolean {
  const slot = mySlot()
  return !!slot && !slot.dead && !slot.stunned && gameState().phase === 'players' && slapCooldownLeft() <= 0
}

export function requestSlap(): boolean {
  if (!canSlapNow()) return false
  lastSlapAt = clock
  room.send('attack', {})
  return true
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, k) => v === b[k])
}

export function inputSystem_(dt: number): void {
  clock += dt

  // Desktop keyboard (touch players use the on-screen d-pad).
  for (const [action, code] of KEYS) {
    if (inputSystem.isTriggered(action, PointerEventType.PET_DOWN)) {
      requestStep(code)
      break
    }
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) requestSlap()
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) requestCancel()

  // Reconcile: the server echoed my plan → its copy takes over; no echo in
  // time (rejected), turn over, stunned or dead → drop the local one.
  if (!pendingPlan.active) return
  const slot = mySlot()
  const echoed = !!slot && samePath(Array.from(slot.path), pendingPlan.steps)
  if (!slot || slot.dead || slot.stunned || echoed || gameState().phase !== 'players' || clock - pendingPlan.at > 1.2) {
    pendingPlan.active = false
  }
}
