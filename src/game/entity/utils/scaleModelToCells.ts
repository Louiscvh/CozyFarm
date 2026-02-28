// src/entity/utils/scaleModelToCells.ts
import * as THREE from "three"

/**
 * Scale un modèle 3D pour que son empreinte au sol corresponde
 * à modelSize cellules en unités monde.
 *
 * @param root       - L'objet racine du modèle
 * @param modelSize  - Taille cible en cellules (ex: 2 = 1 tile, 6 = 3 tiles)
 * @param cellSize   - Taille d'une cellule en unités monde (= tileSize / 2)
 */
export function scaleModelToCells(
  root: THREE.Object3D,
  modelSize: number,
  cellSize: number
) {
  root.updateMatrixWorld(true)

  const box = new THREE.Box3()

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh

    mesh.geometry.computeBoundingBox()
    if (!mesh.geometry.boundingBox) return

    const relativeMatrix = new THREE.Matrix4()
    const path: THREE.Object3D[] = []
    let current: THREE.Object3D | null = mesh
    while (current && current !== root) {
      path.unshift(current)
      current = current.parent
    }
    for (const node of path) {
      node.updateMatrix()
      relativeMatrix.multiply(node.matrix)
    }

    const childBox = mesh.geometry.boundingBox.clone()
    childBox.applyMatrix4(relativeMatrix)
    box.union(childBox)
  })

  const size = new THREE.Vector3()
  box.getSize(size)

  const maxFootprint    = Math.max(size.x, size.z)
  const targetWorldSize = modelSize * cellSize   // ex: 6 cellules × 1u = 6u monde
  const scale           = targetWorldSize / maxFootprint
  root.scale.setScalar(scale)
}