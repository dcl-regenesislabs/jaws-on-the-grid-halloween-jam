import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

import { GameState, Mine, Pickup, PlayerSlot, Shark } from '../shared/components'
import {
  DEPTH_STEP,
  HARBOR_MIN,
  HARBOR_SIZE,
  MAX_DEPTH,
  MAX_TIERS,
  PLAYERS_TIME,
  SHARKS_TIME,
  depthSquare,
  inHarbor,
  tierOf
} from '../shared/config'
import { objectiveProgress, objectives } from '../shared/objectives'
import { room } from '../shared/messages'
import { canDropChum, canHarpoon, canPlantMine, canPlanNow, canStep, requestCancel, requestChum, requestHarpoon, requestMine, requestStep, sharkInHarpoonRange } from './input'
import { canPreviewEnding, endingPreview, finishEndingPreview, previewEnding, gameState, isGuest, myCell, myHunters, myMaxSteps, myPlan, myTargetInBlast, myTargetInDanger, mySlot, phaseElapsed } from './state'
import { explosionFlash } from './mines'
import { cinema } from './cinematic'
import { scoreboard } from './state'
import { ScoreboardUi } from './scoreboard-ui'
import { openAdminPanel } from './admin-ui'
import { t, toggleLang } from './i18n'

// HUD for a 1600×720 mobile canvas, inside the interactable area (clear of
// the Explorer's own left-hand controls). Layout:
//   top-left stats · top-center turn pill · top-right radar
//   bottom-left d-pad in the device safe area; bottom-right gear in interactable

// Bumped manually per deploy to spot stale cached bundles on the phone.
export const BUILD_TAG = 'hud-2'

// Connection watchdog: no synced GameState => no multiplayer server (or the
// room is broken). GameState only exists if the server created and synced it.
// (Message-bus pings never arrive in local preview; CRDT sync does.)
let noServerElapsed = 0
let serverConnected = false
let uiClock = 0
engine.addSystem((dt) => {
  uiClock += dt
  updatePickupNotice()
  updateKillFeed()
  if (serverConnected) return
  for (const [_e] of engine.getEntitiesWith(GameState)) {
    serverConnected = true
    console.log('[client] server state synced', BUILD_TAG)
    break
  }
  if (!serverConnected) noServerElapsed += dt
})

let savedScore = false
let wasDead = false
let pressedKey = ''
let pressedAt = -999

function press(key: string) {
  pressedKey = key
  pressedAt = uiClock
}

function isPressed(key: string): boolean {
  return pressedKey === key && uiClock - pressedAt < 0.15
}

export function setupUi() {
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), ScoreboardUi, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'interactable', zIndex: 25 })
  ReactEcsRenderer.setUiRenderer(uiComponent, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'interactable', zIndex: 10 })
  // Explosion feedback only; changing turns never tints the screen.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), vignette, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'none', zIndex: 0 })
  // Movement uses the device safe area so the left thumb reaches the arrows.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), movePad, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'device', zIndex: 20 })
  // The death modal is centered on the device.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), centerHud, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'device', zIndex: 15 })
  // No server / guest account: full-screen blockers over everything,
  // Explorer areas included.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), blocker, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'none', zIndex: 30 })
  // Kill feed on its own layer: it stays up while you are dead (your own
  // ending included), when the rest of the HUD is hidden.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), killFeedHud, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'interactable', zIndex: 12 })
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), cinematicOverlay, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'none', zIndex: 5 })
}

const cinematicOverlay = () => cinema.active || cinema.returning > 0 ? (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <UiEntity uiTransform={{ positionType: 'absolute', width: '100%', height: '100%' }} uiBackground={{ color: Color4.create(0.65, 0.02, 0.01, cinema.flash * 0.65) }} />
    <UiEntity uiTransform={{ positionType: 'absolute', width: '100%', height: '100%' }} uiBackground={{ color: Color4.create(0, 0, 0, cinema.black) }} />
  </UiEntity>
) : null

const serverLost = () => !serverConnected && noServerElapsed > 12

const blocker = () => (isGuest() ? <GuestBlocked /> : serverLost() ? <ConnectionError /> : null)

// Guests can't play; the server never gives them a slot either.
function GuestBlocked() {
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: rgba(0, 0, 0, 0.85) }}>
      <UiEntity
        uiTransform={{ width: 480, flexDirection: 'column', alignItems: 'center', padding: 24, borderRadius: 28, borderWidth: 2, borderColor: GOLD }}
        uiBackground={{ color: rgba(0.03, 0.06, 0.12, 0.96) }}
      >
        <Icon src={ICON.head} size={110} />
        <Label value={t('sign-in.title')} fontSize={34} color={GOLD} textAlign="middle-center" uiTransform={{ height: 48 }} />
        <Label
          value={t('sign-in.body')}
          fontSize={18}
          color={MUTED}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 84 }}
        />
      </UiEntity>
    </UiEntity>
  )
}

