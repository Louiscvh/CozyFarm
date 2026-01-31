// src/game/core/Time.ts
export class Time {

    static readonly cycleSeconds = 5 * 60

    static delta = 0
    static elapsed = Time.cycleSeconds / 2 // 🔹 commence à midi
    static timeScale = 1
  
  
    // transition VISUELLE uniquement
    private static visualFrom: number | null = null
    private static visualTo: number | null = null
    private static visualT = 0
    private static visualDuration = 0
  
    static update(dt: number) {
        this.delta = dt * this.timeScale
        this.elapsed += this.delta
      
        if (this.visualFrom !== null && this.visualTo !== null) {
          // 🔹 utiliser un delta CONSTANT, indépendant du timeScale
          const realDelta = dt // dt venant de ton render loop, en secondes
          this.visualT += realDelta / this.visualDuration
      
          if (this.visualT >= 1) {
            this.visualFrom = null
            this.visualTo = null
            this.visualT = 0
          }
        }
      }
      
  
    static setSpeed(scale: number) {
      this.timeScale = scale
    }
  
    /** 🔵 temps LOGIQUE (UI, gameplay) */
    static getLogicalDayT() {
      return (this.elapsed % this.cycleSeconds) / this.cycleSeconds
    }
  
    /** 🟠 temps VISUEL (soleil) */
    static getVisualDayT() {
      const base = this.getLogicalDayT()
  
      if (this.visualFrom === null || this.visualTo === null) {
        return base
      }
  
      const t = this.easeInOut(this.visualT)
      return this.lerpAngle(this.visualFrom, this.visualTo, t)
    }
  
    /** Aller à une heure cible (0..1) */
    static jumpToDayT(targetT: number, transition = 2) {
        // 1️⃣ capturer l’état visuel ACTUEL (avant tout changement)
        const currentVisualT = this.getVisualDayT()
      
        // 2️⃣ recalage IMMÉDIAT du temps logique (UI, gameplay)
        const cycles = Math.floor(this.elapsed / this.cycleSeconds)
        this.elapsed = cycles * this.cycleSeconds + targetT * this.cycleSeconds
      
        // 3️⃣ lancer la transition VISUELLE
        this.visualFrom = currentVisualT
        this.visualTo = targetT
        this.visualT = 0
        this.visualDuration = transition
      }
      
  
    // helpers
    private static easeInOut(t: number) {
      return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2
    }
  
    private static lerpAngle(a: number, b: number, t: number) {
      let d = b - a
      if (d > 0.5) d -= 1
      if (d < -0.5) d += 1
      return (a + d * t + 1) % 1
    }
  }
  