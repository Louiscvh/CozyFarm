// src/game/world/tile/TileFactory.ts
import * as THREE from "three"
import {
    type Tile,
    type TileType,
    TILE_VISUALS,
    TILE_TYPES,
    tileTypeAt,
    computeAllCorners,
} from "./Tile"
import { getFootprint } from "../../entity/Entity"
import type { Entity } from "../../entity/Entity"
import { FarmEntity } from "../../entity/entities/FarmEntity"
import { MarketEntity } from "../../entity/entities/MarketEntity"
import { Tree1Entity } from "../../entity/entities/Tree1"
import { Tree2Entity } from "../../entity/entities/Tree2"
import { Flower1Entity } from "../../entity/entities/Flower1"
import { Rock1Entity } from "../../entity/entities/Rock1"
import { Tree3Entity } from "../../entity/entities/Tree3"
import { TreeOrangeEntity } from "../../entity/entities/TreeOrange"
import { TulipEntity } from "../../entity/entities/Tulip"
import { GrassEntity } from "../../entity/entities/Grass"
import { WaterSplashParticles } from "../../system/WaterSplashParticles"
import { TillParticles } from "../../system/TillParticles"
import { FoliageParticles } from "../../system/FoliageParticles"
import { WoodChipParticles } from "../../system/WoodChipParticles"
import { getSeasonState, type SeasonId } from "../../system/Season"
import { Time } from "../../core/Time"
import { clampSoilHydration, decaySoilHydration, easeSoilHydration, getSoilHydrationStage, increaseSoilHydration, saturateSoilHydration } from "../../farming/SoilHydration"

export interface DecorCategory { types: Entity[]; density: number }
export interface FixedEntityDef { def: Entity; tileX: number; tileZ: number; size: number }

let fixedEntitiesCache: FixedEntityDef[] | null = null

export const DECOR_CATEGORIES: DecorCategory[] = [
    { types: [Tree1Entity, Tree2Entity, Tree3Entity, TreeOrangeEntity], density: 30 / 400 },
    { types: [Rock1Entity], density: 1.5 / 400 },
    { types: [Flower1Entity, TulipEntity], density: 20 / 400 },
    { types: [GrassEntity], density: 50 / 400 },
]

export function getFixedEntities(worldCenter: number): FixedEntityDef[] {
    if (fixedEntitiesCache) return fixedEntitiesCache

    const c = worldCenter
    const farmOffset = Math.floor(getFootprint(FarmEntity) / 2 / 2)
    const marketOffset = Math.floor(getFootprint(MarketEntity) / 2 / 2)
    const radius = Math.max(8, Math.floor(c * 0.7))
    const marketTileX = c + Math.floor((Math.random() * 2 - 1) * radius)
    const marketTileZ = c + Math.floor((Math.random() * 2 - 1) * radius)

    fixedEntitiesCache = [
        { def: FarmEntity, tileX: c - farmOffset, tileZ: c - farmOffset, size: getFootprint(FarmEntity) },
        { def: MarketEntity, tileX: marketTileX - marketOffset, tileZ: marketTileZ - marketOffset, size: getFootprint(MarketEntity) },
    ]

    return fixedEntitiesCache
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function reserveFixedEntityTerrainGrid(typeGrid: TileType[][], worldSize: number): void {
    const fixedEntities = getFixedEntities(Math.floor(worldSize / 2))

    for (const entity of fixedEntities) {
        const sizeInTiles = Math.max(1, Math.ceil(entity.size / 2))
        const startX = clamp(entity.tileX, 0, worldSize - 1)
        const startZ = clamp(entity.tileZ, 0, worldSize - 1)
        const endX = clamp(entity.tileX + sizeInTiles - 1, 0, worldSize - 1)
        const endZ = clamp(entity.tileZ + sizeInTiles - 1, 0, worldSize - 1)

        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                if (typeGrid[x][z] === "water") typeGrid[x][z] = "grass"
            }
        }
    }
}

const CORNER_OFFSETS: [number, number][] = [
    [-0.25, -0.25],
    [0.25, -0.25],
    [-0.25, 0.25],
    [0.25, 0.25],
]

const _zero = new THREE.Matrix4().makeScale(0, 0, 0)
const _dummy = new THREE.Object3D()

interface SoilTransition {
    slot: number
    cellX: number
    cellZ: number
    progress: number
    direction: "in" | "out"
    onDone?: () => void
}

interface SnowTransition {
    slot: number
    cellX: number
    cellZ: number
    progress: number
    onDone?: () => void
}

export class TileFactory {
    private scene: THREE.Scene
    readonly worldSize: number
    readonly tileSize: number
    readonly cellSize: number
    readonly worldSizeInCells: number

    private occupiedCells = new Set<string>()
    private debugMarkers: THREE.Mesh[] = []
    private debugMarkersVisible = false

    private instancedMeshes = new Map<TileType, THREE.InstancedMesh>()
    private tileMap = new Map<string, Tile>()
    private cellInstanceMap = new Map<string, { type: TileType; index: number }>()

    // ── Soil layer ────────────────────────────────────────────────
    private soilMesh!: THREE.InstancedMesh
    private soilSlots = new Map<string, number>()
    private soilFreeSlots: number[] = []
    private soilHighWater = 0
    private readonly SOIL_MAX = 2000

