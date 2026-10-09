import { engine, InputAction } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

import { PlayerSlot } from '../shared/components'
import { room } from '../shared/messages'
import { gamePhase, mySlot } from './state'
import { phaseDuration, phaseTimeLeft, uiTickSfx } from './audio'
import { requestMove } from './input'

// Connection watchdog: without server heartbeats, there is no multiplayer
// server (or the room is broken) — block with an error modal.
let noServerElapsed = 0
let serverConnected = false
room.onMessage('ping', () => {
  if (!serverConnected) console.log('[client] first ping received')
  serverConnected = true
})
engine.addSystem((dt) => {
  if (serverConnected) return
  noServerElapsed += dt
})

let savedScore = false
let wasDead = false

// Bumped manually per deploy to spot stale cached bundles on the phone.
export const BUILD_TAG = 'hb4'

function debugLine(): string {
  let slots = 0
  for (const [_e] of engine.getEntitiesWith(PlayerSlot)) slots++
  const slot = mySlot()
  return `${BUILD_TAG} slots:${slots} cell:${slot ? `${slot.cellI},${slot.cellJ}` : '-'}`
}

function sendMsg(msg: 'respawn' | 'saveScore') {
  uiTickSfx()
  room.send(msg, {})
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent, { screenInset: 'none' })
}

const PANEL_BG = { r: 0.02, g: 0.05, b: 0.1, a: 0.75 }
const ACCENT = { r: 0.4, g: 0.8, b: 1, a: 1 }
const DANGER = { r: 1, g: 0.3, b: 0.3, a: 1 }
const OK = { r: 0.4, g: 1, b: 0.5, a: 1 }
const WARN = { r: 1, g: 0.75, b: 0.2, a: 1 }

const PHASE_STYLE: Record<string, { label: string; color: typeof OK }> = {
  players: { label: 'MOVE!', color: OK },
  'sharks-move': { label: 'SHARKS…', color: WARN },
  'sharks-attack': { label: '⚠ ATTACK ⚠', color: DANGER }
}

const DPAD_BTN = 96
const DPAD_GAP = 10
const DPAD_SIZE = DPAD_BTN * 3 + DPAD_GAP * 2

function dpadButton(label: string, col: number, row: number, action: InputAction, di: number, dj: number) {
  return (
    <Button
      value={label}
      fontSize={40}
      color={ACCENT}
      uiBackground={{ color: PANEL_BG }}
      uiInputBinding={{ actions: [action] }}
      onMouseDown={() => requestMove(di, dj)}
      uiTransform={{
        width: DPAD_BTN,
        height: DPAD_BTN,
        positionType: 'absolute',
        position: { left: col * (DPAD_BTN + DPAD_GAP), top: row * (DPAD_BTN + DPAD_GAP) }
      }}
    />
  )
}

