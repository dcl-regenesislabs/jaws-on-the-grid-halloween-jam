import { InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'

import { ATTACK_COOLDOWN, MOVES_PER_TURN, inBoard } from '../shared/config'
import { room } from '../shared/messages'
import { gameState, mySlot, predicted } from './state'

// Input + prediction. Touch d-pad/slap come from ui.tsx; desktop keys are an
// optional extra (WASD/arrows hop, E slaps). Server is the authority: a
// prediction it doesn't confirm snaps back.

let clock = 0
let movesTurn = -1
let movesUsed = 0
let lastSlapAt = -999

const KEYS: [InputAction, number, number][] = [
  [InputAction.IA_FORWARD, 0, 1],
  [InputAction.IA_BACKWARD, 0, -1],
  [InputAction.IA_LEFT, -1, 0],
  [InputAction.IA_RIGHT, 1, 0]
]

function syncTurn(): void {
  const { turn } = gameState()
  if (turn !== movesTurn) {
    movesTurn = turn
    movesUsed = 0
  }
}

export function canMoveNow(): boolean {
  syncTurn()
  const slot = mySlot()
  return (
    !!slot &&
    !slot.dead &&
    !slot.stunned &&
    gameState().phase === 'players' &&
    slot.movesLeft > 0 &&
    movesUsed < MOVES_PER_TURN
  )
}

export function requestMove(di: number, dj: number): void {
  if (!canMoveNow()) return
  const slot = mySlot()!
  const ni = slot.cellI + di
  const nj = slot.cellJ + dj
  if (!inBoard(ni, nj)) return
  movesUsed += 1
  predicted.active = true
  predicted.i = ni
  predicted.j = nj
  predicted.at = clock
  room.send('move', { di, dj })
}

export function slapCooldownLeft(): number {
  return Math.max(0, ATTACK_COOLDOWN - (clock - lastSlapAt))
}

export function requestSlap(): boolean {
  const slot = mySlot()
  if (!slot || slot.dead || slot.stunned || slapCooldownLeft() > 0) return false
  lastSlapAt = clock
  room.send('attack', {})
  return true
}

export function inputSystem_(dt: number): void {
  clock += dt

  // Desktop keyboard (touch players use the on-screen d-pad).
  for (const [action, di, dj] of KEYS) {
    if (inputSystem.isTriggered(action, PointerEventType.PET_DOWN)) {
      requestMove(di, dj)
      break
    }
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) requestSlap()

  // Reconcile: server echoed the cell → done; no echo in time (rejected
  // move) or I died → snap back to the authoritative cell.
  if (!predicted.active) return
  const slot = mySlot()
  if (!slot || slot.dead || (slot.cellI === predicted.i && slot.cellJ === predicted.j) || clock - predicted.at > 1.2) {
    predicted.active = false
  }
}