    private snowMesh!: THREE.InstancedMesh
    private snowSlots = new Map<string, number>()
    private snowFreeSlots: number[] = []
    private snowHighWater = 0
    private readonly SNOW_MAX = 3000
    private winterSnowBudget = 0
    private thawMeltBudget = 0
    private snowTransitions = new Map<string, SnowTransition>()

    private soilHydration = new Map<string, number>()
    private soilDisplayedHydration = new Map<string, number>()
    private readonly SOIL_COLOR_DRY = new THREE.Color(1, 1, 1)
    private readonly SOIL_COLOR_WATERED_LIGHT = new THREE.Color(0xC79269)
    private readonly SOIL_COLOR_WATERED_HEAVY = new THREE.Color(0x7B4A2C)
    private readonly soilDryColors = new Map<string, THREE.Color>()
    private readonly soilWateredLightColors = new Map<string, THREE.Color>()
    private readonly soilWateredHeavyColors = new Map<string, THREE.Color>()
    private readonly soilColorLerpTmp = new THREE.Color()
    private readonly soilColorLerpTmp2 = new THREE.Color()
    // ── Transitions ───────────────────────────────────────────────
    private transitions = new Map<string, SoilTransition>()
    private readonly TRANSITION_SPEED = 1   // ~125ms
    private readonly SNOW_TRANSITION_SPEED = 2.4

    // ── Water particles ───────────────────────────────────────────
    private readonly waterSplashParticles: WaterSplashParticles
    private readonly tillParticles: TillParticles
    private readonly foliageParticles: FoliageParticles
    private readonly woodChipParticles: WoodChipParticles
    private seasonId: SeasonId = "autumn"
    private currentTerrainTint = new THREE.Color("#d59f72")
    private leafDriftAccumulator = 0
    private readonly LEAF_DRIFT_INTERVAL = 0.09


    constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
        this.scene = scene
        this.worldSize = worldSize
        this.tileSize = tileSize
        this.cellSize = tileSize / 2
        this.worldSizeInCells = worldSize * 2
        this.generateGrid()
        this.initSoilMesh()
        this.initSnowMesh()
        this.waterSplashParticles = new WaterSplashParticles(this.scene, this.cellSize, this.worldSizeInCells)
        this.tillParticles = new TillParticles(this.scene, this.cellSize, this.worldSizeInCells)
        this.foliageParticles = new FoliageParticles(this.scene, this.cellSize, this.worldSizeInCells)
        this.woodChipParticles = new WoodChipParticles(this.scene, this.cellSize, this.worldSizeInCells)
    }

    private initSnowMesh(): void {
        const geo = new THREE.BoxGeometry(this.cellSize, 0.05, this.cellSize)
        const mat = new THREE.MeshStandardMaterial({
            color: "#f4f8ff",
            roughness: 0.96,
            metalness: 0,
        })
        const mesh = new THREE.InstancedMesh(geo, mat, this.SNOW_MAX)
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.frustumCulled = false
        mesh.count = 0
        for (let i = 0; i < this.SNOW_MAX; i++) mesh.setMatrixAt(i, _zero)
        mesh.instanceMatrix.needsUpdate = true
        this.snowMesh = mesh
        this.scene.add(mesh)
    }

    private canHaveSnow(cellX: number, cellZ: number): boolean {
        const key = this.cellKey(cellX, cellZ)
        if (this.soilSlots.has(key)) return false
        if (!this.canSpawn(cellX, cellZ, 1)) return false
        return this.getCornerTypeAtCell(cellX, cellZ) !== "water"
    }

    private addSnowCell(cellX: number, cellZ: number): boolean {
        const key = this.cellKey(cellX, cellZ)
        if (this.snowSlots.has(key)) return false
        if (!this.canHaveSnow(cellX, cellZ)) return false

        let slot: number
        if (this.snowFreeSlots.length > 0) {
            slot = this.snowFreeSlots.pop()!
        } else {
            if (this.snowHighWater >= this.SNOW_MAX) return false
            slot = this.snowHighWater
            this.snowHighWater += 1
        }

        this.snowSlots.set(key, slot)
        this.snowMesh.count = Math.min(this.SNOW_MAX, Math.max(this.snowMesh.count, this.snowHighWater))

        this.setSnowMatrix(slot, cellX, cellZ, this.SNOW_Y_VISIBLE)
        return true
    }

    private populateSnow(maxAdds = 40): void {
        let added = 0
        let tries = 0
        while (added < maxAdds && tries < maxAdds * 40) {
            tries++
            const cx = Math.floor(Math.random() * this.worldSizeInCells)
            const cz = Math.floor(Math.random() * this.worldSizeInCells)
            if (this.addSnowCell(cx, cz)) added++
        }
    }

    playSoilHarvestParticles(cellX: number, cellZ: number): void {
        if (!this.isSoil(cellX, cellZ)) return
        this.tillParticles.spawnAtCell(cellX, cellZ, "dirt")
    }

    hasSnowAtCell(cellX: number, cellZ: number): boolean {
        return this.snowSlots.has(this.cellKey(cellX, cellZ))
    }

    clearSnowCell(cellX: number, cellZ: number): boolean {
        const key = this.cellKey(cellX, cellZ)
        const slot = this.snowSlots.get(key)
        if (slot === undefined) return false
        if (this.snowTransitions.has(key)) return false

        this.tillParticles.spawnAtCell(cellX, cellZ, "snow")

        this.snowTransitions.set(key, {
            slot,
            cellX,
            cellZ,
            progress: 0,
            onDone: () => {
                this.snowSlots.delete(key)
                this.snowMesh.setMatrixAt(slot, _zero)
                this.snowMesh.instanceMatrix.needsUpdate = true
                this.snowFreeSlots.push(slot)

                while (this.snowHighWater > 0 && this.snowFreeSlots.includes(this.snowHighWater - 1)) {
                    const top = this.snowHighWater - 1
                    const idx = this.snowFreeSlots.indexOf(top)
                    if (idx >= 0) this.snowFreeSlots.splice(idx, 1)
                    this.snowHighWater -= 1
                }
                this.snowMesh.count = Math.max(0, Math.min(this.SNOW_MAX, this.snowHighWater))
            },
        })

        return true
    }

    private meltSnowStep(maxRemove: number): number {
        const keys = Array.from(this.snowSlots.keys())
        if (keys.length === 0) return 0

        let removed = 0
        for (let i = 0; i < maxRemove && keys.length > 0; i++) {
            const idx = Math.floor(Math.random() * keys.length)
            const key = keys.splice(idx, 1)[0]
            const [x, z] = key.split("|").map(Number)
            if (this.clearSnowCell(x, z)) removed++
        }
        return removed
    }

    updateSeasonVisuals(): void {
        const season = getSeasonState().season
        if (season.id !== this.seasonId) {
            const wasWinter = this.seasonId === "winter"
            this.seasonId = season.id
            if (!wasWinter && this.seasonId === "winter") {
                this.winterSnowBudget = 1800
                this.thawMeltBudget = 0
            }
            if (wasWinter && this.seasonId !== "winter") {
                this.winterSnowBudget = 0
                this.thawMeltBudget = this.snowSlots.size
            }
        }

        if (this.seasonId === "winter") {
            if (this.winterSnowBudget > 0) {
                const step = Math.min(14, this.winterSnowBudget)
                this.populateSnow(step)
                this.winterSnowBudget -= step
            }
            this.populateSnow(2)
        } else if (this.snowSlots.size > 0) {
            const meltStep = this.seasonId === "spring" ? 12 : 9
            const removed = this.meltSnowStep(meltStep)
            this.thawMeltBudget = Math.max(0, this.thawMeltBudget - removed)
        }

        this.currentTerrainTint.lerp(new THREE.Color(season.terrainTint), 0.02)
        for (const mesh of this.instancedMeshes.values()) {
            const material = mesh.material
            if (!(material instanceof THREE.MeshStandardMaterial)) continue
            material.color.copy(this.currentTerrainTint)
        }
    }

    emitSeasonLeafDrift(trees: THREE.Object3D[], deltaTime: number): void {
        if (this.seasonId !== "autumn" && this.seasonId !== "spring") {
            this.leafDriftAccumulator = 0
            return
        }

        this.leafDriftAccumulator += deltaTime
        if (this.leafDriftAccumulator < this.LEAF_DRIFT_INTERVAL) return

        const batches = Math.floor(this.leafDriftAccumulator / this.LEAF_DRIFT_INTERVAL)
        this.leafDriftAccumulator -= batches * this.LEAF_DRIFT_INTERVAL
        const candidateTrees = trees.filter(entity => ["tree1", "tree2", "tree3", "tree_orange"].includes(entity.userData.id))
        if (candidateTrees.length === 0) return

        for (let i = 0; i < batches; i++) {
            const tree = candidateTrees[Math.floor(Math.random() * candidateTrees.length)]
            const cellX = tree.userData.cellX
            const cellZ = tree.userData.cellZ
            if (typeof cellX !== "number" || typeof cellZ !== "number") continue
            this.foliageParticles.spawnSeasonLeafDriftAtCell(cellX, cellZ, this.seasonId)
        }
    }

    waterCell(cellX: number, cellZ: number): boolean {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return false

        const currentHydration = this.soilHydration.get(k) ?? 0
        const nextHydration = increaseSoilHydration(currentHydration)
        if (nextHydration <= currentHydration + 1e-4) return false

        this.soilHydration.set(k, nextHydration)
        this.applySoilHydrationColor(k, slot, this.soilDisplayedHydration.get(k) ?? 0)
        this.waterSplashParticles.spawnAtCell(cellX, cellZ)
        return true
    }

    playPlantAnimation(cellX: number, cellZ: number, baseYOverride?: number, scaleMul: number = 1): void {
        this.foliageParticles.spawnAtCell(cellX, cellZ, baseYOverride, scaleMul)
    }

    playTreeChopAnimation(cellX: number, cellZ: number): void {
        this.woodChipParticles.spawnAtCell(cellX, cellZ)
    }

    unwaterCell(cellX: number, cellZ: number): void {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return

        this.soilHydration.delete(k)
        this.applySoilHydrationColor(k, slot, this.soilDisplayedHydration.get(k) ?? 0)
    }

    isWatered(cellX: number, cellZ: number): boolean {
        return getSoilHydrationStage(this.getHydrationLevel(cellX, cellZ)) > 0
    }

    getHydrationLevel(cellX: number, cellZ: number): number {
        return clampSoilHydration(this.soilHydration.get(this.cellKey(cellX, cellZ)) ?? 0)
    }

    // ─── Soil layer ───────────────────────────────────────────────

    private initSoilMesh(): void {
        const geo = new THREE.BoxGeometry(this.cellSize, 0.5, this.cellSize)
        geo.translate(0, -0.25, 0)
        const mat = new THREE.MeshStandardMaterial({
            map: this.generateSoilTexture(),
            roughness: 0.98,
            metalness: 0.0,
        })
        const mesh = new THREE.InstancedMesh(geo, mat, this.SOIL_MAX)
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        mesh.count = 0
        for (let i = 0; i < this.SOIL_MAX; i++) mesh.setMatrixAt(i, _zero)
        mesh.instanceMatrix.needsUpdate = true
        this.soilMesh = mesh
        this.scene.add(mesh)
    }

    private generateSoilTexture(): THREE.CanvasTexture {
        const size = 128
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")!

        ctx.fillStyle = "#5a4030"
        ctx.fillRect(0, 0, size, size)

        for (let i = 0; i < 5; i++) {
            const x = Math.random() * size
            const y = Math.random() * size
            const r = Math.random() * 6 + 4
            ctx.fillStyle = "#3a2418"
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(1.5, 1.5)
        texture.needsUpdate = true
        return texture
    }

    private textureNoise(x: number, y: number, seed: number): number {
        const v = Math.sin((x * 127.1 + y * 311.7 + seed * 19.19) * 0.07) * 43758.5453
        return v - Math.floor(v)
    }

    private generateCellTint(type: TileType, cellX: number, cellZ: number): THREE.Color {
        const base = new THREE.Color(TILE_VISUALS[type].color)
        const variationSeed = cellX * 928371 + cellZ * 1237 + (type.charCodeAt(0) * 17)
        const noise = Math.sin(variationSeed * 0.013) * 43758.5453
        const n = noise - Math.floor(noise)

        const hsl = { h: 0, s: 0, l: 0 }
        base.getHSL(hsl)
        hsl.h = (hsl.h + (n - 0.5) * 0.04 + 1) % 1
        hsl.s = THREE.MathUtils.clamp(hsl.s + (n - 0.5) * 0.14, 0, 1)
        hsl.l = THREE.MathUtils.clamp(hsl.l + (n - 0.5) * 0.18, 0, 1)

        const tinted = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
        return tinted.lerp(new THREE.Color("#ffffff"), 0.62)
    }

    private generateTerrainTexture(type: TileType): THREE.CanvasTexture {
        const size = 256
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")!

        if (type === "grass") {
            ctx.fillStyle = "#72bf63"
            ctx.fillRect(0, 0, size, size)
            for (let i = 0; i < 2400; i++) {
                const x = Math.random() * size
                const y = Math.random() * size
                const h = 3 + Math.random() * 6
                const tilt = (Math.random() - 0.5) * 2
                ctx.strokeStyle = Math.random() > 0.4 ? "#5aa74e" : "#87d777"
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x + tilt, y - h)
                ctx.stroke()
            }
        } else if (type === "sand") {
            ctx.fillStyle = "#e8cb8e"
            ctx.fillRect(0, 0, size, size)
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const n = this.textureNoise(x, y, 3)
                    if (n > 0.7) {
                        const alpha = (n - 0.7) * 1.8
                        ctx.fillStyle = `rgba(195, 160, 104, ${alpha.toFixed(3)})`
                        ctx.fillRect(x, y, 1, 1)
                    }
                }
            }
            for (let i = 0; i < 30; i++) {
                const y = (i / 30) * size
                ctx.strokeStyle = "rgba(214, 186, 128, 0.35)"
                ctx.lineWidth = 2
                ctx.beginPath()
                for (let x = 0; x < size; x += 8) {
                    const dy = Math.sin(x * 0.05 + i) * 2
                    if (x === 0) ctx.moveTo(x, y + dy)
                    else ctx.lineTo(x, y + dy)
                }
                ctx.stroke()
            }
        } else if (type === "stone") {
            ctx.fillStyle = "#8a8a8a"
            ctx.fillRect(0, 0, size, size)

            for (let i = 0; i < 48; i++) {
                const x = Math.random() * size
                const y = Math.random() * size
                const r = 8 + Math.random() * 18
                ctx.fillStyle = Math.random() > 0.5 ? "rgba(160, 160, 160, 0.22)" : "rgba(108, 108, 108, 0.20)"
                ctx.beginPath()
                ctx.arc(x, y, r, 0, Math.PI * 2)
                ctx.fill()
            }

            for (let i = 0; i < 22; i++) {
                const x0 = Math.random() * size
                const y0 = Math.random() * size
                const len = 20 + Math.random() * 45
                const angle = Math.random() * Math.PI * 2
                ctx.strokeStyle = "rgba(70, 70, 70, 0.58)"
                ctx.lineWidth = 1.5
                ctx.beginPath()
                ctx.moveTo(x0, y0)
                ctx.lineTo(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len)
                ctx.stroke()
            }
        } else if (type === "water") {
            ctx.fillStyle = "#4fadd9"
            ctx.fillRect(0, 0, size, size)
            for (let y = 0; y < size; y += 3) {
                ctx.strokeStyle = "rgba(180, 235, 255, 0.22)"
                ctx.lineWidth = 1
                ctx.beginPath()
                for (let x = 0; x < size; x += 6) {
                    const dy = Math.sin(x * 0.09 + y * 0.15) * 2
                    if (x === 0) ctx.moveTo(x, y + dy)
                    else ctx.lineTo(x, y + dy)
                }
                ctx.stroke()
            }
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(1, 1)
        texture.needsUpdate = true

        return texture
    }

    private generateSoilDryTint(cellX: number, cellZ: number): THREE.Color {
        const base = new THREE.Color("#fbefdf")
        const seed = cellX * 4131587 + cellZ * 2917 + 97
        const noise = Math.sin(seed * 0.017) * 43758.5453
        const n = noise - Math.floor(noise)

        const hsl = { h: 0, s: 0, l: 0 }
        base.getHSL(hsl)
        hsl.h = (hsl.h + (n - 0.5) * 0.03 + 1) % 1
        hsl.s = THREE.MathUtils.clamp(hsl.s + (n - 0.5) * 0.18, 0, 1)
        hsl.l = THREE.MathUtils.clamp(hsl.l + (n - 0.5) * 0.20, 0, 1)
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
    }

    private generateSoilWateredTint(dry: THREE.Color, intensity: 1 | 2): THREE.Color {
        const target = intensity === 2 ? this.SOIL_COLOR_WATERED_HEAVY : this.SOIL_COLOR_WATERED_LIGHT
        const mix = intensity === 2 ? 0.82 : 0.56
        return dry.clone().lerp(target, mix)
    }

    // ── Écrit la matrice d'une instance soil avec un scaleY donné ──

    private setSoilMatrix(slot: number, cellX: number, cellZ: number): void {
        const half = this.worldSizeInCells / 2
        _dummy.position.set(
            (cellX - half + 0.5) * this.cellSize,
            -0.05,
            (cellZ - half + 0.5) * this.cellSize,
        )
        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.setScalar(1)
        _dummy.updateMatrix()
        this.soilMesh.setMatrixAt(slot, _dummy.matrix)
        this.soilMesh.instanceMatrix.needsUpdate = true
    }

    private readonly TERRAIN_Y_VISIBLE: number = 0.0
    private readonly TERRAIN_Y_HIDDEN: number = -0.45
    private readonly TERRAIN_Y_UNTILL_START: number = -0.05 // juste sous le soil
    private readonly SNOW_Y_VISIBLE: number = 0.025
    private readonly SNOW_Y_HIDDEN: number = -0.06

    private applySoilHydrationColor(cellKey: string, slot: number, hydration: number): void {
        const dry = this.soilDryColors.get(cellKey) ?? this.SOIL_COLOR_DRY
        const wateredLight = this.soilWateredLightColors.get(cellKey) ?? this.generateSoilWateredTint(dry, 1)
        const wateredHeavy = this.soilWateredHeavyColors.get(cellKey) ?? this.generateSoilWateredTint(dry, 2)

        if (hydration <= 1e-4) {
            this.soilMesh.setColorAt(slot, dry)
        } else if (hydration <= 1) {
            this.soilColorLerpTmp.copy(dry).lerp(wateredLight, hydration)
            this.soilMesh.setColorAt(slot, this.soilColorLerpTmp)
        } else {
            this.soilColorLerpTmp.copy(wateredLight)
            this.soilColorLerpTmp2.copy(wateredHeavy)
            this.soilColorLerpTmp.lerp(this.soilColorLerpTmp2, Math.min(1, hydration - 1))
            this.soilMesh.setColorAt(slot, this.soilColorLerpTmp)
        }
    }

    private updateSoilHydration(deltaTime: number, rainHydratesSoils: boolean, temperature: number): void {
        const logicalDeltaTime = Math.max(0, Time.delta || deltaTime)

        if (rainHydratesSoils) {
            for (const cellKey of this.soilSlots.keys()) this.soilHydration.set(cellKey, saturateSoilHydration())
        } else if (this.soilHydration.size > 0) {
            for (const [cellKey, hydration] of this.soilHydration) {
                const nextHydration = decaySoilHydration(hydration, logicalDeltaTime, temperature)
                if (nextHydration <= 1e-4) this.soilHydration.delete(cellKey)
                else this.soilHydration.set(cellKey, nextHydration)
            }
        }

        if (!this.soilMesh.instanceColor) return

        for (const [cellKey, slot] of this.soilSlots) {
            const targetHydration = this.soilHydration.get(cellKey) ?? 0
            const currentHydration = this.soilDisplayedHydration.get(cellKey) ?? 0
            const displayedHydration = easeSoilHydration(currentHydration, targetHydration, deltaTime)

            if (displayedHydration <= 1e-4 && targetHydration <= 1e-4) this.soilDisplayedHydration.delete(cellKey)
            else this.soilDisplayedHydration.set(cellKey, displayedHydration)

            this.applySoilHydrationColor(cellKey, slot, displayedHydration)
        }

        this.soilMesh.instanceColor.needsUpdate = true
    }

    // ── Tick transitions — à appeler depuis World.update ───────────

    tickTransitions(deltaTime: number, rainHydratesSoils: boolean = false, temperature: number = 18): void {
        this.waterSplashParticles.update(deltaTime)
        this.tillParticles.update(deltaTime)
        this.foliageParticles.update(deltaTime)
        this.woodChipParticles.update(deltaTime)
        this.updateSoilHydration(deltaTime, rainHydratesSoils, temperature)

        if (this.transitions.size === 0 && this.snowTransitions.size === 0) return

        for (const [k, t] of this.transitions) {
            t.progress = Math.min(1, t.progress + deltaTime * this.TRANSITION_SPEED)

            const ease = t.progress

            if (t.direction === "in") {
                // Bêchage : herbe descend
                const posY = this.TERRAIN_Y_VISIBLE + (this.TERRAIN_Y_HIDDEN - this.TERRAIN_Y_VISIBLE) * ease
                this.setTerrainMatrix(t.cellX, t.cellZ, posY)
            } else {
                // Pelle : herbe remonte, linéaire pour accélérer
                const posY = this.TERRAIN_Y_UNTILL_START + (this.TERRAIN_Y_VISIBLE - this.TERRAIN_Y_UNTILL_START) * ease
                this.setTerrainMatrix(t.cellX, t.cellZ, posY)
            }

            if (t.progress >= 1) {
                t.onDone?.()
                this.transitions.delete(k)
            }
        }

        for (const [k, t] of this.snowTransitions) {
            t.progress = Math.min(1, t.progress + deltaTime * this.SNOW_TRANSITION_SPEED)
            const posY = this.SNOW_Y_VISIBLE + (this.SNOW_Y_HIDDEN - this.SNOW_Y_VISIBLE) * t.progress
            this.setSnowMatrix(t.slot, t.cellX, t.cellZ, posY)

            if (t.progress >= 1) {
                t.onDone?.()
                this.snowTransitions.delete(k)
            }
        }
    }

    // ── Anime la cellule terrain (herbe) en Y ─────────────────────────
    private _matrix = new THREE.Matrix4()
    private _pos = new THREE.Vector3()
    private _quat = new THREE.Quaternion()
    private _scale = new THREE.Vector3()

    private setTerrainMatrix(cellX: number, cellZ: number, posY: number): void {
        const entry = this.cellInstanceMap.get(this.cellKey(cellX, cellZ))
        if (!entry) return

        const mesh = this.instancedMeshes.get(entry.type)
        if (!mesh) return

        mesh.getMatrixAt(entry.index, this._matrix)
        this._matrix.decompose(this._pos, this._quat, this._scale)

        this._pos.y = posY

        this._matrix.compose(this._pos, this._quat, this._scale)
        mesh.setMatrixAt(entry.index, this._matrix)
        mesh.instanceMatrix.needsUpdate = true
    }

    private setSnowMatrix(slot: number, cellX: number, cellZ: number, posY: number): void {
        const half = this.worldSizeInCells / 2
        _dummy.position.set(
            (cellX - half + 0.5) * this.cellSize,
            posY,
            (cellZ - half + 0.5) * this.cellSize,
        )
        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.set(1, 1, 1)
        _dummy.updateMatrix()
        this.snowMesh.setMatrixAt(slot, _dummy.matrix)
        this.snowMesh.instanceMatrix.needsUpdate = true
    }

    // ─── API Soil ─────────────────────────────────────────────────

    tillCell(cellX: number, cellZ: number): boolean {
        const k = this.cellKey(cellX, cellZ)
        if (this.soilSlots.has(k)) return false
        if (this.occupiedCells.has(k)) return false
        if (this.getTileTypeAtCell(cellX, cellZ) !== "grass") return false
        if (this.hasSnowAtCell(cellX, cellZ)) return false

        this.markOccupied(cellX, cellZ, 1)

        const slot = this.soilFreeSlots.pop() ?? this.soilHighWater++
        this.soilSlots.set(k, slot)
        this.soilMesh.count = this.soilHighWater

        // Place le soil immédiatement à sa position finale
        this.setSoilMatrix(slot, cellX, cellZ)

        const dryColor = this.generateSoilDryTint(cellX, cellZ)
        const wateredLightColor = this.generateSoilWateredTint(dryColor, 1)
        const wateredHeavyColor = this.generateSoilWateredTint(dryColor, 2)
        this.soilDryColors.set(k, dryColor)
        this.soilWateredLightColors.set(k, wateredLightColor)
        this.soilWateredHeavyColors.set(k, wateredHeavyColor)
        this.soilDisplayedHydration.set(k, 0)
        this.soilMesh.setColorAt(slot, dryColor)
        this.soilMesh.instanceColor!.needsUpdate = true
        // Lance l'animation de l'herbe qui descend
        this.transitions.set(k, {
            slot, cellX, cellZ,
            progress: 0,
            direction: "in",
            onDone: () => {
                // Cache complètement l'herbe une fois descendue
                this.hideCell(cellX, cellZ)
            },
        })

        this.tillParticles.spawnAtCell(cellX, cellZ)

        return true
    }

    untillCell(cellX: number, cellZ: number): boolean {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return false
        if (this.transitions.has(k)) return false

        this.tillParticles.spawnAtCell(cellX, cellZ)

        // ← Reset couleur immédiatement, avant que le slot soit réutilisé
        this.soilHydration.delete(k)
        this.soilDisplayedHydration.delete(k)
        const dry = this.soilDryColors.get(k) ?? this.SOIL_COLOR_DRY
        this.soilMesh.setColorAt(slot, dry)
        this.soilMesh.instanceColor!.needsUpdate = true

        this.showCell(cellX, cellZ, this.TERRAIN_Y_UNTILL_START)

        this.transitions.set(k, {
            slot, cellX, cellZ,
            progress: 0,
            direction: "out",
            onDone: () => {
                this.soilMesh.setMatrixAt(slot, _zero)
                this.soilMesh.instanceMatrix.needsUpdate = true
                this.soilSlots.delete(k)
                this.soilDryColors.delete(k)
                this.soilWateredLightColors.delete(k)
                this.soilWateredHeavyColors.delete(k)
                this.soilHydration.delete(k)
                this.soilDisplayedHydration.delete(k)
                this.soilFreeSlots.push(slot)
                this.markFree(cellX, cellZ, 1)
            },
        })

        return true
    }

    isSoil(cellX: number, cellZ: number): boolean {
        return this.soilSlots.has(this.cellKey(cellX, cellZ))
    }

    isOccupied(cellX: number, cellZ: number): boolean {
        return this.occupiedCells.has(this.cellKey(cellX, cellZ))
    }

    // ─── Accès aux données ────────────────────────────────────────

    getTile(tileX: number, tileZ: number): Tile | undefined {
        return this.tileMap.get(`${tileX}|${tileZ}`)
    }

    getTileType(tileX: number, tileZ: number): TileType | undefined {
        return this.getTile(tileX, tileZ)?.type
    }

    cellToTile(cellX: number, cellZ: number): { tileX: number; tileZ: number } {
        return {
            tileX: Math.floor(cellX / 2),
            tileZ: Math.floor(cellZ / 2),
        }
    }

    getTileTypeAtCell(cellX: number, cellZ: number): TileType | undefined {
        if (this.isSoil(cellX, cellZ)) return "soil"
        return this.getCornerTypeAtCell(cellX, cellZ)
    }


    // ─── Grid generation ──────────────────────────────────────────

    generateGrid(): Tile[] {
        const tiles: Tile[] = []
        const typeGrid: TileType[][] = []

        for (let x = 0; x < this.worldSize; x++) {
            typeGrid[x] = []
            for (let z = 0; z < this.worldSize; z++) {
                typeGrid[x][z] = tileTypeAt(x, z)
            }
        }

        reserveFixedEntityTerrainGrid(typeGrid, this.worldSize)

        const cornersGrid = computeAllCorners(typeGrid, this.worldSize)
        const countPerType: Record<string, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

        for (let x = 0; x < this.worldSize; x++) {
            for (let z = 0; z < this.worldSize; z++) {
                const corners = cornersGrid[x][z]
                const freq: Record<string, number> = { grass: 0, water: 0, sand: 0, stone: 0 }
                for (const c of corners) freq[c]++
                const dominant = (Object.keys(freq) as TileType[])
                    .reduce((a, b) => freq[a] >= freq[b] ? a : b)
                const tile: Tile = { type: dominant, corners, tileX: x, tileZ: z }
                tiles.push(tile)
                this.tileMap.set(`${x}|${z}`, tile)
                for (const c of corners) countPerType[c]++
            }
        }

        const dummy = new THREE.Object3D()
        const indexPerType: Record<string, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

        for (const type of TILE_TYPES) {
            const { roughness, metalness } = TILE_VISUALS[type]
            const geometry = new THREE.BoxGeometry(this.cellSize, 0.5, this.cellSize)
            geometry.translate(0, -0.25, 0)
            const texture = this.generateTerrainTexture(type)
            const material = new THREE.MeshStandardMaterial({
                color: "#ffffff",
                roughness,
                metalness,
                map: texture,
            })
            const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, countPerType[type]))
            mesh.receiveShadow = true
            mesh.castShadow = false
            if (type === "water") mesh.position.y = -0.2
            this.instancedMeshes.set(type, mesh)
            this.scene.add(mesh)
        }

        for (let x = 0; x < this.worldSize; x++) {
            for (let z = 0; z < this.worldSize; z++) {
                const corners = cornersGrid[x][z]
                const centerX = (x - this.worldSize / 2) * this.tileSize
                const centerZ = (z - this.worldSize / 2) * this.tileSize

                for (let i = 0; i < 4; i++) {
                    const type = corners[i]
                    const mesh = this.instancedMeshes.get(type)!
                    const idx = indexPerType[type]++
                    const [ox, oz] = CORNER_OFFSETS[i]

                    const cx = x * 2 + (i % 2)
                    const cz = z * 2 + Math.floor(i / 2)
                    this.cellInstanceMap.set(this.cellKey(cx, cz), { type, index: idx })

                    dummy.position.set(
                        centerX + ox * this.tileSize + this.cellSize,
                        0,
                        centerZ + oz * this.tileSize + this.cellSize,
                    )
                    dummy.updateMatrix()
                    mesh.setMatrixAt(idx, dummy.matrix)
                    mesh.setColorAt(idx, this.generateCellTint(type, cx, cz))
                }
            }
        }

        for (const mesh of this.instancedMeshes.values()) {
            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }

        return tiles
    }

    // ─── Show / Hide terrain ──────────────────────────────────────

    private hideCell(cellX: number, cellZ: number): void {
        const entry = this.cellInstanceMap.get(this.cellKey(cellX, cellZ))
        if (!entry) return

        const mesh = this.instancedMeshes.get(entry.type)
        if (!mesh) return

        const half = this.worldSizeInCells / 2

        _dummy.position.set(
            (cellX - half + 0.5) * this.cellSize,
            this.TERRAIN_Y_HIDDEN, // juste sous le soil
            (cellZ - half + 0.5) * this.cellSize,
        )

        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.setScalar(1)
        _dummy.updateMatrix()

        mesh.setMatrixAt(entry.index, _dummy.matrix)
        mesh.instanceMatrix.needsUpdate = true
    }

    private showCell(cellX: number, cellZ: number, y: number): void {
        const entry = this.cellInstanceMap.get(this.cellKey(cellX, cellZ))
        if (!entry) return

        const mesh = this.instancedMeshes.get(entry.type)
        if (!mesh) return

        const half = this.worldSizeInCells / 2

        _dummy.position.set(
            (cellX - half + 0.5) * this.cellSize,
            y,
            (cellZ - half + 0.5) * this.cellSize,
        )

        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.setScalar(1)
        _dummy.updateMatrix()

        mesh.setMatrixAt(entry.index, _dummy.matrix)
        mesh.instanceMatrix.needsUpdate = true
    }

    // ─── Debug ────────────────────────────────────────────────────

    toggleDebugMarkers() {
        this.debugMarkersVisible = !this.debugMarkersVisible
        for (const marker of this.debugMarkers) marker.visible = this.debugMarkersVisible
    }

    clearDebugMarkers() {
        for (const marker of this.debugMarkers) {
            this.scene.remove(marker)
            marker.geometry.dispose()
                ; (marker.material as THREE.Material).dispose()
        }
        this.debugMarkers = []
    }

    private createDebugMarker(cellX: number, cellZ: number) {
        const geometry = new THREE.BoxGeometry(this.cellSize, 0.5, this.cellSize)
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 })
        const marker = new THREE.Mesh(geometry, material)
        const halfCells = this.worldSizeInCells / 2
        marker.position.set(
            (cellX - halfCells) * this.cellSize + this.cellSize / 2,
            0.25,
            (cellZ - halfCells) * this.cellSize + this.cellSize / 2,
        )
        marker.visible = this.debugMarkersVisible
        marker.userData.cellKey = `${cellX}|${cellZ}`
        this.debugMarkers.push(marker)
        this.scene.add(marker)
    }

    getCornerTypeAtCell(cellX: number, cellZ: number): TileType | undefined {
        const { tileX, tileZ } = this.cellToTile(cellX, cellZ)
        const tile = this.getTile(tileX, tileZ)
        if (!tile) return undefined
        const col = cellX % 2
        const row = cellZ % 2
        const cornerIndex = col + row * 2
        return tile.corners[cornerIndex]
    }

    // ─── Cell occupancy ───────────────────────────────────────────

    canSpawn(cellX: number, cellZ: number, sizeInCells: number = 1): boolean {
        if (
            cellX < 0 || cellZ < 0 ||
            cellX + sizeInCells > this.worldSizeInCells ||
            cellZ + sizeInCells > this.worldSizeInCells
        ) return false

        for (let dx = 0; dx < sizeInCells; dx++) {
            for (let dz = 0; dz < sizeInCells; dz++) {
                const cx = cellX + dx
                const cz = cellZ + dz
                if (this.getCornerTypeAtCell(cx, cz) === "water") return false
                if (this.occupiedCells.has(`${cx}|${cz}`)) return false
            }
        }
        return true
    }

    markOccupied(cellX: number, cellZ: number, sizeInCells: number = 1) {
        for (let dx = 0; dx < sizeInCells; dx++)
            for (let dz = 0; dz < sizeInCells; dz++) {
                this.occupiedCells.add(`${cellX + dx}|${cellZ + dz}`)
                this.clearSnowCell(cellX + dx, cellZ + dz)
                this.createDebugMarker(cellX + dx, cellZ + dz)
            }
    }

    markFree(cellX: number, cellZ: number, sizeInCells: number = 1) {
        for (let dx = 0; dx < sizeInCells; dx++)
            for (let dz = 0; dz < sizeInCells; dz++) {
                const key = `${cellX + dx}|${cellZ + dz}`
                this.occupiedCells.delete(key)
                const idx = this.debugMarkers.findIndex(m => m.userData.cellKey === key)
                if (idx !== -1) {
                    const marker = this.debugMarkers.splice(idx, 1)[0]
                    this.scene.remove(marker)
                    marker.geometry.dispose()
                        ; (marker.material as THREE.Material).dispose()
                }
            }
    }

    private cellKey(cellX: number, cellZ: number): string {
        return `${cellX}|${cellZ}`
    }
}
