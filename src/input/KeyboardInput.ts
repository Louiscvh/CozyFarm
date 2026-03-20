export class KeyboardInput {
  keys = new Set<string>()

  constructor() {
    window.addEventListener("keydown", e => {
      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && key === "a") {
        e.preventDefault()
      }

      if (key.startsWith("arrow")) {
        e.preventDefault()
      }

      this.keys.add(key)
    })
    window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()))
  }

  isDown(...keys: string[]) {
    return keys.some(key => this.keys.has(key.toLowerCase()))
  }
}
