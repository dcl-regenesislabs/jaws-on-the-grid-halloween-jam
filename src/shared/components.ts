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
  len: Schemas.Int, // lane cells ahead (own cell bites too); 0 = holding, harmless
  hunting: Schemas.Boolean, // = role > 0
  role: Schemas.Int, // 0 wanderer, 1 chaser ("Bruce"), 2 blocker ("the Tiger")
  target: Schemas.String, // hunted player's address, '' if none
  barrels: Schemas.Int, // yellow barrels harpooned into it
  tagUntilTurn: Schemas.Int // exclusive; tagged sharks lunge short and don't hunt
})

// Pooled like sharks. value is the coin's points (depth-scaled).
export const Pickup = engine.defineComponent('pickup', {
  active: Schemas.Boolean,
  kind: Schemas.String, // 'coin' | 'life' | 'mine' | 'boost' | 'barrel' | 'chum'
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  value: Schemas.Int
})

export const PlayerSlot = engine.defineComponent('player-slot', {
  address: Schemas.String,
  name: Schemas.String,
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  // Planned path (STEP_DIRS codes) for the coming execution; during the
  // execution it is the path being swum, cleared when picking starts again.
  path: Schemas.Array(Schemas.Int),
  maxSteps: Schemas.Int, // BASE_STEPS, more with a boost
  score: Schemas.Int,
  extraLives: Schemas.Int,
  mines: Schemas.Int,
  boostUntilTurn: Schemas.Int, // exclusive; collected during execution starts next planning phase
  deathCause: Schemas.String,
  coinsCollected: Schemas.Int,
  sharksKilled: Schemas.Int,
  equipmentCollected: Schemas.Int,
  deepestTier: Schemas.Int,
  objectiveLevel: Schemas.Int,
  objectiveMask: Schemas.Int,
  dead: Schemas.Boolean,
  barrels: Schemas.Int,
  chum: Schemas.Int,
  bloodUntilTurn: Schemas.Int, // exclusive; jacket save → priority target
  killedBy: Schemas.String, // 'bruce' | 'tiger' | '' (any other shark)
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

// The exploded state remains for a whole round so clients cannot miss the FX.
export const Mine = engine.defineComponent('sea-mine', {
  active: Schemas.Boolean,
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  owner: Schemas.String,
  detonateTurn: Schemas.Int,
  exploded: Schemas.Boolean,
  serial: Schemas.Int
})

// Chum in the water: nearby sharks go for it instead of players.
export const Chum = engine.defineComponent('chum', {
  active: Schemas.Boolean,
  cellI: Schemas.Int,
  cellJ: Schemas.Int,
  untilTurn: Schemas.Int // exclusive
})
