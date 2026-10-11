import { isMobile } from '@dcl/sdk/platform'
import ReactEcs, { UiComponent, UiEntity } from '@dcl/sdk/react-ecs'

// Desktop: keep the HUD off the screen edges (virtual px of the 1920×1080 canvas).
// Mobile already sits inside the device / interactable safe area.
const DESKTOP_MARGIN = 32

export function edgePadded(ui: UiComponent): UiComponent {
  return () => {
    const content = ui()
    if (!content || isMobile()) return content
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%', padding: DESKTOP_MARGIN }}>
        <UiEntity uiTransform={{ flexGrow: 1 }}>{content}</UiEntity>
      </UiEntity>
    )
  }
}
