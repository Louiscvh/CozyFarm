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
  { types: [Tree1Entity, Tree2Entity, Tree3Entity], density: 30 / 400 },
  { types: [Rock1Entity],                           density: 10 / 400 },
  { types: [Flower1Entity],                         density: 60 / 400 },
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

// ─── Offsets des 4 sous-tiles dans un tile ────────────────────────────────────
// [TL, TR, BL, BR] — en fraction de tileSize
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

  private occupiedPositions = new Set<string>()
  private debugMarkers: THREE.Mesh[] = []
  private debugMarkersVisible = false

  // Un InstancedMesh par type — mais maintenant pour des sous-tiles (tileSize/2)
  // 4 sous-tiles par tile, donc jusqu'à 4 * worldSize² instances au total,
  // réparties entre les 4 types. C'est toujours 4 draw calls.
  private instancedMeshes: Map<TileType, THREE.InstancedMesh> = new Map()

  // Accès aux données de tile par coordonnées
  private tileMap: Map<string, Tile> = new Map()

  constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
    this.scene = scene
    this.worldSize = worldSize
    this.tileSize = tileSize
    this.generateGrid()
  }

  // ─── Accès aux données ───────────────────────────────────────────────────────

  getTile(tileX: number, tileZ: number): Tile | undefined {
    return this.tileMap.get(`${tileX}|${tileZ}`)
  }

  getTileType(tileX: number, tileZ: number): TileType | undefined {
    return this.getTile(tileX, tileZ)?.type
  }

  // ─── Grid generation ─────────────────────────────────────────────────────────

  generateGrid(): Tile[] {
    const tiles: Tile[] = []

    // 1. Génère la grille de types via Perlin
    const typeGrid: TileType[][] = []
    for (let x = 0; x < this.worldSize; x++) {
      typeGrid[x] = []
      for (let z = 0; z < this.worldSize; z++) {
        typeGrid[x][z] = tileTypeAt(x, z)
      }
    }

    // 2. Calcule les coins pour chaque tile
    const cornersGrid = computeAllCorners(typeGrid, this.worldSize)

    // 3. Construit les Tiles et compte les sous-tiles par type
    //    (chaque coin = 1 sous-tile, donc on compte les corners par type)
    const countPerType: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

    for (let x = 0; x < this.worldSize; x++) {
      for (let z = 0; z < this.worldSize; z++) {
        const corners = cornersGrid[x][z]

        // Type dominant = le plus fréquent parmi les 4 coins
        const freq: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }
        for (const c of corners) freq[c]++
        const dominant = (Object.keys(freq) as TileType[])
          .reduce((a, b) => freq[a] >= freq[b] ? a : b)

        const tile: Tile = { type: dominant, corners, tileX: x, tileZ: z }
        tiles.push(tile)
        this.tileMap.set(`${x}|${z}`, tile)

        // On compte chaque coin comme un sous-tile
        for (const c of corners) countPerType[c]++
      }
    }

    // 4. Crée un InstancedMesh par type — géométrie = demi-tile
    const subSize = this.tileSize / 2
    const dummy = new THREE.Object3D()
    const indexPerType: Record<TileType, number> = { grass: 0, water: 0, sand: 0, stone: 0 }

    for (const type of TILE_TYPES) {
      const { color, roughness, metalness } = TILE_VISUALS[type]
      // Sous-tile légèrement surélevé selon le type pour éviter le z-fighting
      const yOffset = type === "water" ? -0.02 : 0
      const geometry = new THREE.BoxGeometry(subSize, 0.1, subSize)
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, countPerType[type]))
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.position.y = yOffset
      this.instancedMeshes.set(type, mesh)
      this.scene.add(mesh)
    }

    // 5. Positionne chaque sous-tile
    for (let x = 0; x < this.worldSize; x++) {
      for (let z = 0; z < this.worldSize; z++) {
        const corners = cornersGrid[x][z]

        // Centre du tile en coordonnées monde
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

    // 6. Flush GPU
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

  // ─── Debug corner tile ───────────────────────────────────────────────────────

  /**
   * Place une tile de test au centre de la map avec les 4 coins de types différents.
   * Utile pour vérifier que le rendu corner-based fonctionne.
   * À appeler depuis World après generateGrid(), retirer en prod.
   *
   *   TL = water (bleu)  |  TR = stone (gris)
   *   BL = sand  (sable) |  BR = grass (vert)
   */
  addDebugCornerTile() {
    const cx = Math.floor(this.worldSize / 2)
    const cz = Math.floor(this.worldSize / 2)

    const forcedCorners: [TileType, TileType, TileType, TileType] = ["water", "stone", "sand", "grass"]
    const subSize = this.tileSize / 2

    const centerX = (cx - this.worldSize / 2) * this.tileSize
    const centerZ = (cz - this.worldSize / 2) * this.tileSize

    // On crée 4 Mesh individuels (pas instanciés) bien visibles au-dessus du terrain
    forcedCorners.forEach((type, i) => {
      const { color } = TILE_VISUALS[type]
      const [ox, oz] = CORNER_OFFSETS[i]

      const geo = new THREE.BoxGeometry(subSize, 0.3, subSize)
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 })
      const mesh = new THREE.Mesh(geo, mat)

      mesh.position.set(
        centerX + ox * this.tileSize,
        0.2, // surélevé pour être bien visible au-dessus
        centerZ + oz * this.tileSize,
      )
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.isDebugCorner = true

      this.scene.add(mesh)
    })
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