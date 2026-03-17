import * as THREE from "three"

type SoilType = "dirt" | "snow"

interface TillParticle {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    spin: number
    age: number
    lifetime: number
}

export class TillParticles {
    private readonly particles: TillParticle[] = []
    private readonly scene: THREE.Scene
    private readonly cellSize: number
    private readonly worldSizeInCells: number

    private readonly dirtGeometry: THREE.SphereGeometry
    private readonly smokeGeometry: THREE.SphereGeometry

    constructor(scene: THREE.Scene, cellSize: number, worldSizeInCells: number) {
        this.scene = scene
        this.cellSize = cellSize
        this.worldSizeInCells = worldSizeInCells
        this.dirtGeometry = new THREE.SphereGeometry(0.024, 6, 6)
        this.smokeGeometry = new THREE.SphereGeometry(0.03, 6, 6)
    }

    spawnAtCell(cellX: number, cellZ: number, soilType: SoilType = "dirt"): void {
        const halfCells = this.worldSizeInCells / 2
        const baseX = (cellX - halfCells + 0.5) * this.cellSize
        const baseZ = (cellZ - halfCells + 0.5) * this.cellSize
        const baseY = -0.03

        if (soilType === "snow") {
            this.spawnSnowBurst(baseX, baseY, baseZ)
            this.spawnColdMistBurst(baseX, baseY, baseZ)
            return
        }

        this.spawnDirtBurst(baseX, baseY, baseZ)
        this.spawnSmokeBurst(baseX, baseY, baseZ)
    }

    update(deltaTime: number): void {
        if (this.particles.length === 0) return

        const gravity = 2.7
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i]
            particle.age += deltaTime
            particle.velocity.y -= gravity * deltaTime
            particle.mesh.position.addScaledVector(particle.velocity, deltaTime)
            particle.mesh.rotation.y += particle.spin * deltaTime

            const lifeRatio = 1 - (particle.age / particle.lifetime)
            const material = particle.mesh.material as THREE.MeshBasicMaterial
            material.opacity = Math.max(0, lifeRatio * 0.9)
            const scale = THREE.MathUtils.lerp(1, 1.7, 1 - lifeRatio)
            particle.mesh.scale.setScalar(scale)

            if (particle.age >= particle.lifetime) {
                this.scene.remove(particle.mesh)
                material.dispose()
                this.particles.splice(i, 1)
            }
        }
    }

    private spawnDirtBurst(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 10; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x4b2b17,
                transparent: true,
                opacity: 0.9,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.dirtGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.23,
                baseY + Math.random() * 0.04,
                baseZ + (Math.random() - 0.5) * 0.23,
            )
            mesh.scale.setScalar(0.45 + Math.random() * 0.35)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.1,
                    0.36 + Math.random() * 0.28,
                    (Math.random() - 0.5) * 1.1,
                ),
                spin: (Math.random() - 0.5) * 7,
                age: 0,
                lifetime: 0.24 + Math.random() * 0.18,
            })
        }
    }

    private spawnSnowBurst(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 12; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0xf2f7ff,
                transparent: true,
                opacity: 0.95,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.dirtGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.24,
                baseY + Math.random() * 0.04,
                baseZ + (Math.random() - 0.5) * 0.24,
            )
            mesh.scale.setScalar(0.42 + Math.random() * 0.34)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.95,
                    0.32 + Math.random() * 0.26,
                    (Math.random() - 0.5) * 0.95,
                ),
                spin: (Math.random() - 0.5) * 4,
                age: 0,
                lifetime: 0.28 + Math.random() * 0.2,
            })
        }
    }

    private spawnSmokeBurst(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 7; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x8f847a,
                transparent: true,
                opacity: 0.55,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.smokeGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.2,
                baseY + 0.02 + Math.random() * 0.05,
                baseZ + (Math.random() - 0.5) * 0.2,
            )
            mesh.scale.setScalar(0.55 + Math.random() * 0.45)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.32,
                    0.2 + Math.random() * 0.15,
                    (Math.random() - 0.5) * 0.32,
                ),
                spin: (Math.random() - 0.5) * 2,
                age: 0,
                lifetime: 0.36 + Math.random() * 0.22,
            })
        }
    }

    private spawnColdMistBurst(baseX: number, baseY: number, baseZ: number): void {
        for (let i = 0; i < 8; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0xdde7f7,
                transparent: true,
                opacity: 0.5,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.smokeGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.22,
                baseY + 0.02 + Math.random() * 0.05,
                baseZ + (Math.random() - 0.5) * 0.22,
            )
            mesh.scale.setScalar(0.48 + Math.random() * 0.4)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.26,
                    0.22 + Math.random() * 0.16,
                    (Math.random() - 0.5) * 0.26,
                ),
                spin: (Math.random() - 0.5) * 1.5,
                age: 0,
                lifetime: 0.34 + Math.random() * 0.24,
            })
        }
    }
}
