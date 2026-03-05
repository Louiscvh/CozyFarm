// src/game/farming/CropDefinition.ts

export interface GrowthPhase {
    durationSeconds: number
    // ── Fallback cube (si pas de modelPath) ──
    color?: number
    scaleXZ?: number
    height?: number
    // ── Modèle 3D ────────────────────────────
    modelPath?: string   // ex: "/models/crops/carrot_stage1.glb"
    modelScale?: number   // scale uniforme appliqué au modèle
}

export interface CropDefinition {
    readonly id: string
    readonly label: string
    readonly seedItemId: string
    readonly harvestItemId: string
    readonly harvestQty: number
    readonly phases: ReadonlyArray<GrowthPhase>
}

export const CarrotCrop: CropDefinition = {
    id: "carrot",
    label: "Carotte",
    seedItemId: "carrot_seed",
    harvestItemId: "carrot",
    harvestQty: 2,
    phases: [
        // Phase 0 : graine — cube marron (pas de modèle)
        {
            durationSeconds: 5,
            color: 0x5c3317, scaleXZ: 0.01, height: 0.05,
        },
        // Phase 1 : pousse — modèle GLB
        {
            durationSeconds: 5,
            modelPath: "/models/crops/carrot_stage1.glb",
            modelScale: 0.05,
        },
        // Phase 2 : croissance
        {
            durationSeconds: 5,
            modelPath: "/models/crops/carrot_stage1.glb",
            modelScale: 0.1,
        },
        // Phase 3 : mûre
        {
            durationSeconds: 0,
            modelPath: "/models/crops/carrot_stage1.glb",
            modelScale: 0.15,
        },
    ],
}

export const ALL_CROPS: ReadonlyArray<CropDefinition> = [CarrotCrop]