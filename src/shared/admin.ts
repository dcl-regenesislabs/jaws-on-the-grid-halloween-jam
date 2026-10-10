import { Schemas, engine } from '@dcl/sdk/ecs'

import { ADMINS } from './config'

// Synced by the server for the ADMIN panel: the live bot count and how many
// resets have run (so the panel can confirm one landed).
export const AdminState = engine.defineComponent('admin-state', {
  bots: Schemas.Int,
  resets: Schemas.Int
})

export function isAdminAddress(address: string): boolean {
  const a = address.toLowerCase()
  return a !== '' && ADMINS.some((x) => x.toLowerCase() === a)
}
