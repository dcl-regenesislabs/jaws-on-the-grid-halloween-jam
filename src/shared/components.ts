import { Schemas, engine } from '@dcl/sdk/ecs'

// All of these are server-authoritative. The server creates the entities,
// syncs them with syncEntity(), and clients never write to them.

export const Shark = engine.defineComponent('shark', {
  phase: Schemas.String, // 'move' | 'telegraph' | 'attack'
  dirX: Schemas.Int,
  dirZ: Schemas.Int,
  cellI: Schemas.Int,
  cellJ: Schemas.Int
})

export const Pickup = engine.defineComponent('pickup', {
  kind: Schemas.String, // 'coin' | 'life'
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  taken: Schemas.Boolean
})

export const PlayerSlot = engine.defineComponent('player-slot', {
  address: Schemas.String,
  name: Schemas.String,
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  score: Schemas.Int,
  extraLives: Schemas.Int,
  dead: Schemas.Boolean,
  stunned: Schemas.Boolean
})

export const GameState = engine.defineComponent('game-state', {
  phase: Schemas.String // 'players' | 'sharks'
})
