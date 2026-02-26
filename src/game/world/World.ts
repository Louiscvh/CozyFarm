// src/world/World.ts
import * as THREE from "three"
import { Tile } from "./Tile"
import type { TileType } from "./Tile"
import { ObjectManager } from "./TileFactory"
import { FarmEntity } from "../entity/FarmEntity"
import { createEntity } from "../entity/EntityFactory"
import { placeOnTile } from "../entity/utils/placeOnTile"
import type { Entity } from "../entity/Entity"
import { WheatField } from '../entity/WheatField'
import { Tree1Entity } from "../entity/Tree1"
import { Tree2Entity } from "../entity/Tree2"
import { Flower1Entity } from "../entity/Flower1"
import { Rock1Entity } from "../entity/Rock1"
import { Weather } from "./Weather"

export class World {
  static current: World | null = null
  tiles: Tile[] = []
  size: number = 80
  tileSize: number
  public entities: THREE.Object3D[] = []

  private occupiedPositions = new Set<string>()
  private debugMarkers: THREE.Mesh[] = []
  private debugMarkersVisible: boolean = false

  scene: THREE.Scene
  objects: ObjectManager
  camera!: THREE.Camera

  public weather!: Weather

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    World.current = this
    this.scene = scene

    this.tileSize = tileSize
    this.objects = new ObjectManager(this.scene, this.size, this.tileSize)