const vignette = () =>
  !mySlot()?.dead && explosionFlash > 0 ? (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ color: Color4.create(1, 0.55, 0.08, explosionFlash * 0.18) }} />
  ) : null

// --- palette ---
const rgba = (r: number, g: number, b: number, a = 1) => Color4.create(r, g, b, a)
const INK = rgba(0.02, 0.06, 0.12, 0.84)
const INK_SOFT = rgba(0.02, 0.06, 0.12, 0.6)
const EDGE = rgba(0.45, 0.85, 1, 0.35)
const WHITE = rgba(1, 1, 1, 1)
const MUTED = rgba(0.72, 0.84, 0.95, 0.75)
const AQUA = rgba(0.36, 0.9, 0.92, 1)
const MINT = rgba(0.38, 0.96, 0.62, 1)
const GOLD = rgba(1, 0.84, 0.32, 1)
const CORAL = rgba(1, 0.36, 0.34, 1)
const CORAL_DEEP = rgba(0.55, 0.06, 0.08, 0.9)
const CLEAR = rgba(0, 0, 0, 0)
const HUNTER_RED = rgba(1, 0.12, 0.08, 1)
const BARREL_YELLOW = rgba(1, 0.82, 0.1, 1)

const ICON = {
  coin: 'assets/images/ui/score-coin.png',
  buoy: 'assets/images/items/life-jacket.png',
  mine: 'assets/images/items/sea-mine.png',
  boost: 'assets/images/items/swim-boost.png',
  fin: 'assets/images/ui/shark-fin-great-white.png',
  tiger: 'assets/images/items/shark-fin-tiger.png',
  barrel: 'assets/images/items/barrel.png',
  raft: 'assets/images/ui/player-raft.png',
  fish: 'assets/images/ui/bait-fish.png',
  head: 'assets/images/ui/shark-head-bite.png',
  trophy: 'assets/images/ui/survivor-trophy.png',
  up: 'assets/images/ui/arrow-up.png',
  down: 'assets/images/ui/arrow-down.png',
  left: 'assets/images/ui/arrow-left.png',
  right: 'assets/images/ui/arrow-right.png'
}

function Icon(props: { key?: string; src: string; size: number; margin?: { left?: number; right?: number } }) {
  return (
    <UiEntity
      uiTransform={{ width: props.size, height: props.size, flexShrink: 0, margin: props.margin }}
      uiBackground={{ textureMode: 'stretch', texture: { src: props.src } }}
    />
  )
}

// --- top-left: score, jackets and depth in one pill ---
function Stats(props: { score: number; lives: number; harbor: boolean; tier: number }) {
  const depthColor = props.harbor ? MINT : props.tier >= 2 ? CORAL : props.tier >= 1 ? GOLD : AQUA
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: 360, height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        padding: { left: 8, right: 12 },
        borderRadius: 28
      }}
      uiBackground={{ color: INK }}
    >
      <Icon src={ICON.coin} size={40} />
      <Label value={`${props.score}`} fontSize={26} color={GOLD} textAlign="middle-left" uiTransform={{ width: 84, height: 46, flexShrink: 0, margin: { left: 6 } }} />
      <Icon src={ICON.buoy} size={32} />
      <Label value={`${props.lives}`} fontSize={22} color={WHITE} textAlign="middle-left" uiTransform={{ width: 34, height: 46, flexShrink: 0, margin: { left: 4 } }} />
      <Icon src={props.harbor ? ICON.raft : ICON.fin} size={30} />
      <Label value={props.harbor ? t('raft') : `${t('depth')} ${props.tier + 1}`} fontSize={18} color={depthColor} textAlign="middle-left" uiTransform={{ width: 92, height: 46, flexShrink: 0, margin: { left: 4 } }} />
    </UiEntity>
  )
}

// --- top-center: whose turn, time left, move state ---
function TurnPill(props: { playersTurn: boolean; remaining: number }) {
  const color = props.playersTurn ? MINT : AQUA
  const W = 260
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: '50%' },
        margin: { left: -W / 2 },
        width: W, height: 72,
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: W,
          height: 72,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 24
        }}
        uiBackground={{ color: INK }}
      >
        <UiEntity uiTransform={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Label value={props.playersTurn ? t('pick-move') : t('go')} fontSize={26} color={color} textAlign="middle-center" uiTransform={{ width: 220, height: 40 }} />
        </UiEntity>
        <UiEntity uiTransform={{ width: W - 48, height: 8, margin: { top: 6 }, borderRadius: 4 }} uiBackground={{ color: rgba(1, 1, 1, 0.12) }}>
          <UiEntity
            uiTransform={{ width: Math.max(8, Math.round((W - 48) * props.remaining)), height: 8, borderRadius: 4 }}
            uiBackground={{ color }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// On the raft: the one rule worth reading, then go.
function RaftHint() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 16, left: '50%' },
        margin: { left: -230 },
        width: 460,
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: 8, bottom: 10, left: 16, right: 16 },
        borderRadius: 20
      }}
      uiBackground={{ color: INK_SOFT }}
    >
      <Label value={t('raft.hint1')} fontSize={16} color={MUTED} textAlign="middle-center" uiTransform={{ width: '100%', height: 24 }} />
      <Label value={t('raft.hint2')} fontSize={20} color={MINT} textAlign="middle-center" uiTransform={{ width: '100%', height: 30 }} />
      {/* Language switch: only offered here on the raft, never mid-swim. */}
      <UiEntity
        uiTransform={{ width: 280, height: 56, margin: { top: 8 }, alignItems: 'center', justifyContent: 'center', borderRadius: 28, borderWidth: 2, borderColor: AQUA }}
        uiBackground={{ color: isPressed('lang') ? rgba(0.36, 0.9, 0.92, 0.55) : INK }}
        onMouseDown={() => {
          press('lang')
          toggleLang()
        }}
      >
        <Label value={t('lang.button')} fontSize={20} color={AQUA} textAlign="middle-center" uiTransform={{ width: 270, height: 48 }} />
      </UiEntity>
    </UiEntity>
  )
}

