export class Time {
    static delta = 0
    static elapsed = 0
  
    static update(dt: number) {
      this.delta = dt
      this.elapsed += dt
    }
  }