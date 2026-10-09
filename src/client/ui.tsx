import { engine } from '@dcl/sdk/ecs'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

import { GameState, PlayerSlot } from '../shared/components'
import { room } from '../shared/messages'
import { gamePhase, mySlot } from './render'

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
let tapsSent = 0 // debug

function sendMove(di: number, dj: number) {
  tapsSent++
  room.send('move', { di, dj })
}

// Bumped manually per deploy to spot stale cached bundles on the phone.
export const BUILD_TAG = 'hb2'

function debugLine(): string {
  let slots = 0
  for (const [_e] of engine.getEntitiesWith(PlayerSlot)) slots++
  const slot = mySlot()
  return `${BUILD_TAG} slots:${slots} cell:${slot ? `${slot.cellI},${slot.cellJ}` : '-'} taps:${tapsSent}`
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent, { screenInset: 'interactable' })
}

const FONT_TITLE = 34
const FONT_BIG = 28
const FONT_MED = 20

const PANEL_BG = { r: 0.02, g: 0.05, b: 0.1, a: 0.75 }
const ACCENT = { r: 0.4, g: 0.8, b: 1, a: 1 }
const DANGER = { r: 1, g: 0.3, b: 0.3, a: 1 }
const OK = { r: 0.4, g: 1, b: 0.5, a: 1 }

const DPAD_BTN = 96
const DPAD_GAP = 10
const DPAD_SIZE = DPAD_BTN * 3 + DPAD_GAP * 2

function dpadButton(label: string, col: number, row: number, di: number, dj: number) {
  return (
    <Button
      value={label}
      fontSize={40}
      color={ACCENT}
      onMouseDown={() => sendMove(di, dj)}
      uiBackground={{ color: PANEL_BG }}
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
  const playersTurn = phase === 'players'
  const phaseLabel = playersTurn ? '— MOVE —' : phase === 'sharks-move' ? '— SHARKS MOVE —' : '— ATTACK! —'
  const dead = slot?.dead ?? false

  if (dead) savedScore = wasDead ? savedScore : false
  if (!dead && wasDead) savedScore = false
  wasDead = dead

  // No server: block with an error modal.
  if (!serverConnected && noServerElapsed > 12) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0.9 } }}>
        <UiEntity uiTransform={{ width: 420, height: 240, alignItems: 'center', padding: 20 }} uiBackground={{ color: { r: 0.15, g: 0, b: 0, a: 0.95 } }}>
          <Label value="CONNECTION ERROR" fontSize={FONT_TITLE} color={DANGER} textAlign="middle-center" uiTransform={{ width: '100%', height: 60 }} />
          <Label
            value="No multiplayer server.\nRe-enter the scene to retry."
            fontSize={FONT_MED}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: 100 }}
          />
        </UiEntity>
      </UiEntity>
    )
  }

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0 } }}>
      {/* Score + turn banner, top center */}
      <UiEntity
        uiTransform={{
          width: 360,
          height: 150,
          positionType: 'absolute',
          position: { top: '4%', left: '50%' },
          margin: { left: -180 },
          alignItems: 'center',
          padding: 8
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        <Label
          value={`SCORE ${slot?.score ?? 0}    LIVES ${slot?.extraLives ?? 0}${slot?.stunned ? '    STUNNED' : ''}`}
          fontSize={FONT_MED}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 40 }}
        />
        <Label
          value={phaseLabel}
          fontSize={FONT_BIG}
          color={playersTurn ? OK : DANGER}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 50 }}
        />
        {/* debug: quita cuando ande */}
        <Label
          value={debugLine()}
          fontSize={12}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 30 }}
        />
      </UiEntity>

      {/* D-pad, bottom left */}
      <UiEntity
        uiTransform={{
          width: DPAD_SIZE,
          height: DPAD_SIZE,
          positionType: 'absolute',
          position: { left: '4%', bottom: '5%' }
        }}
        uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0 } }}
      >
        {dpadButton('▲', 1, 0, 0, 1)}
        {dpadButton('◀', 0, 1, -1, 0)}
        {dpadButton('▶', 2, 1, 1, 0)}
        {dpadButton('▼', 1, 2, 0, -1)}
      </UiEntity>

      {/* Attack, bottom right */}
      <Button
        value="👊"
        fontSize={52}
        onMouseDown={() => room.send('attack', {})}
        uiBackground={{ color: PANEL_BG }}
        uiTransform={{
          width: 130,
          height: 130,
          positionType: 'absolute',
          position: { right: '5%', bottom: '8%' }
        }}
      />

      {/* Death overlay */}
      {dead && (
        <UiEntity
          uiTransform={{
            width: 400,
            height: 320,
            positionType: 'absolute',
            position: { top: '25%', left: '50%' },
            margin: { left: -200 },
            alignItems: 'center',
            padding: 16
          }}
          uiBackground={{ color: { r: 0.1, g: 0, b: 0, a: 0.9 } }}
        >
          <Label value="A SHARK GOT YOU" fontSize={FONT_TITLE} color={DANGER} textAlign="middle-center" uiTransform={{ width: '100%', height: 60 }} />
          <Button
            value="RESPAWN"
            fontSize={FONT_BIG}
            onMouseDown={() => room.send('respawn', {})}
            uiTransform={{ width: 260, height: 90 }}
          />
          <Button
            value={savedScore ? 'SAVED ✓' : 'SAVE SCORE'}
            fontSize={FONT_MED}
            disabled={savedScore}
            onMouseDown={() => {
              room.send('saveScore', {})
              savedScore = true
            }}
            uiTransform={{ width: 260, height: 60, margin: { top: 12 } }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}
