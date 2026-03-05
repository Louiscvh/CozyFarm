// src/game/farming/CropInstance.ts
import * as THREE from "three"
import type { CropDefinition, GrowthPhase } from "./CropDefinition"

let _idCounter = 0

export class CropInstance {
    readonly instanceId: string
    readonly def: CropDefinition
    readonly cellX: number
    readonly cellZ: number

    private _phase = 0
    private _elapsed = 0

    // Peut être un Mesh (cube) ou un Object3D (GLB)
    mesh: THREE.Mesh | THREE.Object3D | null = null

    constructor(def: CropDefinition, cellX: number, cellZ: number) {
        this.instanceId = `crop_${++_idCounter}`
        this.def = def
        this.cellX = cellX
        this.cellZ = cellZ
    }

    get phaseIndex(): number { return this._phase }
    get phaseCount(): number { return this.def.phases.length }
    get currentPhase(): GrowthPhase { return this.def.phases[this._phase] }
    get isReady(): boolean { return this._phase >= this.phaseCount - 1 }

    advance(deltaTime: number): boolean {
        if (this.isReady) return false
        this._elapsed += deltaTime
        if (this._elapsed >= this.currentPhase.durationSeconds) {
            this._elapsed -= this.currentPhase.durationSeconds
            this._phase++
            return true
        }
        return false
    }
}