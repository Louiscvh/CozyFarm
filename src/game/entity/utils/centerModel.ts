// src/entity/utils/centerModel.ts
import * as THREE from "three"

/**
 * Recentre un modèle GLTF sur son pivot, indépendamment de l'origine définie dans Blender.
 *
 * - X/Z : centrés sur le centre géométrique de la bounding box (le modèle sera centré sur sa tile)
 * - Y   : le bas du modèle est ramené à Y=0 (le modèle pose sur le sol)
 */
export function centerModel(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())

  obj.position.x -= center.x
  obj.position.z -= center.z
  obj.position.y -= box.min.y // pose le bas du modèle sur Y=0
}