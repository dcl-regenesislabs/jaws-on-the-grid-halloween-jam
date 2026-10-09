import {
  ColliderLayer,
  Entity,
  Material,
  MaterialTransparencyMode,
  MeshCollider,
  MeshRenderer,
  Schemas,
  TextureFilterMode,
  TextureWrapMode,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { CELL, CENTER_CELL, GRID, VIEW_CELLS, WATER_Y, cellCenter } from '../shared/config'

const WATER_TEXTURE = 'assets/scene/water/water-tile-v2.png'
const WATER_BUMP_TEXTURE = 'assets/scene/water/water-bump.png'

// Client-only: UV drift on the water plane.
const WaterScroll = engine.defineComponent('water-scroll-local', {
  speedU: Schemas.Number,
  speedV: Schemas.Number,
  offsetU: Schemas.Number,
  offsetV: Schemas.Number,
  tileCount: Schemas.Number
})

function wrapUnit(v: number): number {
  return ((v % 1) + 1) % 1
}

export function waterScrollSystem(dt: number): void {
  for (const [entity] of engine.getEntitiesWith(WaterScroll)) {
    const scroll = WaterScroll.getMutable(entity)
    scroll.offsetU = wrapUnit(scroll.offsetU + scroll.speedU * dt)
    scroll.offsetV = wrapUnit(scroll.offsetV + scroll.speedV * dt)
    const n = scroll.tileCount
    const u0 = scroll.offsetU
    const v0 = scroll.offsetV
    const u1 = u0 + n
    const v1 = v0 + n
    MeshRenderer.setPlane(entity, [u0, v0, u1, v0, u1, v1, u0, v1, u0, v0, u1, v0, u1, v1, u0, v1])
  }
}

// Tiled PNG plane with UV drift. Centered on (cx, cz), covering the board.
export function createWaterFloor(size: number, y: number, cx: number, cz: number) {
  const tileCount = Math.max(1, Math.round(size / 16))

  const water = engine.addEntity()
  Transform.create(water, {
    position: Vector3.create(cx, y, cz),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
    scale: Vector3.create(size, size, 1)
  })
  const face = [0, 0, tileCount, 0, tileCount, tileCount, 0, tileCount]
  MeshRenderer.setPlane(water, [...face, ...face])
  MeshCollider.setPlane(water, ColliderLayer.CL_POINTER)
  WaterScroll.create(water, { speedU: 0.04, speedV: 0.025, offsetU: 0, offsetV: 0, tileCount })
  Material.setPbrMaterial(water, {
    texture: Material.Texture.Common({
      src: WATER_TEXTURE,
      filterMode: TextureFilterMode.TFM_BILINEAR,
      wrapMode: TextureWrapMode.TWM_REPEAT
    }),
    bumpTexture: Material.Texture.Common({
      src: WATER_BUMP_TEXTURE,
      filterMode: TextureFilterMode.TFM_BILINEAR,
      wrapMode: TextureWrapMode.TWM_REPEAT
    }),
    albedoColor: Color4.create(1, 1, 1, 0.95),
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    castShadows: false,
    roughness: 0.5,
    metallic: 0,
    specularIntensity: 0.4,
    reflectivityColor: Color3.create(0.04, 0.06, 0.08)
  })

  // Invisible walkable floor at y=0, same extent as the water.
  const floor = engine.addEntity()
  Transform.create(floor, {
    position: Vector3.create(cx, 0, cz),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
    scale: Vector3.create(size, size, 1)
  })
  MeshRenderer.setPlane(floor)
  MeshCollider.setPlane(floor, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(floor, {
    albedoColor: Color4.create(0.02, 0.05, 0.1, 1),
    castShadows: false
  })
}

// Visible board grid, only around the player: a window of glowing strips
// that slides with you cell by cell, clipped at the board edge. Opaque and
// thick: alpha blending against the scrolling water makes thin translucent
// lines flicker and break apart.
const LINES = 2 * VIEW_CELLS + 2 // per axis
const gridLines: { e: Entity; vertical: boolean; k: number }[] = []
let windowI = -1
let windowJ = -1

export function createGridWindow(): void {
  for (const vertical of [true, false]) {
    for (let k = 0; k < LINES; k++) {
      const e = engine.addEntity()
      Transform.create(e, { scale: Vector3.Zero() })
      MeshRenderer.setBox(e)
      Material.setPbrMaterial(e, {
        albedoColor: Color4.create(0.16, 0.38, 0.55, 1),
        emissiveColor: Color3.create(0.12, 0.32, 0.5),
        emissiveIntensity: 0.45,
        castShadows: false
      })
      gridLines.push({ e, vertical, k })
    }
  }
}

export function gridWindowSystem(ci: number, cj: number): void {
  if (ci === windowI && cj === windowJ) return
  windowI = ci
  windowJ = cj
  // Cell-boundary coordinates (in cells) covered by the window, clipped.
  const i0 = Math.max(0, ci - VIEW_CELLS)
  const i1 = Math.min(GRID, ci + VIEW_CELLS + 1)
  const j0 = Math.max(0, cj - VIEW_CELLS)
  const j1 = Math.min(GRID, cj + VIEW_CELLS + 1)
  for (const line of gridLines) {
    const t = Transform.getMutable(line.e)
    const at = (line.vertical ? ci : cj) - VIEW_CELLS + line.k
    const lo = line.vertical ? i0 : j0
    const hi = line.vertical ? i1 : j1
    if (at < lo || at > hi) {
      t.scale = Vector3.Zero()
      continue
    }
    if (line.vertical) {
      t.position = Vector3.create(at * CELL, WATER_Y + 0.22, ((j0 + j1) / 2) * CELL)
      t.scale = Vector3.create(0.14, 0.1, (j1 - j0) * CELL)
    } else {
      t.position = Vector3.create(((i0 + i1) / 2) * CELL, WATER_Y + 0.22, at * CELL)
      t.scale = Vector3.create((i1 - i0) * CELL, 0.1, 0.14)
    }
  }
}

// Safe harbor at the spawn: pale water and four buoys. Sharks never enter.
export function createHarbor(radius: number): void {
  const side = (2 * radius + 1) * CELL
  const c = cellCenter(CENTER_CELL)
  const patch = engine.addEntity()
  Transform.create(patch, {
    position: Vector3.create(c, WATER_Y + 0.04, c),
    scale: Vector3.create(side, 0.04, side)
  })
  MeshRenderer.setBox(patch)
  Material.setPbrMaterial(patch, {
    albedoColor: Color4.create(0.5, 1, 0.85, 0.3),
    emissiveColor: Color3.create(0.2, 0.6, 0.5),
    emissiveIntensity: 0.4,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    castShadows: false
  })
  const h = side / 2
  for (const [dx, dz] of [
    [-h, -h],
    [h, -h],
    [-h, h],
    [h, h]
  ]) {
    const buoy = engine.addEntity()
    Transform.create(buoy, {
      position: Vector3.create(c + dx, WATER_Y + 0.4, c + dz),
      scale: Vector3.create(0.8, 0.9, 0.8)
    })
    MeshRenderer.setCylinder(buoy)
    Material.setPbrMaterial(buoy, {
      albedoColor: Color4.fromHexString('#FF7A1AFF'),
      emissiveColor: Color3.fromHexString('#AA4400'),
      emissiveIntensity: 0.5
    })
  }
}

// Shark net around the whole board: the end of the endless ocean.
export function createBoardEdge(): void {
  const size = GRID * CELL
  const t = 0.3
  for (const [x, z, sx, sz] of [
    [t, size / 2, t, size],
    [size - t, size / 2, t, size],
    [size / 2, t, size, t],
    [size / 2, size - t, size, t]
  ]) {
    const net = engine.addEntity()
    Transform.create(net, {
      position: Vector3.create(x, WATER_Y + 0.35, z),
      scale: Vector3.create(sx, 0.7, sz)
    })
    MeshRenderer.setBox(net)
    Material.setPbrMaterial(net, {
      albedoColor: Color4.create(0.9, 0.15, 0.1, 1),
      emissiveColor: Color3.create(0.6, 0.05, 0.02),
      emissiveIntensity: 0.6,
      castShadows: false
    })
  }
}
