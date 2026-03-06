// src/game/farming/CropManager.ts
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { CropDefinition, GrowthPhase } from "./CropDefinition"
import { CropInstance } from "./CropInstance"
import type { World } from "../world/World"

const _loader = new GLTFLoader()
const _modelCache = new Map<string, THREE.Object3D>()

async function loadModel(path: string): Promise<THREE.Object3D> {
    if (_modelCache.has(path)) return _modelCache.get(path)!.clone()
    return new Promise((resolve, reject) => {
        _loader.load(
            path,
            gltf => { _modelCache.set(path, gltf.scene); resolve(gltf.scene.clone()) },
            undefined,
            reject,
        )
    })
}

function buildCubeMesh(phase: GrowthPhase): THREE.Mesh {
    const geo = new THREE.BoxGeometry(
        (phase.scaleXZ ?? 0.05) * 2,
        phase.height ?? 0.05,
        (phase.scaleXZ ?? 0.05) * 2,
    )
    const mat = new THREE.MeshStandardMaterial({
        color: phase.color ?? 0x888888,
        roughness: 0.85,
        metalness: 0.0,
        emissive: new THREE.Color(0xff4400),
        emissiveIntensity: 0,
    })
    return new THREE.Mesh(geo, mat)
}

export class CropManager {
    private readonly scene: THREE.Scene
    private readonly world: World
    private readonly crops = new Map<string, CropInstance>()

    constructor(scene: THREE.Scene, world: World) {
        this.scene = scene
        this.world = world
    }

    // ─── API publique ──────────────────────────────────────────────────────────

    hasCrop(cellX: number, cellZ: number): boolean {
        return this.crops.has(this.key(cellX, cellZ))
    }

    getCrop(cellX: number, cellZ: number): CropInstance | undefined {
        return this.crops.get(this.key(cellX, cellZ))
    }

    plant(def: CropDefinition, cellX: number, cellZ: number): CropInstance | null {
        if (this.hasCrop(cellX, cellZ)) return null
        const instance = new CropInstance(def, cellX, cellZ)
        this.crops.set(this.key(cellX, cellZ), instance)
        this.spawnMesh(instance, "spawn")
        return instance
    }

    /**
     * Déclenche l'animation de récolte (scale → 0) puis supprime le crop.
     * Retourne l'instance immédiatement pour que l'inventaire soit crédité
     * sans attendre la fin de l'animation.
     */
    harvest(cellX: number, cellZ: number): CropInstance | null {
        const instance = this.crops.get(this.key(cellX, cellZ))
        if (!instance?.isReady) return null

        this.crops.delete(this.key(cellX, cellZ))
        this._harvestingInstances.add(instance)

        const currentScale = instance.currentPhase.modelScale ?? 1
        instance.startTransition("harvest", currentScale, 0, () => {
            this.disposeMesh(instance)
            this._harvestingInstances.delete(instance)
        })

        return instance
    }

    getMeshes(): THREE.Mesh[] {
        return Array.from(this.crops.values())
            .map(c => c.mesh)
            .filter((m): m is THREE.Mesh => m !== null)
    }

    // ─── Boucle ────────────────────────────────────────────────────────────────

    update(deltaTime: number, growthRate: number = 1): void {
        // Les crops en cours de récolte (hors map) ont leur propre suivi via les instances
        // On les tick séparément dans _harvestingInstances

        for (const inst of this._harvestingInstances) {
            if (!inst.isTransition) {
                this._harvestingInstances.delete(inst)
                continue
            }
            inst.tickTransition(deltaTime, 5)
            this.applyScale(inst)
        }

        if (growthRate <= 0) return
        const effective = deltaTime * growthRate

        for (const instance of this.crops.values()) {
            // ── Transition en cours ──────────────────────────────────
            if (instance.isTransition) {
                instance.tickTransition(deltaTime, 4)
                this.applyScale(instance)
                continue   // pas de croissance pendant la transition
            }

            // ── Croissance ───────────────────────────────────────────
            const phaseChanged = instance.advance(effective)
            if (phaseChanged) this.spawnMesh(instance, "phase")
        }
    }

    updateReadyPulse(time: number): void {
        const pulse = 0.12 + Math.sin(time * 2.5) * 0.08
        for (const instance of this.crops.values()) {
            if (!instance.isReady || !instance.mesh) continue
            this.setEmissive(instance.mesh, pulse)
        }
    }

    dispose(): void {
        for (const instance of this.crops.values()) this.disposeMesh(instance)
        this.crops.clear()
    }

    // ─── Instances en cours de récolte (hors map principale) ──────────────────

    private _harvestingInstances = new Set<CropInstance>()

    // ─── Privé ─────────────────────────────────────────────────────────────────

