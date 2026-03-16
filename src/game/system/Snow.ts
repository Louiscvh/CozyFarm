import * as THREE from "three"

export class Snow {
  private readonly scene: THREE.Scene
  private points: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: THREE.PointsMaterial | null = null
  private flakes: Float32Array | null = null
  private velocity: Float32Array | null = null
  private count = 3200
  private spread = 90

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setEnabled(enabled: boolean) {
    if (enabled && !this.points) this.create()
    if (!enabled && this.points) this.destroy()
  }

  update(dt: number, cameraPosition: THREE.Vector3) {
    if (!this.geometry || !this.flakes || !this.velocity || !this.points) return

    const arr = this.flakes
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3
      arr[idx] += Math.sin((i * 13.37) + performance.now() * 0.00025) * dt * 0.2
      arr[idx + 2] += Math.cos((i * 9.71) + performance.now() * 0.00021) * dt * 0.2
      arr[idx + 1] -= this.velocity[i] * dt

      if (arr[idx + 1] < cameraPosition.y - 2) {
        arr[idx] = cameraPosition.x + (Math.random() - 0.5) * this.spread
        arr[idx + 1] = cameraPosition.y + 20 + Math.random() * 10
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

  private create() {
    this.flakes = new Float32Array(this.count * 3)
    this.velocity = new Float32Array(this.count)

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3
      this.flakes[idx] = (Math.random() - 0.5) * this.spread
      this.flakes[idx + 1] = 3 + Math.random() * 30
      this.flakes[idx + 2] = (Math.random() - 0.5) * this.spread
      this.velocity[i] = 2.5 + Math.random() * 2.2
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.flakes, 3))

    this.material = new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.28,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
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
  }
}