function LaneWarning() {
  const blast = myTargetInBlast()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 132, left: '50%' },
        margin: { left: -170 },
        width: 340,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        borderWidth: 2,
        borderColor: CORAL
      }}
      uiBackground={{ color: CORAL_DEEP }}
    >
      <Label value={blast ? t('lane.blast') : t('lane.shark')} fontSize={18} color={WHITE} textAlign="middle-center" uiTransform={{ width: 332, height: 44 }} />
    </UiEntity>
  )
}

// --- top-right: radar of coins, life buoys and other players ---
const RADAR = 168 // px
const RADAR_CELLS = 16 // cells from center to edge

function Dot(props: { key?: string; di: number; dj: number; size: number; color: Color4; clamp?: boolean }) {
  let x = props.di / RADAR_CELLS
  let y = props.dj / RADAR_CELLS
  if (props.clamp) {
    // Off-radar players stick to the rim, pointing their way.
    const m = Math.max(Math.abs(x), Math.abs(y))
    if (m > 0.92) {
      x = (x / m) * 0.92
      y = (y / m) * 0.92
    }
  } else if (Math.abs(x) > 1 || Math.abs(y) > 1) {
    return null
  }
  const half = RADAR / 2
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: half + x * half - props.size / 2, top: half - y * half - props.size / 2 },
        width: props.size,
        height: props.size,
        borderRadius: props.size / 2
      }}
      uiBackground={{ color: props.color }}
    />
  )
}

// Square of cells with depth < d as up to four bars, clipped to the radar
// by hand (not relying on overflow clipping).
function radarOutline(key: string, d: number, ci: number, cj: number, color: Color4, w: number): any[] {
  const cellPx = RADAR / (2 * RADAR_CELLS)
  const { lo, hi } = depthSquare(d)
  const left = RADAR / 2 + (lo - (ci + 0.5)) * cellPx
  const right = RADAR / 2 + (hi - (ci + 0.5)) * cellPx
  const top = RADAR / 2 - (hi - (cj + 0.5)) * cellPx
  const bottom = RADAR / 2 - (lo - (cj + 0.5)) * cellPx
  const bars: any[] = []
  const bar = (k: string, x: number, y: number, bw: number, bh: number) =>
    bars.push(
      <UiEntity
        key={`${key}${k}`}
        uiTransform={{ positionType: 'absolute', position: { left: x, top: y }, width: bw, height: bh }}
        uiBackground={{ color }}
      />
    )
  const y0 = Math.max(0, top)
  const y1 = Math.min(RADAR, bottom)
  const x0 = Math.max(0, left)
  const x1 = Math.min(RADAR, right)
  if (y1 > y0) {
    if (left >= 0 && left <= RADAR) bar('l', left - w / 2, y0, w, y1 - y0)
    if (right >= 0 && right <= RADAR) bar('r', right - w / 2, y0, w, y1 - y0)
  }
  if (x1 > x0) {
    if (top >= 0 && top <= RADAR) bar('t', x0, top - w / 2, x1 - x0, w)
    if (bottom >= 0 && bottom <= RADAR) bar('b', x0, bottom - w / 2, x1 - x0, w)
  }
  return bars
}

