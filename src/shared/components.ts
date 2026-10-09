import { Schemas, engine } from '@dcl/sdk/ecs'

// All of these are server-authoritative. The server creates the entities,
// syncs them with syncEntity(), and clients never write to them.

// Pooled: inactive sharks are hidden and wait to surface near a player.
export const Shark = engine.defineComponent('shark', {
  active: Schemas.Boolean,
  phase: Schemas.String, // 'plan' (lane shown) | 'lunge' (dashing along it)
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  dirX: Schemas.Int,
  dirZ: Schemas.Int,
  len: Schemas.Int, // lane cells ahead; the shark's own cell is dangerous too
  hunting: Schemas.Boolean
})

// Pooled like sharks. value is the coin's points (depth-scaled).
export const Pickup = engine.defineComponent('pickup', {
  active: Schemas.Boolean,
  kind: Schemas.String, // 'coin' | 'life'
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  value: Schemas.Int
})

export const PlayerSlot = engine.defineComponent('player-slot', {
  address: Schemas.String,
  name: Schemas.String,
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  // Picked step for the coming execution (-1..1 each, 0,0 = stay).
  planDi: Schemas.Int,
  planDj: Schemas.Int,
  score: Schemas.Int,
  extraLives: Schemas.Int,
  dead: Schemas.Boolean,
  stunned: Schemas.Boolean,
  // Real profile snapshot, so clients can draw this player as an AvatarShape.
  bodyShape: Schemas.String,
  wearables: Schemas.Array(Schemas.String),
  skinColor: Schemas.Color3,
  hairColor: Schemas.Color3,
  eyesColor: Schemas.Color3
})

export const GameState = engine.defineComponent('game-state', {
  phase: Schemas.String, // 'players' | 'sharks'
  turn: Schemas.Int
})
