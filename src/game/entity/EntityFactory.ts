// src/game/entity/EntityFactory.ts
import * as THREE from "three"
import type { Entity } from "./Entity"
import { assetManager } from "../../render/AssetManager"
import { scaleModelToTiles } from "./utils/scaleModelToTiles"
import { applyRotation } from "./utils/applyRotation"
import { createTorchMesh } from "./TorchMesh"

const DEBUG_HITBOX = false // ← passe à true pour voir le wireframe

export function attachHitBox(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)

  // IMPORTANT : on ignore le scale du root
  const originalScale = root.scale.clone()
  root.scale.set(1, 1, 1)
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)

  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  // On remet le scale
  root.scale.copy(originalScale)
  root.updateMatrixWorld(true)

  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)

  const wire = new THREE.WireframeGeometry(geometry)
  const line = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: true, visible: DEBUG_HITBOX })
  )

  const hitMesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ visible: false })
  )

  hitMesh.add(line)

  hitMesh.position.copy(center) // local direct
  hitMesh.name = "__hitbox__"
  hitMesh.userData.isHitBox = true

  root.add(hitMesh)
}

export async function createEntity(
  def: Entity,
  tileSize: number
): Promise<THREE.Object3D> {
  if (def.model === "procedural:torch") {
    const root = createTorchMesh()
    const scale = tileSize * 0.4
    root.scale.set(scale, scale, scale)
    attachHitBox(root)
    return root
  }

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

  attachHitBox(root)
  return root
}