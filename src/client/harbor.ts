import {
  Entity,
  engine,
  InputAction,
  MainCamera,
  pointerEventsSystem,
  TextAlignMode,
  TextShape,
  Transform,
  VirtualCamera
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { Leaderboard } from '../shared/components'
import { inHarbor } from '../shared/config'
import { room } from '../shared/messages'
import { cinema } from './cinematic'
import { lang, t } from './i18n'
import { gameState, mySlot, pendingPlan, scoreboard } from './state'

export function initHarbor(): void {
  const board = engine.getEntityOrNullByName('Raft Scoreboard')
  if (board === null) {
    console.error('[client] Raft Scoreboard missing from composite')
    return
  }
  // Tapping the board zooms the camera onto it (top 10); tapping it again or
  // EXIT (scoreboard-ui.tsx) zooms back out.
  const toggleScoreboard = (): boolean => {
    if (scoreboard.open) {
      scoreboard.open = false
      return true
    }
    const slot = mySlot()
    if (!slot || slot.dead || !inHarbor(slot.cellI, slot.cellJ)) return false
    // Cancel a queued departure when possible, so reading on the raft is safe.
    if (gameState().phase === 'players') {
      room.send('plan', { steps: [] })
      pendingPlan.active = false
    }
    scoreboard.open = true
    return true
  }
  // Tap (phone) or click (desktop) the board. The game runs on a scene
  // VirtualCamera, so the mobile client raycasts from the tapped point and
  // sends it as an IA_POINTER press; hover only moves with taps there, so it
  // can't open the board on its own. Desktop keeps the hover hint.
  let registeredMobile: boolean | undefined
  const updateInteraction = () => {
    const mobile = isMobile()
    if (registeredMobile === mobile) return
    pointerEventsSystem.removeOnPointerDown(board)
    registeredMobile = mobile
    pointerEventsSystem.onPointerDown({
      entity: board,
      opts: mobile
        ? { button: InputAction.IA_POINTER, maxDistance: 40, showFeedback: false }
        : { button: InputAction.IA_POINTER, hoverText: t('view-scoreboard'), maxDistance: 40 }
    }, () => { toggleScoreboard() })
  }
  updateInteraction()
  createBoardList(board)
  createBoardZoom(board)
  engine.addSystem(() => {
    // Platform information may arrive after main() on the first few ticks.
    updateInteraction()
    const slot = mySlot()
    // A move already executing is authoritative; close if it leaves safety.
    if (!slot || slot.dead || !inHarbor(slot.cellI, slot.cellJ)) scoreboard.open = false
  })
}

// Live scores written on the board's chalk face, between the baked title and
// TAP TO VIEW (scripts/build-raft.py): the top 5 in big letters from the
// game camera, the top 10 in small letters while zoomed in. The face is the
// model's panel plane tilted 35° back from flat-up toward the camera; with the
// composite's 180° turn it faces -Z. Points are (across, up the face, off the
// face) in metres from the panel centre, 1.85 m above the board's origin.
const FACE_TILT = (35 * Math.PI) / 180
const FACE_LIFT = 1.85
const FACE_OFF = 0.19 // just above the baked letters
const FACE_NORMAL = Vector3.create(0, Math.cos(FACE_TILT), -Math.sin(FACE_TILT))
const FACE_ROTATION = Quaternion.fromEulerDegrees(90 - 35, 0, 0) // text normal / camera back (-Z) onto the face normal
const LAYOUTS = {
  far: { rows: 5, top: 0.55, step: 0.31, font: 3.6, rank: -2.25, name: -1.8, score: 2.3 },
  zoom: { rows: 10, top: 0.7, step: 0.17, font: 2, rank: -2.2, name: -1.85, score: 2.25 }
}
const CREAM = Color4.create(0.94, 0.92, 0.82, 1)
const GOLD = Color4.create(1, 0.77, 0.28, 1)
const MUTED = Color4.create(0.61, 0.76, 0.75, 1)

function onFace(board: Entity, across: number, up: number, off: number): Vector3 {
  const origin = Transform.get(board).position
  return Vector3.create(
    origin.x + across,
    origin.y + FACE_LIFT + up * Math.sin(FACE_TILT) + off * Math.cos(FACE_TILT),
    origin.z + up * Math.cos(FACE_TILT) - off * Math.sin(FACE_TILT)
  )
}

function createBoardList(board: Entity): void {
  const label = (across: number, up: number, font: number, textAlign: TextAlignMode, color: Color4) => {
    const e = engine.addEntity()
    Transform.create(e, { position: onFace(board, across, up, FACE_OFF), rotation: FACE_ROTATION })
    TextShape.create(e, { text: '', fontSize: font, textAlign, textColor: color })
    return e
  }
  const sets = Object.entries(LAYOUTS).map(([key, l]) => ({
    key,
    rows: Array.from({ length: l.rows }, (_, k) => {
      const up = l.top - k * l.step
      return {
        rank: label(l.rank, up, l.font, TextAlignMode.TAM_MIDDLE_LEFT, k === 0 ? GOLD : MUTED),
        name: label(l.name, up, l.font, TextAlignMode.TAM_MIDDLE_LEFT, CREAM),
        score: label(l.score, up, l.font, TextAlignMode.TAM_MIDDLE_RIGHT, GOLD)
      }
    })
  }))
  const note = label(0, LAYOUTS.far.top - 2 * LAYOUTS.far.step, LAYOUTS.far.font, TextAlignMode.TAM_MIDDLE_CENTER, CREAM)

  // A single space, never '': the mobile (Bevy) client seems to keep the old
  // glyphs when a TextShape goes empty, so big and small rows overlapped.
  const setText = (e: Entity, text: string) => {
    const next = text === '' ? ' ' : text
    if (TextShape.get(e).text !== next) TextShape.getMutable(e).text = next
  }
  let shown = ''
  engine.addSystem(() => {
    const saved = [...engine.getEntitiesWith(Leaderboard)][0]?.[1]
    const status = saved?.status ?? 'loading'
    const entries = status === 'ready' ? Array.from(saved?.entries ?? []) : []
    const active = scoreboard.open ? 'zoom' : 'far'
    const key = lang() + '|' + active + '|' + status + '|' + entries.map((e) => `${e.name}:${e.score}`).join('|')
    if (key === shown) return
    shown = key
    for (const set of sets) {
      set.rows.forEach((row, k) => {
        const entry = set.key === active ? entries[k] : undefined
        setText(row.rank, entry ? `${k + 1}` : '')
        setText(row.name, entry ? Array.from(entry.name.replace(/[<>\r\n]/g, '')).slice(0, 16).join('') : '')
        setText(row.score, entry ? `${entry.score}` : '')
      })
    }
    setText(
      note,
      entries.length > 0 ? '' : status === 'loading' ? t('scores.loading') : status === 'error' ? t('scores.error') : t('scores.none')
    )
  })
}

// Zoom: a fixed camera square in front of the face. Switching to it glides
// over ZOOM_TIME; switching back gives the previous camera the same glide
// (the cinematic sets its own cut when it takes the game camera).
const ZOOM_TIME = 0.8 // s
const ZOOM_DISTANCE = 4.3 // m from the face; fits the frame at ZOOM_FOV on phone and desktop
const ZOOM_AIM = -0.45 // m down the face from its centre: the board sits high, clear of EXIT
const ZOOM_FOV = 50

function createBoardZoom(board: Entity): void {
  const cam = engine.addEntity()
  const centre = onFace(board, 0, ZOOM_AIM, 0)
  Transform.create(cam, { position: Vector3.add(centre, Vector3.scale(FACE_NORMAL, ZOOM_DISTANCE)), rotation: FACE_ROTATION })
  VirtualCamera.create(cam, { fov: ZOOM_FOV, defaultTransition: { transitionMode: VirtualCamera.Transition.Time(ZOOM_TIME) } })
  let zoomed = false
  let previous: Entity | undefined
  engine.addSystem(() => {
    const want = scoreboard.open && !cinema.active
    if (want === zoomed) return
    const main = MainCamera.getMutableOrNull(engine.CameraEntity)
    if (!main) return
    zoomed = want
    if (want) {
      previous = main.virtualCameraEntity as Entity | undefined
      main.virtualCameraEntity = cam
    } else {
      if (previous !== undefined && VirtualCamera.has(previous)) {
        VirtualCamera.getMutable(previous).defaultTransition = { transitionMode: VirtualCamera.Transition.Time(ZOOM_TIME) }
      }
      if (main.virtualCameraEntity === cam) main.virtualCameraEntity = previous
    }
  })
}
