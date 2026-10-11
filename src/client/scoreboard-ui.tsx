import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { scoreboard } from './state'
import { t } from './i18n'

const gold = Color4.create(1, .77, .28, 1)
const ink = Color4.create(.035, .105, .115, 1)

// While the camera is zoomed onto the 3D scoreboard (harbor.ts), the HUD is
// hidden and this EXIT button zooms back out. Bottom centre, touch-sized.
export function ScoreboardUi() {
  if (!scoreboard.open) return null
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ width: 300, height: 96, margin: { bottom: 24 }, alignItems: 'center', justifyContent: 'center', borderRadius: 48, borderWidth: 3, borderColor: ink }}
        uiBackground={{ color: gold }}
        onMouseDown={() => { scoreboard.open = false }}
      >
        <Label value={t('exit')} fontSize={34} color={ink} textAlign="middle-center" uiTransform={{ width: 300, height: 96 }} />
      </UiEntity>
    </UiEntity>
  )
}
