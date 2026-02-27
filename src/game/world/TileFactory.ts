// src/world/TileFactory.ts
import * as THREE from "three"
import { type Tile, type TileType, TILE_VISUALS, TILE_TYPES, randomTileType } from "./Tile"
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
  { types: [Tree1Entity, Tree2Entity, Tree3Entity], density: 20 / 400 },
  { types: [Rock1Entity],              density: 10 / 400 },
  { types: [Flower1Entity],            density: 60 / 400 },
]

export function getFixedEntities(worldCenter: number): FixedEntityDef[] {
  const c = worldCenter
  const offset = Math.floor(FarmEntity.sizeInTiles / 2)
  return [
    { def: FarmEntity, tileX: c - offset, tileZ: c - offset, size: FarmEntity.sizeInTiles },
    { def: WheatField, tileX: c + 2, tileZ: c - 2, size: WheatField.sizeInTiles },
    { def: WheatField, tileX: c + 3, tileZ: c + 0, size: WheatField.sizeInTiles },
    { def: WheatField, tileX: c + 3, tileZ: c - 2, size: WheatField.sizeInTiles },
    { def: WheatField, tileX: c + 2, tileZ: c - 1, size: WheatField.sizeInTiles },
  ]
}

// ─── TileFactory ──────────────────────────────────────────────────────────────

export class TileFactory {
  private scene: THREE.Scene
  readonly worldSize: number
  readonly tileSize: number

  private occupiedPositions = new Set<string>()
  private debugMarkers: THREE.Mesh[] = []
  private debugMarkersVisible = false

  // Un InstancedMesh par type de tile — 4 draw calls au total
  private instancedMeshes: Map<TileType, THREE.InstancedMesh> = new Map()

  constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
    this.scene = scene
    this.worldSize = worldSize
    this.tileSize = tileSize
    this.generateGrid()
  }

  // ─── Grid generation ─────────────────────────────────────────────────────────

  generateGrid(): Tile[] {
    const tiles: Tile[] = []

    // 1. Génère les données et compte par type
    const countPerType: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }
    const tileData: { type: TileType; tileX: number; tileZ: number }[] = []

    for (let x = 0; x < this.worldSize; x++) {
      for (let z = 0; z < this.worldSize; z++) {
        const type = randomTileType()
        countPerType[type]++
        tileData.push({ type, tileX: x, tileZ: z })
        tiles.push({ type, tileX: x, tileZ: z })
      }
    }

    // 2. Crée un InstancedMesh par type avec le bon count
    const dummy = new THREE.Object3D()
    const indexPerType: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

    for (const type of TILE_TYPES) {
      const { color, roughness, metalness } = TILE_VISUALS[type]
      const geometry = new THREE.BoxGeometry(this.tileSize, 0.1, this.tileSize)
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
      const mesh = new THREE.InstancedMesh(geometry, material, countPerType[type])
      mesh.receiveShadow = true
      mesh.castShadow = false
      this.instancedMeshes.set(type, mesh)
      this.scene.add(mesh)
    }

    // 3. Positionne chaque instance
    for (const { type, tileX, tileZ } of tileData) {
      const mesh = this.instancedMeshes.get(type)!
      const idx  = indexPerType[type]++

      dummy.position.set(
        (tileX - this.worldSize / 2) * this.tileSize,
        0,
        (tileZ - this.worldSize / 2) * this.tileSize,
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
    }

    // 4. Flush GPU
    for (const mesh of this.instancedMeshes.values()) {
      mesh.instanceMatrix.needsUpdate = true
    }


    return tiles
  }

  // ─── Debug markers ────────────────────────────────────────────────────────────

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

  private createDebugMarker(tileX: number, tileZ: number, size: number) {
    const geometry = new THREE.BoxGeometry(this.tileSize * size, 0.5, this.tileSize * size)
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 })
    const marker   = new THREE.Mesh(geometry, material)

    const worldX = (tileX - this.worldSize / 2) * this.tileSize + (size / 2) * this.tileSize
    const worldZ = (tileZ - this.worldSize / 2) * this.tileSize + (size / 2) * this.tileSize
    marker.position.set(worldX - this.tileSize / 2, 0.25, worldZ - this.tileSize / 2)
    marker.visible = this.debugMarkersVisible
    marker.userData.tileKey = `${tileX}|${tileZ}`

    this.debugMarkers.push(marker)
    this.scene.add(marker)
  }

  // ─── Tile occupancy ───────────────────────────────────────────────────────────

  canSpawn(tileX: number, tileZ: number, size: number = 1): boolean {
    const gridSize = Math.max(1, Math.ceil(size))
    if (tileX < 0 || tileZ < 0 || tileX + gridSize > this.worldSize || tileZ + gridSize > this.worldSize) return false
    for (let dx = 0; dx < gridSize; dx++)
      for (let dz = 0; dz < gridSize; dz++)
        if (this.occupiedPositions.has(`${tileX + dx}|${tileZ + dz}`)) return false
    return true
  }

  markOccupied(tileX: number, tileZ: number, size: number = 1) {
    const gridSize = Math.max(1, Math.ceil(size))
    for (let dx = 0; dx < gridSize; dx++)
      for (let dz = 0; dz < gridSize; dz++) {
        this.occupiedPositions.add(`${tileX + dx}|${tileZ + dz}`)
        this.createDebugMarker(tileX + dx, tileZ + dz, 1)
      }
  }

  markFree(tileX: number, tileZ: number, size: number = 1) {
    const gridSize = Math.max(1, Math.ceil(size))
    for (let dx = 0; dx < gridSize; dx++)
      for (let dz = 0; dz < gridSize; dz++) {
        const key = `${tileX + dx}|${tileZ + dz}`
        this.occupiedPositions.delete(key)

        const idx = this.debugMarkers.findIndex(m => m.userData.tileKey === key)
        if (idx !== -1) {
          const marker = this.debugMarkers.splice(idx, 1)[0]
          this.scene.remove(marker)
          marker.geometry.dispose()
          ;(marker.material as THREE.Material).dispose()
        }
      }
  }
}