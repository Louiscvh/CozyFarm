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

interface SoilTransition {
    slot: number
    cellX: number
    cellZ: number
    progress: number
    direction: "in" | "out"
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

    private wateredCells = new Set<string>()
    private readonly SOIL_COLOR_DRY = new THREE.Color(1, 1, 1)
    private readonly SOIL_COLOR_WATERED = new THREE.Color(0x824C27)
    // ── Transitions ───────────────────────────────────────────────
    private transitions = new Map<string, SoilTransition>()
    private readonly TRANSITION_SPEED = 1   // ~125ms

    constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
        this.scene = scene
        this.worldSize = worldSize
        this.tileSize = tileSize
        this.cellSize = tileSize / 2
        this.worldSizeInCells = worldSize * 2
        this.generateGrid()
        this.initSoilMesh()
    }

    waterCell(cellX: number, cellZ: number): boolean {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return false   // pas un soil
        if (this.wateredCells.has(k)) return false  // déjà arrosé

        this.wateredCells.add(k)
        this.soilMesh.setColorAt(slot, this.SOIL_COLOR_WATERED)
        this.soilMesh.instanceColor!.needsUpdate = true
        return true
    }

    unwaterCell(cellX: number, cellZ: number): void {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return

        this.wateredCells.delete(k)
        this.soilMesh.setColorAt(slot, this.SOIL_COLOR_DRY)
        this.soilMesh.instanceColor!.needsUpdate = true
    }

    isWatered(cellX: number, cellZ: number): boolean {
        return this.wateredCells.has(this.cellKey(cellX, cellZ))
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

        ctx.fillStyle = "#3d2b1f"
        ctx.fillRect(0, 0, size, size)

        for (let i = 0; i < 5; i++) {
            const x = Math.random() * size
            const y = Math.random() * size
            const r = Math.random() * 6 + 4
            ctx.fillStyle = "#1e0f07"
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
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
    // ── Tick transitions — à appeler depuis World.update ───────────

    tickTransitions(deltaTime: number): void {
        if (this.transitions.size === 0) return

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

    // ─── API Soil ─────────────────────────────────────────────────

    tillCell(cellX: number, cellZ: number): boolean {
        const k = this.cellKey(cellX, cellZ)
        if (this.soilSlots.has(k)) return false
        if (this.occupiedCells.has(k)) return false

        this.markOccupied(cellX, cellZ, 1)

        const slot = this.soilFreeSlots.pop() ?? this.soilHighWater++
        this.soilSlots.set(k, slot)
        this.soilMesh.count = this.soilHighWater

        // Place le soil immédiatement à sa position finale
        this.setSoilMatrix(slot, cellX, cellZ)
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

        return true
    }

    untillCell(cellX: number, cellZ: number): void {
        const k = this.cellKey(cellX, cellZ)
        const slot = this.soilSlots.get(k)
        if (slot === undefined) return

        this.transitions.delete(k)

        // ← Reset couleur immédiatement, avant que le slot soit réutilisé
        this.wateredCells.delete(k)
        this.soilMesh.setColorAt(slot, this.SOIL_COLOR_DRY)
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
                this.soilFreeSlots.push(slot)
                this.markFree(cellX, cellZ, 1)
            },
        })
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
                }
            }
        }

        for (const mesh of this.instancedMeshes.values()) {
            mesh.instanceMatrix.needsUpdate = true
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