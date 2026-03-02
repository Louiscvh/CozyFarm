// src/game/entity/EntityAnimation.ts
import * as THREE from "three"
import { World } from "../world/World"

type W = NonNullable<typeof World.current>

export function syncInstance(w: W, e: THREE.Object3D) {
  if (!e.userData.isInstanced) return
  w.instanceManager.setTransform(e.userData.def, e.userData.instanceSlot, e.position, e.userData.rotY ?? 0, e.scale.x)
}

export function animateRemove(w: W, e: THREE.Object3D): () => void {
  const startY     = e.position.y
  const startScale = e.scale.x
  const startTime  = performance.now()
  let cancelled    = false
  let rafId        = 0

  function animate(now: number) {
    if (cancelled) return
    const t = Math.min((now - startTime) / 400, 1)
    e.position.y = startY + Math.sin(t * Math.PI) * 0.3 + t * t * -3
    e.scale.setScalar(startScale * (1 - t * 0.7))
    syncInstance(w, e)
    if (t < 1) {
      rafId = requestAnimationFrame(animate)
    } else {
      if (e.userData.isInstanced) w.instanceManager.hide(e.userData.def, e.userData.instanceSlot)
      w.scene.remove(e)
    }
  }
  rafId = requestAnimationFrame(animate)
  return () => { cancelled = true; cancelAnimationFrame(rafId) }
}

export function animateAppear(
  w: W,
  en: THREE.Object3D,
  originalY: number,
  originalScale: THREE.Vector3,
  originalRotation: THREE.Euler
) {
  const startTime = performance.now()
  const fromScale = en.scale.x
  const fromY     = en.position.y
  en.rotation.copy(originalRotation)

  function animateIn(now: number) {
    const t    = Math.min((now - startTime) / 350, 1)
    const ease = 1 - Math.pow(1 - t, 3)
    en.scale.setScalar(fromScale + (originalScale.x - fromScale) * ease)
    en.position.y = fromY + (originalY - fromY) * ease + Math.sin(t * Math.PI) * 0.2
    syncInstance(w, en)
    if (t < 1) {
      requestAnimationFrame(animateIn)
    } else {
      en.scale.copy(originalScale)
      en.position.y = originalY
      syncInstance(w, en)
    }
  }
  requestAnimationFrame(animateIn)
}

export function animateRotate(w: W, e: THREE.Object3D, targetRotY: number): () => void {
  let current = e.userData.isInstanced ? (e.userData.rotY ?? 0) : e.rotation.y
  let rafId   = 0

  function applyRotation(rotY: number) {
    if (e.userData.isInstanced) {
      w.instanceManager.setTransform(e.userData.def, e.userData.instanceSlot, e.position, rotY)
      e.userData.rotY = rotY
    }
    e.rotation.y = rotY
  }

  function animate() {
    current += (targetRotY - current) * 0.3
    applyRotation(current)
    if (Math.abs(targetRotY - current) > 0.001) {
      rafId = requestAnimationFrame(animate)
    } else {
      applyRotation(targetRotY)
    }
  }
  animate()
  return () => cancelAnimationFrame(rafId)
}