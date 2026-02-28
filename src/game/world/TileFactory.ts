// src/world/TileFactory.ts
import * as THREE from "three"
import {
  type Tile,
  type TileType,
  TILE_VISUALS,
  TILE_TYPES,
  tileTypeAt,
  computeAllCorners,
} from "./Tile"
import { getFootprint } from "../entity/Entity"
import type { Entity } from "../entity/Entity"
import { FarmEntity } from "../entity/FarmEntity"
import { WheatField } from "../entity/WheatField"
import { Tree1Entity } from "../entity/Tree1"
import { Tree2Entity } from "../entity/Tree2"
import { Flower1Entity } from "../entity/Flower1"
import { Rock1Entity } from "../entity/Rock1"
import { Tree3Entity } from "../entity/Tree3"

// ─── Decor definitions ────────────────────────────────────────────────────────

export interface DecorCategory { types: Entity[]; density: number }
export interface FixedEntityDef { def: Entity; tileX: number; tileZ: number; size: number }

export const DECOR_CATEGORIES: DecorCategory[] = [
  { types: [Tree1Entity, Tree2Entity, Tree3Entity], density: 40 / 400 },
  { types: [Rock1Entity],                           density: 10 / 400 },
  { types: [Flower1Entity],                         density: 60 / 400 },
]

export function getFixedEntities(worldCenter: number): FixedEntityDef[] {
  const c = worldCenter

  // footprint en cellules → tiles = /2 → offset de centrage = /2
  const farmFootprintInTiles = getFootprint(FarmEntity) / 2
  const farmOffset = Math.floor(farmFootprintInTiles / 2)

  return [
    { def: FarmEntity, tileX: c - farmOffset, tileZ: c - farmOffset, size: getFootprint(FarmEntity) },
    { def: WheatField, tileX: c + 2, tileZ: c - 2, size: getFootprint(WheatField) },
    { def: WheatField, tileX: c + 3, tileZ: c + 0, size: getFootprint(WheatField) },
    { def: WheatField, tileX: c + 3, tileZ: c - 2, size: getFootprint(WheatField) },
    { def: WheatField, tileX: c + 2, tileZ: c - 1, size: getFootprint(WheatField) },
  ]
}

// ─── Offsets des 4 coins dans un tile ─────────────────────────────────────────
const CORNER_OFFSETS: [number, number][] = [
  [-0.25, -0.25], // TL
  [ 0.25, -0.25], // TR
  [-0.25,  0.25], // BL
  [ 0.25,  0.25], // BR
]

// ─── TileFactory ──────────────────────────────────────────────────────────────

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

  constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
    this.scene            = scene
    this.worldSize        = worldSize
    this.tileSize         = tileSize
    this.cellSize         = tileSize / 2
    this.worldSizeInCells = worldSize * 2
    this.generateGrid()
    //this.addDebugCornerTile()
  }

  // ─── Accès aux données ───────────────────────────────────────────────────────

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
    const { tileX, tileZ } = this.cellToTile(cellX, cellZ)
    return this.getTileType(tileX, tileZ)
  }

  // ─── Grid generation ─────────────────────────────────────────────────────────

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
    const countPerType: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

    for (let x = 0; x < this.worldSize; x++) {
      for (let z = 0; z < this.worldSize; z++) {
        const corners = cornersGrid[x][z]
        const freq: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }
        for (const c of corners) freq[c]++
        const dominant = (Object.keys(freq) as TileType[])
          .reduce((a, b) => freq[a] >= freq[b] ? a : b)

        const tile: Tile = { type: dominant, corners, tileX: x, tileZ: z }
        tiles.push(tile)
        this.tileMap.set(`${x}|${z}`, tile)
        for (const c of corners) countPerType[c]++
      }
    }

    const subSize = this.cellSize
    const dummy = new THREE.Object3D()
    const indexPerType: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

    for (const type of TILE_TYPES) {
      const { color, roughness, metalness } = TILE_VISUALS[type]
      const geometry = new THREE.BoxGeometry(subSize, 0.1, subSize)
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, countPerType[type]))
      mesh.receiveShadow = true
      mesh.castShadow = false
      if (type === "water") mesh.position.y = -0.02
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
          const idx  = indexPerType[type]++
          const [ox, oz] = CORNER_OFFSETS[i]

          dummy.position.set(
            centerX + ox * this.tileSize,
            0,
            centerZ + oz * this.tileSize,
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

  // ─── Debug ───────────────────────────────────────────────────────────────────

  toggleDebugMarkers() {
    this.debugMarkersVisible = !this.debugMarkersVisible
    for (const marker of this.debugMarkers) marker.visible = this.debugMarkersVisible
  }

  clearDebugMarkers() {
    for (const marker of this.debugMarkers) {
      this.scene.remove(marker)
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
    this.debugMarkers = []
  }

  private createDebugMarker(cellX: number, cellZ: number) {
    const geometry = new THREE.BoxGeometry(this.cellSize, 0.5, this.cellSize)
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 })
    const marker   = new THREE.Mesh(geometry, material)
  
    const halfCells = this.worldSizeInCells / 2
  
    // (cellX - halfCells) * cellSize = bord gauche de la cellule
    // + cellSize / 2 = centre de la cellule
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

  addDebugCornerTile() {
    const cx = Math.floor(this.worldSize / 2)
    const cz = Math.floor(this.worldSize / 2)
    const forcedCorners: [TileType, TileType, TileType, TileType] = ["water", "stone", "sand", "grass"]
    const subSize = this.cellSize
    const centerX = (cx - this.worldSize / 2) * this.tileSize
    const centerZ = (cz - this.worldSize / 2) * this.tileSize

    forcedCorners.forEach((type, i) => {
      const { color } = TILE_VISUALS[type]
      const [ox, oz] = CORNER_OFFSETS[i]
      const geo  = new THREE.BoxGeometry(subSize, 0.3, subSize)
      const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        centerX + ox * this.tileSize, 
        0,
        centerZ + oz * this.tileSize
      )
      this.scene.add(mesh)
    })
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
  
        // Bloque sur l'eau
        if (this.getTileTypeAtCell(cx, cz) === "water") return false
  
        // Bloque sur cellule occupée
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
          ;(marker.material as THREE.Material).dispose()
        }
      }
  }
}