const uiComponent = () => {
  const slot = mySlot()
  const phase = gamePhase()
  const style = PHASE_STYLE[phase] ?? PHASE_STYLE.players
  const dead = slot?.dead ?? false

  if (!dead) savedScore = false
  wasDead = dead

  // No server: block with an error modal.
  if (!serverConnected && noServerElapsed > 12) {
    return (
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0.9 } }}
      >
        <UiEntity
          uiTransform={{ width: 420, height: 240, alignItems: 'center', padding: 20 }}
          uiBackground={{ color: { r: 0.15, g: 0, b: 0, a: 0.95 } }}
        >
          <Label value="CONNECTION ERROR" fontSize={34} color={DANGER} textAlign="middle-center" uiTransform={{ width: '100%', height: 60 }} />
          <Label
            value="No multiplayer server.\nRe-enter the scene to retry."
            fontSize={20}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: 100 }}
          />
        </UiEntity>
      </UiEntity>
    )
  }

  const timeLeft = phaseTimeLeft()
  const barK = phaseDuration() > 0 ? timeLeft / phaseDuration() : 0

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0 } }}>
      {/* Red vignette while the sharks bite */}
      {phase === 'sharks-attack' && (
        <UiEntity
          uiTransform={{ width: '100%', height: '100%' }}
          uiBackground={{ color: { r: 0.6, g: 0, b: 0, a: 0.18 } }}
        />
      )}

      {/* Score + turn banner, top center */}
      <UiEntity
        uiTransform={{
          width: 380,
          height: 160,
          positionType: 'absolute',
          position: { top: '4%', left: '50%' },
          margin: { left: -190 },
          flexDirection: 'column',
          alignItems: 'center',
          padding: 10
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
        >
          <UiEntity
            uiTransform={{ width: 32, height: 32, margin: { right: 8 } }}
            uiBackground={{ texture: { src: 'assets/images/items/score-coin.png' }, textureMode: 'stretch' }}
          />
          <Label value={`${slot?.score ?? 0}`} fontSize={26} textAlign="middle-left" uiTransform={{ width: 90, height: 40 }} />
          <Label value={`LIVES ${slot?.extraLives ?? 0}`} fontSize={20} textAlign="middle-center" uiTransform={{ width: 90, height: 40 }} />
          <Label value={`MOVES ${slot?.movesLeft ?? 0}`} fontSize={20} color={ACCENT} textAlign="middle-center" uiTransform={{ width: 100, height: 40 }} />
          {slot?.stunned && <Label value="STUNNED" fontSize={18} color={WARN} uiTransform={{ width: 90, height: 40 }} />}
        </UiEntity>

        <Label value={style.label} fontSize={34} color={style.color} textAlign="middle-center" uiTransform={{ width: '100%', height: 50 }} />

        {/* Phase countdown bar */}
        <UiEntity uiTransform={{ width: '90%', height: 10 }} uiBackground={{ color: { r: 0.1, g: 0.15, b: 0.2, a: 1 } }}>
          <UiEntity uiTransform={{ width: `${Math.round(barK * 100)}%`, height: '100%' }} uiBackground={{ color: style.color }} />
        </UiEntity>

        {/* debug: quita cuando ande */}
        <Label value={debugLine()} fontSize={12} textAlign="middle-center" uiTransform={{ width: '100%', height: 26 }} />
      </UiEntity>

      {/* D-pad, bottom left — mobile only; desktop uses arrow keys/WASD */}
      {isMobile() && (
        <UiEntity
          uiTransform={{
            width: DPAD_SIZE,
            height: DPAD_SIZE,
            positionType: 'absolute',
            position: { left: '10%', bottom: '12%' }
          }}
          uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0 } }}
        >
          {dpadButton('▲', 1, 0, InputAction.IA_ACTION_3, 0, 1)}
          {dpadButton('◀', 0, 1, InputAction.IA_ACTION_5, -1, 0)}
          {dpadButton('▶', 2, 1, InputAction.IA_ACTION_6, 1, 0)}
          {dpadButton('▼', 1, 2, InputAction.IA_ACTION_4, 0, -1)}
        </UiEntity>
      )}

      {/* Death overlay */}
      {dead && (
        <UiEntity
          uiTransform={{
            width: 400,
            height: 400,
            positionType: 'absolute',
            position: { top: '24%', left: '50%' },
            margin: { left: -200 },
            flexDirection: 'column',
            alignItems: 'center',
            padding: 16
          }}
          uiBackground={{ color: { r: 0.1, g: 0, b: 0, a: 0.92 } }}
        >
          <UiEntity
            uiTransform={{ width: 120, height: 120 }}
            uiBackground={{ texture: { src: 'assets/images/items/shark-head-bite.png' }, textureMode: 'stretch' }}
          />
          <Label value="A SHARK GOT YOU" fontSize={28} color={DANGER} textAlign="middle-center" uiTransform={{ width: '100%', height: 50 }} />
          <Button value="RESPAWN" fontSize={28} onMouseDown={() => sendMsg('respawn')} uiTransform={{ width: 260, height: 80 }} />
          <Button
            value={savedScore ? 'SAVED ✓' : 'SAVE SCORE'}
            fontSize={20}
            disabled={savedScore}
            onMouseDown={() => {
              sendMsg('saveScore')
              savedScore = true
            }}
            uiTransform={{ width: 260, height: 56, margin: { top: 10 } }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}