function Radar(props: { ci: number; cj: number; myAddress: string }) {
  const dots: any[] = []
  const cellPx = RADAR / (2 * RADAR_CELLS)

  // Depth lines (gold, coral) and the shark net (red), as on the water.
  for (let t = 1; t < MAX_TIERS; t++) {
    dots.push(...radarOutline(`d${t}`, t * DEPTH_STEP, props.ci, props.cj, t === 1 ? rgba(1, 0.84, 0.32, 0.55) : rgba(1, 0.36, 0.34, 0.6), 2))
  }
  dots.push(...radarOutline('net', MAX_DEPTH + 1, props.ci, props.cj, rgba(0.95, 0.2, 0.15, 0.9), 3))

  // Harbor square, when in range.
  // Raft center relative to my cell center, in cells.
  const hi = HARBOR_MIN + HARBOR_SIZE / 2 - (props.ci + 0.5)
  const hj = HARBOR_MIN + HARBOR_SIZE / 2 - (props.cj + 0.5)
  const hs = HARBOR_SIZE * cellPx
  if (Math.abs(hi) < RADAR_CELLS + HARBOR_SIZE / 2 && Math.abs(hj) < RADAR_CELLS + HARBOR_SIZE / 2) {
    dots.push(
      <UiEntity
        key="harbor"
        uiTransform={{
          positionType: 'absolute',
          position: { left: RADAR / 2 + hi * cellPx - hs / 2, top: RADAR / 2 - hj * cellPx - hs / 2 },
          width: hs,
          height: hs,
          borderRadius: 4
        }}
        uiBackground={{ color: rgba(0.69, 0.48, 0.27, 0.6) }}
      />
    )
  }

  for (const [e, p] of engine.getEntitiesWith(Pickup)) {
    if (!p.active) continue
    dots.push(
      <Dot key={`p${e}`} di={p.cellI - props.ci} dj={p.cellJ - props.cj} size={p.kind === 'coin' ? 8 : 11} color={p.kind === 'coin' ? GOLD : p.kind === 'boost' ? AQUA : p.kind === 'mine' || p.kind === 'chum' ? CORAL : p.kind === 'barrel' ? BARREL_YELLOW : MINT} />
    )
  }
  for (const [e, s] of engine.getEntitiesWith(PlayerSlot)) {
    if (s.dead || s.address === props.myAddress) continue
    dots.push(<Dot key={`s${e}`} di={s.cellI - props.ci} dj={s.cellJ - props.cj} size={11} color={WHITE} clamp />)
  }
  for (const [e, m] of engine.getEntitiesWith(Mine)) {
    if (m.active && !m.exploded) dots.push(<Dot key={`m${e}`} di={m.cellI - props.ci} dj={m.cellJ - props.cj} size={12} color={CORAL} />)
  }
  // My pack, so you can see them coming from off-screen.
  for (const [e, sh] of engine.getEntitiesWith(Shark)) {
    if (sh.active && sh.role > 0 && sh.target === props.myAddress) {
      dots.push(<Dot key={`h${e}`} di={sh.cellI - props.ci} dj={sh.cellJ - props.cj} size={13} color={HUNTER_RED} clamp />)
    }
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, right: 0 },
        width: RADAR + 8, // + padding 2 + border 2, both sides
        height: RADAR + 8,
        padding: 2,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: EDGE
      }}
      uiBackground={{ color: INK }}
      onMouseDown={openAdminPanel}
    >
      <UiEntity uiTransform={{ width: RADAR, height: RADAR, overflow: 'hidden', borderRadius: 18 }}>
        {/* faint crosshair */}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { left: RADAR / 2 - 1, top: 0 }, width: 2, height: RADAR }} uiBackground={{ color: rgba(0.45, 0.85, 1, 0.12) }} />
        <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: RADAR / 2 - 1 }, width: RADAR, height: 2 }} uiBackground={{ color: rgba(0.45, 0.85, 1, 0.12) }} />
        {dots}
        <Dot key="me" di={0} dj={0} size={14} color={AQUA} />
      </UiEntity>
    </UiEntity>
  )
}

// --- bottom-left: d-pad ---
const PAD = 92
const PAD_GAP = 6

function PadButton(props: { dir: string; icon: string; col: number; row: number; code: number }) {
  const pressed = isPressed(props.dir)
  const enabled = canStep(props.code)
  const picked = canPlanNow() && myPlan().includes(props.code)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.col * (PAD + PAD_GAP), top: props.row * (PAD + PAD_GAP) },
        width: PAD,
        height: PAD,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: PAD / 2,
        borderWidth: picked ? 4 : 2,
        borderColor: picked ? GOLD : enabled ? AQUA : EDGE,
        opacity: enabled || picked ? 1 : 0.45
      }}
      uiBackground={{ color: picked ? rgba(1, 0.84, 0.32, 0.5) : pressed ? rgba(0.36, 0.9, 0.92, 0.55) : INK }}
      onMouseDown={() => {
        press(props.dir)
        requestStep(props.code)
      }}
    >
      <Icon src={props.icon} size={44} />
    </UiEntity>
  )
}

// Center of the cross: wipes the whole plan (you stay put).
function CancelButton() {
  const SIZE = 64
  const enabled = canPlanNow() && myPlan().length > 0
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: PAD + PAD_GAP + (PAD - SIZE) / 2, top: PAD + PAD_GAP + (PAD - SIZE) / 2 },
        width: SIZE,
        height: SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: SIZE / 2,
        borderWidth: 2,
        borderColor: enabled ? CORAL : EDGE,
        opacity: enabled ? 1 : 0.35
      }}
      uiBackground={{ color: isPressed('cancel') ? rgba(1, 0.36, 0.34, 0.5) : INK }}
      onMouseDown={() => {
        press('cancel')
        requestCancel()
      }}
    >
      <Label value="X" fontSize={30} color={enabled ? CORAL : MUTED} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />
    </UiEntity>
  )
}

