import { AudioSource, Entity, Schemas, engine } from '@dcl/sdk/ecs'

import { GameState, PlayerSlot } from '../shared/components'
import { PLAYERS_TIME, SHARKS_MOVE_TIME, SHARKS_ATTACK_TIME } from '../shared/config'
import { mySlot } from './state'

// Audio feedback driven by the synced game phase. Music intensity follows the
// turn cycle; SFX mark bites, pickups and deaths.

const MUSIC = {
  players: 'assets/sounds/music/jaws-calm-loop.mp3',
  'sharks-move': 'assets/sounds/music/jaws-danger-loop.mp3',
  'sharks-attack': 'assets/sounds/music/jaws-climax-loop.mp3'
}

let musicEntity: Entity
let sfxEntity: Entity
let lastPhase = ''
let lastScore = -1
let wasDead = false

// Per-frame tick component so the UI re-renders and can show the countdown.
const UiTick = engine.defineComponent('ui-tick-local', { t: Schemas.Number })
const tickEntity = engine.addEntity()
UiTick.create(tickEntity, { t: 0 })

const PHASE_DURATION: Record<string, number> = {
  players: PLAYERS_TIME,
  'sharks-move': SHARKS_MOVE_TIME,
  'sharks-attack': SHARKS_ATTACK_TIME
}

// Seconds left in the current phase (client-side mirror of the server clock).
export function phaseTimeLeft(): number {
  const elapsed = UiTick.getOrNull(tickEntity)?.t ?? 0
  const total = PHASE_DURATION[lastPhase] ?? PLAYERS_TIME
  return Math.max(0, total - elapsed)
}

export function phaseDuration(): number {
  return PHASE_DURATION[lastPhase] ?? PLAYERS_TIME
}

function playSfx(src: string, volume = 0.8) {
  if (!sfxEntity) sfxEntity = engine.addEntity()
  AudioSource.createOrReplace(sfxEntity, { audioClipUrl: src, playing: true, loop: false, volume })
}

export function uiTickSfx() {
  playSfx('assets/sounds/kenney-interface/tick_001.mp3', 0.4)
}

export function audioSystem(dt: number): void {
  UiTick.getMutable(tickEntity).t += dt

  // Phase music.
  let phase = 'players'
  for (const [_e, state] of engine.getEntitiesWith(GameState)) phase = state.phase

  if (phase !== lastPhase) {
    UiTick.getMutable(tickEntity).t = 0
    if (!musicEntity) musicEntity = engine.addEntity()
    AudioSource.createOrReplace(musicEntity, {
      audioClipUrl: MUSIC[phase as keyof typeof MUSIC] ?? MUSIC.players,
      playing: true,
      loop: true,
      volume: 0.45
    })
    // Splash when the bites land.
    if (phase === 'sharks-attack' && lastPhase !== '') {
      playSfx('assets/sounds/big-water-splash.mp3', 0.9)
    }
    lastPhase = phase
  }

  const slot = mySlot()
  if (!slot) return

  // Coin pickup tick: score jumped by more than the 1/s survival tick.
  if (lastScore >= 0 && slot.score - lastScore > 2) {
    playSfx('assets/sounds/kenney-interface/glass_001.mp3', 0.7)
  }
  lastScore = slot.score

  // Death splash.
  if (slot.dead && !wasDead) {
    playSfx('assets/sounds/big-water-splash.mp3', 1)
  }
  wasDead = slot.dead
}

export function startAmbient() {
  const ocean = engine.addEntity()
  AudioSource.create(ocean, {
    audioClipUrl: 'assets/sounds/ocean-waves.mp3',
    playing: true,
    loop: true,
    volume: 0.25
  })
}
