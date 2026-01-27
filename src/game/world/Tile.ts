// src/world/Tile.ts
import * as THREE from "three"

export type TileType = "grass" | "water" | "sand" | "stone"

export class Tile {
  mesh: THREE.Mesh
  type: TileType
  position: THREE.Vector3

  constructor(type: TileType, position: THREE.Vector3, size: number = 2) {
    this.type = type
    this.position = position

    let material: THREE.Material
    switch (type) {
      case "grass":
        // herbe un peu plus douce et chaude
        material = new THREE.MeshStandardMaterial({ color: "#7fb36a" })
        break
      case "water":
        // eau plus profonde, tirant légèrement vers l'indigo
        material = new THREE.MeshStandardMaterial({ color: "#142c5c" })
        break
      case "sand":
        // sable plus pêche, pour accrocher la lumière orangée
        material = new THREE.MeshStandardMaterial({ color: "#f5c97a" })
        break
      case "stone":
        // pierre un peu plus chaude
        material = new THREE.MeshStandardMaterial({ color: "#b0a7a0" })
        break
    }

    const geometry = new THREE.BoxGeometry(size, 0.1, size)
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.copy(position)
  }
}