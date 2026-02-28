// src/world/World.ts
import * as THREE from "three"
import { TileFactory, getFixedEntities, DECOR_CATEGORIES } from "./TileFactory"
import { createEntity } from "../entity/EntityFactory"
import { placeOnCell } from "../entity/utils/placeOnCell"
import { getFootprint } from "../entity/Entity"
import type { Entity } from "../entity/Entity"
import { Weather } from "../system/Weather"

export class World {
  static current: World | null = null

  readonly size: number = 80
  readonly tileSize: number
  readonly cellSize: number
  readonly sizeInCells: number

  public entities: THREE.Object3D[] = []
  public weather!: Weather

  scene: THREE.Scene
  camera!: THREE.Camera

  public tilesFactory: TileFactory

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    World.current    = this
    this.scene       = scene
    this.tileSize    = tileSize
    this.cellSize    = tileSize / 2
    this.sizeInCells = this.size * 2

    this.tilesFactory = new TileFactory(scene, this.size, tileSize)

    this.initialize()
  }

  // ─── Camera & Weather ─────────────────────────────────────────────────────

  setCamera(camera: THREE.Camera) {
    this.camera = camera
  }

  setWeather() {
    this.weather = new Weather(this.scene, this.camera)
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  update(deltaTime: number) {
    if (!this.weather) return
    this.weather.update(deltaTime)

    const now = performance.now() / 1000
    const torchIntensity = 1 - this.weather.daylight

    for (const entity of this.entities) {
      if (!entity.userData.isTorch) continue
      ;(entity as any).updateTorch(now, torchIntensity)
    }
  }

  // ─── Debug markers ────────────────────────────────────────────────────────


  // ─── Coordonnées ──────────────────────────────────────────────────────────

  worldToCellIndex(worldX: number, worldZ: number): { cellX: number; cellZ: number } {
    // Formule correcte : floor(worldX / cellSize + halfCells)
    // L'ancienne formule avait + cellSize/2 dans le numérateur, ce qui
    // décalait le seuil de snap de 0.5 cellule — le ghost sautait une cellule trop tôt.
    const halfCells = this.sizeInCells / 2
    return {
      cellX: Math.floor(worldX / this.cellSize + halfCells),
      cellZ: Math.floor(worldZ / this.cellSize + halfCells),
    }
  }

  tileToCell(tileX: number, tileZ: number): { cellX: number; cellZ: number } {
    return { cellX: tileX * 2, cellZ: tileZ * 2 }
  }

  // ─── Terrain checks ───────────────────────────────────────────────────────

  private isValidSpawnTerrain(cellX: number, cellZ: number, sizeInCells: number): boolean {
    for (let dx = 0; dx < sizeInCells; dx++) {
      for (let dz = 0; dz < sizeInCells; dz++) {
        const type = this.tilesFactory.getTileTypeAtCell(cellX + dx, cellZ + dz)
        if (type === "water") return false
      }
    }
    return true
  }

  // ─── Entity spawning ──────────────────────────────────────────────────────

  async spawnEntitySafe(
    def: Entity,
    cellX: number,
    cellZ: number,
    sizeInCells?: number
  ): Promise<THREE.Object3D | null> {
    const cells = sizeInCells ?? getFootprint(def)

    if (!this.tilesFactory.canSpawn(cellX, cellZ, cells)) return null
    this.tilesFactory.markOccupied(cellX, cellZ, cells)

    const entity = await createEntity(def, this.tileSize)
    entity.userData.id          = def.id
    entity.userData.cellX       = cellX
    entity.userData.cellZ       = cellZ
    entity.userData.sizeInCells = cells

    placeOnCell(entity, cellX, cellZ, this.cellSize, this.sizeInCells, cells)
    this.scene.add(entity)
    this.entities.push(entity)

    return entity
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private async initialize() {
    await this.populateDecor()
  }

  private async populateDecor() {
    for (const e of getFixedEntities(this.size / 2)) {
      const { cellX, cellZ } = this.tileToCell(e.tileX, e.tileZ)
      // e.size est déjà en cellules via getFootprint() — pas de conversion
      await this.spawnEntitySafe(e.def, cellX, cellZ, e.size)
    }

    const totalCells = this.sizeInCells * this.sizeInCells

    for (const cat of DECOR_CATEGORIES) {
      const count = Math.round(totalCells * cat.density / 4)
      let placed = 0
      let attempts = 0
      const maxAttempts = count * 50

      while (placed < count && attempts < maxAttempts) {
        attempts++

        const cellX = Math.floor(Math.random() * this.sizeInCells)
        const cellZ = Math.floor(Math.random() * this.sizeInCells)
        const type  = cat.types[Math.floor(Math.random() * cat.types.length)]
        const cells = getFootprint(type)

        if (!this.isValidSpawnTerrain(cellX, cellZ, cells)) continue

        const ok = await this.spawnEntitySafe(type, cellX, cellZ, cells)
        if (ok) placed++
      }
    }
  }
}