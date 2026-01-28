import * as THREE from "three"

export function applyRotation(
  obj: THREE.Object3D,
  rot?: { x?: number; y?: number; z?: number }
) {
  if (!rot) return

  obj.rotation.set(
    THREE.MathUtils.degToRad(rot.x ?? 0),
    THREE.MathUtils.degToRad(rot.y ?? 0),
    THREE.MathUtils.degToRad(rot.z ?? 0)
  )
}
