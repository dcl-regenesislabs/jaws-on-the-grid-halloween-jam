import { AudioSource, Entity, Transform, engine } from '@dcl/sdk/ecs'

import { COIN_POINTS, inHarbor, tierOf } from '../shared/config'
import { myHunters, mySlot, onPhaseStart } from './state'
import { cinema } from './cinematic'

// Audio feedback: turn cues, my own bites/pickups, and music whose intensity
// follows how deep you are (a 1 s sharks' turn is too short to swap tracks).
// On the practice raft only the ocean plays: the game starts in the water.

export const SFX = {
  turn: 'assets/sounds/kenney-interface/tick_002.mp3',
  sharks: 'assets/sounds/kenney-interface/drop_002.mp3',
  hop: 'assets/sounds/kenney-interface/select_001.mp3',
  coin: 'assets/sounds/kenney-interface/confirmation_001.mp3',
  life: 'assets/sounds/kenney-interface/maximize_003.mp3',
  saved: 'assets/sounds/kenney-interface/glass_002.mp3',
  bite: 'assets/sounds/big-water-splash.mp3',
  // Original heartbeat cues (scratch-synthesized, no film material).
  lockon: 'assets/sounds/lockon-sting.wav',
  pulse: 'assets/sounds/lockon-pulse.wav'
}

// Open water by depth: calm, tension, danger, climax.
const MUSIC = [
  'assets/sounds/music/jaws-calm-loop.mp3',
  'assets/sounds/music/jaws-tension-loop.mp3',
  'assets/sounds/music/jaws-danger-loop.mp3',
  'assets/sounds/music/jaws-climax-loop.mp3'
]

// One global source per cue so they can overlap.
const sfxEntities = new Map<string, Entity>()

export function sfx(src: string, volume = 1): void {
  let e = sfxEntities.get(src)
  if (!e) {
    e = engine.addEntity()
    Transform.create(e, {})
    AudioSource.create(e, { audioClipUrl: src, playing: false, loop: false, volume, global: true })
    sfxEntities.set(src, e)
  }
  AudioSource.playSound(e, src)
}

let musicEntity: Entity
let musicTrack = ''
let lastScore = 0
let lastLives = 0
let lastDead = false
let lastPack = 0
let pulseTimer = 0

function onRaft(): boolean {
  const slot = mySlot()
  return !slot || inHarbor(slot.cellI, slot.cellJ)
}

function musicFor(i: number, j: number, dead: boolean): string {
  if (inHarbor(i, j)) return ''
  if (dead) return MUSIC[0]
  const tier = tierOf(i, j)
  return MUSIC[Math.min(MUSIC.length - 1, tier + 1)]
}

export function initAudio(): void {
  // Ambient sea, quiet so the turn cues cut through.
  const ocean = engine.addEntity()
  Transform.create(ocean, {})
  AudioSource.create(ocean, {
    audioClipUrl: 'assets/sounds/ocean-waves.mp3',
    playing: true,
    loop: true,
    volume: 0.25,
    global: true
  })
  musicEntity = engine.addEntity()
  Transform.create(musicEntity, {})

  onPhaseStart((phase) => {
    if (onRaft() || mySlot()?.dead) return
    if (phase === 'players') sfx(SFX.turn, 0.5)
    else sfx(SFX.sharks, 0.6)
  })
  engine.addSystem(audioSystem)
}

function audioSystem(dt: number): void {
  const slot = mySlot()
  if (!slot) return

  // Feedback cues from my own slot's changes.
  if (slot.dead && !lastDead && slot.deathCause !== 'shark') sfx(SFX.bite)
  if (!slot.dead && !lastDead) {
    if (slot.extraLives > lastLives) sfx(SFX.life)
    else if (slot.extraLives < lastLives) sfx(SFX.saved)
    // A buoy save also adds points; only a coin pickup plays the coin cue.
    else if (slot.score - lastScore >= COIN_POINTS) sfx(SFX.coin, 0.8)
  }
  lastDead = slot.dead
  lastLives = slot.extraLives
  lastScore = slot.score

  // Lock-on: a sting when a shark joins my pack, then a heartbeat whose
  // pace follows the pack. Silent when nobody hunts me.
  const pack = myHunters()
  const calm = slot.dead || cinema.active || inHarbor(slot.cellI, slot.cellJ)
  pulseTimer -= dt
  if (!calm && pack.count > lastPack) {
    sfx(SFX.lockon, 0.9)
    pulseTimer = 1.5
  } else if (!calm && pack.count > 0 && pulseTimer <= 0) {
    sfx(SFX.pulse, 0.7)
    pulseTimer = pack.nearest <= 3 ? 0.55 : pack.count >= 2 ? 0.85 : 1.25
  }
  lastPack = calm ? 0 : pack.count

  const track = slot.dead && slot.deathCause === 'shark'
    ? (cinema.swallowed ? '' : MUSIC[3])
    : musicFor(slot.cellI, slot.cellJ, slot.dead)
  if (track !== musicTrack) {
    musicTrack = track
    if (track) AudioSource.createOrReplace(musicEntity, { audioClipUrl: track, playing: true, loop: true, volume: 0.35, global: true })
    else if (AudioSource.has(musicEntity)) AudioSource.stopSound(musicEntity)
  }
}
