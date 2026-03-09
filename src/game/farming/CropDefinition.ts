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
    readonly usePlacementGhost?: boolean   // défaut: true
    readonly showPlacementGrid?: boolean   // défaut: false
    readonly fruitRegrowSeconds?: number
    readonly fruitVisualColor?: number
    readonly fruitVisualCount?: number
    readonly supportsStake?: boolean
    readonly stakeGrowthMultiplier?: number
    readonly plantTileTypes?: readonly string[]
    readonly ghostModelScale?: number
}

const DEBUG = false

export const CarrotCrop: CropDefinition = {
    id: "carrot",
    label: "Carotte",
    seedItemId: "carrot_seed",
    harvestItemId: "carrot",
    harvestQty: 2,
    yOffset: -0.04,
    usePlacementGhost: true,
    plantTileTypes: ["soil"],
    phases: [
        { durationSeconds: DEBUG ? 3 : 300, color: 0x5c3317, scaleXZ: 0.01, height: 0.05 },
        { durationSeconds: DEBUG ? 3 : 300, modelPath: "/models/crops/carrot_stage1.glb", modelScale: 0.06, yOffset: -0.13 },
        { durationSeconds: DEBUG ? 3 : 300, modelPath: "/models/crops/carrot_stage1.glb", modelScale: 0.09, yOffset: -0.2 },
        { durationSeconds: 0, modelPath: "/models/crops/carrot_stage1.glb", modelScale: 0.14, yOffset: -0.2 },
    ],
}

export const LettuceCrop: CropDefinition = {
    id: "lettuce",
    label: "Salade",
    seedItemId: "lettuce_seed",
    harvestItemId: "lettuce",
    harvestQty: 4,
    yOffset: -0.08,
    usePlacementGhost: true,
    plantTileTypes: ["soil"],
    phases: [
        { durationSeconds: DEBUG ? 3 : 300, color: 0x008000, scaleXZ: 0.01, height: 0.05, yOffset: -0.05 },
        { durationSeconds: DEBUG ? 3 : 300, modelPath: "/models/crops/lettuce_stage1.glb", modelScale: 0.01 },
        { durationSeconds: DEBUG ? 3 : 300, modelPath: "/models/crops/lettuce_stage1.glb", modelScale: 0.0170 },
        { durationSeconds: 0, modelPath: "/models/crops/lettuce_stage1.glb", modelScale: 0.0225 },
    ],
}

export const OrangeTreeCrop: CropDefinition = {
    id: "orange_tree",
    label: "Oranger",
    seedItemId: "orange_sapling",
    harvestItemId: "orange",
    harvestQty: 3,
    yOffset: 0,
    supportsStake: true,
    stakeGrowthMultiplier: 1.75,
    fruitRegrowSeconds: DEBUG ? 8 : 420,
    fruitVisualColor: 0xff8a00,
    fruitVisualCount: 14,
    usePlacementGhost: true,
    plantTileTypes: ["grass"],
    ghostModelScale: 0.3,
    phases: [
        { durationSeconds: DEBUG ? 3 : 260, color: 0x7a5d3b, scaleXZ: 0.025, height: 0.09 },
        { durationSeconds: DEBUG ? 3 : 360, color: 0x4b7a2f, scaleXZ: 0.1, height: 0.24 },
        { durationSeconds: DEBUG ? 3 : 520, color: 0x4b8a35, scaleXZ: 0.2, height: 0.75 },
        { durationSeconds: DEBUG ? 3 : 480, color: 0x4f8f38, scaleXZ: 0.24, height: 0.95 },
        { durationSeconds: 0, modelPath: "/models/tree_orange.glb", modelScale: 0.24 },
    ],
}

export const ALL_CROPS: ReadonlyArray<CropDefinition> = [CarrotCrop, LettuceCrop, OrangeTreeCrop]
