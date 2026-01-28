import * as THREE from "three"
import type { Entity } from "./Entity"
import { assetManager } from "../../render/AssetManager"
import { scaleModelToTiles } from "./utils/scaleModelToTiles"
import { applyRotation } from "./utils/applyRotation"

export async function createEntity(
  def: Entity,
  tileSize: number
): Promise<THREE.Object3D> {
  const gltf = await assetManager.loadGLTF(def.model)
  const root = gltf.scene.clone(true)
  scaleModelToTiles(root, def.sizeInTiles, tileSize)
  applyRotation(root, def.rotation)
  const cast = def.castShadow !== undefined ? def.castShadow : true
  const receive = def.receiveShadow !== undefined ? def.receiveShadow : true

  root.traverse((obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = cast
      obj.receiveShadow = receive
    }
  })

  return root
}
