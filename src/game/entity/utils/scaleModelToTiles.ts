import * as THREE from "three"

export function scaleModelToTiles(
  root: THREE.Object3D,
  sizeInTiles: number,
  tileSize: number
) {
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  box.getSize(size)

  const maxFootprint = Math.max(size.x, size.z)
  const targetWorldSize = sizeInTiles * tileSize

  const scale = targetWorldSize / maxFootprint
  root.scale.setScalar(scale)
}