    this.generateTiles()
    this.initialize()
  }

  // La camera n'est pas dispo dans le constructeur dans certains setups,
  // donc on initialise Weather dès qu'elle est assignée.
  setCamera(camera: THREE.Camera) {
    this.camera = camera
    this.weather = new Weather(this.scene, this.camera)
    }

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

  // ─── Debug markers ───────────────────────────────────────────────────────────

  public toggleDebugMarkers() {
    this.debugMarkersVisible = !this.debugMarkersVisible
    for (const marker of this.debugMarkers) {
      marker.visible = this.debugMarkersVisible
    }
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
    const marker = new THREE.Mesh(geometry, material)

    const worldX = (tileX - this.size / 2) * this.tileSize + (size / 2) * this.tileSize
    const worldZ = (tileZ - this.size / 2) * this.tileSize + (size / 2) * this.tileSize
    marker.position.set(worldX - this.tileSize / 2, 0.25, worldZ - this.tileSize / 2)
    marker.visible = this.debugMarkersVisible
    marker.userData.tileKey = `${tileX}|${tileZ}`

    this.debugMarkers.push(marker)
    this.scene.add(marker)
  }

  // ─── Tile occupancy ──────────────────────────────────────────────────────────

  private getCenteredTopLeft(centerTileX: number, centerTileZ: number, size: number): { x: number, z: number } {
    const offset = Math.floor(size / 2)
    return { x: centerTileX - offset, z: centerTileZ - offset }
  }

  worldToTileIndex(worldX: number, worldZ: number): { tileX: number, tileZ: number } {
    return {
      tileX: Math.floor(worldX / this.tileSize + this.size / 2),
      tileZ: Math.floor(worldZ / this.tileSize + this.size / 2),
    }
  }

  canSpawn(tileX: number, tileZ: number, size: number = 1): boolean {
    const gridSize = Math.max(1, Math.ceil(size))

    if (tileX < 0 || tileZ < 0 || tileX + gridSize > this.size || tileZ + gridSize > this.size) {
      return false
    }

    for (let dx = 0; dx < gridSize; dx++) {
      for (let dz = 0; dz < gridSize; dz++) {
        if (this.occupiedPositions.has(`${tileX + dx}|${tileZ + dz}`)) {
          return false
        }
      }
    }
    return true
  }

  markOccupied(tileX: number, tileZ: number, size: number = 1) {
    const gridSize = Math.max(1, Math.ceil(size))
    for (let dx = 0; dx < gridSize; dx++) {
      for (let dz = 0; dz < gridSize; dz++) {
        this.occupiedPositions.add(`${tileX + dx}|${tileZ + dz}`)
        this.createDebugMarker(tileX + dx, tileZ + dz, 1)
      }
    }
  }

  markFree(tileX: number, tileZ: number, size: number = 1) {
    const gridSize = Math.max(1, Math.ceil(size))
    for (let dx = 0; dx < gridSize; dx++) {
      for (let dz = 0; dz < gridSize; dz++) {
        const key = `${tileX + dx}|${tileZ + dz}`
        this.occupiedPositions.delete(key)

        const idx = this.debugMarkers.findIndex(m => m.userData.tileKey === key)
        if (idx !== -1) {
          const marker = this.debugMarkers[idx]
          this.scene.remove(marker)
          marker.geometry.dispose()
          ;(marker.material as THREE.Material).dispose()
          this.debugMarkers.splice(idx, 1)
        }
      }
    }
  }

  // ─── Entity spawning ─────────────────────────────────────────────────────────

  async spawnEntitySafe(def: Entity, tileX: number, tileZ: number, size: number = 1): Promise<THREE.Object3D | null> {
    const gridSize = Math.max(1, Math.ceil(size))
    if (!this.canSpawn(tileX, tileZ, gridSize)) return null

    this.markOccupied(tileX, tileZ, gridSize)

    const entity = await createEntity(def, this.tileSize)
    entity.userData.id = def.id
    entity.userData.tileX = tileX
    entity.userData.tileZ = tileZ
    entity.userData.tileSize = gridSize
    placeOnTile(entity, tileX, tileZ, this.tileSize, this.size, gridSize)
    this.scene.add(entity)
    this.entities.push(entity)

    return entity
  }

  // ─── World generation ────────────────────────────────────────────────────────

  async initialize() {
    await this.populateDecor()
  }

  generateTiles() {
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const type = this.randomTileType()
        const pos = new THREE.Vector3(
          (x - this.size / 2) * this.tileSize,
          0,
          (z - this.size / 2) * this.tileSize
        )
        const tile = new Tile(type, pos, this.tileSize)
        this.tiles.push(tile)
        this.scene.add(tile.mesh)
      }
    }
  }

  async populateDecor() {
    const center = this.size / 2
    const farmTL = this.getCenteredTopLeft(center, center, FarmEntity.sizeInTiles)

    const fixedEntities: { def: Entity, tileX: number, tileZ: number, size: number }[] = [
      { def: FarmEntity, tileX: farmTL.x,   tileZ: farmTL.z,   size: FarmEntity.sizeInTiles },
      { def: WheatField, tileX: center + 2, tileZ: center - 2, size: WheatField.sizeInTiles },
      { def: WheatField, tileX: center + 3, tileZ: center + 0, size: WheatField.sizeInTiles },
      { def: WheatField, tileX: center + 3, tileZ: center - 2, size: WheatField.sizeInTiles },
      { def: WheatField, tileX: center + 2, tileZ: center - 1, size: WheatField.sizeInTiles },
    ]

    for (const e of fixedEntities) {
      await this.spawnEntitySafe(e.def, e.tileX, e.tileZ, e.size)
    }

    const area = this.size * this.size
    const decorCategories: { types: Entity[], density: number }[] = [
      { types: [Tree1Entity, Tree2Entity], density: 40 / 400 },
      { types: [Rock1Entity],              density: 20 / 400 },
      { types: [Flower1Entity],            density: 30 / 400 },
    ]

    for (const cat of decorCategories) {
      const count = Math.round(area * cat.density)
      let placedCount = 0
      let attempts = 0
      const maxAttempts = count * 50

      while (placedCount < count && attempts < maxAttempts) {
        attempts++

        const tileX = Math.floor(Math.random() * this.size)
        const tileZ = Math.floor(Math.random() * this.size)

        const type = cat.types[Math.floor(Math.random() * cat.types.length)]
        const entitySize = (type as any).sizeInTiles ?? 1

        const success = await this.spawnEntitySafe(type, tileX, tileZ, entitySize)
        if (success) placedCount++
      }
    }
  }

  // ─── Misc ────────────────────────────────────────────────────────────────────

  getPickableMeshes(): THREE.Object3D[] {
    return [
      ...this.objects.trees,
      ...this.objects.stones,
      ...this.objects.flowers,
    ]
  }

  randomTileType(): TileType {
    const r = Math.random()
    if (r < 0.7)  return "grass"
    if (r < 0.72) return "water"
    if (r < 0.95) return "sand"
    return "stone"
  }
}