function DPad() {
  const size = PAD * 3 + PAD_GAP * 2
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, bottom: 0 }, width: size, height: size }}>
      <PadButton dir="up" icon={ICON.up} col={1} row={0} code={0} />
      <PadButton dir="left" icon={ICON.left} col={0} row={1} code={2} />
      <PadButton dir="right" icon={ICON.right} col={2} row={1} code={3} />
      <PadButton dir="down" icon={ICON.down} col={1} row={2} code={1} />
      <CancelButton />
    </UiEntity>
  )
}

// Steps planned out of steps allowed (more with a boost).
function StepPips(props: { used: number; max: number }) {
  const pips = []
  for (let n = 0; n < props.max; n++) {
    pips.push(
      <UiEntity
        key={`pip-${n}`}
        uiTransform={{ width: 18, height: 18, margin: { left: 4, right: 4 }, borderRadius: 9, borderWidth: 2, borderColor: GOLD }}
        uiBackground={{ color: n < props.used ? GOLD : CLEAR }}
      />
    )
  }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 82, left: '50%' }, margin: { left: -(props.max * 26) / 2 }, flexDirection: 'row' }}>
      {pips}
    </UiEntity>
  )
}

// --- bottom-right: gear. Chum and barrel show up once you carry them. ---
function GearRow() {
  const slot = mySlot()
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { right: 0, bottom: 0 }, flexDirection: 'row', alignItems: 'flex-end' }}>
      {!!slot && slot.mines > 0 && <MineButton />}
      {!!slot && slot.barrels > 0 && <BarrelButton />}
      {!!slot && slot.chum > 0 && <ChumButton />}
    </UiEntity>
  )
}

function GearButton(props: { id: string; icon: string; count: string; ready: boolean; color: Color4; title: string; onPress: () => void }) {
  return (
    <UiEntity uiTransform={{ width: 132, margin: { right: 10 }, flexDirection: 'column', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ width: 132, height: 132, borderWidth: 3, borderColor: props.ready ? props.color : EDGE, borderRadius: 66, alignItems: 'center', justifyContent: 'center', opacity: props.ready ? 1 : 0.5 }}
        uiBackground={{ color: isPressed(props.id) ? CORAL_DEEP : INK }}
        onMouseDown={() => {
          if (props.ready) {
            press(props.id)
            props.onPress()
          }
        }}
      >
        <Icon src={props.icon} size={84} />
        <Label value={props.count} fontSize={20} color={WHITE} textAlign="middle-center" uiTransform={{ positionType: 'absolute', position: { right: 0, top: 0 }, width: 40, height: 28 }} />
      </UiEntity>
      <Label value={props.title} fontSize={16} color={props.ready ? props.color : MUTED} textAlign="middle-center" uiTransform={{ width: 132, height: 26 }} />
    </UiEntity>
  )
}

function BarrelButton() {
  const slot = mySlot()
  const ready = canHarpoon()
  const harbor = !!slot && inHarbor(slot.cellI, slot.cellJ)
  return (
    <GearButton
      id="barrel"
      icon={ICON.barrel}
      count={`${slot?.barrels ?? 0}`}
      ready={ready}
      color={BARREL_YELLOW}
      title={harbor || !sharkInHarpoonRange() ? t('no-target') : t('harpoon')}
      onPress={() => requestHarpoon()}
    />
  )
}

function ChumButton() {
  const slot = mySlot()
  const ready = canDropChum()
  const harbor = !!slot && inHarbor(slot.cellI, slot.cellJ)
  return (
    <GearButton
      id="chum"
      icon={ICON.fish}
      count={`${slot?.chum ?? 0}`}
      ready={ready}
      color={CORAL}
      title={t('chum')}
      onPress={() => requestChum()}
    />
  )
}

// --- top-right, under the radar: who is hunting me ---
function HuntedPill() {
  const slot = mySlot()
  if (!slot || slot.dead || inHarbor(slot.cellI, slot.cellJ)) return null
  const { count } = myHunters()
  const bleeding = slot.bloodUntilTurn > gameState().turn
  if (count === 0 && !bleeding) return null
  const fins = []
  for (let n = 0; n < count; n++) fins.push(<Icon key={`hf-${n}`} src={n === 0 ? ICON.fin : ICON.tiger} size={30} />)
  return (
    <UiEntity uiTransform={{ width: RADAR + 8, flexDirection: 'column', alignItems: 'flex-end' }}>
      {count > 0 && (
        <UiEntity uiTransform={{ width: RADAR + 8, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 2, borderColor: HUNTER_RED }} uiBackground={{ color: CORAL_DEEP }}>
          {fins}
          <Label value={`${t('hunted')} x${count}`} fontSize={18} color={WHITE} textAlign="middle-center" uiTransform={{ width: 104, height: 40, margin: { left: 4 } }} />
        </UiEntity>
      )}
      {bleeding && (
        <UiEntity uiTransform={{ width: RADAR + 8, height: 34, margin: { top: 6 }, alignItems: 'center', justifyContent: 'center', borderRadius: 17 }} uiBackground={{ color: rgba(0.5, 0, 0.02, 0.9) }}>
          <Label value={t('blood')} fontSize={15} color={WHITE} textAlign="middle-center" uiTransform={{ width: RADAR, height: 30 }} />
        </UiEntity>
      )}
    </UiEntity>
  )
}

