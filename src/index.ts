import {} from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'

import { initServer } from './server/game'
import { initBots } from './server/bots'
import { initAdmin } from './server/admin'
import { initClient } from './client/render'
import { setupUi } from './client/ui'
import { setupAdminUi } from './client/admin-ui'

export function main() {
  if (isServer()) {
    // Headless authority: game logic, validation, state sync.
    initServer()
    // Simulated players (BOT_COUNT in src/shared/config.ts).
    initBots()
    // In-game ADMIN panel commands (ADMINS in src/shared/config.ts).
    initAdmin()
  } else {
    // Client: visuals, camera, touch controls, UI.
    initClient()
    setupUi()
    setupAdminUi()
  }
}
