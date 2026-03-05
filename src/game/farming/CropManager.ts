// src/game/farming/CropManager.ts
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { CropDefinition, GrowthPhase } from "./CropDefinition"
import { CropInstance } from "./CropInstance"
import type { World } from "../world/World"

const _loader = new GLTFLoader()

/** Cache des modèles déjà chargés — clé = modelPath */
const _modelCache = new Map<string, THREE.Object3D>()

async function loadModel(path: string): Promise<THREE.Object3D> {
    if (_modelCache.has(path)) return _modelCache.get(path)!.clone()
    return new Promise((resolve, reject) => {
        _loader.load(
            path,
            gltf => {
                _modelCache.set(path, gltf.scene)
                resolve(gltf.scene.clone())
            },
            undefined,
            reject,
        )
    })
}

function buildCubeMesh(phase: GrowthPhase): THREE.Mesh {
    const geo = new THREE.BoxGeometry(
        (phase.scaleXZ ?? 0.1) * 2,
        phase.height ?? 0.1,
        (phase.scaleXZ ?? 0.1) * 2,
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
        this.spawnMesh(instance)
        return instance
    }

    harvest(cellX: number, cellZ: number): CropInstance | null {
        const instance = this.crops.get(this.key(cellX, cellZ))
        if (!instance?.isReady) return null
        this.disposeMesh(instance)
        this.crops.delete(this.key(cellX, cellZ))
        return instance
    }

    getMeshes(): THREE.Mesh[] {
        return Array.from(this.crops.values())
            .map(c => c.mesh)
            .filter((m): m is THREE.Mesh => m !== null)
    }

    // ─── Boucle ────────────────────────────────────────────────────────────────

    /**
     * @param deltaTime  temps réel écoulé (déjà scalé par Time.timeScale)
     * @param growthRate multiplicateur environnemental [0..2] — calculé par World
     */
    update(deltaTime: number, growthRate: number = 1): void {
        if (growthRate <= 0) return
        const effective = deltaTime * growthRate
        for (const instance of this.crops.values()) {
            const phaseChanged = instance.advance(effective)
            if (phaseChanged) this.spawnMesh(instance)
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

    /**
     * Crée ou remplace le mesh pour la phase courante.
     * Gère les deux cas : modèle GLB ou cube de fallback.
     */
    private spawnMesh(instance: CropInstance): void {
        // Supprime l'ancien mesh avant d'en créer un nouveau
        this.disposeMesh(instance)

        const phase = instance.currentPhase
        const pos = this.worldPos(instance.cellX, instance.cellZ)

        if (phase.modelPath) {
            // ── Chargement asynchrone du modèle GLB ─────────────────────
            loadModel(phase.modelPath).then(model => {
                // Vérifie que l'instance est toujours en vie et à la même phase
                if (!this.crops.has(this.key(instance.cellX, instance.cellZ))) return
                if (instance.currentPhase !== phase) return

                const scale = phase.modelScale ?? 1
                model.scale.setScalar(scale)
                model.position.copy(pos)
                model.frustumCulled = false

                // Attache les métadonnées sur le root pour le raycasting
                model.userData.isCrop = true
                model.userData.cellX = instance.cellX
                model.userData.cellZ = instance.cellZ

                // Propage les métadonnées sur tous les meshes enfants
                // pour que getMeshes() et le raycast fonctionnent
                model.traverse(child => {
                    if (!(child as THREE.Mesh).isMesh) return
                    child.userData.isCrop = true
                    child.userData.cellX = instance.cellX
                    child.userData.cellZ = instance.cellZ
                    child.frustumCulled = false
                        ; (child as THREE.Mesh).castShadow = true
                })

                // Applique emissive si mûre
                if (instance.isReady) {
                    this.setEmissive(model, 0.12)
                }

                instance.mesh = model as unknown as THREE.Mesh
                this.scene.add(model)

            }).catch(err => {
                console.error(`[CropManager] Impossible de charger ${phase.modelPath}`, err)
                // Fallback cube si le modèle échoue
                this.spawnCube(instance, phase, pos)
            })

        } else {
            // ── Cube de fallback ─────────────────────────────────────────
            this.spawnCube(instance, phase, pos)
        }
    }

    private spawnCube(
        instance: CropInstance,
        phase: GrowthPhase,
        pos: THREE.Vector3,
    ): void {
        const mesh = buildCubeMesh(phase)
        mesh.castShadow = true
        mesh.frustumCulled = false
        mesh.userData.isCrop = true
        mesh.userData.cellX = instance.cellX
        mesh.userData.cellZ = instance.cellZ

        const h = phase.height ?? 0.1
        mesh.position.set(pos.x, h / 2, pos.z)

        if (instance.isReady) {
            const mat = mesh.material as THREE.MeshStandardMaterial
            mat.emissiveIntensity = 0.12
        }

        instance.mesh = mesh
        this.scene.add(mesh)
    }

    /** Applique une emissiveIntensity sur tous les meshes d'un objet. */
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