// --- under the radar: kill feed. Everyone eaten by a shark, bots
// included and drawn the same, with the score they died with. ---
const FEED_MAX = 4
const FEED_LIFE = 6 // s on screen
const FEED_FADE = 1 // s fading out at the end
type FeedEntry = { id: number; name: string; score: number; killedBy: string; at: number }
const feed: FeedEntry[] = []
let feedSerial = 0
// Last dead flag seen per address; a slot seen dead first (late join)
// gets no entry.
const deadSeen = new Map<string, boolean>()

function updateKillFeed() {
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    const prev = deadSeen.get(slot.address)
    deadSeen.set(slot.address, slot.dead)
    if (prev !== false || !slot.dead || slot.deathCause !== 'shark') continue
    feed.push({ id: feedSerial++, name: slot.name || 'anon', score: slot.score, killedBy: slot.killedBy, at: uiClock })
    if (feed.length > FEED_MAX) feed.shift()
  }
  while (feed.length > 0 && uiClock - feed[0].at > FEED_LIFE) feed.shift()
}

// Height HuntedPill takes under the radar right now (0 when it is hidden).
function huntedPillHeight(): number {
  const slot = mySlot()
  if (serverLost() || isGuest() || !slot || slot.dead || inHarbor(slot.cellI, slot.cellJ)) return 0
  const bleeding = slot.bloodUntilTurn > gameState().turn
  return (myHunters().count > 0 ? 44 : 0) + (bleeding ? 40 : 0)
}

const killFeedHud = () => {
  if (scoreboard.open || feed.length === 0) return null
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: RADAR + 16 + huntedPillHeight() + 6, right: 0 },
          width: 360,
          flexDirection: 'column',
          alignItems: 'flex-end'
        }}
      >
        {feed.map((f) => (
          <FeedRow key={`kf-${f.id}`} entry={f} />
        ))}
      </UiEntity>
    </UiEntity>
  )
}

function FeedRow(props: { key?: string; entry: FeedEntry }) {
  const f = props.entry
  const left = FEED_LIFE - (uiClock - f.at)
  const name = f.name.length > 14 ? `${f.name.slice(0, 12)}..` : f.name
  const icon = f.killedBy === 'tiger' ? ICON.tiger : f.killedBy === 'bruce' ? ICON.fin : ICON.head
  return (
    <UiEntity
      uiTransform={{
        height: 38,
        margin: { top: 4 },
        padding: { left: 10, right: 12 },
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 19,
        borderWidth: 2,
        borderColor: CORAL,
        opacity: Math.min(1, left / FEED_FADE)
      }}
      uiBackground={{ color: INK }}
    >
      <Icon src={icon} size={28} margin={{ right: 6 }} />
      <Label value={name} fontSize={18} color={WHITE} textAlign="middle-left" uiTransform={{ width: 160, height: 34, flexShrink: 0 }} />
      <Icon src={ICON.coin} size={22} margin={{ left: 10, right: 4 }} />
      <Label value={`${f.score}`} fontSize={18} color={GOLD} textAlign="middle-left" uiTransform={{ width: 72, height: 34, flexShrink: 0 }} />
    </UiEntity>
  )
}

function MineButton() {
  const slot = mySlot()
  const count = slot?.mines ?? 0
  const harbor = !!slot && inHarbor(slot.cellI, slot.cellJ)
  return (
    <GearButton
      id="mine"
      icon={ICON.mine}
      count={`${count}`}
      ready={canPlantMine()}
      color={CORAL}
      title={t('mine')}
      onPress={() => requestMine()}
    />
  )
}

