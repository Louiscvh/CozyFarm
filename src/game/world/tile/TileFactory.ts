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
import { Tree1Entity } from "../../entity/entities/Tree1"
import { Tree2Entity } from "../../entity/entities/Tree2"
import { Flower1Entity } from "../../entity/entities/Flower1"
import { Rock1Entity } from "../../entity/entities/Rock1"
import { Tree3Entity } from "../../entity/entities/Tree3"
import { TreeOrangeEntity } from "../../entity/entities/TreeOrange"
import { TulipEntity } from "../../entity/entities/Tulip"
import { GrassEntity } from "../../entity/entities/Grass"

export interface DecorCategory { types: Entity[]; density: number }
export interface FixedEntityDef { def: Entity; tileX: number; tileZ: number; size: number }

export const DECOR_CATEGORIES: DecorCategory[] = [
    { types: [Tree1Entity, Tree2Entity, Tree3Entity, TreeOrangeEntity], density: 30 / 400 },
    { types: [Rock1Entity], density: 1.5 / 400 },
    { types: [Flower1Entity, TulipEntity], density: 20 / 400 },
    { types: [GrassEntity], density: 50 / 400 },
]

export function getFixedEntities(worldCenter: number): FixedEntityDef[] {
    const c = worldCenter
    const farmOffset = Math.floor(getFootprint(FarmEntity) / 2 / 2)
    return [
        { def: FarmEntity, tileX: c - farmOffset, tileZ: c - farmOffset, size: getFootprint(FarmEntity) },
    ]
}

const CORNER_OFFSETS: [number, number][] = [
    [-0.25, -0.25],
    [0.25, -0.25],
    [-0.25, 0.25],
    [0.25, 0.25],
]

const _zero = new THREE.Matrix4().makeScale(0, 0, 0)
const _dummy = new THREE.Object3D()

export class TileFactory {
    private scene: THREE.Scene
    readonly worldSize: number
    readonly tileSize: number
    readonly cellSize: number
    readonly worldSizeInCells: number

    private occupiedCells = new Set<string>()
    private debugMarkers: THREE.Mesh[] = []
    private debugMarkersVisible = false

    private instancedMeshes: Map<TileType, THREE.InstancedMesh> = new Map()
    private tileMap: Map<string, Tile> = new Map()

