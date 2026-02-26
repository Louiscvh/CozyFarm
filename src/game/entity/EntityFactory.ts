// src/game/entity/EntityFactory.ts
import * as THREE from "three"
import type { Entity } from "./Entity"
import { assetManager } from "../../render/AssetManager"
import { scaleModelToTiles } from "./utils/scaleModelToTiles"
import { applyRotation } from "./utils/applyRotation"
import { createTorchMesh } from "./TorchMesh"

export async function createEntity(
  def: Entity,
  tileSize: number
): Promise<THREE.Object3D> {
  // Entités procédurales — pas de GLTF à charger
  if (def.model === "procedural:torch") {
    const root = createTorchMesh()
    // Scale pour correspondre à la taille d'une tile
    const scale = tileSize * 0.4
    root.scale.set(scale, scale, scale)
    return root
  }

  // Entités GLTF normales
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