// One strip: expedition number and the three contracts as icon + progress.
// Completing one is announced by a notice; details live in the notice text.
function Contracts() {
  const slot = mySlot()
  if (!slot) return null
  const progress = objectiveProgress(slot)
  const goals = objectives(slot.objectiveLevel)
  const icons = [ICON.coin, ICON.mine, ICON.down]
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 64 }, width: 360, height: 40, flexDirection: 'row', alignItems: 'center', padding: { left: 12, right: 8 }, borderRadius: 20 }} uiBackground={{ color: INK_SOFT }}>
      <Label value={`${t('exp')} ${slot.objectiveLevel + 1}`} fontSize={15} color={AQUA} textAlign="middle-left" uiTransform={{ width: 58, height: 36, flexShrink: 0 }} />
      {goals.map((goal, n) => {
        const done = (slot.objectiveMask & goal.bit) !== 0
        return (
          <UiEntity key={`goal-${n}`} uiTransform={{ width: 84, height: 36, flexDirection: 'row', alignItems: 'center' }}>
            <Icon src={icons[n]} size={24} />
            <Label value={done ? t('ok') : `${Math.min(progress[n], goal.target)}/${goal.target}`} fontSize={16} color={done ? MINT : WHITE} textAlign="middle-left" uiTransform={{ width: 56, height: 32, margin: { left: 4 } }} />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

let previousGear: { mines: number; lives: number; boost: number; mask: number; level: number; kills: number; barrels: number; chum: number; blood: number } | null = null
let notice = '' // i18n key, translated when drawn
let noticeUntil = 0
function updatePickupNotice() {
  const slot = mySlot()
  // Dead → respawn resets gear server-side; that is not "used", so skip it.
  if (!slot || slot.dead) { previousGear = null; return }
  if (previousGear) {
    let next = ''
    if (slot.mines > previousGear.mines) next = 'notice.mine'
    if (slot.extraLives > previousGear.lives) next = 'notice.jacket'
    if (slot.boostUntilTurn > previousGear.boost) next = 'notice.boost'
    if (slot.barrels > previousGear.barrels) next = 'notice.barrel'
    if (slot.chum > previousGear.chum) next = 'notice.chum'
    if (!slot.dead && slot.barrels < previousGear.barrels) next = 'notice.harpooned'
    if (!slot.dead && slot.chum < previousGear.chum) next = 'notice.chum-used'
    if (!slot.dead && slot.extraLives < previousGear.lives) next = 'notice.jacket-used'
    if (slot.bloodUntilTurn > previousGear.blood) next = 'notice.blood'
    if (slot.sharksKilled > previousGear.kills) next = 'notice.shark-down'
    if (slot.objectiveMask !== previousGear.mask && slot.objectiveMask > 0) next = 'notice.contract'
    if (slot.objectiveLevel > previousGear.level) next = 'notice.expedition'
    if (next) { notice = next; noticeUntil = uiClock + 2.8 }
  }
  previousGear = {
    mines: slot.mines, lives: slot.extraLives, boost: slot.boostUntilTurn, mask: slot.objectiveMask, level: slot.objectiveLevel,
    kills: slot.sharksKilled, barrels: slot.barrels, chum: slot.chum, blood: slot.bloodUntilTurn
  }
}

function EquipmentStatus() {
  const slot = mySlot()
  if (!slot || slot.dead) return null
  const rounds = Math.max(0, slot.boostUntilTurn - gameState().turn)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 186, left: '50%' }, margin: { left: -230 }, width: 460, height: 98, flexDirection: 'column', alignItems: 'center' }}>
      {rounds > 0 && <UiEntity uiTransform={{ width: 282, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AQUA, borderRadius: 18 }} uiBackground={{ color: INK }}>
        <Icon src={ICON.boost} size={36} />
        <Label value={`4 ${t('boost.status')} / ${Math.min(5, rounds)} ${t('rounds')}`} fontSize={19} color={AQUA} textAlign="middle-center" uiTransform={{ width: 228, height: 40 }} />
      </UiEntity>}
      {uiClock < noticeUntil && <UiEntity uiTransform={{ width: 460, height: 42, margin: { top: 8 }, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }} uiBackground={{ color: INK }}>
        <Label value={t(notice as Parameters<typeof t>[0])} fontSize={18} color={GOLD} textAlign="middle-center" uiTransform={{ width: 450, height: 40 }} />
      </UiEntity>}
    </UiEntity>
  )
}

// --- death card ---
function Button(props: { label: string; onPress: () => void; filled: boolean; icon?: string; disabled?: boolean; width: number; height: number }) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width,
        height: props.height,
        margin: { top: 12 },
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: props.height / 2,
        borderWidth: 2,
        borderColor: props.filled ? MINT : EDGE,
        opacity: props.disabled ? 0.5 : 1
      }}
      uiBackground={{ color: props.filled ? MINT : rgba(1, 1, 1, 0.06) }}
      onMouseDown={() => {
        if (!props.disabled) props.onPress()
      }}
    >
      {props.icon && <Icon src={props.icon} size={34} margin={{ right: 8 }} />}
      <Label value={props.label} fontSize={props.filled ? 28 : 20} color={props.filled ? rgba(0.02, 0.1, 0.12, 1) : WHITE} textAlign="middle-center" uiTransform={{ width: props.width - (props.icon ? 70 : 12), height: props.height - 8 }} />
    </UiEntity>
  )
}

function deathLine(slot: ReturnType<typeof mySlot>): string {
  if (!slot) return ''
  if (slot.deathCause === 'mine') return t('death.mine')
  if (slot.killedBy === 'bruce') return t('death.bruce')
  if (slot.killedBy === 'tiger') return t('death.tiger')
  return t('death.wander')
}

