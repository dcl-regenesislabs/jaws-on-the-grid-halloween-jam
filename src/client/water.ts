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

import { GRID, CELL, WATER_Y } from '../shared/config'

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

// Tiled PNG plane with UV drift. Centered on (cx, cz); the ocean is bigger
// than the board so the arena reads as endless.
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

// Visible board grid: glowing strips floating above the water surface,
// tiled 3x3 around the board so edges read as endless. All lines are children
// of one root — the world-shift system slides the root, not each line.
// Opaque and thick enough: alpha blending against the scrolling water makes
// thin translucent lines flicker and break apart.
export function createGridLines(): Entity {
  const root = engine.addEntity()
  Transform.create(root, {})
  const size = GRID * CELL
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      for (let k = 0; k <= GRID; k++) {
        for (const vertical of [true, false]) {
          const line = engine.addEntity()
          Transform.create(line, {
            parent: root,
            position: vertical
              ? Vector3.create(k * CELL + ox * size, WATER_Y + 0.22, size / 2 + oz * size)
              : Vector3.create(size / 2 + ox * size, WATER_Y + 0.22, k * CELL + oz * size),
            scale: vertical ? Vector3.create(0.1, 0.08, size) : Vector3.create(size, 0.08, 0.1)
          })
          MeshRenderer.setBox(line)
          Material.setPbrMaterial(line, {
            albedoColor: Color4.create(0.2, 0.5, 0.7, 1),
            emissiveColor: Color3.create(0.15, 0.4, 0.6),
            emissiveIntensity: 0.8,
            castShadows: false
          })
        }
      }
    }
  }
  return root
}
