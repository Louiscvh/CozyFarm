// src/world/Weather.ts
import * as THREE from "three"
import { Time } from "../core/Time"
import { Rain, type RainIntensity } from "../system/Rain"

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export class Weather {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private readonly baseSkyColor = new THREE.Color("#ffb3a7")
  private readonly dawnSkyColor = new THREE.Color("#ff9868")
  private readonly noonSkyColor = new THREE.Color("#ffe3b5")
  private readonly nightSkyColor = new THREE.Color("#081122")

  private sun: THREE.DirectionalLight
  private moon: THREE.DirectionalLight
  private backSun: THREE.DirectionalLight
  private ambient: THREE.AmbientLight
  private sunFlareCore: THREE.Sprite
  private sunFlareHalo: THREE.Sprite
  private sunFlareGhost: THREE.Sprite
  private sunGlowParticles: THREE.Points
  private sunGlowMaterial!: THREE.PointsMaterial
  private sunParticleBase!: Float32Array
  public temperature: number = 15
  private targetTemperature: number = 15
  private rain: Rain
  private readonly shadowCoverage = 24
  private readonly shadowPcfKernel = 4

  public daylight: number = 1

  // Source de vérité unique : l'intensité courante
  private currentRainIntensity: RainIntensity = "none"

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene
    this.camera = camera

    this.sun = this._createSun()
    this.moon = this._createMoon()
    this.backSun = this._createBackSun()
    this.ambient = this._createAmbient()
    this.sunFlareCore = this._createSunFlare(8, "#fff2bf", 0.98)
    this.sunFlareHalo = this._createSunFlare(16, "#ffbc76", 0.42)
    this.sunFlareGhost = this._createSunFlare(6, "#ff9a4f", 0.2)
    this.sunGlowParticles = this._createSunGlowParticles()

    this.rain = new Rain(scene)
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  setRain(intensity: RainIntensity) {
    this.currentRainIntensity = intensity
    this.rain.setIntensity(intensity)
  }

  toggleRain() {
    // Si il pleut → arrêt, sinon → moderate
    const next: RainIntensity = this.currentRainIntensity === "none" ? "heavy" : "none"
    this.setRain(next)
  }

  getRainIntensity() {
    return this.currentRainIntensity
  }

  getTemperature() {
    return this.temperature
  }

  update(deltaTime: number) {
    this._updateSun()
    this._updateTemperature(deltaTime)

    const camPos = this.camera.position
    this.rain.update(deltaTime, camPos)
  }

  dispose() {
    this.scene.remove(this.sun, this.sun.target)
    this.scene.remove(this.moon, this.moon.target)
    this.scene.remove(this.backSun)
    this.scene.remove(this.ambient)
    this.scene.remove(this.sunFlareCore)
    this.scene.remove(this.sunFlareHalo)
    this.scene.remove(this.sunFlareGhost)
    this.scene.remove(this.sunGlowParticles)

    this.sunFlareCore.material.dispose()
    this.sunFlareHalo.material.dispose()
    this.sunFlareGhost.material.dispose()
    this.sunGlowParticles.geometry.dispose()
    this.sunGlowMaterial.dispose()
    this.rain.dispose()
  }

  private _updateTemperature(deltaTime: number) {
    const minTemp = 8
    const maxTemp = 22

    let baseTemp = THREE.MathUtils.lerp(minTemp, maxTemp, this.daylight)

    if (this.currentRainIntensity === "heavy") {
      baseTemp -= 4
    } else if (this.currentRainIntensity === "moderate") {
      baseTemp -= 2
    }

    const timeT = Time.getVisualDayT()
    const variation = Math.sin(timeT * Math.PI * 2) * 1.5
    baseTemp += variation

    this.targetTemperature = baseTemp

    this.temperature = THREE.MathUtils.lerp(
      this.temperature,
      this.targetTemperature,
      deltaTime * 0.5
    )
  }

  // ─── Light setup ─────────────────────────────────────────────────────────────

  private _createSun(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight("#ffb347", 1)
    light.castShadow = true
    light.shadow.mapSize.set(4096, 4096)
    const d = this.shadowCoverage
    light.shadow.camera.left = -d
    light.shadow.camera.right = d
    light.shadow.camera.top = d
    light.shadow.camera.bottom = -d
    light.shadow.camera.near = 1
    light.shadow.camera.far = 220
    light.shadow.bias = -0.00008
    light.shadow.normalBias = 0.02
    light.shadow.radius = this.shadowPcfKernel * 0.5
    light.target.position.set(0, 0, 0)
    light.target.updateMatrixWorld()
    this.scene.add(light, light.target)
    return light
  }

  private _createMoon(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight("#c8d8ff", 0)
    light.castShadow = false
    this.scene.add(light, light.target)
    return light
  }

  private _createBackSun(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight("#ff7aa2", 0.4)
    light.position.set(35, 12, -30)
    light.castShadow = false
    this.scene.add(light)
    return light
  }

  private _createAmbient(): THREE.AmbientLight {
    const light = new THREE.AmbientLight("#ffe0c7", 0.2)
    this.scene.add(light)
    return light
  }

  private _createSunFlare(scale: number, color: string, opacity: number): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const flare = new THREE.Sprite(material)
    flare.scale.setScalar(scale)
    flare.renderOrder = 5
    this.scene.add(flare)
    return flare
  }

  private _createSunGlowParticles(): THREE.Points {
    const particleCount = 120
    const positions = new Float32Array(particleCount * 3)
    this.sunParticleBase = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i++) {
      const stride = i * 3
      const radius = THREE.MathUtils.lerp(0.25, 1, Math.sqrt(Math.random()))
      const theta = Math.random() * Math.PI * 2
      const y = THREE.MathUtils.randFloatSpread(0.65)

      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius
      positions[stride] = x
      positions[stride + 1] = y
      positions[stride + 2] = z

      this.sunParticleBase[stride] = x
      this.sunParticleBase[stride + 1] = y
      this.sunParticleBase[stride + 2] = z
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))

    this.sunGlowMaterial = new THREE.PointsMaterial({
      color: "#ffd7a5",
      size: 0.52,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })

    const points = new THREE.Points(geometry, this.sunGlowMaterial)
    points.frustumCulled = false
    points.renderOrder = 4
    this.scene.add(points)
    return points
  }

  // ─── Sun/Moon cycle ──────────────────────────────────────────────────────────

  private _updateSun() {
    const t = Time.getVisualDayT()
    const radius = 100
    const sunriseT = 0.25
    const sunsetT = 0.917

    const dayProgress = (t - sunriseT) / (sunsetT - sunriseT)
    const sunAngle = dayProgress * Math.PI
    const sunY = Math.sin(sunAngle)
    const isDay = t >= sunriseT && t <= sunsetT
    this.daylight = isDay ? Math.max(0, sunY) : 0

    this.sun.position.set(
      Math.cos(sunAngle - Math.PI / 2) * radius,
      Math.max(0, sunY) * radius,
      50
    )
    this.sun.intensity = THREE.MathUtils.lerp(0.05, 2.2, this.daylight)
    this.sun.color = new THREE.Color("#071029").lerp(new THREE.Color("#ffbc59"), this.daylight)
    this.backSun.intensity = this.daylight * 0.55

    const nightProgress = t < sunriseT
      ? (t + (1 - sunsetT)) / (1 - (sunsetT - sunriseT))
      : (t - sunsetT) / (1 - (sunsetT - sunriseT))
    const moonAngle = nightProgress * Math.PI
    const moonY = Math.sin(moonAngle)

    this.moon.position.set(
      Math.cos(moonAngle - Math.PI / 2) * radius,
      Math.max(0.1, moonY) * radius,
      -50
    )
    const nightDepth = isDay ? 0 : Math.max(0, moonY)
    this.moon.intensity = nightDepth * smoothstep(0, 0.3, 1 - this.daylight) * 0.05

    this.ambient.color = new THREE.Color("#060810").lerp(new THREE.Color("#ffe0c7"), this.daylight)
    this.ambient.intensity = THREE.MathUtils.lerp(0.03, 0.62, this.daylight)

    this._updateSunVfx(t)
  }

  private _updateSunVfx(dayT: number) {
    const dawn = 1 - Math.abs(dayT - 0.27) * 8
    const dusk = 1 - Math.abs(dayT - 0.9) * 8
    const goldenBoost = Math.max(0, dawn, dusk)
    const flareStrength = THREE.MathUtils.clamp(this.daylight * 0.9 + goldenBoost * 0.45, 0, 1)

    const cameraPos = this.camera.position
    const camToSun = new THREE.Vector3().subVectors(this.sun.position, cameraPos).normalize()
    const flarePos = cameraPos.clone().addScaledVector(camToSun, 36)
    const ghostPos = cameraPos.clone().addScaledVector(camToSun, 30)

    this.sunFlareCore.position.copy(flarePos)
    this.sunFlareHalo.position.copy(flarePos)
    this.sunFlareGhost.position.copy(ghostPos)

    const flareScale = THREE.MathUtils.lerp(8, 14, flareStrength)
    this.sunFlareCore.scale.setScalar(flareScale)
    this.sunFlareHalo.scale.setScalar(flareScale * 2.25)
    this.sunFlareGhost.scale.setScalar(flareScale * 0.75)

    ;(this.sunFlareCore.material as THREE.SpriteMaterial).opacity = flareStrength * 1
    ;(this.sunFlareHalo.material as THREE.SpriteMaterial).opacity = flareStrength * 0.52
    ;(this.sunFlareGhost.material as THREE.SpriteMaterial).opacity = flareStrength * 0.22

    this.sunGlowParticles.position.copy(flarePos)
    this.sunGlowParticles.scale.setScalar(THREE.MathUtils.lerp(5, 8.2, flareStrength))
    this.sunGlowParticles.rotation.y += 0.0015
    this.sunGlowMaterial.opacity = flareStrength * 0.4
    this.sunGlowMaterial.size = THREE.MathUtils.lerp(0.4, 0.8, flareStrength)

    const positions = this.sunGlowParticles.geometry.getAttribute("position") as THREE.BufferAttribute
    const time = performance.now() * 0.001
    for (let i = 0; i < positions.count; i++) {
      const stride = i * 3
      const pulse = Math.sin(time * 1.7 + i * 0.37) * 0.08
      positions.array[stride] = this.sunParticleBase[stride] * (1 + pulse)
      positions.array[stride + 1] = this.sunParticleBase[stride + 1] + Math.sin(time * 1.2 + i * 0.13) * 0.06
      positions.array[stride + 2] = this.sunParticleBase[stride + 2] * (1 + pulse)
    }
    positions.needsUpdate = true

    const skyColor = this.nightSkyColor.clone().lerp(this.baseSkyColor, this.daylight)
    skyColor.lerp(this.noonSkyColor, Math.max(0, this.daylight - 0.2))
    skyColor.lerp(this.dawnSkyColor, goldenBoost * 0.65)
    this.scene.background = skyColor

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(skyColor)
      this.scene.fog.near = THREE.MathUtils.lerp(35, 55, this.daylight)
      this.scene.fog.far = THREE.MathUtils.lerp(95, 130, this.daylight)
    } else {
      this.scene.fog = new THREE.Fog(skyColor.clone(), 35, 100)
    }
  }
}
