import { engine, InputAction, pointerEventsSystem } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { inHarbor } from '../shared/config'
import { room } from '../shared/messages'
import { gameState, mySlot, pendingPlan, scoreboard } from './state'

export function initHarbor(): void {
  const board = engine.getEntityOrNullByName('Raft Scoreboard')
  if (board === null) {
    console.error('[client] Raft Scoreboard missing from composite')
    return
  }
  const openScoreboard = (): boolean => {
    const slot = mySlot()
    if (scoreboard.open || !slot || slot.dead || !inHarbor(slot.cellI, slot.cellJ)) return false
    // Cancel a queued departure when possible, so reading on the raft is safe.
    if (gameState().phase === 'players') {
      room.send('plan', { steps: [] })
      pendingPlan.active = false
    }
    scoreboard.open = true
    return true
  }
  let mobileArmed = true
  let registeredMobile: boolean | undefined
  const updateInteraction = () => {
    const mobile = isMobile()
    if (registeredMobile === mobile) return
    pointerEventsSystem.removeOnPointerDown(board)
    pointerEventsSystem.removeOnPointerHoverEnter(board)
    pointerEventsSystem.removeOnPointerHoverLeave(board)
    registeredMobile = mobile
    mobileArmed = true
    if (mobile) {
      const target = { entity: board, opts: { maxDistance: 40, showFeedback: false } }
      pointerEventsSystem.onPointerHoverEnter(target, () => {
        if (mobileArmed && openScoreboard()) mobileArmed = false
      })
      pointerEventsSystem.onPointerHoverLeave(target, () => {
        // The modal can itself cause a hover leave. Rearm only after closing
        // and pointing away, so closing over the board does not reopen it.
        if (!scoreboard.open) mobileArmed = true
      })
    } else {
      pointerEventsSystem.onPointerDown({
        entity: board,
        opts: { button: InputAction.IA_POINTER, hoverText: 'View scoreboard', maxDistance: 40 }
      }, () => { openScoreboard() })
    }
  }
  updateInteraction()
  engine.addSystem(() => {
    // Platform information may arrive after main() on the first few ticks.
    updateInteraction()
    const slot = mySlot()
    // A move already executing is authoritative; close if it leaves safety.
    if (!slot || slot.dead || !inHarbor(slot.cellI, slot.cellJ)) scoreboard.open = false
  })
}
