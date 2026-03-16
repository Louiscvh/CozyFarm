export class KeyboardInput {
    keys = new Set<string>()
  
    constructor() {
      window.addEventListener("keydown", e => {
        const key = e.key.toLowerCase()

        if ((e.ctrlKey || e.metaKey) && key === "a") {
          e.preventDefault()
        }

        this.keys.add(key)
      })
      window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()))
    }
  
    isDown(key: string) {
      return this.keys.has(key)
    }
  }