import * as THREE from "three"

export function scaleModelToTiles(
  root: THREE.Object3D,
  sizeInTiles: number,
  tileSize: number
) {
  // Force le calcul des matrices locales avant de mesurer
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

  const maxFootprint = Math.max(size.x, size.z)
  const targetWorldSize = sizeInTiles * tileSize
  const scale = targetWorldSize / maxFootprint
  root.scale.setScalar(scale)
}