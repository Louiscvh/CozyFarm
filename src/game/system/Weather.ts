// src/world/Weather.ts
import * as THREE from "three"
import { Time } from "../core/Time"
import { Rain, type RainIntensity } from "../system/Rain"

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export class Weather {
  private scene:  THREE.Scene
  private camera: THREE.Camera

  private sun:     THREE.DirectionalLight
  private moon:    THREE.DirectionalLight
  private backSun: THREE.DirectionalLight
  private ambient: THREE.AmbientLight
  public temperature: number = 15
  private targetTemperature: number = 15
  private rain:    Rain
  private readonly shadowCoverage = 30

  public daylight: number = 1

  // Source de vérité unique : l'intensité courante
  private currentRainIntensity: RainIntensity = "none"

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene  = scene
    this.camera = camera

    this.sun     = this._createSun()
    this.moon    = this._createMoon()
    this.backSun = this._createBackSun()
    this.ambient = this._createAmbient()

    this.rain    = new Rain(scene)
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

  getRainIntensity(){
    return this.currentRainIntensity;
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
    this.rain.dispose()
  }

  private _updateTemperature(deltaTime: number) {
    // Température de base selon lumière du jour
    // Nuit ≈ 8°C
    // Jour plein ≈ 22°C
    const minTemp = 8
    const maxTemp = 22
  
    let baseTemp = THREE.MathUtils.lerp(minTemp, maxTemp, this.daylight)
  
    // Refroidissement pluie
    if (this.currentRainIntensity === "heavy") {
      baseTemp -= 4
    } else if (this.currentRainIntensity === "moderate") {
      baseTemp -= 2
    }
  
    // Petite variation naturelle
    const timeT = Time.getVisualDayT()
    const variation = Math.sin(timeT * Math.PI * 2) * 1.5
    baseTemp += variation
  
    this.targetTemperature = baseTemp
  
    // Transition douce (inertie thermique)
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
    light.shadow.camera.left   = -d
    light.shadow.camera.right  =  d
    light.shadow.camera.top    =  d
    light.shadow.camera.bottom = -d
    light.shadow.camera.near   = 1
    light.shadow.camera.far    = 220
    light.shadow.bias = -0.00012
    light.shadow.normalBias = 0.018
    light.shadow.radius = 2
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

  // ─── Sun/Moon cycle ──────────────────────────────────────────────────────────

  private _updateSun() {
    const t = Time.getVisualDayT()
    const radius   = 100
    const sunriseT = 0.25
    const sunsetT  = 0.917

    const dayProgress = (t - sunriseT) / (sunsetT - sunriseT)
    const sunAngle    = dayProgress * Math.PI
    const sunY        = Math.sin(sunAngle)
    const isDay       = t >= sunriseT && t <= sunsetT
    this.daylight     = isDay ? Math.max(0, sunY) : 0

    this.sun.position.set(
      Math.cos(sunAngle - Math.PI / 2) * radius,
      Math.max(0, sunY) * radius,
      50
    )
    this.sun.intensity = this.daylight * 2
    this.sun.color      = new THREE.Color("#001133").lerp(new THREE.Color("#ffb347"), this.daylight)
    this.backSun.intensity = this.daylight * 0.4

    const nightProgress = t < sunriseT
      ? (t + (1 - sunsetT)) / (1 - (sunsetT - sunriseT))
      : (t - sunsetT) / (1 - (sunsetT - sunriseT))
    const moonAngle = nightProgress * Math.PI
    const moonY     = Math.sin(moonAngle)

    this.moon.position.set(
      Math.cos(moonAngle - Math.PI / 2) * radius,
      Math.max(0.1, moonY) * radius,
      -50
    )
    const nightDepth    = isDay ? 0 : Math.max(0, moonY)
    this.moon.intensity = nightDepth * smoothstep(0, 0.3, 1 - this.daylight) * 0.05

    this.ambient.color     = new THREE.Color("#060810").lerp(new THREE.Color("#ffe0c7"), this.daylight)
    this.ambient.intensity = THREE.MathUtils.lerp(0.03, 0.55, this.daylight)
  }

}
