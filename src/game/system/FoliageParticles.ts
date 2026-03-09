import * as THREE from "three"

interface FoliageParticle {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    spin: number
    age: number
    lifetime: number
}

export class FoliageParticles {
    private readonly particles: FoliageParticle[] = []
    private readonly leafGeometry: THREE.PlaneGeometry
    private readonly puffGeometry: THREE.SphereGeometry

    private readonly scene: THREE.Scene
    private readonly cellSize: number
    private readonly worldSizeInCells: number

    constructor(scene: THREE.Scene, cellSize: number, worldSizeInCells: number) {
        this.scene = scene
        this.cellSize = cellSize
        this.worldSizeInCells = worldSizeInCells
        this.leafGeometry = new THREE.PlaneGeometry(0.05, 0.032)
        this.puffGeometry = new THREE.SphereGeometry(0.02, 6, 6)
    }

    spawnAtCell(cellX: number, cellZ: number): void {
        const halfCells = this.worldSizeInCells / 2
        const baseX = (cellX - halfCells + 0.5) * this.cellSize
        const baseZ = (cellZ - halfCells + 0.5) * this.cellSize
        const baseY = -0.02

        this.spawnLeafBurst(baseX, baseY, baseZ)
        this.spawnGreenPuff(baseX, baseY, baseZ)
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
            material.opacity = Math.max(0, lifeRatio * 0.95)

            if (particle.age >= particle.lifetime) {
                this.scene.remove(particle.mesh)
                material.dispose()
                this.particles.splice(i, 1)
            }
        }
    }

    private spawnLeafBurst(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 11; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.45 ? 0x5fbf4a : 0x74cf52,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.leafGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.2,
                baseY + 0.02 + Math.random() * 0.04,
                baseZ + (Math.random() - 0.5) * 0.2,
            )
            mesh.rotation.set(
                (Math.random() - 0.5) * 0.6,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.6,
            )
            mesh.scale.setScalar(0.65 + Math.random() * 0.55)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.9,
                    0.42 + Math.random() * 0.26,
                    (Math.random() - 0.5) * 0.9,
                ),
                spin: (Math.random() - 0.5) * 8.5,
                age: 0,
                lifetime: 0.22 + Math.random() * 0.2,
            })
        }
    }

    private spawnGreenPuff(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 5; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x9dcf6a,
                transparent: true,
                opacity: 0.45,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.puffGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.16,
                baseY + 0.01 + Math.random() * 0.03,
                baseZ + (Math.random() - 0.5) * 0.16,
            )
            mesh.scale.setScalar(0.8 + Math.random() * 0.55)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.22,
                    0.17 + Math.random() * 0.14,
                    (Math.random() - 0.5) * 0.22,
                ),
                spin: (Math.random() - 0.5) * 2.2,
                age: 0,
                lifetime: 0.3 + Math.random() * 0.22,
            })
        }
    }
}
