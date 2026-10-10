import { PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

import { AdminState, isAdminAddress } from '../shared/admin'
import { BOT_MAX } from '../shared/config'
import { room } from '../shared/messages'

// ADMIN panel, only for wallets in ADMINS (src/shared/config.ts): reset the
// World and set the number of bots. Its own UI layer, top-left under the
// stats, sized for touch. The server re-checks the sender on every command.

const INK = Color4.create(0.02, 0.06, 0.12, 0.88)
const EDGE = Color4.create(0.45, 0.85, 1, 0.35)
const WHITE = Color4.create(1, 1, 1, 1)
const MUTED = Color4.create(0.72, 0.84, 0.95, 0.75)
const GOLD = Color4.create(1, 0.84, 0.32, 1)
const CORAL = Color4.create(1, 0.36, 0.34, 1)
const RESET_CONFIRM = 3 // s to tap RESET a second time

let open = false
let clock = 0
let resetArmedUntil = -1
let resetSentAt = -99
let resetsSeen = -1
let wantBots = -1 // last count asked for, until the server shows it

function myAddress(): string {
  return PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? ''
}

export function openAdminPanel(): void {
  if (!isAdminAddress(myAddress())) return
  open = true
  resetArmedUntil = -1
}

function adminState(): { bots: number; resets: number } | null {
  for (const [_e, s] of engine.getEntitiesWith(AdminState)) return s
  return null
}

export function setupAdminUi(): void {
  engine.addSystem((dt) => {
    clock += dt
  })
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), adminPanel, {
    virtualWidth: 1920, virtualHeight: 1080, screenInset: 'interactable', zIndex: 12
  })
}

function setBots(n: number): void {
  wantBots = Math.max(0, Math.min(BOT_MAX, n))
  room.send('adminBots', { count: wantBots })
}

function PanelButton(props: { label: string; width: number; height: number; color: Color4; filled?: boolean; onPress: () => void }) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width, height: props.height, margin: { left: 6, right: 6 },
        alignItems: 'center', justifyContent: 'center',
        borderRadius: props.height / 2, borderWidth: 2, borderColor: props.color
      }}
      uiBackground={{ color: props.filled ? props.color : Color4.create(1, 1, 1, 0.06) }}
      onMouseDown={props.onPress}
    >
      <Label value={props.label} fontSize={props.height > 60 ? 24 : 30} color={props.filled ? INK : WHITE} textAlign="middle-center" uiTransform={{ width: props.width - 8, height: props.height - 8 }} />
    </UiEntity>
  )
}

const adminPanel = () => {
  if (!isAdminAddress(myAddress())) {
    open = false
    return null
  }
  if (!open) return null
  const state = adminState()
  if (state && wantBots === state.bots) wantBots = -1
  const bots = wantBots >= 0 ? wantBots : state?.bots ?? 0
  if (state && resetsSeen < 0) resetsSeen = state.resets
  const resetDone = state !== null && state.resets > resetsSeen
  if (resetDone) {
    resetsSeen = state!.resets
    resetSentAt = -99
  }
  const armed = clock < resetArmedUntil
  const resetting = clock - resetSentAt < 4
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 120 }, flexDirection: 'column', alignItems: 'flex-start' }}>
      <UiEntity
        uiTransform={{ width: 150, height: 56, borderRadius: 28, borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ color: INK }}
        onMouseDown={() => {
          open = false
          resetArmedUntil = -1
        }}
      >
        <Label value="CLOSE" fontSize={22} color={GOLD} textAlign="middle-center" uiTransform={{ width: 140, height: 48 }} />
      </UiEntity>
      {open && (
        <UiEntity
          uiTransform={{ width: 380, margin: { top: 10 }, padding: { top: 14, bottom: 16, left: 14, right: 14 }, borderRadius: 24, flexDirection: 'column', alignItems: 'center' }}
          uiBackground={{ color: INK }}
        >
          <Label value={state ? 'BOTS' : 'BOTS (waiting for server)'} fontSize={18} color={MUTED} textAlign="middle-center" uiTransform={{ width: 340, height: 26 }} />
          <UiEntity uiTransform={{ width: 340, height: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <PanelButton label="-" width={84} height={72} color={EDGE} onPress={() => state && setBots(bots - 1)} />
            <Label value={`${bots}`} fontSize={40} color={WHITE} textAlign="middle-center" uiTransform={{ width: 110, height: 72 }} />
            <PanelButton label="+" width={84} height={72} color={EDGE} onPress={() => state && setBots(bots + 1)} />
          </UiEntity>
          <UiEntity uiTransform={{ width: 340, height: 2, margin: { top: 10, bottom: 14 } }} uiBackground={{ color: EDGE }} />
          <PanelButton
            label={resetting ? 'RESETTING...' : armed ? 'TAP AGAIN TO RESET' : 'RESET WORLD'}
            width={320} height={72} color={CORAL} filled={armed}
            onPress={() => {
              if (!state || resetting) return
              if (armed) {
                resetArmedUntil = -1
                resetSentAt = clock
                room.send('adminReset', {})
              } else {
                resetArmedUntil = clock + RESET_CONFIRM
              }
            }}
          />
          <Label value="Everyone back to the raft. Scores, gear and contracts cleared." fontSize={14} color={MUTED} textAlign="middle-center" uiTransform={{ width: 340, height: 40, margin: { top: 6 } }} />
        </UiEntity>
      )}
    </UiEntity>
  )
}