    private key(cx: number, cz: number): string {
        return `${cx}|${cz}`
    }

    private worldPos(cellX: number, cellZ: number): THREE.Vector3 {
        const half = this.world.sizeInCells / 2
        return new THREE.Vector3(
            (cellX - half) * this.world.cellSize + this.world.cellSize / 2,
            0,
            (cellZ - half) * this.world.cellSize + this.world.cellSize / 2,
        )
    }


    private applyScale(instance: CropInstance): void {
        if (!instance.mesh) return
            ; (instance.mesh as unknown as THREE.Object3D).scale.setScalar(
                Math.max(0, instance.currentScale)
            )
    }

    private spawnMesh(instance: CropInstance, transitionType: "spawn" | "phase"): void {
        const phase = instance.currentPhase
        const prevPhase = instance.previousPhase
        const pos = this.worldPos(instance.cellX, instance.cellZ)
        const cropYOffset = phase.yOffset ?? instance.def.yOffset ?? 0

        // ── Même modèle entre deux phases — lerp de scale uniquement ──
        if (
            transitionType === "phase" &&
            phase.modelPath &&
            prevPhase.modelPath === phase.modelPath &&
            instance.mesh
        ) {
            const fromScale = prevPhase.modelScale ?? 1
            const toScale = phase.modelScale ?? 1
            instance.startTransition("phase", fromScale, toScale)
            return
        }

        // ── Modèle différent ou premier spawn — recrée le mesh ────────
        this.disposeMesh(instance)

        if (phase.modelPath) {
            loadModel(phase.modelPath).then(model => {
                if (!this.crops.has(this.key(instance.cellX, instance.cellZ))) return
                if (instance.currentPhase !== phase) return

                const targetScale = phase.modelScale ?? 1
                model.scale.setScalar(targetScale)

                const box = new THREE.Box3().setFromObject(model)
                const yFix = box.min.y < 0 ? -box.min.y : 0
                model.position.set(pos.x, yFix + cropYOffset, pos.z)

                model.frustumCulled = false
                model.userData.isCrop = true
                model.userData.cellX = instance.cellX
                model.userData.cellZ = instance.cellZ

                model.traverse(child => {
                    if (!(child as THREE.Mesh).isMesh) return
                    child.userData.isCrop = true
                    child.userData.cellX = instance.cellX
                    child.userData.cellZ = instance.cellZ
                    child.frustumCulled = false
                        ; (child as THREE.Mesh).castShadow = true
                })

                if (instance.isReady) this.setEmissive(model, 0.12)

                model.scale.setScalar(0)
                instance.mesh = model as unknown as THREE.Mesh
                this.scene.add(model)

                instance.startTransition(transitionType, 0, targetScale)

            }).catch(err => {
                console.error(`[CropManager] Impossible de charger ${phase.modelPath}`, err)
                this.spawnCube(instance, phase, pos, cropYOffset, transitionType)
            })

        } else {
            this.spawnCube(instance, phase, pos, cropYOffset, transitionType)
        }
    }

    private spawnCube(
        instance: CropInstance,
        phase: GrowthPhase,
        pos: THREE.Vector3,
        cropYOffset: number = 0,
        transitionType: "spawn" | "phase" = "spawn",
    ): void {
        const mesh = buildCubeMesh(phase)
        mesh.castShadow = true
        mesh.frustumCulled = false
        mesh.userData.isCrop = true
        mesh.userData.cellX = instance.cellX
        mesh.userData.cellZ = instance.cellZ

        const h = phase.height ?? 0.05
        mesh.position.set(pos.x, h / 2 + cropYOffset, pos.z)
        mesh.scale.setScalar(0)

        if (instance.isReady) {
            const mat = mesh.material as THREE.MeshStandardMaterial
            mat.emissiveIntensity = 0.12
        }

        instance.mesh = mesh
        this.scene.add(mesh)

        const targetScale = 1
        instance.startTransition(transitionType, 0, targetScale)
    }

    private setEmissive(root: THREE.Object3D, intensity: number): void {
        root.traverse(obj => {
            const mesh = obj as THREE.Mesh
            if (!mesh.isMesh) return
            const mat = mesh.material as THREE.MeshStandardMaterial
            if (mat?.emissive) mat.emissiveIntensity = intensity
        })
    }

    private disposeMesh(instance: CropInstance): void {
        if (!instance.mesh) return
        this.scene.remove(instance.mesh as unknown as THREE.Object3D)
            ; (instance.mesh as unknown as THREE.Object3D).traverse(obj => {
                const mesh = obj as THREE.Mesh
                if (!mesh.isMesh) return
                mesh.geometry?.dispose()
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                mats.forEach(m => m?.dispose())
            })
        instance.mesh = null
    }
}