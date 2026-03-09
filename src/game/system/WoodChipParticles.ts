import * as THREE from "three"

interface WoodChipParticle {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    spin: number
    age: number
    lifetime: number
}

export class WoodChipParticles {
    private readonly particles: WoodChipParticle[] = []
    private readonly chipGeometry: THREE.PlaneGeometry
    private readonly dustGeometry: THREE.SphereGeometry

    private readonly scene: THREE.Scene
    private readonly cellSize: number
    private readonly worldSizeInCells: number

    constructor(scene: THREE.Scene, cellSize: number, worldSizeInCells: number) {
        this.scene = scene
        this.cellSize = cellSize
        this.worldSizeInCells = worldSizeInCells
        this.chipGeometry = new THREE.PlaneGeometry(0.062, 0.034)
        this.dustGeometry = new THREE.SphereGeometry(0.022, 6, 6)
    }

    spawnAtCell(cellX: number, cellZ: number): void {
        const halfCells = this.worldSizeInCells / 2
        const baseX = (cellX - halfCells + 0.5) * this.cellSize
        const baseZ = (cellZ - halfCells + 0.5) * this.cellSize
        const baseY = -0.01

        this.spawnChipBurst(baseX, baseY, baseZ)
        this.spawnDustPuff(baseX, baseY, baseZ)
    }

    update(deltaTime: number): void {
        if (this.particles.length === 0) return

        const gravity = 2.15
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i]
            particle.age += deltaTime
            particle.velocity.y -= gravity * deltaTime
            particle.mesh.position.addScaledVector(particle.velocity, deltaTime)
            particle.mesh.rotation.z += particle.spin * deltaTime

            const lifeRatio = 1 - (particle.age / particle.lifetime)
            const material = particle.mesh.material as THREE.MeshBasicMaterial
            material.opacity = Math.max(0, lifeRatio * 0.92)

            if (particle.age >= particle.lifetime) {
                this.scene.remove(particle.mesh)
                material.dispose()
                this.particles.splice(i, 1)
            }
        }
    }

    private spawnChipBurst(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 18; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.45 ? 0x8b5a2b : 0x6f4522,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.chipGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.24,
                baseY + 0.02 + Math.random() * 0.05,
                baseZ + (Math.random() - 0.5) * 0.24,
            )
            mesh.rotation.set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.7,
            )
            mesh.scale.setScalar(0.85 + Math.random() * 0.7)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.3,
                    0.45 + Math.random() * 0.35,
                    (Math.random() - 0.5) * 1.3,
                ),
                spin: (Math.random() - 0.5) * 9,
                age: 0,
                lifetime: 0.28 + Math.random() * 0.22,
            })
        }
    }

    private spawnDustPuff(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 8; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0xa06b3b,
                transparent: true,
                opacity: 0.4,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.dustGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.2,
                baseY + 0.01 + Math.random() * 0.03,
                baseZ + (Math.random() - 0.5) * 0.2,
            )
            mesh.scale.setScalar(0.95 + Math.random() * 0.7)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.32,
                    0.2 + Math.random() * 0.17,
                    (Math.random() - 0.5) * 0.32,
                ),
                spin: (Math.random() - 0.5) * 2,
                age: 0,
                lifetime: 0.34 + Math.random() * 0.24,
            })
        }
    }
}
