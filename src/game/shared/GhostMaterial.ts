// src/game/shared/GhostMaterial.ts
import * as THREE from "three"

/**
    color: 0xffffff,
    opacity: 0.55,
 */
export const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: false,
})

export function applyGhostMaterials(root: THREE.Object3D): void {
    const toRemove: THREE.Object3D[] = []
    const toReMat: THREE.Mesh[] = []

    root.traverse(obj => {
        if (obj.userData.isHitBox || obj.name === "__hitbox__") { toRemove.push(obj); return }
        if ((obj as THREE.Mesh).isMesh) toReMat.push(obj as THREE.Mesh)
        if ((obj as THREE.PointLight).isLight) (obj as THREE.PointLight).visible = false
    })

    toRemove.forEach(o => o.parent?.remove(o))
    toReMat.forEach(m => {
        m.material = ghostMat
        m.renderOrder = 999
    })
}
