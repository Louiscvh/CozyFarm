// src/game/entity/animations/ChopAnimation.ts
import * as THREE from "three"
import { assetManager } from "../../../render/AssetManager"
import { scaleModelToCells } from "../utils/scaleModelToCells"
import { syncInstance } from "../EntityAnimation"
import type { World } from "../../world/World"

const DURATION = 900
const FADE_START = 0.55
const MAX_FALL_ANGLE = Math.PI / 2

export async function animateChop(
    w: NonNullable<typeof World.current>,
    entity: THREE.Object3D,
): Promise<void> {
    const def = entity.userData.def
    if (!def) return

    // ── Clone visuel ──────────────────────────────────────────────────────────
    const gltf = await assetManager.loadGLTF(def.model)
    const clone = gltf.scene.clone(true)

    const cellSize = w.tileSize / 2
    scaleModelToCells(clone, def.modelSize, cellSize)

    const info = w.instanceManager.getInfo(def)
    const yOffset = info?.yOffset ?? 0
    const cast = def.castShadow !== false

    // Active les ombres sur tous les meshes du clone
    clone.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = cast
        mesh.receiveShadow = def.receiveShadow !== false

        // Clone les matériaux pour le fade sans altérer le pool
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mat.transparent = true
        mat.depthWrite = true
        mat.opacity = 1
        mesh.material = mat
    })

    // ── Pivot à y=0 (sol) — la rotation part de la base de l'arbre ───────────
    // clone.position.y = yOffset (l'arbre s'appuie sur le sol dans le pivot)
    const pivot = new THREE.Group()
    pivot.position.set(entity.position.x, 0, entity.position.z)
    clone.position.set(0, yOffset, 0)
    clone.rotation.y = entity.userData.rotY ?? 0
    pivot.add(clone)
    w.scene.add(pivot)

    // ── Cache le slot instancié APRÈS ajout du clone ──────────────────────────
    entity.scale.setScalar(0)
    syncInstance(w, entity)
    if (!entity.userData.isInstanced) w.scene.remove(entity)

    // ── Direction de chute déterministe par cellule ───────────────────────────
    const seed = entity.userData.cellX * 31 + entity.userData.cellZ * 17
    const fallDir = (seed % 2 === 0 ? 1 : -1)

    // ── RAF ───────────────────────────────────────────────────────────────────
    const startTime = performance.now()

    const animate = () => {
        const t = Math.min(1, (performance.now() - startTime) / DURATION)
        const fallEase = t * t * t   // ease-in cubique

        pivot.rotation.z = fallDir * fallEase * MAX_FALL_ANGLE

        if (t >= FADE_START) {
            const fadeT = (t - FADE_START) / (1 - FADE_START)
            const opacity = Math.max(0, 1 - fadeT * fadeT)
            clone.traverse(obj => {
                const mesh = obj as THREE.Mesh
                if (!mesh.isMesh) return
                    ; (mesh.material as THREE.MeshStandardMaterial).opacity = opacity
            })
        }

        if (t < 1) {
            requestAnimationFrame(animate)
        } else {
            w.scene.remove(pivot)
            pivot.traverse(obj => {
                const mesh = obj as THREE.Mesh
                if (!mesh.isMesh) return
                    ; (mesh.material as THREE.MeshStandardMaterial).dispose()
            })
        }
    }

    animate()
}