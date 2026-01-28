import * as THREE from "three"

export function placeOnTile(
  obj: THREE.Object3D,
  tileX: number,
  tileZ: number,
  tileSize: number
) {
  obj.position.set(
    tileX * tileSize,
    0,
    tileZ * tileSize
  )
}
