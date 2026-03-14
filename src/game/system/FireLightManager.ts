import * as THREE from "three"

interface FireSource {
  object: THREE.Object3D
  distanceSq: number
}

const MAX_DYNAMIC_LIGHTS = 6

export class FireLightManager {
  private readonly lights: THREE.PointLight[] = []
  private readonly tempWorldPos = new THREE.Vector3()
  private readonly scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene
    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i++) {
      const light = new THREE.PointLight(0xff7a1a, 0, 8)
      light.visible = false
      light.castShadow = false
      this.scene.add(light)
      this.lights.push(light)
    }
  }

  update(entities: THREE.Object3D[], camera: THREE.Camera | null, fireIntensity: number) {
    if (!camera || fireIntensity <= 0.01) {
      this.disableAllLights()
      return
    }

    const sources: FireSource[] = []
    for (const entity of entities) {
      if (!entity.userData.isFireSource) continue
      entity.getWorldPosition(this.tempWorldPos)
      sources.push({
        object: entity,
        distanceSq: this.tempWorldPos.distanceToSquared(camera.position),
      })
    }

    sources.sort((a, b) => a.distanceSq - b.distanceSq)

    let usedLights = 0
    for (const source of sources) {
      if (usedLights >= this.lights.length) break

      const light = this.lights[usedLights]
      const baseStrength = source.object.userData.fireStrength ?? 1
      const range = source.object.userData.fireRange ?? 8
      const flicker = 1 + Math.sin(performance.now() * 0.018 + source.object.id) * 0.08

      source.object.getWorldPosition(light.position)
      light.position.y += 0.6
      light.distance = range
      light.intensity = fireIntensity * baseStrength * 1.6 * flicker
      light.visible = true
      usedLights++
    }

    for (let i = usedLights; i < this.lights.length; i++) {
      this.lights[i].visible = false
    }
  }

  private disableAllLights() {
    for (const light of this.lights) {
      light.visible = false
      light.intensity = 0
    }
  }
}
