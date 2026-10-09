import {} from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'

import { initServer } from './server/game'
import { initClient } from './client/render'
import { setupUi } from './client/ui'

export function main() {
  if (isServer()) {
    // Headless authority: game logic, validation, state sync.
    initServer()
  } else {
    // Client: visuals, camera, touch controls, UI.
    initClient()
    setupUi()
  }
}
