// src/game/farming/CropInstance.ts
import type { CropDefinition, GrowthPhase } from "./CropDefinition"
import type * as THREE from "three"

let _idCounter = 0

export type TransitionType = "spawn" | "phase" | "harvest"

export class CropInstance {
    readonly instanceId: string
    readonly def: CropDefinition
    readonly cellX: number
    readonly cellZ: number

    private _phase = 0
    private _prevPhase = 0
    private _elapsed = 0

    // ── Transition ──────────────────────────────────────────────
    transitionType: TransitionType = "spawn"
    transitionT: number = 0
    isTransition: boolean = false
    transitionFrom: number = 0   // scale de départ
    transitionTo: number = 1   // scale d'arrivée
    onTransitionEnd: (() => void) | null = null

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
    get previousPhase(): GrowthPhase { return this.def.phases[this._prevPhase] }
    get isReady(): boolean { return this._phase >= this.phaseCount - 1 }

    startTransition(
        type: TransitionType,
        from: number,
        to: number,
        onEnd?: () => void,
    ): void {
        this.transitionType = type
        this.transitionT = 0
        this.isTransition = true
        this.transitionFrom = from
        this.transitionTo = to
        this.onTransitionEnd = onEnd ?? null
    }

    tickTransition(deltaTime: number, speed: number = 4): void {
        if (!this.isTransition) return
        this.transitionT += deltaTime * speed
        if (this.transitionT >= 1) {
            this.transitionT = 1
            this.isTransition = false
            this.onTransitionEnd?.()
            this.onTransitionEnd = null
        }
    }

    get smoothT(): number {
        const t = Math.max(0, Math.min(1, this.transitionT))
        return t * t * (3 - 2 * t)
    }

    /** Scale interpolé entre transitionFrom et transitionTo */
    get currentScale(): number {
        return this.transitionFrom + (this.transitionTo - this.transitionFrom) * this.smoothT
    }

    advance(deltaTime: number): boolean {
        if (this.isReady) return false
        this._elapsed += deltaTime
        if (this._elapsed >= this.currentPhase.durationSeconds) {
            this._elapsed -= this.currentPhase.durationSeconds
            this._prevPhase = this._phase
            this._phase++
            return true
        }
        return false
    }
}