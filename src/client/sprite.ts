import { Entity, Material, MaterialTransparencyMode } from '@dcl/sdk/ecs'
import { Color3, Color4 } from '@dcl/sdk/math'

// A flat picture with a see-through background (billboarded item art).
// The desktop Explorer draws a basic (unlit) material's transparent pixels
// as black, and its alphaTexture reads brightness, which fades dark art.
// A PBR cutout lit by its own texture looks unlit and cuts out cleanly.
export function setSpriteMaterial(e: Entity, src: string): void {
  const texture = Material.Texture.Common({ src })
  Material.setPbrMaterial(e, {
    texture,
    emissiveTexture: texture,
    albedoColor: Color4.White(),
    emissiveColor: Color3.White(),
    emissiveIntensity: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_TEST,
    alphaTest: 0.5,
    castShadows: false
  })
}
