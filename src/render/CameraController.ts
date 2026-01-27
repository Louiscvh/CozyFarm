// src/render/CameraController.ts
import * as THREE from "three"
import { Time } from "../game/core/Time"
import { KeyboardInput } from "../input/KeyboardInput"
import { MouseDrag } from "../input/MouseDrag"

export class CameraController {
  camera: THREE.OrthographicCamera
  target = new THREE.Vector3(0, 0, 0)

  // Zoom
  distance = 5
  targetDistance = 5
  zoomVelocity = 0
  zoomSpeed = 0.05
  zoomFriction = 0.85
  minDistance = 3
  maxDistance = 20
  private pinchLastDistance: number | null = null

  // Rotation
  azimuth = Math.PI / 4
  elevation = Math.PI / 9
  rotateSpeed = 0.005

  // Mouvement
  moveVelocity = new THREE.Vector3()
  moveFriction = 0.97
  keyboard: KeyboardInput
  mouseDrag: MouseDrag
  minSpeed = 4
  maxSpeed = 32

  // "Home"
  private homeTarget = new THREE.Vector3(0, 0, 0)
  private homeDistance = 5
  private homeAzimuth = this.azimuth
  private homeElevation = this.elevation
  private isReturningHome = false
  private returnT = 0
  private returnStartTarget = new THREE.Vector3()
  private returnStartDistance = 0
  private returnStartAzimuth = 0
  private returnStartElevation = 0

  constructor(camera: THREE.OrthographicCamera) {
    this.camera = camera
    this.updateCamera()

    this.keyboard = new KeyboardInput()
    this.mouseDrag = new MouseDrag((dx, dy) => this.rotate(dx, dy))

    // Zoom (wheel + pinch)
    const addZoom = (delta: number) => (this.zoomVelocity += delta * this.zoomSpeed)
    
    window.addEventListener("wheel", e => {
      e.preventDefault()
      addZoom(e.deltaY * 0.2)
    }, { passive: false })

    window.addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        this.pinchLastDistance = this.getTouchDistance(e.touches[0], e.touches[1])
      }
    }, { passive: false })

    window.addEventListener("touchmove", e => {
      if (e.touches.length === 2 && this.pinchLastDistance !== null) {
        e.preventDefault()
        const d = this.getTouchDistance(e.touches[0], e.touches[1])
        addZoom((this.pinchLastDistance - d) * 0.05)
        this.pinchLastDistance = d
      }
    }, { passive: false })

    const endPinch = () => (this.pinchLastDistance = null)
    window.addEventListener("touchend", endPinch)
    window.addEventListener("touchcancel", endPinch)
  }

  update() {
    this.mouseDrag.update()
    this.handleMovement()
    this.handleZoom()
    this.handleReturnHome()
    this.updateCamera()
  }

  private handleMovement() {
    const forward = this.getForward()
    const right = this.getRight()
    const moveDir = new THREE.Vector3()

    if (this.keyboard.isDown("z")) moveDir.add(forward)
    if (this.keyboard.isDown("s")) moveDir.add(forward.clone().multiplyScalar(-1))
    if (this.keyboard.isDown("q")) moveDir.add(right.clone().multiplyScalar(-1))
    if (this.keyboard.isDown("d")) moveDir.add(right)

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize()
      const t = ((this.distance - this.minDistance) / (this.maxDistance - this.minDistance))
      const speed = THREE.MathUtils.lerp(this.maxSpeed, this.minSpeed, t * t)
      this.moveVelocity.addScaledVector(moveDir, speed * Time.delta * 2)
    }

    this.moveVelocity.multiplyScalar(this.moveFriction)
    this.target.addScaledVector(this.moveVelocity, Time.delta)
  }

  private handleZoom() {
    if (Math.abs(this.zoomVelocity) > 0.001) {
      this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + this.zoomVelocity, this.minDistance, this.maxDistance)
      this.zoomVelocity *= this.zoomFriction
    }
    this.distance += (this.targetDistance - this.distance) * 0.2
  }

  private handleReturnHome() {
    if (!this.isReturningHome) return
    this.returnT = Math.min(1, this.returnT + 0.08)
    const t = this.returnT

    this.target.lerpVectors(this.returnStartTarget, this.homeTarget, t)
    this.distance = THREE.MathUtils.lerp(this.returnStartDistance, this.homeDistance, t)
    this.azimuth = THREE.MathUtils.lerp(this.returnStartAzimuth, this.homeAzimuth, t)
    this.elevation = THREE.MathUtils.lerp(this.returnStartElevation, this.homeElevation, t)

    if (t >= 1) this.isReturningHome = false
  }

  private updateCamera() {
    const x = this.target.x + Math.cos(this.elevation) * Math.sin(this.azimuth) * 20
    const y = this.target.y + Math.sin(this.elevation) * 25
    const z = this.target.z + Math.cos(this.elevation) * Math.cos(this.azimuth) * 20

    this.camera.position.set(x, y, z)
    this.camera.lookAt(this.target)
    this.camera.zoom = this.distance
    this.camera.updateProjectionMatrix()
  }

  rotate(dx: number, dy: number) {
    this.azimuth -= dx * this.rotateSpeed
    this.elevation = THREE.MathUtils.clamp(this.elevation + dy * this.rotateSpeed, 0.3, Math.PI / 3)
  }

  resetToHome() {
    this.isReturningHome = true
    this.returnT = 0
    this.returnStartTarget.copy(this.target)
    this.returnStartDistance = this.distance
    this.returnStartAzimuth = this.azimuth
    this.returnStartElevation = this.elevation
  }

  private getTouchDistance(a: Touch, b: Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  getForward(): THREE.Vector3 {
    const f = new THREE.Vector3().subVectors(this.target, this.camera.position)
    f.y = 0
    return f.normalize()
  }

  getRight(): THREE.Vector3 {
    return new THREE.Vector3().crossVectors(this.getForward(), new THREE.Vector3(0, 1, 0)).normalize()
  }
}
