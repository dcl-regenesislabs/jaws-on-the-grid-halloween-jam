import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// Shared message contract. Registered once at module level on both sides.
export const Messages = {
  // Client → Server
  pick: Schemas.Map({ di: Schemas.Int, dj: Schemas.Int }), // next cell; 0,0 = stay
  attack: Schemas.Map({}),
  respawn: Schemas.Map({}),
  saveScore: Schemas.Map({}),

  // Server → Client: heartbeat. Client shows the error modal without it.
  ping: Schemas.Map({})
}

export const room = registerMessages(Messages)
