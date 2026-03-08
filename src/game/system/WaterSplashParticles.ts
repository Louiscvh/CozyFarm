import * as THREE from "three"

interface SplashParticle {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    age: number
    lifetime: number
}

export class WaterSplashParticles {
    private readonly particles: SplashParticle[] = []
    private readonly geometry: THREE.SphereGeometry
    private readonly baseMaterial: THREE.MeshBasicMaterial

    private readonly scene: THREE.Scene
    private readonly cellSize: number
    private readonly worldSizeInCells: number

    constructor(scene: THREE.Scene, cellSize: number, worldSizeInCells: number) {
        this.scene = scene
        this.cellSize = cellSize
        this.worldSizeInCells = worldSizeInCells
        this.geometry = new THREE.SphereGeometry(0.018, 5, 5)
        this.baseMaterial = new THREE.MeshBasicMaterial({
            color: 0x2f8dff,
            transparent: true,
            opacity: 0.95,
            toneMapped: false,
        })
    }

    spawnAtCell(cellX: number, cellZ: number): void {
        const halfCells = this.worldSizeInCells / 2
        const baseX = (cellX - halfCells + 0.5) * this.cellSize
        const baseZ = (cellZ - halfCells + 0.5) * this.cellSize
        const baseY = -0.04

        for (let i = 0; i < 14; i++) {
            const mesh = new THREE.Mesh(this.geometry, this.baseMaterial.clone())
            const spread = 0.22
            mesh.position.set(
                baseX + (Math.random() - 0.5) * spread,
                baseY + Math.random() * 0.03,
                baseZ + (Math.random() - 0.5) * spread,
            )
            mesh.scale.setScalar(0.45 + Math.random() * 0.35)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.3,
                    0.32 + Math.random() * 0.35,
                    (Math.random() - 0.5) * 1.3,
                ),
                age: 0,
                lifetime: 0.26 + Math.random() * 0.18,
            })
        }
    }

    update(deltaTime: number): void {
        if (this.particles.length === 0) return

        const gravity = 2.3
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i]
            particle.age += deltaTime
            particle.velocity.y -= gravity * deltaTime
            particle.mesh.position.addScaledVector(particle.velocity, deltaTime)

            const lifeRatio = 1 - (particle.age / particle.lifetime)
            const material = particle.mesh.material as THREE.MeshBasicMaterial
            material.opacity = Math.max(0, lifeRatio * 0.95)

            if (particle.age >= particle.lifetime) {
                this.scene.remove(particle.mesh)
                material.dispose()
                this.particles.splice(i, 1)
            }
        }
    }
}
