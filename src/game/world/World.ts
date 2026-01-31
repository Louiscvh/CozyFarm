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
import { WheatField } from '../entity/WheatField';

export class World {
  tiles: Tile[] = []
  size: number = 120
  tileSize: number
  public entities: THREE.Object3D[] = []

  scene: THREE.Scene
  objects: ObjectManager

  private sun!: THREE.DirectionalLight
  private backSun!: THREE.DirectionalLight
  private ambient!: THREE.AmbientLight

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    this.scene = scene
    this.tileSize = tileSize

    this.objects = new ObjectManager(this.scene, this.size, this.tileSize)

    this.setupLights()
    this.spawnEntitiesAsync()
    this.generateTiles()
    this.populateDecor()
    this.updateSun()

  }

  private async spawnEntitiesAsync() {
    await this.spawnEntity(FarmEntity, 0, 0)
    await this.spawnEntity(WheatField, 2, 0)
    await this.spawnEntity(WheatField, 3, 0)
    await this.spawnEntity(WheatField, 3, -1)
    await this.spawnEntity(WheatField, 2, -1)

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
    // lumière principale chaude
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

    // fill light rosée
    this.backSun = new THREE.DirectionalLight("#ff7aa2", 0.4)
    this.backSun.position.set(35, 12, -30)
    this.scene.add(this.backSun)

    // lumière globale
    this.ambient = new THREE.AmbientLight("#ffe0c7", 0.55)
    this.scene.add(this.ambient)
  }

  async spawnEntity(def: Entity, tileX: number, tileZ: number) {
    const entity = await createEntity(def, this.tileSize)
    placeOnTile(entity, tileX, tileZ, this.tileSize)
  
    this.scene.add(entity)
    this.entities.push(entity)
  }



  /** à appeler chaque frame pour mettre à jour le cycle jour/nuit */
  /** à appeler à chaque frame depuis ton Renderer */
  updateSun() {
    const t = Time.getVisualDayT()
    const angle = (t - 0.25) * Math.PI * 2
    const radius = 100
  
    this.sun.position.set(
      Math.cos(angle) * radius,
      Math.max(0, Math.sin(angle)) * radius,
      50
    )
  
    const daylight = Math.max(0, Math.sin(angle))
    this.sun.intensity = daylight
  
    const dayColor = new THREE.Color("#ffb347")
    const nightColor = new THREE.Color("#001133")
    this.sun.color = nightColor.clone().lerp(dayColor, daylight)
  
    this.ambient.intensity = THREE.MathUtils.lerp(0.05, 0.55, daylight)
  }
  
  
  

  populateDecor() {
    const area = this.size * this.size

    const treeDensity = 60 / 400
    const stoneDensity = 20 / 400
    const flowerDensity = 50 / 400

    const trees = Math.round(area * treeDensity)
    const stones = Math.round(area * stoneDensity)
    const flowers = Math.round(area * flowerDensity)

    this.objects.populateRandomly(trees, "tree")
    this.objects.populateRandomly(stones, "stone")
    this.objects.populateRandomly(flowers, "flower")
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
    if (r < 0.7) return "grass"
    if (r < 0.72) return "water"
    if (r < 0.95) return "sand"
    return "stone"
  }
}
