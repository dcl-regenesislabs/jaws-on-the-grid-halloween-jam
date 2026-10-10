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

import { CELL, DEPTH_STEP, MAX_DEPTH, MAX_TIERS, VIEW_CELLS, WATER_Y, depthSquare } from '../shared/config'

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
    // Opaque: the real avatars stand underneath and must not show through.
    albedoColor: Color4.create(1, 1, 1, 1),
    transparencyMode: MaterialTransparencyMode.MTM_OPAQUE,
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
// that slides with you cell by cell, clipped at the shark net. Opaque and
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
  const net = depthSquare(MAX_DEPTH + 1)
  const i0 = Math.max(net.lo, ci - VIEW_CELLS)
  const i1 = Math.min(net.hi, ci + VIEW_CELLS + 1)
  const j0 = Math.max(net.lo, cj - VIEW_CELLS)
  const j1 = Math.min(net.hi, cj + VIEW_CELLS + 1)
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

// Four boxes outlining the square of cells with depth < d.
function depthOutline(d: number, width: number, y: number, height: number, albedo: Color4, emissive: Color3, intensity: number): void {
  const { lo, hi } = depthSquare(d)
  const a = lo * CELL
  const b = hi * CELL
  const mid = (a + b) / 2
  const len = b - a + width
  for (const [x, z, sx, sz] of [
    [a, mid, width, len],
    [b, mid, width, len],
    [mid, a, len, width],
    [mid, b, len, width]
  ]) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, height, sz) })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, { albedoColor: albedo, emissiveColor: emissive, emissiveIntensity: intensity, castShadows: false })
  }
}

// Shark net around the playable square: the end of the ocean (MAX_DEPTH).
export function createBoardEdge(): void {
  depthOutline(MAX_DEPTH + 1, 0.3, WATER_Y + 0.6, 1.2, Color4.create(0.9, 0.15, 0.1, 1), Color3.create(0.6, 0.05, 0.02), 0.6)
}

// A line on the water where each deeper tier starts, in the HUD's depth
// colour for that tier (gold, then coral). Wider and a touch higher than the
// grid strips it lies on, so it reads over them; below your cell frame.
const DEPTH_LINE_COLORS: [number, number, number][] = [
  [1, 0.84, 0.32], // into DEPTH 2
  [1, 0.36, 0.34] // into DEPTH 3
]
export function createDepthLines(): void {
  for (let t = 1; t < MAX_TIERS; t++) {
    const [r, g, b] = DEPTH_LINE_COLORS[Math.min(t - 1, DEPTH_LINE_COLORS.length - 1)]
    depthOutline(t * DEPTH_STEP, 0.4, WATER_Y + 0.24, 0.1, Color4.create(r, g, b, 1), Color3.create(r, g, b), 0.9)
  }
}
