import * as THREE from "three"

interface FireSourceData {
  position: THREE.Vector3
  strength: number
  range: number
  distanceSq: number
}

interface FireCluster {
  position: THREE.Vector3
  strength: number
  range: number
  weight: number
  distanceSq: number
}

const MAX_DYNAMIC_LIGHTS = 8
const CLUSTER_SIZE = 2.5

export class FireLightManager {
  private readonly lights: THREE.PointLight[] = []
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

    const sources = this.collectSources(entities, camera)
    if (sources.length === 0) {
      this.disableAllLights()
      return
    }

    const clusters = this.clusterSources(sources)
    clusters.sort((a, b) => b.weight - a.weight)

    let usedLights = 0
    const now = performance.now() * 0.018

    for (const cluster of clusters) {
      if (usedLights >= this.lights.length) break

      const light = this.lights[usedLights]
      const distanceFade = 1 / (1 + cluster.distanceSq * 0.03)
      const cappedStrength = Math.min(cluster.strength, 4.5)
      const flicker = 1 + Math.sin(now + usedLights * 1.7) * 0.08

      light.position.copy(cluster.position)
      light.distance = Math.min(14, cluster.range)
      light.intensity = fireIntensity * cappedStrength * 1.5 * distanceFade * flicker
      light.visible = true

      usedLights++
    }

    for (let i = usedLights; i < this.lights.length; i++) {
      this.lights[i].visible = false
    }
  }

  private collectSources(entities: THREE.Object3D[], camera: THREE.Camera): FireSourceData[] {
    const sources: FireSourceData[] = []

    for (const entity of entities) {
      if (!entity.userData.isFireSource) continue

      const position = new THREE.Vector3()
      entity.getWorldPosition(position)
      position.y += 0.6

      const distanceSq = position.distanceToSquared(camera.position)
      if (distanceSq > 28 * 28) continue

      sources.push({
        position,
        distanceSq,
        strength: entity.userData.fireStrength ?? 1,
        range: entity.userData.fireRange ?? 8,
      })
    }

    return sources
  }

  private clusterSources(sources: FireSourceData[]): FireCluster[] {
    const bucket = new Map<string, FireCluster>()

    for (const source of sources) {
      const keyX = Math.round(source.position.x / CLUSTER_SIZE)
      const keyZ = Math.round(source.position.z / CLUSTER_SIZE)
      const key = `${keyX}:${keyZ}`

      const existing = bucket.get(key)
      if (!existing) {
        bucket.set(key, {
          position: source.position.clone(),
          strength: source.strength,
          range: source.range,
          weight: source.strength / (1 + source.distanceSq * 0.01),
          distanceSq: source.distanceSq,
        })
        continue
      }

      const mergedStrength = existing.strength + source.strength
      const sourceWeight = source.strength / mergedStrength

      existing.position.lerp(source.position, sourceWeight)
      existing.strength = mergedStrength
      existing.range = Math.max(existing.range, source.range)
      existing.distanceSq = Math.min(existing.distanceSq, source.distanceSq)
      existing.weight += source.strength / (1 + source.distanceSq * 0.01)

    }

    return Array.from(bucket.values())
  }

  private disableAllLights() {
    for (const light of this.lights) {
      light.visible = false
      light.intensity = 0
    }
  }
}
