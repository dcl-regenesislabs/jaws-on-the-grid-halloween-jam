import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

import { Pickup, PlayerSlot } from '../shared/components'
import { HARBOR_MIN, HARBOR_SIZE, PLAYERS_TIME, SHARKS_TIME, inHarbor, tierOf } from '../shared/config'
import { room } from '../shared/messages'
import { canPlanNow, canSlapNow, canStep, requestCancel, requestSlap, requestStep, slapCooldownLeft } from './input'
import { gameState, isGuest, myCell, myMaxSteps, myPlan, myTargetInDanger, mySlot, phaseElapsed } from './state'

// HUD for a 1600×720 mobile canvas, inside the interactable area (clear of
// the Explorer's own left-hand controls). Layout:
//   top-left stats · top-center turn pill · top-right radar
//   bottom-left d-pad · bottom-right fish slap

// Bumped manually per deploy to spot stale cached bundles on the phone.
export const BUILD_TAG = 'ui2'

// Connection watchdog: without server heartbeats, there is no multiplayer
// server (or the room is broken) — block with an error modal.
let noServerElapsed = 0
let serverConnected = false
let uiClock = 0
room.onMessage('ping', () => {
  if (!serverConnected) console.log('[client] first ping received', BUILD_TAG)
  serverConnected = true
})
engine.addSystem((dt) => {
  uiClock += dt
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
  ReactEcsRenderer.setUiRenderer(uiComponent, { screenInset: 'interactable', zIndex: 10 })
  // Full-screen red wash while the sharks strike (outside the inset area).
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), vignette, { screenInset: 'none', zIndex: 0 })
  // D-pad in the device safe area: nearer the left thumb than the
  // interactable area, which starts right of the Explorer's left controls.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), movePad, { screenInset: 'device', zIndex: 20 })
  // No server / guest account: full-screen blockers over everything,
  // Explorer areas included.
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), blocker, { screenInset: 'none', zIndex: 30 })
}

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
        <Label value="SIGN IN TO PLAY" fontSize={34} color={GOLD} textAlign="middle-center" uiTransform={{ height: 48 }} />
        <Label
          value={'Guest accounts cannot swim with the sharks.\nLog in with a wallet or social account,\nthen re-enter the scene.'}
          fontSize={18}
          color={MUTED}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 84 }}
        />
      </UiEntity>
    </UiEntity>
  )
}

const movePad = () => {
  if (serverLost() || isGuest()) return null
  const slot = mySlot()
  if (!slot || slot.dead) return null
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <DPad />
    </UiEntity>
  )
}

const vignette = () =>
  gameState().phase === 'sharks' ? (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ color: Color4.create(0.6, 0, 0.02, 0.16) }} />
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

const ICON = {
  coin: 'assets/images/ui/score-coin.png',
  buoy: 'assets/images/ui/life-buoy.png',
  fin: 'assets/images/ui/shark-fin-great-white.png',
  raft: 'assets/images/ui/player-raft.png',
  fish: 'assets/images/ui/bait-fish.png',
  head: 'assets/images/ui/shark-head-bite.png',
  trophy: 'assets/images/ui/survivor-trophy.png',
  up: 'assets/images/ui/arrow-up.png',
  down: 'assets/images/ui/arrow-down.png',
  left: 'assets/images/ui/arrow-left.png',
  right: 'assets/images/ui/arrow-right.png'
}

function Icon(props: { src: string; size: number; margin?: { left?: number; right?: number } }) {
  return (
    <UiEntity
      uiTransform={{ width: props.size, height: props.size, flexShrink: 0, margin: props.margin }}
      uiBackground={{ textureMode: 'stretch', texture: { src: props.src } }}
    />
  )
}

// --- top-left: score, lives, depth ---
function Stats(props: { score: number; lives: number; harbor: boolean; tier: number }) {
  const depthColor = props.harbor ? MINT : props.tier >= 3 ? CORAL : props.tier >= 1 ? GOLD : AQUA
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 16, left: 30 },
        flexDirection: 'column',
        alignItems: 'flex-start'
      }}
    >
      <UiEntity
        uiTransform={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 10, right: 18 },
          borderRadius: 32,
          borderWidth: 2,
          borderColor: EDGE
        }}
        uiBackground={{ color: INK }}
      >
        <Icon src={ICON.coin} size={46} />
        <Label value={`${props.score}`} fontSize={30} color={GOLD} textAlign="middle-left" uiTransform={{ width: 84, height: 50, margin: { left: 8 } }} />
        <Icon src={ICON.buoy} size={38} margin={{ left: 6 }} />
        <Label value={`x${props.lives}`} fontSize={26} color={WHITE} textAlign="middle-left" uiTransform={{ width: 52, height: 50, margin: { left: 6 } }} />
      </UiEntity>
      <UiEntity
        uiTransform={{
          height: 34,
          margin: { top: 8, left: 6 },
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 6, right: 14 },
          borderRadius: 17,
          borderWidth: 2,
          borderColor: depthColor
        }}
        uiBackground={{ color: INK_SOFT }}
      >
        <Icon src={props.harbor ? ICON.raft : ICON.fin} size={26} />
        <Label
          value={props.harbor ? 'PRACTICE RAFT' : `DEPTH ${props.tier + 1}`}
          fontSize={16}
          color={depthColor}
          textAlign="middle-left"
          uiTransform={{ width: 120, height: 30, margin: { left: 6 } }}
        />
      </UiEntity>
    </UiEntity>
  )
}

