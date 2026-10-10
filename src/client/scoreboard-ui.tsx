import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Leaderboard } from '../shared/components'
import { scoreboard } from './state'

const cream = Color4.create(.94, .92, .82, 1)
const gold = Color4.create(1, .77, .28, 1)
const muted = Color4.create(.61, .76, .75, 1)

export function ScoreboardUi() {
  if (!scoreboard.open) return null
  const board = [...engine.getEntitiesWith(Leaderboard)][0]?.[1]
  const status = board?.status ?? 'loading'
  const entries = board?.entries ?? []
  const message = status === 'loading' ? 'Loading saved scores...'
    : status === 'error' ? 'Scores unavailable. Please try again later.'
    : 'No saved scores yet. Be the first survivor!'
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', pointerFilter: 'block' }} uiBackground={{ color: Color4.create(.01, .025, .04, .88) }}>
      <UiEntity uiTransform={{ width: 720, height: 640, padding: 16, flexDirection: 'column', alignItems: 'center', borderWidth: 2, borderColor: gold }} uiBackground={{ color: Color4.create(.035, .105, .115, 1) }}>
        <Label value="SCORE BOARD" fontSize={34} color={gold} textAlign="middle-center" uiTransform={{ width: 680, height: 44, flexShrink: 0 }} />
        <Label value="TOP 10 / BEST SAVED SCORES" fontSize={18} color={muted} textAlign="middle-center" uiTransform={{ width: 680, height: 30, flexShrink: 0 }} />
        <UiEntity uiTransform={{ width: 656, height: 320, flexDirection: 'column', margin: { top: 10, bottom: 10 }, flexShrink: 0 }}>
          {status === 'ready' && entries.length > 0 ? entries.map((entry, index) => (
            <UiEntity key={`score-${index}`} uiTransform={{ width: 656, height: 32, flexDirection: 'row', alignItems: 'center', flexShrink: 0 }} uiBackground={{ color: Color4.create(1, 1, 1, index % 2 === 0 ? .055 : 0) }}>
              <Label value={`${index + 1}`} fontSize={22} color={index === 0 ? gold : muted} textAlign="middle-center" uiTransform={{ width: 56, height: 32 }} />
              <Label value={entry.name.replace(/[<>\r\n]/g, '').slice(0, 28)} fontSize={22} color={cream} textAlign="middle-left" uiTransform={{ width: 448, height: 32 }} />
              <Label value={`${entry.score}`} fontSize={22} color={gold} textAlign="middle-right" uiTransform={{ width: 140, height: 32 }} />
            </UiEntity>
          )) : <Label value={message} fontSize={22} color={cream} textAlign="middle-center" uiTransform={{ width: 656, height: 320 }} />}
        </UiEntity>
        <Label value="Use SAVE SCORE after a run to join the board." fontSize={18} color={muted} textAlign="middle-center" uiTransform={{ width: 680, height: 36, flexShrink: 0 }} />
        <UiEntity uiTransform={{ width: 320, height: 96, margin: { top: 14 }, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} uiBackground={{ color: gold }} onMouseDown={() => { scoreboard.open = false }}>
          <Label value="CLOSE" fontSize={28} color={Color4.create(.035, .105, .115, 1)} textAlign="middle-center" uiTransform={{ width: 320, height: 96 }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