function DeathCard(props: { score: number }) {
  const blasted = mySlot()?.deathCause === 'mine'
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
    >
      <UiEntity
        uiTransform={{
          width: 440,
          height: 478,
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: 18, bottom: 22, left: 24, right: 24 },
          borderRadius: 28,
          borderWidth: 2,
          borderColor: CORAL
        }}
        uiBackground={{ color: rgba(0.06, 0.03, 0.06, 0.94) }}
      >
        <Icon src={blasted ? ICON.mine : ICON.head} size={140} />
        <Label value={blasted ? t('death.blasted') : t('death.chomped')} fontSize={44} color={CORAL} textAlign="middle-center" uiTransform={{ width: 380, height: 54 }} />
        <Label value={deathLine(mySlot())} fontSize={18} color={WHITE} textAlign="middle-center" uiTransform={{ width: 380, height: 28 }} />
        <UiEntity uiTransform={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Icon src={ICON.coin} size={36} margin={{ right: 8 }} />
          <Label value={`${props.score}`} fontSize={30} color={GOLD} textAlign="middle-left" uiTransform={{ width: 170, height: 42 }} />
        </UiEntity>
        <Button label={endingPreview.active ? t('back-to-raft') : t('swim-again')} filled width={320} height={72} onPress={() => endingPreview.active ? finishEndingPreview() : room.send('respawn', {})} />
        <Button
          label={savedScore ? t('score-saved') : t('save-score')}
          filled={false}
          icon={ICON.trophy}
          disabled={savedScore || endingPreview.active}
          width={320}
          height={56}
          onPress={() => {
            room.send('saveScore', {})
            savedScore = true
          }}
        />
        <Label value={endingPreview.active ? t('death.preview') : t('death.kept')} fontSize={16} color={MUTED} textAlign="middle-center" uiTransform={{ width: 380, height: 26 }} />
      </UiEntity>
    </UiEntity>
  )
}

function ConnectionError() {
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: rgba(0, 0, 0, 0.85) }}>
      <UiEntity
        uiTransform={{ width: 440, flexDirection: 'column', alignItems: 'center', padding: 24, borderRadius: 28, borderWidth: 2, borderColor: CORAL }}
        uiBackground={{ color: rgba(0.06, 0.03, 0.06, 0.94) }}
      >
        <Label value={t('lost.title')} fontSize={36} color={CORAL} textAlign="middle-center" uiTransform={{ height: 50 }} />
        <Label value={t('lost.body')} fontSize={20} color={MUTED} textAlign="middle-center" uiTransform={{ width: '100%', height: 70 }} />
      </UiEntity>
    </UiEntity>
  )
}

// Movement is anchored directly to the device inset, without extra padding.
const movePad = () => {
  const slot = mySlot()
  if (!isMobile() || scoreboard.open || serverLost() || isGuest() || !slot || slot.dead) return null
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <DPad />
    </UiEntity>
  )
}

// Informational HUD and gear use the interactable area, without extra padding.
const uiComponent = () => {
  if (scoreboard.open) return null
  const slot = mySlot()
  if (serverLost() || isGuest() || slot?.dead) return null
  const playersTurn = gameState().phase === 'players'
  const cell = myCell()
  const harbor = cell ? inHarbor(cell.i, cell.j) : true
  const remaining = Math.max(0, 1 - phaseElapsed() / (playersTurn ? PLAYERS_TIME : SHARKS_TIME))
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity uiTransform={{ width: '100%', height: 112, flexDirection: 'row' }}>
        <UiEntity uiTransform={{ width: 360, height: 112, flexShrink: 0 }}>
          <Stats score={slot?.score ?? 0} lives={slot?.extraLives ?? 0} harbor={harbor} tier={cell ? tierOf(cell.i, cell.j) : 0} />
          <Contracts />
        </UiEntity>
        <UiEntity uiTransform={{ flexGrow: 1, height: 112 }}>
          <TurnPill playersTurn={playersTurn} remaining={remaining} />
          {playersTurn && <StepPips used={myPlan().length} max={myMaxSteps()} />}
        </UiEntity>
        <UiEntity uiTransform={{ width: 360, height: 112, flexShrink: 0 }}>
          {slot && cell && <Radar ci={cell.i} cj={cell.j} myAddress={slot.address} />}
          <UiEntity uiTransform={{ positionType: 'absolute', position: { top: RADAR + 16, right: 0 }, width: 360, flexDirection: 'column', alignItems: 'flex-end' }}>
            <HuntedPill />
          </UiEntity>
        </UiEntity>
      </UiEntity>
      {playersTurn && (myTargetInDanger() || myTargetInBlast()) && <LaneWarning />}
      <EquipmentStatus />
      <GearRow />
      {harbor && <RaftHint />}
    </UiEntity>
  )
}

// The death modal stays centered within the device safe area.
const centerHud = () => {
  if (scoreboard.open) return null
  if (serverLost() || isGuest()) return null
  const slot = mySlot()
  const dead = slot?.dead ?? false
  if (!dead && wasDead) savedScore = false
  wasDead = dead
  if (!dead || (cinema.active && !cinema.ready)) return null
  return <DeathCard score={slot?.score ?? 0} />
}
