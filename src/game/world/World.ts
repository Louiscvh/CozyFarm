// src/world/World.ts
import * as THREE from "three"
import { Tile } from "./Tile"
import type { TileType } from "./Tile"
import { ObjectManager } from "./ObjectManager"

export class World {
  tiles: Tile[] = []
  size: number
  tileSize: number

  scene: THREE.Scene
  objects: ObjectManager

  constructor(scene: THREE.Scene, size: number = 20, tileSize: number = 2) {
    this.scene = scene
    this.size = size
    this.tileSize = tileSize

    this.objects = new ObjectManager(this.scene, this.size, this.tileSize)

    this.setupLights()
    this.generateTiles()
    this.populateDecor()
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

  // éclairage "sunset" du monde
  setupLights() {
    // lumière principale chaude, basse sur l'horizon
    const sunColor = new THREE.Color("#ffb347")   // orange doux
    const sun = new THREE.DirectionalLight(sunColor, 1.6)
    sun.position.set(-40, 18, 25)
    sun.target.position.set(0, 0, 0)
    this.scene.add(sun)
    this.scene.add(sun.target)

    // fill light rosée venant de l'autre côté, très douce
    const backSun = new THREE.DirectionalLight("#ff7aa2", 0.4)
    backSun.position.set(35, 12, -30)
    this.scene.add(backSun)

    // lumière globale chaude, légèrement désaturée
    const ambient = new THREE.AmbientLight("#ffe0c7", 0.55)
    this.scene.add(ambient)
  }

  populateDecor() {
    const area = this.size * this.size

    // densités (par tuile) calibrées sur l'ancien cas 20x20 :
    // 30 arbres, 20 pierres, 50 fleurs → divisé par 400
    const treeDensity = 30 / 400
    const stoneDensity = 20 / 400
    const flowerDensity = 50 / 400

    const trees = Math.round(area * treeDensity)
    const stones = Math.round(area * stoneDensity)
    const flowers = Math.round(area * flowerDensity)

    this.objects.populateRandomly(trees, "tree")
    this.objects.populateRandomly(stones, "stone")
    this.objects.populateRandomly(flowers, "flower")
  }

  // objets sélectionnables pour le raycast UI (arbres, pierres, fleurs)
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
    if (r < 0.8) return "water"
    if (r < 0.95) return "sand"
    return "stone"
  }
}