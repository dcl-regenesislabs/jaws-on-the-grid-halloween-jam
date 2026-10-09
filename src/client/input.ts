import { InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'

import { ATTACK_COOLDOWN, PLAYERS_TIME, inBoard } from '../shared/config'
import { room } from '../shared/messages'
import { gameState, mySlot, myPick, pendingPick, phaseElapsed } from './state'

// Input. During the players' turn you pick a neighbouring cell (tap the same
// arrow again to stay); execution moves everyone at once. Touch d-pad/slap
// come from ui.tsx; desktop keys are an optional extra (WASD/arrows, E).

let clock = 0
let lastSlapAt = -999

// Picks this close to the end of the turn would reach the server too late.
const LATE_TAP = 0.15

const KEYS: [InputAction, number, number][] = [
  [InputAction.IA_FORWARD, 0, 1],
  [InputAction.IA_BACKWARD, 0, -1],
  [InputAction.IA_LEFT, -1, 0],
  [InputAction.IA_RIGHT, 1, 0]
]

export function canPickNow(): boolean {
  const slot = mySlot()
  return (
    !!slot &&
    !slot.dead &&
    !slot.stunned &&
    gameState().phase === 'players' &&
    phaseElapsed() < PLAYERS_TIME - LATE_TAP
  )
}

export function requestPick(di: number, dj: number): void {
  if (!canPickNow()) return
  const slot = mySlot()!
  const current = myPick()
  // Same arrow again = change of mind: stay.
  if (current.di === di && current.dj === dj) {
    di = 0
    dj = 0
  }
  if (!inBoard(slot.cellI + di, slot.cellJ + dj)) return
  pendingPick.active = true
  pendingPick.di = di
  pendingPick.dj = dj
  pendingPick.at = clock
  room.send('pick', { di, dj })
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

export function inputSystem_(dt: number): void {
  clock += dt

  // Desktop keyboard (touch players use the on-screen d-pad).
  for (const [action, di, dj] of KEYS) {
    if (inputSystem.isTriggered(action, PointerEventType.PET_DOWN)) {
      requestPick(di, dj)
      break
    }
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) requestSlap()

  // Reconcile: the server echoed my pick → its copy takes over; no echo in
  // time (rejected), turn over, stunned or dead → drop the local one.
  if (!pendingPick.active) return
  const slot = mySlot()
  const echoed = !!slot && slot.planDi === pendingPick.di && slot.planDj === pendingPick.dj
  if (!slot || slot.dead || slot.stunned || echoed || gameState().phase !== 'players' || clock - pendingPick.at > 1.2) {
    pendingPick.active = false
  }
}