// --- top-center: whose turn, time left, move state ---
function TurnPill(props: { playersTurn: boolean; remaining: number; status: string; statusColor: Color4 }) {
  const color = props.playersTurn ? MINT : CORAL
  const W = 300
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 16, left: '50%' },
        margin: { left: -W / 2 },
        width: W,
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
          borderRadius: 24,
          borderWidth: 2,
          borderColor: props.playersTurn ? EDGE : CORAL
        }}
        uiBackground={{ color: props.playersTurn ? INK : CORAL_DEEP }}
      >
        <UiEntity uiTransform={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {!props.playersTurn && <Icon src={ICON.fin} size={34} margin={{ right: 8 }} />}
          <Label value={props.playersTurn ? 'PICK A MOVE' : 'GO!'} fontSize={30} color={props.playersTurn ? color : WHITE} textAlign="middle-center" uiTransform={{ width: 200, height: 40 }} />
        </UiEntity>
        <UiEntity uiTransform={{ width: W - 48, height: 8, margin: { top: 6 }, borderRadius: 4 }} uiBackground={{ color: rgba(1, 1, 1, 0.12) }}>
          <UiEntity
            uiTransform={{ width: Math.max(8, Math.round((W - 48) * props.remaining)), height: 8, borderRadius: 4 }}
            uiBackground={{ color: props.playersTurn ? color : WHITE }}
          />
        </UiEntity>
      </UiEntity>
      <Label value={props.status} fontSize={16} color={props.statusColor} textAlign="middle-center" uiTransform={{ width: W, height: 26, margin: { top: 4 } }} />
    </UiEntity>
  )
}

// On the raft: how a turn works. The game starts once you swim off it.
function RaftHint() {
  const lines = [
    'PICK A MOVE: plan your path with the arrows',
    'GO!: everyone swims, sharks dash their red lanes',
    'End on a red lane and you get chomped'
  ]
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 24, left: '50%' },
        margin: { left: -230 },
        width: 460,
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: 10, bottom: 12, left: 16, right: 16 },
        borderRadius: 20,
        borderWidth: 2,
        borderColor: rgba(0.69, 0.48, 0.27, 1)
      }}
      uiBackground={{ color: INK }}
    >
      <UiEntity uiTransform={{ height: 34, flexDirection: 'row', alignItems: 'center' }}>
        <Icon src={ICON.raft} size={30} margin={{ right: 8 }} />
        <Label value="PRACTICE RAFT" fontSize={20} color={GOLD} textAlign="middle-left" uiTransform={{ width: 200, height: 30 }} />
      </UiEntity>
      {lines.map((line, n) => (
        <Label key={`hint-${n}`} value={line} fontSize={15} color={MUTED} textAlign="middle-center" uiTransform={{ width: '100%', height: 22 }} />
      ))}
      <Label value="Swim off the raft to start!" fontSize={18} color={MINT} textAlign="middle-center" uiTransform={{ width: '100%', height: 28, margin: { top: 4 } }} />
    </UiEntity>
  )
}

function LaneWarning() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 160, left: '50%' },
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
      <Label value="YOUR SPOT IS ON A SHARK LANE" fontSize={18} color={WHITE} textAlign="middle-center" />
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

function Radar(props: { ci: number; cj: number; myAddress: string }) {
  const dots: any[] = []
  const cellPx = RADAR / (2 * RADAR_CELLS)

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
      <Dot key={`p${e}`} di={p.cellI - props.ci} dj={p.cellJ - props.cj} size={p.kind === 'coin' ? 8 : 10} color={p.kind === 'coin' ? GOLD : CORAL} />
    )
  }
  for (const [e, s] of engine.getEntitiesWith(PlayerSlot)) {
    if (s.dead || s.address === props.myAddress) continue
    dots.push(<Dot key={`s${e}`} di={s.cellI - props.ci} dj={s.cellJ - props.cj} size={11} color={WHITE} clamp />)
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 16, right: 16 },
        width: RADAR + 8, // + padding 2 + border 2, both sides
        height: RADAR + 8,
        padding: 2,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: EDGE
      }}
      uiBackground={{ color: INK }}
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
const DPAD_LEFT = 40

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
      <Label value="X" fontSize={30} color={enabled ? CORAL : MUTED} textAlign="middle-center" />
    </UiEntity>
  )
}

function DPad() {
  const size = PAD * 3 + PAD_GAP * 2
  return (
    // The left arrow's row sits above the Explorer's emote button (bottom-left).
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: DPAD_LEFT, bottom: 16 }, width: size, height: size }}>
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
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 128, left: '50%' }, margin: { left: -(props.max * 26) / 2 }, flexDirection: 'row' }}>
      {pips}
    </UiEntity>
  )
}

