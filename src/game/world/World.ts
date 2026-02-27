// src/world/World.ts
import * as THREE from "three"
import { TileFactory, getFixedEntities, DECOR_CATEGORIES } from "./TileFactory"
import { createEntity } from "../entity/EntityFactory"
import { placeOnTile } from "../entity/utils/placeOnTile"
import type { Entity } from "../entity/Entity"
import { Weather } from "../system/Weather"

export class World {
  static current: World | null = null

  readonly size: number = 80
  readonly tileSize: number

  public entities: THREE.Object3D[] = []
  public weather!: Weather

  scene: THREE.Scene
  camera!: THREE.Camera

  public tilesFactory: TileFactory

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    World.current = this
    this.scene = scene
    this.tileSize = tileSize

    this.tilesFactory = new TileFactory(scene, this.size, tileSize)

    // 🔧 DEBUG — retire cette ligne une fois le corner-based vérifié
    this.tilesFactory.addDebugCornerTile()

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

  public toggleDebugMarkers() { this.tilesFactory.toggleDebugMarkers() }
  clearDebugMarkers()          { this.tilesFactory.clearDebugMarkers() }

  // ─── Tile occupancy ───────────────────────────────────────────────────────

  worldToTileIndex(worldX: number, worldZ: number): { tileX: number; tileZ: number } {
    return {
      tileX: Math.floor((worldX + this.tileSize / 2) / this.tileSize + this.size / 2),
      tileZ: Math.floor((worldZ + this.tileSize / 2) / this.tileSize + this.size / 2),
    }
  }

  // ─── Terrain checks ───────────────────────────────────────────────────────

  /**
   * Vérifie que toute la zone de spawn est sur un terrain valide (pas d'eau).
   * On utilise le type dominant du tile, pas les coins, pour la logique gameplay.
   */
  private isValidSpawnTerrain(tileX: number, tileZ: number, size: number): boolean {
    const gridSize = Math.max(1, Math.ceil(size))
    for (let dx = 0; dx < gridSize; dx++) {
      for (let dz = 0; dz < gridSize; dz++) {
        const type = this.tilesFactory.getTileType(tileX + dx, tileZ + dz)
        if (type === "water") return false
      }
    }
    return true
  }

  // ─── Entity spawning ──────────────────────────────────────────────────────

  async spawnEntitySafe(def: Entity, tileX: number, tileZ: number, size: number = 1): Promise<THREE.Object3D | null> {
    const gridSize = Math.max(1, Math.ceil(size))
    if (!this.tilesFactory.canSpawn(tileX, tileZ, gridSize)) return null

    this.tilesFactory.markOccupied(tileX, tileZ, gridSize)

    const entity = await createEntity(def, this.tileSize)
    entity.userData.id       = def.id
    entity.userData.tileX    = tileX
    entity.userData.tileZ    = tileZ
    entity.userData.tileSize = gridSize

    placeOnTile(entity, tileX, tileZ, this.tileSize, this.size, gridSize)
    this.scene.add(entity)
    this.entities.push(entity)

    return entity
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private async initialize() {
    await this.populateDecor()
  }

  private async populateDecor() {
    const center = this.size / 2

    for (const e of getFixedEntities(center)) {
      await this.spawnEntitySafe(e.def, e.tileX, e.tileZ, e.size)
    }

    const area = this.size * this.size

    for (const cat of DECOR_CATEGORIES) {
      const count = Math.round(area * cat.density)
      let placed = 0
      let attempts = 0
      const maxAttempts = count * 50

      while (placed < count && attempts < maxAttempts) {
        attempts++

        const tileX = Math.floor(Math.random() * this.size)
        const tileZ = Math.floor(Math.random() * this.size)
        const type  = cat.types[Math.floor(Math.random() * cat.types.length)]
        const size  = (type as any).sizeInTiles ?? 1

        // Pas de spawn sur l'eau
        if (!this.isValidSpawnTerrain(tileX, tileZ, size)) continue

        const ok = await this.spawnEntitySafe(type, tileX, tileZ, size)
        if (ok) placed++
      }
    }
  }
}