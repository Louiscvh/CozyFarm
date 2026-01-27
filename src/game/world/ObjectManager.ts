// src/world/ObjectManager.ts
import * as THREE from "three"

export class ObjectManager {
  scene: THREE.Scene
  trees: THREE.Mesh[] = []
  stones: THREE.Mesh[] = []
  flowers: THREE.Mesh[] = []

  // dimensions du monde (en tuiles) et taille d'une tuile
  worldSize: number
  tileSize: number

  constructor(scene: THREE.Scene, worldSize: number, tileSize: number) {
    this.scene = scene
    this.worldSize = worldSize
    this.tileSize = tileSize
  }

  addTree(x: number, z: number) {
    // feuillage légèrement plus chaud pour mieux prendre la lumière du soleil couchant
    const material = new THREE.MeshStandardMaterial({ color: "#4f8b3b" })
    const geometry = new THREE.ConeGeometry(0.5, 1.5, 8)
    const tree = new THREE.Mesh(geometry, material)
    tree.position.set(x, 0.75, z)
    tree.userData = {
      kind: "tree",
      name: "Arbre",
      description: "Un arbre qui aime le soleil couchant.",
    }
    this.scene.add(tree)
    this.trees.push(tree)
  }

  addStone(x: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color: "#b3a79e" })
    const geometry = new THREE.DodecahedronGeometry(0.2)
    const stone = new THREE.Mesh(geometry, material)
    stone.position.set(x, 0.15, z)
    stone.userData = {
      kind: "stone",
      name: "Roche",
      description: "Une petite roche lissée par le temps.",
    }
    this.scene.add(stone)
    this.stones.push(stone)
  }

  addFlower(x: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color: "#ff7fbf" })
    const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6)
    const flower = new THREE.Mesh(geometry, material)
    flower.position.set(x, 0.15, z)
    flower.userData = {
      kind: "flower",
      name: "Fleur",
      description: "Une petite fleur colorée qui parfume la prairie.",
    }
    this.scene.add(flower)
    this.flowers.push(flower)
  }

  populateRandomly(count: number, type: "tree" | "stone" | "flower") {
    // coordonnées parfaitement calées sur la taille du monde :
    // le monde va de -(size * tileSize) / 2 à +(size * tileSize) / 2
    const halfExtent = (this.worldSize * this.tileSize) / 2

    for (let i = 0; i < count; i++) {
      const x = Math.random() * (2 * halfExtent) - halfExtent
      const z = Math.random() * (2 * halfExtent) - halfExtent

      if (type === "tree") this.addTree(x, z)
      if (type === "stone") this.addStone(x, z)
      if (type === "flower") this.addFlower(x, z)
    }
  }
}