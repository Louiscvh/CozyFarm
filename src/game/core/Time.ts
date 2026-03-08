// src/game/core/Time.ts
export class Time {

  static readonly cycleSeconds = 5 * 60

  static delta = 0
  static elapsed = Time.cycleSeconds / 2 // commence à midi
  static timeScale = 1

  // transition VISUELLE uniquement (offset temporaire par rapport au temps logique)
  private static visualOffsetFrom: number | null = null
  private static visualT = 0
  private static visualDuration = 0

  static update(dt: number) {
    const safeDt = Math.min(dt, 0.1)   // cap à 100ms max
    this.delta = safeDt * this.timeScale
    this.elapsed += this.delta

    if (this.visualOffsetFrom !== null) {
      // Delta constant, indépendant du timeScale
      this.visualT += dt / this.visualDuration

      if (this.visualT >= 1) {
        this.visualOffsetFrom = null
        this.visualT = 0
      }
    }
  }

  static setSpeed(scale: number) {
    this.timeScale = scale
  }

  /** temps LOGIQUE (UI, gameplay) */
  static getLogicalDayT() {
    return (this.elapsed % this.cycleSeconds) / this.cycleSeconds
  }

  /** temps VISUEL (soleil) */
  static getVisualDayT() {
    const base = this.getLogicalDayT()

    if (this.visualOffsetFrom === null) {
      return base
    }

    const eased = this.easeInOut(this.visualT)
    const remainingOffset = this.visualOffsetFrom * (1 - eased)
    return this.wrap01(base + remainingOffset)
  }

  /** Aller à une heure cible (0..1) */
  static jumpToDayT(targetT: number, transition = 2) {
    // 1. Capturer l'état visuel ACTUEL avant tout changement
    const currentVisualT = this.getVisualDayT()

    // 2. Recalage IMMÉDIAT du temps logique
    const cycles = Math.floor(this.elapsed / this.cycleSeconds)
    this.elapsed = cycles * this.cycleSeconds + targetT * this.cycleSeconds

    // 3. Lancer la transition visuelle en conservant un offset qui s'atténue
    // pendant que le temps logique continue d'avancer.
    const baseStart = this.getLogicalDayT()
    this.visualOffsetFrom = this.signedDelta(baseStart, currentVisualT)
    this.visualT = 0
    this.visualDuration = Math.max(0.001, transition)
  }

  // helpers
  private static easeInOut(t: number) {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  private static signedDelta(from: number, to: number) {
    let d = to - from
    if (d > 0.5) d -= 1
    if (d < -0.5) d += 1
    return d
  }

  private static wrap01(t: number) {
    return ((t % 1) + 1) % 1
  }
}
