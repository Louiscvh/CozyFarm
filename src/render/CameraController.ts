// src/render/CameraController.ts
import * as THREE from "three"
import { Time } from "../game/core/Time"
import { KeyboardInput } from "../input/KeyboardInput"
import { MouseDrag } from "../input/MouseDrag"

export class CameraController {
  camera: THREE.OrthographicCamera
  target = new THREE.Vector3(0, 0, 0)

  // distance caméra (pour orthographic zoom)
  distance = 5         // distance actuelle
  targetDistance = 5   // distance cible pour easing
  zoomVelocity = 0
  zoomSpeed = 0.05     // ← vitesse du zoom, modifiable

  // rotation
  azimuth = Math.PI / 4
  elevation = Math.PI / 9

  // vitesse de déplacement / rotation
  moveSpeed = 1
  rotateSpeed = 0.005

  // easing
  zoomFriction = 0.85

  // --- limites du zoom ---
  minDistance = 3     
  maxDistance = 20

  // input
  keyboard: KeyboardInput
  mouseDrag: MouseDrag
  private pinchLastDistance: number | null = null

  // déplacement avec easing / inertie
  private moveVelocity = new THREE.Vector3()
  private moveFriction = 0.97

  // état "maison" (position/cible initiale)
  private homeTarget = new THREE.Vector3(0, 0, 0)
  private homeDistance = this.distance
  private homeAzimuth = this.azimuth
  private homeElevation = this.elevation

  // interpolation vers la maison
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

    // --- scroll zoom (desktop) ---
    window.addEventListener(
      "wheel",
      e => {
        e.preventDefault() // empêche scroll page

        let delta = e.deltaY
        delta *= 0.2 // normalisation petits trackpads / Magic Mouse

        this.zoomVelocity += delta * this.zoomSpeed
      },
      { passive: false }
    )

    // --- pinch zoom (mobile / tablette) ---
    window.addEventListener(
      "touchstart",
      e => {
        if (e.touches.length === 2) {
          const d = this.getTouchDistance(e.touches[0], e.touches[1])
          this.pinchLastDistance = d
        }
      },
      { passive: false }
    )

    window.addEventListener(
      "touchmove",
      e => {
        if (e.touches.length === 2 && this.pinchLastDistance !== null) {
          e.preventDefault()
          const d = this.getTouchDistance(e.touches[0], e.touches[1])
          const delta = this.pinchLastDistance - d
          // même logique que la molette : on influe sur la vélocité de zoom
          this.zoomVelocity += delta * this.zoomSpeed * 0.05
          this.pinchLastDistance = d
        }
      },
      { passive: false }
    )

