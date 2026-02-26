// src/world/World.ts
import * as THREE from "three"
import { Tile } from "./Tile"
import type { TileType } from "./Tile"
import { ObjectManager } from "./TileFactory"
import { Time } from "../../game/core/Time"
import { FarmEntity } from "../entity/FarmEntity"
import { createEntity } from "../entity/EntityFactory"
import { placeOnTile } from "../entity/utils/placeOnTile"
import type { Entity } from "../entity/Entity"
import { WheatField } from '../entity/WheatField'
import { Tree1Entity } from "../entity/Tree1"
import { Tree2Entity } from "../entity/Tree2"
import { Flower1Entity } from "../entity/Flower1"
import { Rock1Entity } from "../entity/Rock1"

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

  private sun!: THREE.DirectionalLight
  private moon!: THREE.DirectionalLight
  private backSun!: THREE.DirectionalLight
  private ambient!: THREE.AmbientLight
  camera!: THREE.Camera

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    World.current = this
    this.scene = scene
    
    this.tileSize = tileSize
    this.objects = new ObjectManager(this.scene, this.size, this.tileSize)

    this.setupLights()
    this.generateTiles()
    this.initialize()
    this.updateSun()
  }

  public toggleDebugMarkers() {
    this.debugMarkersVisible = !this.debugMarkersVisible
    for (const marker of this.debugMarkers) {
      marker.visible = this.debugMarkersVisible
    }
  }

  private getCenteredTopLeft(centerTileX: number, centerTileZ: number, size: number): { x: number, z: number } {
    const offset = Math.floor(size / 2)
    return { x: centerTileX - offset, z: centerTileZ - offset }
  }

  async initialize() {
    await this.populateDecor()
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

  clearDebugMarkers() {
    for (const marker of this.debugMarkers) {
      this.scene.remove(marker)
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
    this.debugMarkers = []
  }

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

  setupLights() {
    this.sun = new THREE.DirectionalLight("#ffb347", 1)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.width = 4096
    this.sun.shadow.mapSize.height = 4096
    const d = 20
    this.sun.shadow.camera.left = -d
    this.sun.shadow.camera.right = d
    this.sun.shadow.camera.top = d
    this.sun.shadow.camera.bottom = -d
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 400
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
  
    this.moon = new THREE.DirectionalLight("#c8d8ff", 0)
    this.moon.castShadow = true
    this.moon.shadow.mapSize.width = 2048
    this.moon.shadow.mapSize.height = 2048
    this.moon.shadow.camera.left = -d
    this.moon.shadow.camera.right = d
    this.moon.shadow.camera.top = d
    this.moon.shadow.camera.bottom = -d
    this.moon.shadow.camera.near = 1
    this.moon.shadow.camera.far = 400
    this.moon.shadow.radius = 3
    this.scene.add(this.moon)
    this.scene.add(this.moon.target)
  
    this.backSun = new THREE.DirectionalLight("#ff7aa2", 0.4)
    this.backSun.position.set(35, 12, -30)
    this.scene.add(this.backSun)
  
    this.ambient = new THREE.AmbientLight("#ffe0c7", 0.2)
    this.scene.add(this.ambient)
  }
  
  updateSun() {
    const t = Time.getVisualDayT()
    const radius = 100
    const sunriseT = 0.25   // 6h
    const sunsetT  = 0.917  // 22h
  
    const dayProgress = (t - sunriseT) / (sunsetT - sunriseT)
    const sunAngle = dayProgress * Math.PI
    const sunY = Math.sin(sunAngle)
    const isDay = t >= sunriseT && t <= sunsetT
    const daylight = isDay ? Math.max(0, sunY) : 0
  
    this.sun.position.set(
      Math.cos(sunAngle - Math.PI / 2) * radius,
      Math.max(0, sunY) * radius,
      50
    )
    this.sun.intensity = daylight
    this.sun.color = new THREE.Color("#001133").lerp(new THREE.Color("#ffb347"), daylight)
    this.backSun.intensity = daylight * 0.4
  
    const nightProgress = t < sunriseT
      ? (t + (1 - sunsetT)) / (1 - (sunsetT - sunriseT))
      : (t - sunsetT) / (1 - (sunsetT - sunriseT))
    const moonAngle = nightProgress * Math.PI
    const moonY = Math.sin(moonAngle)
  
    this.moon.position.set(
      Math.cos(moonAngle - Math.PI / 2) * radius,
      Math.max(0.1, moonY) * radius,
      -50
    )
    const nightDepth = isDay ? 0 : Math.max(0, moonY)
    this.moon.intensity = nightDepth * smoothstep(0, 0.3, 1 - daylight) * 0.05
  
    const nightAmbient = new THREE.Color("#060810")
    const dayAmbient = new THREE.Color("#ffe0c7")
    this.ambient.color = nightAmbient.clone().lerp(dayAmbient, daylight)
    this.ambient.intensity = THREE.MathUtils.lerp(0.03, 0.55, daylight)

    // --- Torches ---
    // S'allument la nuit, s'éteignent le jour
    // Flickering : variation rapide de l'intensité avec sin + bruit
    const now = performance.now() / 1000
    const torchIntensity = 1 - daylight

    for (const entity of this.entities) {
      if (!entity.userData.isTorch) continue
      ;(entity as any).updateTorch(now, torchIntensity)
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}