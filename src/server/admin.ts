import { engine, Entity } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

import { AdminState, isAdminAddress } from '../shared/admin'
import { room } from '../shared/messages'
import { botTarget, onBotTarget, resetBots, setBotTarget } from './bots'
import { resetWorld } from './game'

// Admin commands from the in-game ADMIN panel. Only wallets in ADMINS
// (src/shared/config.ts) are obeyed; the check uses the verified sender.

let state: Entity

export function initAdmin(): void {
  AdminState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  state = engine.addEntity()
  AdminState.create(state, { bots: botTarget(), resets: 0 })
  syncEntity(state, [AdminState.componentId])
  onBotTarget((n) => {
    AdminState.getMutable(state).bots = n
  })

  const admin = (context: { from: string } | null | undefined, what: string): boolean => {
    const from = context?.from ?? ''
    if (isAdminAddress(from)) return true
    console.log('[admin] REJECTED', what, 'from', from || '(unknown)')
    return false
  }

  room.onMessage('adminReset', (_data, context) => {
    if (!admin(context, 'reset')) return
    console.log('[admin] world reset by', context!.from)
    resetWorld()
    resetBots()
    AdminState.getMutable(state).resets++
  })

  room.onMessage('adminBots', (data, context) => {
    if (!admin(context, 'bots')) return
    console.log('[admin] bots', data.count, 'by', context!.from)
    setBotTarget(data.count)
  })
}
