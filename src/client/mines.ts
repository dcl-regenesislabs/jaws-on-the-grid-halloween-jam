import { Billboard, BillboardMode, Entity, Material, MeshRenderer, TextShape, Transform, engine } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { Mine } from '../shared/components'
import { CELL, PROP_SCALE, VIEW_CELLS, WATER_Y, blastCells, cellCenter } from '../shared/config'
import { gameState, mySlot } from './state'
import { sfx, SFX } from './audio'

const HIDDEN = Vector3.create(0, 0, 0)
type Visual = { sprite: Entity; label: Entity; tiles: Entity[]; serial: number; burstAt: number; seenExplosion: boolean }
const visuals = new Map<Entity, Visual>()
let clock = 0
let shakeUntil = 0
export let explosionFlash = 0

export function cameraShake(): { x: number; z: number } {
  const fade = Math.max(0, (shakeUntil - clock) / 0.55)
  return { x: Math.sin(clock * 83) * 0.24 * fade, z: Math.cos(clock * 67) * 0.16 * fade }
}

function createVisual(): Visual {
  const sprite = engine.addEntity()
  Transform.create(sprite, { scale: HIDDEN })
  Billboard.create(sprite, { billboardMode: BillboardMode.BM_ALL })
  MeshRenderer.setPlane(sprite)
  Material.setBasicMaterial(sprite, { texture: Material.Texture.Common({ src: 'assets/images/items/sea-mine.png' }), castShadows: false })
  const label = engine.addEntity()
  Transform.create(label, { scale: HIDDEN })
  Billboard.create(label, { billboardMode: BillboardMode.BM_ALL })
  TextShape.create(label, { text: '', fontSize: 5, textColor: Color4.White(), outlineColor: Color4.Black(), outlineWidth: 0.18 })
  const tiles: Entity[] = []
  for (let n = 0; n < 5; n++) {
    const e = engine.addEntity()
    Transform.create(e, { scale: HIDDEN })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(0.9, 0.25, 0.03, 1),
      emissiveColor: Color3.create(1, 0.14, 0.015), emissiveIntensity: 0.8, castShadows: false
    })
    tiles.push(e)
  }
  return { sprite, label, tiles, serial: -1, burstAt: -999, seenExplosion: false }
}

export function mineVisualSystem(dt: number): void {
  clock += dt
  explosionFlash = Math.max(0, explosionFlash - dt * 3)
  const me = mySlot()
  for (const [entity, mine] of engine.getEntitiesWith(Mine)) {
    let v = visuals.get(entity)
    if (!v && !mine.active) continue
    if (!v) { v = createVisual(); visuals.set(entity, v) }
    if (v.serial !== mine.serial) {
      v.serial = mine.serial
      v.seenExplosion = false
      v.burstAt = -999
    }
    const near = !!me && Math.max(Math.abs(mine.cellI - me.cellI), Math.abs(mine.cellJ - me.cellJ)) <= VIEW_CELLS
    if (mine.active && mine.exploded && !v.seenExplosion) {
      v.seenExplosion = true
      if (near && !me?.dead) {
        v.burstAt = clock
        shakeUntil = clock + 0.55
        explosionFlash = 0.65
        sfx(SFX.bite, 0.9)
      }
    }
    const remaining = Math.max(1, mine.detonateTurn - gameState().turn)
    const age = clock - v.burstAt
    const bursting = mine.exploded && age < 0.7
    const visible = mine.active && near && (!mine.exploded || bursting)
    const sprite = Transform.getMutable(v.sprite)
    sprite.position = Vector3.create(cellCenter(mine.cellI), WATER_Y + 1.05 * PROP_SCALE, cellCenter(mine.cellJ))
    const pulse = 1 + Math.sin(clock * (remaining === 1 ? 13 : 5)) * 0.08
    sprite.scale = visible && !mine.exploded ? Vector3.scale(Vector3.One(), 2 * pulse * PROP_SCALE) : HIDDEN
    const label = Transform.getMutable(v.label)
    label.position = Vector3.create(cellCenter(mine.cellI), WATER_Y + 2.7 * PROP_SCALE, cellCenter(mine.cellJ))
    label.scale = visible && !mine.exploded ? Vector3.One() : HIDDEN
    const text = `${remaining}`
    if (TextShape.get(v.label).text !== text) TextShape.getMutable(v.label).text = text
    const cells = blastCells(mine.cellI, mine.cellJ)
    v.tiles.forEach((e, n) => {
      const t = Transform.getMutable(e)
      const cell = cells[n]
      if (!visible || !cell) { t.scale = HIDDEN; return }
      t.position = Vector3.create(cellCenter(cell[0]), WATER_Y + 0.09, cellCenter(cell[1]))
      // Small warning plates leave shark lanes and grid edges readable.
      const size = bursting ? CELL - 0.25 : remaining === 1 ? 1.35 + pulse * 0.15 : 0.65 // blast cue: not shrunk
      t.scale = Vector3.create(size, bursting ? Math.max(0.06, (1 - age / 0.7) * 2.2) : 0.045, size)
      const mat = Material.getFlatMutable(e)
      mat.emissiveIntensity = bursting ? Math.max(0, 3 * (1 - age / 0.7)) : remaining === 1 ? 1.4 : 0.5
    })
  }
}
