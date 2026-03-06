// src/game/farming/CropDefinition.ts

export interface GrowthPhase {
    durationSeconds: number
    // ── Fallback cube ──
    color?: number
    scaleXZ?: number
    height?: number
    // ── Modèle 3D ──────
    modelPath?: string
    modelScale?: number
    yOffset?: number  // ← surcharge le yOffset global du crop pour cette phase
}

export interface CropDefinition {
    readonly id: string
    readonly label: string
    readonly seedItemId: string
    readonly harvestItemId: string
    readonly harvestQty: number
    readonly yOffset?: number   // ← décalage Y global appliqué à tous les modèles
    readonly phases: ReadonlyArray<GrowthPhase>
}

export const CarrotCrop: CropDefinition = {
    id: "carrot",
    label: "Carotte",
    seedItemId: "carrot_seed",
    harvestItemId: "carrot",
    harvestQty: 2,
    yOffset: -0.05,
    phases: [
        { durationSeconds: 5, color: 0x5c3317, scaleXZ: 0.01, height: 0.05 },
        { durationSeconds: 5, modelPath: "/models/crops/carrot_stage1.glb", modelScale: 0.04, yOffset: -0.13 },
        { durationSeconds: 5, modelPath: "/models/crops/carrot_stage1.glb", modelScale: 0.07, yOffset: -0.2 },
        { durationSeconds: 0, modelPath: "/models/crops/carrot_stage1.glb", modelScale: 0.1, yOffset: -0.2 },
    ],
}

export const LettuceCrop: CropDefinition = {
    id: "lettuce",
    label: "Salade",
    seedItemId: "lettuce_seed",
    harvestItemId: "lettuce",
    harvestQty: 4,
    yOffset: -0.05,
    phases: [
        { durationSeconds: 5, color: 0x008000, scaleXZ: 0.01, height: 0.05 },
        { durationSeconds: 4, modelPath: "/models/crops/lettuce_stage1.glb", modelScale: 0.01 },
        { durationSeconds: 4, modelPath: "/models/crops/lettuce_stage1.glb", modelScale: 0.0175 },
        { durationSeconds: 4, modelPath: "/models/crops/lettuce_stage1.glb", modelScale: 0.025 },
    ],
}

export const ALL_CROPS: ReadonlyArray<CropDefinition> = [CarrotCrop, LettuceCrop]