    const endPinch = () => {
      this.pinchLastDistance = null
    }
    window.addEventListener("touchend", endPinch)
    window.addEventListener("touchcancel", endPinch)
  }

  // --- update par frame ---
  update() {
    // input souris (drag pour rotation)
    this.mouseDrag.update()

    const zoom = this.camera.zoom
    const minZoom = this.minDistance
    const maxZoom = this.maxDistance

    // écart marqué, mais un peu calmer en max
    const minSpeed = 4    // lent mais confortable quand on est collé au sol
    const maxSpeed = 32   // rapide mais contrôlable quand on est loin

    // interpolation non-linéaire (courbe douce) pour accentuer la différence
    const tLinear = THREE.MathUtils.clamp(
      (zoom - minZoom) / (maxZoom - minZoom),
      0,
      1
    )
    const t = tLinear * tLinear // plus on zoome, plus ça ralentit fort
    const speedPerSecond = maxSpeed + (minSpeed - maxSpeed) * t

    const forward = this.getForward()
    const right = this.getRight()

    const moveDir = new THREE.Vector3()
    if (this.keyboard.isDown("z")) moveDir.add(forward)
    if (this.keyboard.isDown("s")) moveDir.add(forward.clone().multiplyScalar(-1))
    if (this.keyboard.isDown("q")) moveDir.add(right.clone().multiplyScalar(-1))
    if (this.keyboard.isDown("d")) moveDir.add(right)

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize()
      // on pousse plus fort pour avoir une montée en vitesse plus vive
      const accel = speedPerSecond * Time.delta * 2
      this.moveVelocity.addScaledVector(moveDir, accel)
    }

    // friction / easing quand on relâche les touches
    this.moveVelocity.multiplyScalar(this.moveFriction)

    if (this.moveVelocity.lengthSq() > 0.0001) {
      // applique le mouvement en fonction de la vélocité
      this.target.addScaledVector(this.moveVelocity, Time.delta)
    }
    // easing de retour à la maison
    if (this.isReturningHome) {
      this.returnT = Math.min(1, this.returnT + 0.05)

      const t = this.returnT

      this.target.lerpVectors(this.returnStartTarget, this.homeTarget, t)
      this.distance = THREE.MathUtils.lerp(this.returnStartDistance, this.homeDistance, t)
      this.azimuth = THREE.MathUtils.lerp(this.returnStartAzimuth, this.homeAzimuth, t)
      this.elevation = THREE.MathUtils.lerp(this.returnStartElevation, this.homeElevation, t)

      if (this.returnT >= 1) {
        this.isReturningHome = false
      }
    }

    // zoom easing / inertia
    if (Math.abs(this.zoomVelocity) > 0.001) {
      this.targetDistance += this.zoomVelocity
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance,
        this.minDistance,
        this.maxDistance
      )
      this.zoomVelocity *= this.zoomFriction
    }

    // interpolation douce distance → targetDistance
    this.distance += (this.targetDistance - this.distance) * 0.2

    this.updateCamera()
  }

  // --- mise à jour de la position caméra ---
  updateCamera() {
    const x = this.target.x + Math.cos(this.elevation) * Math.sin(this.azimuth) * 20
    const y = this.target.y + Math.sin(this.elevation) * 25
    const z = this.target.z + Math.cos(this.elevation) * Math.cos(this.azimuth) * 20

    this.camera.position.set(x, y, z)
    this.camera.lookAt(this.target)

    // zoom orthographique
    this.camera.zoom = this.distance
    this.camera.updateProjectionMatrix()
  }

  // --- rotation drag ---
  rotate(dx: number, dy: number) {
    this.azimuth -= dx * this.rotateSpeed
    this.elevation += dy * this.rotateSpeed

    // clamp pour éviter que la caméra passe sous le sol
    // et limiter l'inclinaison vers le bas (sinon le monde est "croppé")
    this.elevation = THREE.MathUtils.clamp(
      this.elevation,
      0.3,          // angle minimum (vers l'horizon)
      Math.PI / 3   // angle maximum (≈ 60° vers le bas)
    )

    this.updateCamera()
  }

  // --- déplacement relatif caméra (ZQSD) ---
  moveByVector(vec: THREE.Vector3, amount: number) {
    this.target.addScaledVector(vec, amount)
    this.updateCamera()
  }

  // --- retour au point initial avec easing ---
  resetToHome() {
    this.isReturningHome = true
    this.returnT = 0

    this.returnStartTarget.copy(this.target)
    this.returnStartDistance = this.distance
    this.returnStartAzimuth = this.azimuth
    this.returnStartElevation = this.elevation
  }

  private getTouchDistance(a: Touch, b: Touch) {
    const dx = a.clientX - b.clientX
    const dy = a.clientY - b.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  // --- vecteur forward (projection XZ) ---
  getForward(): THREE.Vector3 {
    const forward = new THREE.Vector3().subVectors(this.target, this.camera.position)
    forward.y = 0
    return forward.normalize()
  }

  // --- vecteur droite (projection XZ) ---
  getRight(): THREE.Vector3 {
    return new THREE.Vector3().crossVectors(this.getForward(), new THREE.Vector3(0, 1, 0)).normalize()
  }
}