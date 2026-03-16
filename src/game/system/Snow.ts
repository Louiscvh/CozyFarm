import * as THREE from "three"
import type { RainIntensity } from "./Rain"

interface SnowConfig {
  count: number
  spread: number
  opacity: number
  size: number
  speedMin: number
  speedMax: number
}

const SNOW_CONFIGS: Record<RainIntensity, SnowConfig> = {
  none: { count: 0, spread: 90, opacity: 0, size: 0.3, speedMin: 0, speedMax: 0 },
  light: { count: 3600, spread: 120, opacity: 0.92, size: 0.5, speedMin: 1.6, speedMax: 2.7 },
  moderate: { count: 5600, spread: 125, opacity: 0.98, size: 0.62, speedMin: 2.1, speedMax: 3.3 },
  heavy: { count: 8200, spread: 130, opacity: 1, size: 0.78, speedMin: 2.7, speedMax: 4.4 },
}

export class Snow {
  private readonly scene: THREE.Scene
  private points: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: THREE.PointsMaterial | null = null
  private flakes: Float32Array | null = null
  private velocity: Float32Array | null = null

  private intensity: RainIntensity = "none"
  private spread = SNOW_CONFIGS.none.spread
  private count = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setIntensity(intensity: RainIntensity) {
    if (intensity === this.intensity) return
    this.intensity = intensity

    if (intensity === "none") {
      this.destroy()
      return
    }

    this.rebuild(SNOW_CONFIGS[intensity])
  }

  update(dt: number, cameraPosition: THREE.Vector3) {
    if (!this.geometry || !this.flakes || !this.velocity || !this.points || !this.material) return

    const arr = this.flakes
    const now = performance.now()

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3
      arr[idx] += Math.sin((i * 13.37) + now * 0.00025) * dt * 0.26
      arr[idx + 2] += Math.cos((i * 9.71) + now * 0.00021) * dt * 0.26
      arr[idx + 1] -= this.velocity[i] * dt

      if (arr[idx + 1] < cameraPosition.y - 45) {
        arr[idx] = cameraPosition.x + (Math.random() - 0.5) * this.spread
        arr[idx + 1] = cameraPosition.y + 45 + Math.random() * 20
        arr[idx + 2] = cameraPosition.z + (Math.random() - 0.5) * this.spread
      }
    }

    this.geometry.attributes.position.needsUpdate = true
    this.points.position.x = cameraPosition.x
    this.points.position.z = cameraPosition.z
  }

  dispose() {
    this.destroy()
  }

  private rebuild(config: SnowConfig) {
    this.destroy()

    this.spread = config.spread
    this.count = config.count
    this.flakes = new Float32Array(this.count * 3)
    this.velocity = new Float32Array(this.count)

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3
      this.flakes[idx] = (Math.random() - 0.5) * this.spread
      this.flakes[idx + 1] = -45 + Math.random() * 90
      this.flakes[idx + 2] = (Math.random() - 0.5) * this.spread
      this.velocity[i] = config.speedMin + Math.random() * (config.speedMax - config.speedMin)
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.flakes, 3))

    this.material = new THREE.PointsMaterial({
      color: "#ffffff",
      size: config.size,
      transparent: true,
      opacity: config.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.scene.add(this.points)
  }

  private destroy() {
    if (!this.points) return
    this.scene.remove(this.points)
    this.geometry?.dispose()
    this.material?.dispose()
    this.points = null
    this.geometry = null
    this.material = null
    this.flakes = null
    this.velocity = null
    this.count = 0
  }
}
