// src/game/core/Time.ts
export class Time {

  static readonly cycleSeconds = 5 * 60

  static delta = 0
  static elapsed = Time.cycleSeconds / 2 // commence à midi
  static timeScale = 1

  // transition de phase (appliquée au temps logique + visuel)
  private static phaseShiftFrom: number | null = null
  private static phaseShiftTo: number | null = null
  private static phaseShiftT = 0
  private static phaseShiftDuration = 0

  static update(dt: number) {
    const safeDt = Math.min(dt, 0.1)   // cap à 100ms max
    this.delta = safeDt * this.timeScale
    this.elapsed += this.delta

    if (this.phaseShiftFrom !== null && this.phaseShiftTo !== null) {
      // Delta constant, indépendant du timeScale
      this.phaseShiftT += dt / this.phaseShiftDuration

      if (this.phaseShiftT >= 1) {
        // Applique le décalage final à la timeline logique
        this.elapsed += this.phaseShiftTo * this.cycleSeconds

        this.phaseShiftFrom = null
        this.phaseShiftTo = null
        this.phaseShiftT = 0
      }
    }
  }

  static setSpeed(scale: number) {
    this.timeScale = scale
  }

  /** temps LOGIQUE (UI, gameplay) */
  static getLogicalDayT() {
    const base = this.getBaseDayT()

    if (this.phaseShiftFrom === null || this.phaseShiftTo === null) {
      return base
    }

    const t = this.easeInOut(this.phaseShiftT)
    return (base + this.lerp(this.phaseShiftFrom, this.phaseShiftTo, t) + 1) % 1
  }

  /** temps VISUEL (soleil) */
  static getVisualDayT() {
    return this.getLogicalDayT()
  }

  /** Aller à une heure cible (0..1) */
  static jumpToDayT(targetT: number, transition = 2) {
    const currentT = this.getLogicalDayT()
    const shift = this.forwardPhaseDiff(currentT, targetT)

    this.phaseShiftFrom = 0
    this.phaseShiftTo = shift
    this.phaseShiftT = 0
    this.phaseShiftDuration = Math.max(0.01, transition)
  }

  private static getBaseDayT() {
    return (this.elapsed % this.cycleSeconds) / this.cycleSeconds
  }

  // helpers
  private static easeInOut(t: number) {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  private static lerp(a: number, b: number, t: number) {
    return a + (b - a) * t
  }

  private static forwardPhaseDiff(from: number, to: number) {
    return (to - from + 1) % 1
  }
}
