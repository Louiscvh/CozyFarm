export class MouseDrag {
  dragging = false
  lastX = 0
  lastY = 0

  vx = 0
  vy = 0

  onDrag: (dx: number, dy: number, pointerType: "mouse" | "touch") => void
  private activeTouchId: number | null = null
  private lastPointerType: "mouse" | "touch" = "mouse"

  friction = 0.95 // vitesse diminue de 10% par frame

  constructor(onDrag: (dx: number, dy: number, pointerType: "mouse" | "touch") => void) {
    this.onDrag = onDrag

    const isUiTarget = (target: EventTarget | null) =>
      (target as HTMLElement | null)?.closest?.("#ui-root")

    // Souris (desktop)
    window.addEventListener("mousedown", e => {
      if (e.button !== 0) return
      if (isUiTarget(e.target)) return

      e.preventDefault()
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

      e.preventDefault()

      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY

      this.lastX = e.clientX
      this.lastY = e.clientY

      this.vx = dx
      this.vy = dy
      this.lastPointerType = "mouse"

      this.onDrag(dx, dy, "mouse")
    })

    // Touch (mobile / tablette)
    window.addEventListener(
      "touchstart",
      e => {
        if (e.touches.length !== 1) return
        if (isUiTarget(e.target)) return
        const t = e.touches[0]
        this.dragging = true
        this.activeTouchId = t.identifier
        this.lastX = t.clientX
        this.lastY = t.clientY
        this.vx = 0
        this.vy = 0
        this.lastPointerType = "touch"
      },
      { passive: false }
    )

    window.addEventListener(
      "touchmove",
      e => {
        if (!this.dragging || e.touches.length !== 1) return
        const t = Array.from(e.touches).find(touch => touch.identifier === this.activeTouchId) ?? e.touches[0]
        if (isUiTarget(e.target)) return

        e.preventDefault()

        const dx = t.clientX - this.lastX
        const dy = t.clientY - this.lastY

        this.lastX = t.clientX
        this.lastY = t.clientY

        this.vx = dx
        this.vy = dy
        this.lastPointerType = "touch"

        this.onDrag(dx, dy, "touch")
      },
      { passive: false }
    )

    const endTouch = () => {
      this.dragging = false
      this.activeTouchId = null
      this.vx = 0
      this.vy = 0
    }

    window.addEventListener("touchend", endTouch)
    window.addEventListener("touchcancel", endTouch)
  }

  /** à appeler chaque frame dans render loop */
  update() {
    if (this.dragging) return // pas d’inertie si on drag

    // inertia / easing
    if (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01) {
      this.onDrag(this.vx, this.vy, this.lastPointerType)
      this.vx *= this.friction
      this.vy *= this.friction
    }
  }
}
