import { InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { BOARD_SIZE, GRID, MOVE_LIMIT, cellCenter } from '../shared/config'
import { room } from '../shared/messages'
import { gamePhase, mySlot, noteOwnSlot, setWorldTarget, startHop } from './state'
import { uiTickSfx } from './audio'

// Input + prediction. The real avatar is parked at the board center (hidden);
// movement slides the world (see state.ts / render.ts). Server is authority:
// predictions that don't get confirmed snap back.

let predicted: { i: number; j: number; at: number } | null = null
let clock = 0
let parked = false
let wasDead = false

const MOVES: [InputAction, number, number][] = [
  // Mobile d-pad (uiInputBinding; ACTION_3-6 don't drive locomotion, so they
  // survive InputModifier disableAll).
  [InputAction.IA_ACTION_3, 0, 1], // up
  [InputAction.IA_ACTION_4, 0, -1], // down
  [InputAction.IA_ACTION_5, -1, 0], // left
  [InputAction.IA_ACTION_6, 1, 0], // right
  // Desktop keyboard.
  [InputAction.IA_FORWARD, 0, 1],
  [InputAction.IA_BACKWARD, 0, -1],
  [InputAction.IA_LEFT, -1, 0],
  [InputAction.IA_RIGHT, 1, 0]
]

function clampCell(v: number): number {
  return Math.min(Math.max(v, 0), GRID - 1)
}

// One grid step with client-side prediction. Rate-limited so a held key steps
// repeatedly.
let lastMoveAt = -1

export function requestMove(di: number, dj: number): void {
  if (clock - lastMoveAt < 0.22) return
  const phase = gamePhase()
  if (phase !== lastPhaseSeen) {
    lastPhaseSeen = phase
    if (phase === 'players') localMovesUsed = 0
  }
  const slot = mySlot()
  if (!slot || slot.dead || slot.stunned || phase !== 'players' || localMovesUsed >= MOVE_LIMIT) return
  const baseI = predicted ? predicted.i : slot.cellI
  const baseJ = predicted ? predicted.j : slot.cellJ
  const ni = clampCell(baseI + di)
  const nj = clampCell(baseJ + dj)
  if (ni === baseI && nj === baseJ) return
  lastMoveAt = clock
  localMovesUsed += 1
  predicted = { i: ni, j: nj, at: clock }
  setWorldTarget(ni, nj)
  startHop(di, dj)
  uiTickSfx()
  room.send('move', { di, dj })
}

let lastPhaseSeen = ''
let localMovesUsed = 0

export function inputSystem_(dt: number): void {
  clock += dt
  const slot = mySlot()
  if (!slot) return

  // Park the (hidden) real avatar at the board center; repark on respawn.
  if (!parked || (wasDead && !slot.dead)) {
    movePlayerTo({ newRelativePosition: Vector3.create(BOARD_SIZE / 2, 0, BOARD_SIZE / 2) }).catch(() => {})
    parked = true
    if (!wasDead) setWorldTarget(slot.cellI, slot.cellJ)
  }
  wasDead = slot.dead

  // Attack: big central button (IA_JUMP) or E on desktop.
  if (
    inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  ) {
    uiTickSfx()
    room.send('attack', {})
  }

  // Held = keep stepping (rate-limited inside requestMove).
  for (const [action, di, dj] of MOVES) {
    if (inputSystem.isPressed(action)) {
      requestMove(di, dj)
      break
    }
  }

  // Reconcile: server caught up -> clear prediction; stale prediction
  // (rejected move) -> snap back to the authoritative cell.
  if (predicted) {
    if (slot.cellI === predicted.i && slot.cellJ === predicted.j) {
      noteOwnSlot(slot.address) // server echoed our move: this slot is us
      predicted = null
    } else if (clock - predicted.at > 1.2) {
      predicted = null
      setWorldTarget(slot.cellI, slot.cellJ)
    }
  }
}
