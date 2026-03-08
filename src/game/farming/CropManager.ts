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

    private _harvestingInstances = new Set<CropInstance>()

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

        // ← délai pour laisser l'animation du ghost se terminer
        setTimeout(() => this.spawnMesh(instance, "spawn"), 300)

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

    /**
     * Déplante un crop, qu'il soit en pousse ou mature,
     * puis joue une animation de projection vers le haut + fade out.
     */
    uproot(cellX: number, cellZ: number): CropInstance | null {
        const instance = this.crops.get(this.key(cellX, cellZ))
        if (!instance) return null

        this.crops.delete(this.key(cellX, cellZ))
        this._harvestingInstances.add(instance)

        const currentScale = instance.currentScale > 0 ? instance.currentScale : (instance.currentPhase.modelScale ?? 1)
        instance.startTransition("uproot", currentScale, 0, () => {
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

    update(deltaTime: number, growthRate: number, wateredMult: number): void {
        for (const inst of this._harvestingInstances) {
            inst.tickTransition(deltaTime)
            this.applyScale(inst)
            if (inst.transitionType === "uproot") this.applyUprootEffect(inst)
            if (!inst.isTransition) this._harvestingInstances.delete(inst)
        }

        if (growthRate <= 0) return

        for (const [key, instance] of this.crops) {
            if (instance.isTransition) {
                instance.tickTransition(deltaTime)
                this.applyScale(instance)
                continue
            }

            const [cx, cz] = key.split("|").map(Number)
            const isWatered = this.world.tilesFactory.isWatered(cx, cz)
            const effective = deltaTime * growthRate * (isWatered ? wateredMult : 1)

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

    // ─── Helpers privés ────────────────────────────────────────────────────────

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

    private hash01(cellX: number, cellZ: number, salt: number): number {
        const s = Math.sin(cellX * (127.1 + salt * 3.13) + cellZ * (311.7 + salt * 1.73) + salt * 19.19) * 43758.5453
        return s - Math.floor(s)
    }

    /**
     * Décalage pseudo-aléatoire déterministe basé sur les coordonnées de cellule.
     * Stable entre les changements de phase — la plante ne "saute" pas.
     */
    private cellJitter(cellX: number, cellZ: number): {
        dx: number
        dz: number
        rotY: number
        tiltX: number
        tiltZ: number
    } {
        const r1 = this.hash01(cellX, cellZ, 1)
        const r2 = this.hash01(cellX, cellZ, 2)
        const r3 = this.hash01(cellX, cellZ, 3)
        const r4 = this.hash01(cellX, cellZ, 4)
        const r5 = this.hash01(cellX, cellZ, 5)

        const maxRadius = this.world.cellSize * 0.24
        const radius = Math.sqrt(r1) * maxRadius
        const angle = r2 * Math.PI * 2

        const radialX = Math.cos(angle) * radius
        const radialZ = Math.sin(angle) * radius

        // Légère dérive "de parcelle" pour casser l'effet grille trop propre.
        const driftX = Math.sin(cellX * 0.47 + cellZ * 0.19) * this.world.cellSize * 0.08
        const driftZ = Math.cos(cellX * 0.23 - cellZ * 0.41) * this.world.cellSize * 0.08

        const hardLimit = this.world.cellSize * 0.28
        const dx = THREE.MathUtils.clamp(radialX + driftX, -hardLimit, hardLimit)
        const dz = THREE.MathUtils.clamp(radialZ + driftZ, -hardLimit, hardLimit)

        return {
            dx,
            dz,
            rotY: r3 * Math.PI * 2,
            tiltX: (r4 - 0.5) * 0.16,
            tiltZ: (r5 - 0.5) * 0.16,
        }
    }

    private uprootSpin(cellX: number, cellZ: number): number {
        return (this.hash01(cellX, cellZ, 11) - 0.5) * 0.45
    }

    private uprootDirection(cellX: number, cellZ: number): { x: number; z: number } {
        const angle = this.hash01(cellX, cellZ, 12) * Math.PI * 2
        return { x: Math.cos(angle), z: Math.sin(angle) }
    }

    private applyScale(instance: CropInstance): void {
        if (!instance.mesh) return
            ; (instance.mesh as unknown as THREE.Object3D).scale.setScalar(
                Math.max(0, instance.currentScale)
            )
    }

    private applyUprootEffect(instance: CropInstance): void {
        if (!instance.mesh) return

        const root = instance.mesh as unknown as THREE.Object3D & { userData: Record<string, unknown> }
        const t = instance.smoothT
        const arcHeight = this.world.cellSize * 0.32
        const arc = 4 * t * (1 - t)

        const baseY = typeof root.userData.uprootBaseY === "number" ? root.userData.uprootBaseY as number : root.position.y
        const baseX = typeof root.userData.uprootBaseX === "number" ? root.userData.uprootBaseX as number : root.position.x
        const baseZ = typeof root.userData.uprootBaseZ === "number" ? root.userData.uprootBaseZ as number : root.position.z

        root.userData.uprootBaseY = baseY
        root.userData.uprootBaseX = baseX
        root.userData.uprootBaseZ = baseZ

        const savedDirX = typeof root.userData.uprootDirX === "number" ? root.userData.uprootDirX as number : null
        const savedDirZ = typeof root.userData.uprootDirZ === "number" ? root.userData.uprootDirZ as number : null
        const dir = savedDirX !== null && savedDirZ !== null
            ? { x: savedDirX, z: savedDirZ }
            : this.uprootDirection(instance.cellX, instance.cellZ)
        root.userData.uprootDirX = dir.x
        root.userData.uprootDirZ = dir.z

        const driftDistance = this.world.cellSize * 0.2
        root.position.set(
            baseX + dir.x * driftDistance * t,
            baseY + arcHeight * arc,
            baseZ + dir.z * driftDistance * t,
        )
        root.rotation.y += this.uprootSpin(instance.cellX, instance.cellZ)

        const fade = 1 - Math.max(0, (t - 0.45) / 0.55)
        this.setOpacity(root, fade)
    }

    private setOpacity(root: THREE.Object3D, opacity: number): void {
        const clamped = THREE.MathUtils.clamp(opacity, 0, 1)
        root.traverse(obj => {
            const mesh = obj as THREE.Mesh
            if (!mesh.isMesh) return
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach(mat => {
                const m = mat as THREE.Material & { transparent?: boolean; opacity?: number; depthWrite?: boolean }
                m.transparent = clamped < 1
                m.opacity = clamped
                m.depthWrite = clamped > 0.2
            })
        })
    }


    private makeMaterialsUnique(root: THREE.Object3D): void {
        root.traverse(obj => {
            const mesh = obj as THREE.Mesh
            if (!mesh.isMesh || !mesh.material) return
            if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map(mat => mat.clone())
            } else {
                mesh.material = mesh.material.clone()
            }
        })
    }

    private spawnMesh(instance: CropInstance, transitionType: "spawn" | "phase"): void {
        const phase = instance.currentPhase
        const prevPhase = instance.previousPhase
        const basePos = this.worldPos(instance.cellX, instance.cellZ)
        const cropYOffset = phase.yOffset ?? instance.def.yOffset ?? 0
        const jitter = this.cellJitter(instance.cellX, instance.cellZ)

        // Position finale avec jitter
        const pos = new THREE.Vector3(
            basePos.x + jitter.dx,
            basePos.y,
            basePos.z + jitter.dz,
        )

        // ── Même modèle entre deux phases — lerp de scale uniquement ──────────
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

        // ── Modèle différent ou premier spawn — recrée le mesh ───────────────
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
                model.rotation.set(jitter.tiltX, jitter.rotY, jitter.tiltZ)

                this.makeMaterialsUnique(model)

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
                this.spawnCube(instance, phase, pos, cropYOffset, jitter.rotY, jitter.tiltX, jitter.tiltZ, transitionType)
            })

        } else {
            this.spawnCube(instance, phase, pos, cropYOffset, jitter.rotY, jitter.tiltX, jitter.tiltZ, transitionType)
        }
    }

    private spawnCube(
        instance: CropInstance,
        phase: GrowthPhase,
        pos: THREE.Vector3,
        cropYOffset: number = 0,
        rotY: number = 0,
        tiltX: number = 0,
        tiltZ: number = 0,
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
        mesh.rotation.set(tiltX, rotY, tiltZ)
        mesh.scale.setScalar(0)

        if (instance.isReady) {
            ; (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.12
        }

        instance.mesh = mesh
        this.scene.add(mesh)

        instance.startTransition(transitionType, 0, 1)
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
