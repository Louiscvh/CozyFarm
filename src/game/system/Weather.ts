// src/world/Weather.ts
import * as THREE from "three"
import { Time } from "../core/Time"
import { Rain, type RainIntensity } from "../system/Rain"
import { getSeasonState, type SeasonId } from "./Season"
import { Snow } from "./Snow"

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const DAY_RAIN_CHANCE = 0.30
const CONTINUE_NEXT_DAY_CHANCE = 0.12
const DAWN_WINDOW_START_H = 4
const DAWN_WINDOW_END_H = 8
const NIGHT_STOP_WINDOW_START_H = 22
const NIGHT_STOP_WINDOW_END_H = 26 // 02:00 next day

function weatherLog(message: string) {
  console.log(`[Weather] ${message}`)
}

function formatGameHourFromDayT(dayT: number): string {
  const hours = Math.floor(dayT * 24)
  const minutes = Math.floor((dayT * 24 * 60) % 60)
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}

function formatAbsDayHour(absDayT: number): string {
  const day = Math.floor(absDayT)
  const dayT = absDayT - day
  return `J${day} ${formatGameHourFromDayT(dayT)}`
}

function randInHours(startHour: number, endHour: number): number {
  return (startHour + Math.random() * (endHour - startHour)) / 24
}

export class Weather {
  private scene: THREE.Scene
  private camera: THREE.Camera

  private sun: THREE.DirectionalLight
  private moon: THREE.DirectionalLight
  private backSun: THREE.DirectionalLight
  private ambient: THREE.AmbientLight
  public temperature: number = 15
  private targetTemperature: number = 15
  private rain: Rain
  private snow: Snow
  private readonly shadowCoverage = 24
  private readonly shadowPcfKernel = 4

  public daylight: number = 1
  private seasonId: SeasonId = "autumn"
  private seasonSky = new THREE.Color("#f4b184")
  private seasonLight = new THREE.Color("#ffd2b0")

  private currentPrecipIntensity: RainIntensity = "none"
  private currentDayRainIntensity: Exclude<RainIntensity, "none"> = "moderate"

  private currentDayIndex = -1
  private plannedWetDay = false
  private carryWetToNextDay = false
  private dawnDecisionDone = false
  private stopDone = false
  private dayRainStartAbs = 0
  private dayRainStopAbs = 0

  private manualOverrideActive = false
  private manualOverrideIntensity: RainIntensity = "none"

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene
    this.camera = camera

    this.sun = this._createSun()
    this.moon = this._createMoon()
    this.backSun = this._createBackSun()
    this.ambient = this._createAmbient()

