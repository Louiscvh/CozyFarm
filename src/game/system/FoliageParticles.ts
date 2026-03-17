import * as THREE from "three"
import type { SeasonId } from "./Season"

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
    private readonly autumnLeafPalette = [0x8f4f2b, 0xa86135, 0x7c3f21]
    private readonly springLeafPalette = [0x5fbf4a, 0x74cf52, 0x86db62]

    constructor(scene: THREE.Scene, cellSize: number, worldSizeInCells: number) {
        this.scene = scene
        this.cellSize = cellSize
        this.worldSizeInCells = worldSizeInCells
        this.leafGeometry = new THREE.PlaneGeometry(0.064, 0.04)
        this.puffGeometry = new THREE.SphereGeometry(0.024, 6, 6)
    }

    spawnAtCell(cellX: number, cellZ: number, baseYOverride?: number, scaleMul: number = 1): void {
        const halfCells = this.worldSizeInCells / 2
        const baseX = (cellX - halfCells + 0.5) * this.cellSize
        const baseZ = (cellZ - halfCells + 0.5) * this.cellSize
        const baseY = baseYOverride ?? -0.02

        this.spawnLeafBurst(baseX, baseY, baseZ, scaleMul)
        this.spawnGreenPuff(baseX, baseY, baseZ, scaleMul)
    }

    spawnSeasonLeafDriftAtCell(cellX: number, cellZ: number, seasonId: SeasonId): void {
        const palette = seasonId === "autumn"
            ? this.autumnLeafPalette
            : seasonId === "spring"
                ? this.springLeafPalette
                : null
        if (!palette) return

        const halfCells = this.worldSizeInCells / 2
        const baseX = (cellX - halfCells + 0.5) * this.cellSize
        const baseZ = (cellZ - halfCells + 0.5) * this.cellSize
        const baseY = 0.8 + Math.random() * 0.4
        this.spawnDriftingLeaves(baseX, baseY, baseZ, palette)
    }

    update(deltaTime: number): void {
        if (this.particles.length === 0) return

        const gravity = 2.05
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

    private spawnLeafBurst(baseX: number, baseY: number, baseZ: number, scaleMul: number): void {
        for (let i = 0; i < 18; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.45 ? 0x5fbf4a : 0x74cf52,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.leafGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.24 * scaleMul,
                baseY + 0.02 + Math.random() * 0.05 * scaleMul,
                baseZ + (Math.random() - 0.5) * 0.24 * scaleMul,
            )
            mesh.rotation.set(
                (Math.random() - 0.5) * 0.6,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.6,
            )
            mesh.scale.setScalar((0.9 + Math.random() * 0.65) * scaleMul)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.25 * scaleMul,
                    (0.5 + Math.random() * 0.34) * Math.sqrt(scaleMul),
                    (Math.random() - 0.5) * 1.25 * scaleMul,
                ),
                spin: (Math.random() - 0.5) * 10,
                age: 0,
                lifetime: 0.28 + Math.random() * 0.24,
            })
        }
    }

    private spawnGreenPuff(baseX: number, baseY: number, baseZ: number, scaleMul: number): void {
        for (let i = 0; i < 9; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x9dcf6a,
                transparent: true,
                opacity: 0.45,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.puffGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.2 * scaleMul,
                baseY + 0.01 + Math.random() * 0.04 * scaleMul,
                baseZ + (Math.random() - 0.5) * 0.2 * scaleMul,
            )
            mesh.scale.setScalar((1 + Math.random() * 0.7) * scaleMul)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.32 * scaleMul,
                    (0.21 + Math.random() * 0.18) * Math.sqrt(scaleMul),
                    (Math.random() - 0.5) * 0.32 * scaleMul,
                ),
                spin: (Math.random() - 0.5) * 2.2,
                age: 0,
                lifetime: 0.36 + Math.random() * 0.24,
            })
        }
    }

    private spawnDriftingLeaves(baseX: number, baseY: number, baseZ: number, palette: readonly number[]): void {
        const leafCount = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < leafCount; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: palette[Math.floor(Math.random() * palette.length)],
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                toneMapped: false,
            })
            const mesh = new THREE.Mesh(this.leafGeometry, material)
            mesh.position.set(
                baseX + (Math.random() - 0.5) * 0.6,
                baseY + Math.random() * 0.35,
                baseZ + (Math.random() - 0.5) * 0.6,
            )
            mesh.rotation.set(
                (Math.random() - 0.5) * 0.45,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.45,
            )
            mesh.scale.setScalar(0.65 + Math.random() * 0.6)
            this.scene.add(mesh)

            this.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.22,
                    -(0.22 + Math.random() * 0.24),
                    (Math.random() - 0.5) * 0.22,
                ),
                spin: (Math.random() - 0.5) * 6.2,
                age: 0,
                lifetime: 1.8 + Math.random() * 1.2,
            })
        }
    }
}
