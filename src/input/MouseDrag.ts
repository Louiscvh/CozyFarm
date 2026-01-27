export class MouseDrag {
  dragging = false
  lastX = 0
  lastY = 0

  vx = 0
  vy = 0

  onDrag: (dx: number, dy: number) => void

  friction = 0.95 // vitesse diminue de 10% par frame

  constructor(onDrag: (dx: number, dy: number) => void) {
    this.onDrag = onDrag

    // Souris (desktop)
    window.addEventListener("mousedown", e => {
      this.dragging = true
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.vx = 0
      this.vy = 0
    })

    window.addEventListener("mouseup", () => {
      this.dragging = false
    })

    window.addEventListener("mousemove", e => {
      if (!this.dragging) return

      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY

      this.lastX = e.clientX
      this.lastY = e.clientY

      this.vx = dx
      this.vy = dy

      this.onDrag(dx, dy)
    })

    // Touch (mobile / tablette)
    window.addEventListener(
      "touchstart",
      e => {
        if (e.touches.length !== 1) return
        const t = e.touches[0]
        this.dragging = true
        this.lastX = t.clientX
        this.lastY = t.clientY
        this.vx = 0
        this.vy = 0
      },
      { passive: true }
    )

    window.addEventListener(
      "touchmove",
      e => {
        if (!this.dragging || e.touches.length !== 1) return
        const t = e.touches[0]

        const dx = t.clientX - this.lastX
        const dy = t.clientY - this.lastY

        this.lastX = t.clientX
        this.lastY = t.clientY

        this.vx = dx
        this.vy = dy

        this.onDrag(dx, dy)
      },
      { passive: true }
    )

    const endTouch = () => {
      this.dragging = false
    }

    window.addEventListener("touchend", endTouch)
    window.addEventListener("touchcancel", endTouch)
  }

  /** à appeler chaque frame dans render loop */
  update() {
    if (this.dragging) return // pas d’inertie si on drag

    // inertia / easing
    if (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01) {
      this.onDrag(this.vx, this.vy)
      this.vx *= this.friction
      this.vy *= this.friction
    }
  }
}