    this.rain = new Rain(scene)
    this.snow = new Snow(scene)
  }

  setRain(intensity: RainIntensity) {
    this.manualOverrideActive = true
    this.manualOverrideIntensity = intensity
    weatherLog(`Manual override -> ${intensity}`)
    this._applyPrecipitation(intensity)
  }

  toggleRain() {
    const next: RainIntensity = this.currentPrecipIntensity === "none" ? "heavy" : "none"
    this.setRain(next)
  }

  getRainIntensity() {
    return this.currentPrecipIntensity
  }

  getTemperature() {
    return this.temperature
  }

  update(deltaTime: number) {
    this._updateSun()
    this._updateDayPrecipitationPlan()
    this._updateTemperature(deltaTime)

    const camPos = this.camera.position
    this.rain.update(deltaTime, camPos)
    this.snow.update(deltaTime, camPos)
  }

  dispose() {
    this.scene.remove(this.sun, this.sun.target)
    this.scene.remove(this.moon, this.moon.target)
    this.scene.remove(this.backSun)
    this.scene.remove(this.ambient)
    this.rain.dispose()
    this.snow.dispose()
  }

  private _updateDayPrecipitationPlan() {
    const absoluteDayT = Time.elapsed / Time.cycleSeconds
    const dayIndex = Math.floor(absoluteDayT)

    if (dayIndex !== this.currentDayIndex) {
      this.currentDayIndex = dayIndex
      this.dawnDecisionDone = false
      this.stopDone = false
      this.plannedWetDay = this.carryWetToNextDay
      this.carryWetToNextDay = false
      this.currentDayRainIntensity = Math.random() < 0.6 ? "moderate" : "heavy"

      if (this.plannedWetDay) {
        // reconduction: on garde la journée humide dès minuit
        this.dayRainStartAbs = dayIndex
      } else {
        this.dayRainStartAbs = dayIndex + randInHours(DAWN_WINDOW_START_H, DAWN_WINDOW_END_H)
      }
      this.dayRainStopAbs = dayIndex + randInHours(NIGHT_STOP_WINDOW_START_H, NIGHT_STOP_WINDOW_END_H)

      weatherLog(
        `Day setup J${dayIndex} | dawnWindow=${DAWN_WINDOW_START_H}:00-${DAWN_WINDOW_END_H}:00 trigger=${formatAbsDayHour(this.dayRainStartAbs)} | stopWindow=22:00-02:00 trigger=${formatAbsDayHour(this.dayRainStopAbs)} | rainChance=${Math.round(DAY_RAIN_CHANCE * 100)}% | continueChance=${Math.round(CONTINUE_NEXT_DAY_CHANCE * 100)}% | carryIn=${this.plannedWetDay}`,
      )
    }

    // décision entre 04:00 et 08:00, à heure aléatoire
    if (!this.dawnDecisionDone && absoluteDayT >= this.dayRainStartAbs) {
      this.dawnDecisionDone = true
      if (!this.plannedWetDay) {
        this.plannedWetDay = Math.random() < DAY_RAIN_CHANCE
      }
      if (this.plannedWetDay) {
        this.currentDayRainIntensity = Math.random() < 0.65 ? "moderate" : "heavy"
      }
      weatherLog(
        `Dawn decision trigger=${formatAbsDayHour(absoluteDayT)} | plannedWet=${this.plannedWetDay} | intensity=${this.currentDayRainIntensity} | rainChance=${Math.round(DAY_RAIN_CHANCE * 100)}% | continueChance=${Math.round(CONTINUE_NEXT_DAY_CHANCE * 100)}%`,
      )
    }

    // arrêt aléatoire entre 22:00 et 02:00 (fenêtre traversant minuit)
    if (!this.stopDone && absoluteDayT >= this.dayRainStopAbs) {
      this.stopDone = true
      this.carryWetToNextDay = this.plannedWetDay && Math.random() < CONTINUE_NEXT_DAY_CHANCE
      weatherLog(
        `Night stop trigger=${formatAbsDayHour(absoluteDayT)} | carryNext=${this.carryWetToNextDay} | continueChance=${Math.round(CONTINUE_NEXT_DAY_CHANCE * 100)}%`,
      )
      this.plannedWetDay = false
      this.manualOverrideActive = false
      this._applyPrecipitation("none")
      return
    }

    if (this.manualOverrideActive) {
      this._applyPrecipitation(this.manualOverrideIntensity)
      return
    }

    const shouldPrecipitate = this.plannedWetDay && absoluteDayT >= this.dayRainStartAbs && absoluteDayT < this.dayRainStopAbs
    this._applyPrecipitation(shouldPrecipitate ? this.currentDayRainIntensity : "none")
  }

  private _applyPrecipitation(intensity: RainIntensity, force = false) {
    if (!force && intensity === this.currentPrecipIntensity) return
    const previous = this.currentPrecipIntensity
    this.currentPrecipIntensity = intensity

    const isWinter = getSeasonState().season.id === "winter"
    if (isWinter) {
      this.rain.setIntensity("none")
      this.snow.setIntensity(intensity)
      weatherLog(`Weather change at ${formatGameHourFromDayT(Time.getLogicalDayT())} | rainChance=${Math.round(DAY_RAIN_CHANCE * 100)}% | continueChance=${Math.round(CONTINUE_NEXT_DAY_CHANCE * 100)}% | ${previous} -> ${intensity} (snow)`)
      return
    }

    this.snow.setIntensity("none")
    this.rain.setIntensity(intensity)
    weatherLog(`Weather change at ${formatGameHourFromDayT(Time.getLogicalDayT())} | rainChance=${Math.round(DAY_RAIN_CHANCE * 100)}% | continueChance=${Math.round(CONTINUE_NEXT_DAY_CHANCE * 100)}% | ${previous} -> ${intensity} (rain)`)
  }

  private _updateTemperature(deltaTime: number) {
    const season = getSeasonState().season
    const minTemp = 8
    const maxTemp = 22

    let baseTemp = THREE.MathUtils.lerp(minTemp, maxTemp, this.daylight)
    baseTemp += season.temperatureOffset

    if (this.currentPrecipIntensity === "heavy") {
      baseTemp -= 4
    } else if (this.currentPrecipIntensity === "moderate") {
      baseTemp -= 2
    }

    const timeT = Time.getVisualDayT()
    const variation = Math.sin(timeT * Math.PI * 2) * 1.5
    baseTemp += variation

    this.targetTemperature = baseTemp

    this.temperature = THREE.MathUtils.lerp(
      this.temperature,
      this.targetTemperature,
      deltaTime * 0.5,
    )
  }

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

  private _updateSun() {
    const season = getSeasonState().season
    if (season.id !== this.seasonId) {
      this.seasonId = season.id
      this._applyPrecipitation(this.currentPrecipIntensity, true)
    }
    this.seasonSky.lerp(new THREE.Color(season.skyColor), 0.015)
    this.seasonLight.lerp(new THREE.Color(season.lightTint), 0.015)

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
      50,
    )
    this.sun.intensity = this.daylight * 2
    this.sun.color = new THREE.Color("#001133").lerp(this.seasonLight, this.daylight)
    this.backSun.intensity = this.daylight * 0.4

    const nightProgress = t < sunriseT
      ? (t + (1 - sunsetT)) / (1 - (sunsetT - sunriseT))
      : (t - sunsetT) / (1 - (sunsetT - sunriseT))
    const moonAngle = nightProgress * Math.PI
    const moonY = Math.sin(moonAngle)

    this.moon.position.set(
      Math.cos(moonAngle - Math.PI / 2) * radius,
      Math.max(0.1, moonY) * radius,
      -50,
    )
    const nightDepth = isDay ? 0 : Math.max(0, moonY)
    this.moon.intensity = nightDepth * smoothstep(0, 0.3, 1 - this.daylight) * 0.05

    this.ambient.color = new THREE.Color("#060810").lerp(this.seasonLight, this.daylight)
    this.ambient.intensity = THREE.MathUtils.lerp(0.03, 0.55, this.daylight)

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.seasonSky)
    } else {
      this.scene.background = this.seasonSky.clone()
    }
  }
}