// --- bottom-right: fish slap (stuns players next to you) ---
function SlapButton() {
  const cooldown = slapCooldownLeft()
  const cooling = cooldown > 0
  const ready = canSlapNow()
  const SIZE = 132
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: 24, bottom: 24 },
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: SIZE,
          height: SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: SIZE / 2,
          borderWidth: 3,
          borderColor: ready ? GOLD : EDGE,
          opacity: ready ? 1 : 0.45
        }}
        uiBackground={{ color: isPressed('slap') ? rgba(1, 0.84, 0.32, 0.45) : INK }}
        onMouseDown={() => {
          if (requestSlap()) press('slap')
        }}
      >
        <Icon src={ICON.fish} size={88} />
      </UiEntity>
      <Label value={cooling ? `${Math.ceil(cooldown)}` : 'SLAP'} fontSize={18} color={ready ? GOLD : MUTED} textAlign="middle-center" uiTransform={{ width: SIZE, height: 26, margin: { top: 4 } }} />
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
      <Label value={props.label} fontSize={props.filled ? 28 : 20} color={props.filled ? rgba(0.02, 0.1, 0.12, 1) : WHITE} textAlign="middle-center" />
    </UiEntity>
  )
}

function DeathCard(props: { score: number }) {
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
    >
      <UiEntity
        uiTransform={{
          width: 440,
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: 18, bottom: 22, left: 24, right: 24 },
          borderRadius: 28,
          borderWidth: 2,
          borderColor: CORAL
        }}
        uiBackground={{ color: rgba(0.06, 0.03, 0.06, 0.94) }}
      >
        <Icon src={ICON.head} size={140} />
        <Label value="CHOMPED!" fontSize={44} color={CORAL} textAlign="middle-center" uiTransform={{ height: 54 }} />
        <UiEntity uiTransform={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Icon src={ICON.coin} size={36} margin={{ right: 8 }} />
          <Label value={`${props.score}`} fontSize={30} color={GOLD} textAlign="middle-left" />
        </UiEntity>
        <Button label="SWIM AGAIN" filled width={320} height={72} onPress={() => room.send('respawn', {})} />
        <Button
          label={savedScore ? 'SCORE SAVED' : 'SAVE SCORE'}
          filled={false}
          icon={ICON.trophy}
          disabled={savedScore}
          width={320}
          height={56}
          onPress={() => {
            room.send('saveScore', {})
            savedScore = true
          }}
        />
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
        <Label value="LOST AT SEA" fontSize={36} color={CORAL} textAlign="middle-center" uiTransform={{ height: 50 }} />
        <Label value={'No multiplayer server.\nRe-enter the scene to retry.'} fontSize={20} color={MUTED} textAlign="middle-center" uiTransform={{ width: '100%', height: 70 }} />
      </UiEntity>
    </UiEntity>
  )
}

const uiComponent = () => {
  if (serverLost() || isGuest()) return null

  const slot = mySlot()
  const { phase } = gameState()
  const playersTurn = phase === 'players'
  const dead = slot?.dead ?? false
  const stunned = slot?.stunned ?? false
  const cell = myCell()
  const canPlan = canPlanNow()
  const plan = myPlan()
  const maxSteps = myMaxSteps()
  const harbor = cell ? inHarbor(cell.i, cell.j) : true
  const tier = cell ? tierOf(cell.i, cell.j) : 0
  const remaining = Math.max(0, 1 - phaseElapsed() / (playersTurn ? PLAYERS_TIME : SHARKS_TIME))

  if (!dead && wasDead) savedScore = false
  wasDead = dead

  let status = 'SWIM!'
  let statusColor = MUTED
  if (dead) {
    status = 'CHOMPED'
    statusColor = CORAL
  } else if (playersTurn) {
    if (stunned) {
      status = 'SLAPPED - FROZEN'
      statusColor = CORAL
    } else if (plan.length === 0) {
      status = canPlan ? `PLAN UP TO ${maxSteps} STEPS - OR STAY` : 'STAYING'
      statusColor = canPlan ? MINT : MUTED
    } else {
      status = `${plan.length}/${maxSteps} STEPS - X TO CANCEL`
      statusColor = GOLD
    }
  }

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ color: CLEAR }}>
      <Stats score={slot?.score ?? 0} lives={slot?.extraLives ?? 0} harbor={harbor} tier={tier} />
      <TurnPill playersTurn={playersTurn} remaining={remaining} status={status} statusColor={statusColor} />
      {playersTurn && !dead && !stunned && <StepPips used={plan.length} max={maxSteps} />}
      {playersTurn && !dead && myTargetInDanger() && <LaneWarning />}
      {harbor && !dead && <RaftHint />}
      {slot && cell && <Radar ci={cell.i} cj={cell.j} myAddress={slot.address} />}
      {!dead && <SlapButton />}
      {dead && <DeathCard score={slot?.score ?? 0} />}
    </UiEntity>
  )
}