    // ── Soil layer dynamique ───────────────────────────────────────
    private soilMesh!: THREE.InstancedMesh
    private soilSlots = new Map<string, number>()
    private soilFreeSlots: number[] = []
    private soilHighWater = 0
    private readonly SOIL_MAX = 2000
    private cellInstanceMap = new Map<string, { type: TileType; index: number }>()
    constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
        this.scene = scene
        this.worldSize = worldSize
        this.tileSize = tileSize
        this.cellSize = tileSize / 2
        this.worldSizeInCells = worldSize * 2
        this.generateGrid()
        this.initSoilMesh()
    }

    // ─── Soil layer ───────────────────────────────────────────────────────────────

    private initSoilMesh(): void {
        const geo = new THREE.BoxGeometry(this.cellSize, 0.5, this.cellSize)
        geo.translate(0, -0.25, 0)   // même géométrie que les tiles terrain

        const { color, roughness, metalness } = TILE_VISUALS.soil
        const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness })
        const mesh = new THREE.InstancedMesh(geo, mat, this.SOIL_MAX)
        mesh.receiveShadow = true
        mesh.count = 0
        mesh.frustumCulled = false

        for (let i = 0; i < this.SOIL_MAX; i++) mesh.setMatrixAt(i, _zero)
        mesh.instanceMatrix.needsUpdate = true
        this.soilMesh = mesh
        this.scene.add(mesh)
    }

    tillCell(cellX: number, cellZ: number): boolean {
        const k = this.cellKey(cellX, cellZ)
        if (this.soilSlots.has(k)) return false
        if (this.occupiedCells.has(k)) return false  // ← ajouter

        // Cache la cellule terrain sous-jacente
        this.hideCell(cellX, cellZ)
        this.markOccupied(cellX, cellZ, 1)  // ← ajouter

        const slot = this.soilFreeSlots.pop() ?? this.soilHighWater++
        this.soilSlots.set(k, slot)

        const half = this.worldSizeInCells / 2
        _dummy.position.set(
            (cellX - half + 0.5) * this.cellSize,
            -0.05,   // en dessous du niveau du terrain
            (cellZ - half + 0.5) * this.cellSize,
        )
        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.setScalar(1)
        _dummy.updateMatrix()

        this.soilMesh.setMatrixAt(slot, _dummy.matrix)
        this.soilMesh.count = this.soilHighWater
        this.soilMesh.instanceMatrix.needsUpdate = true
        return true
    }
    

    untillCell(cellX: number, cellZ: number): void {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return

        this.soilSlots.delete(k)
        this.soilFreeSlots.push(slot)
        this.soilMesh.setMatrixAt(slot, _zero)
        this.soilMesh.instanceMatrix.needsUpdate = true

        // Restaure la cellule terrain sous-jacente
        this.showCell(cellX, cellZ)
        this.markFree(cellX, cellZ, 1)  // ← ajouter
    }

    isOccupied(cellX: number, cellZ: number): boolean {
        return this.occupiedCells.has(this.cellKey(cellX, cellZ))
    }

    isSoil(cellX: number, cellZ: number): boolean {
        return this.soilSlots.has(this.cellKey(cellX, cellZ))
    }

    // ─── Accès aux données ────────────────────────────────────────────────────────

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

    /** Retourne le type effectif — "soil" est prioritaire sur le terrain sous-jacent. */
    getTileTypeAtCell(cellX: number, cellZ: number): TileType | undefined {
        if (this.isSoil(cellX, cellZ)) return "soil"
        return this.getCornerTypeAtCell(cellX, cellZ)  // ← corner exact, pas le dominant du tile
    }

    // ─── Grid generation ──────────────────────────────────────────────────────────

    generateGrid(): Tile[] {
        const tiles: Tile[] = []
        const typeGrid: TileType[][] = []

        for (let x = 0; x < this.worldSize; x++) {
            typeGrid[x] = []
            for (let z = 0; z < this.worldSize; z++) {
                typeGrid[x][z] = tileTypeAt(x, z)
            }
        }

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
            const { color, roughness, metalness } = TILE_VISUALS[type]
            const geometry = new THREE.BoxGeometry(this.cellSize, 0.5, this.cellSize)
            geometry.translate(0, -0.25, 0)
            const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
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

                    // Calcul de la cellule correspondante à ce coin
                    const cx = x * 2 + (i % 2)        // col: 0=gauche, 1=droite
                    const cz = z * 2 + Math.floor(i / 2) // row: 0=haut, 1=bas

                    this.cellInstanceMap.set(this.cellKey(cx, cz), { type, index: idx })  // ← ajouter

                    dummy.position.set(
                        centerX + ox * this.tileSize + this.cellSize,
                        0,
                        centerZ + oz * this.tileSize + this.cellSize,
                    )
                    dummy.updateMatrix()
                    mesh.setMatrixAt(idx, dummy.matrix)
                }
            }
        }

        for (const mesh of this.instancedMeshes.values()) {
            mesh.instanceMatrix.needsUpdate = true
        }

        return tiles
    }

    private hideCell(cellX: number, cellZ: number): void {
        const entry = this.cellInstanceMap.get(this.cellKey(cellX, cellZ))
        if (!entry) return
        const mesh = this.instancedMeshes.get(entry.type)
        if (!mesh) return
        mesh.setMatrixAt(entry.index, _zero)
        mesh.instanceMatrix.needsUpdate = true
    }

    private showCell(cellX: number, cellZ: number): void {
        const entry = this.cellInstanceMap.get(this.cellKey(cellX, cellZ))
        if (!entry) return
        const mesh = this.instancedMeshes.get(entry.type)
        if (!mesh) return

        const half = this.worldSizeInCells / 2
        _dummy.position.set(
            (cellX - half + 0.5) * this.cellSize,
            0,
            (cellZ - half + 0.5) * this.cellSize,
        )
        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.setScalar(1)
        _dummy.updateMatrix()
        mesh.setMatrixAt(entry.index, _dummy.matrix)
        mesh.instanceMatrix.needsUpdate = true
    }

    // ─── Debug ────────────────────────────────────────────────────────────────────

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

    // ─── Cell occupancy ───────────────────────────────────────────────────────────

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