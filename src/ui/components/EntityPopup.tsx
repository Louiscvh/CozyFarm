import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { historyStore } from "../store/HistoryStore"
import { Renderer } from "../../render/Renderer"
import type { Entity } from "../../game/entity/Entity"
import type { HistoryAction } from "../store/HistoryStore"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
  screenPos: { x: number; y: number }
}

// ─── Instanced appear animation ───────────────────────────────────────────────
function animateInstanceAppear(
  w: NonNullable<typeof World.current>,
  def: Entity,
  slot: number,
  worldPos: THREE.Vector3,
  rotY: number,
  originalY: number,
  proxy?: THREE.Object3D   // optional: kept in sync with the rising mesh
) {
  const duration  = 350
  const startTime = performance.now()
  const animPos   = worldPos.clone()

  // Start from invisible / below ground
  w.instanceManager.show(def, slot, worldPos, rotY)  // mark slot active
  w.instanceManager.setTransform(def, slot, worldPos, rotY, 0)

  function animateIn(now: number) {
    const t         = Math.min((now - startTime) / duration, 1)
    const ease      = 1 - Math.pow(1 - t, 3)
    const overshoot = Math.sin(t * Math.PI) * 0.2
    animPos.set(worldPos.x, (originalY - 2) + (2 * ease) + overshoot, worldPos.z)
    w.instanceManager.setTransform(def, slot, animPos, rotY, ease)
    if (proxy) proxy.position.copy(animPos)   // keep hitbox in sync with rising mesh
    if (t < 1) {
      requestAnimationFrame(animateIn)
    } else {
      animPos.y = originalY
      w.instanceManager.setTransform(def, slot, animPos, rotY, 1)
      if (proxy) proxy.position.set(worldPos.x, originalY, worldPos.z)
    }
  }
  requestAnimationFrame(animateIn)
}

// ─── Instanced remove animation ───────────────────────────────────────────────
function animateInstanceRemove(
  w: NonNullable<typeof World.current>,
  def: Entity,
  slot: number,
  worldPos: THREE.Vector3,
  rotY: number,
  proxy: THREE.Object3D
): () => void {
  const duration  = 400
  const startTime = performance.now()
  const animPos   = worldPos.clone()
  let   cancelled = false
  let   rafId     = 0

  function animate(now: number) {
    if (cancelled) return
    const t = Math.min((now - startTime) / duration, 1)
    animPos.set(
      worldPos.x,
      worldPos.y + Math.sin(t * Math.PI) * 0.3 + t * t * -3,
      worldPos.z
    )
    w.instanceManager.setTransform(def, slot, animPos, rotY, 1 - t * 0.9)
    proxy.position.copy(animPos)   // keep hitbox in sync with the falling mesh

    if (t < 1) {
      rafId = requestAnimationFrame(animate)
    } else {
      w.instanceManager.hide(def, slot)
      w.scene.remove(proxy)
    }
  }
  rafId = requestAnimationFrame(animate)
  return () => { cancelled = true; cancelAnimationFrame(rafId) }
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const rotRafRef      = useRef<number>(0)
  const currentRotY    = useRef<number>(0)
  const targetRotY     = useRef<number>(0)
  const popupRef       = useRef<HTMLDivElement | null>(null)
  const closeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMouseEvent = useRef<{ clientX: number; clientY: number } | null>(null)

  const isOverPopup = useRef(false)

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setHoveredPopup(null), 300)
  }

  useEffect(() => {
    const r = Renderer.instance
    if (!r) return

    const prev = r.cameraController.onUpdate
    r.cameraController.onUpdate = () => {
      const mouse = Renderer.instance!.mouse
      const w = World.current
      if (!w) return

      setHoveredPopup(current => {
        if (!current) return null
        if (!w.entities.includes(current.entityObject)) return null
        if (isOverPopup.current) return current

        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(mouse, w.camera)

        const hitbox = current.entityObject.getObjectByName("__hitbox__")
        if (!hitbox) return null

        const intersects = raycaster.intersectObject(hitbox, false)
        if (intersects.length === 0) return null

        const box = new THREE.Box3().setFromObject(hitbox)
        const topCenter = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y + 0.3,
          (box.min.z + box.max.z) / 2
        )
        topCenter.project(w.camera)

        const x = (topCenter.x + 1) / 2 * window.innerWidth
        const y = (-topCenter.y + 1) / 2 * window.innerHeight

        if (Math.abs(x - current.screenPos.x) < 0.5 && Math.abs(y - current.screenPos.y) < 0.5) return current
        return { ...current, screenPos: { x, y } }
      })
    }

    return () => { r.cameraController.onUpdate = prev }
  }, [])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function onMouseMove(e: MouseEvent) {
      lastMouseEvent.current = { clientX: e.clientX, clientY: e.clientY }

      const w = World.current
      if (!w || !w.camera) return

      if (placementStore.selectedItem) {
        cancelClose()
        setHoveredPopup(null)
        return
      }

      if (isOverPopup.current) {
        cancelClose()
        return
      }

      const cam = w.camera
      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1

      raycaster.setFromCamera(mouse, cam)

      const hitboxes: THREE.Object3D[] = []
      for (const entity of w.entities) {
        const hitbox = entity.getObjectByName("__hitbox__")
        if (hitbox) hitboxes.push(hitbox)
      }

      const intersects = raycaster.intersectObjects(hitboxes, false)

      if (intersects.length > 0) {
        const hit    = intersects[0].object
        const entity = hit.parent!

        const box = new THREE.Box3().setFromObject(hit)
        const topCenter = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y + 0.3,
          (box.min.z + box.max.z) / 2
        )
        topCenter.project(cam)

        const x = (topCenter.x + 1) / 2 * window.innerWidth
        const y = (-topCenter.y + 1) / 2 * window.innerHeight

        cancelClose()
        setHoveredPopup({ entityObject: entity, id: entity.uuid, screenPos: { x, y } })
        return
      }

      scheduleClose()
    }

    window.addEventListener("mousemove", onMouseMove)
    return () => { window.removeEventListener("mousemove", onMouseMove); cancelClose() }
  }, [])

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = (popup: PopupInfo) => {
    cancelClose()
    isOverPopup.current = false
    const w = World.current
    if (!w) return
    const e = popup.entityObject

    const cellX       = e.userData.cellX       as number
    const cellZ       = e.userData.cellZ       as number
    const sizeInCells = (e.userData.sizeInCells as number) ?? 1
    const savedHoveredCell = placementStore.hoveredCell

    const occupiedCells: { x: number; z: number }[] = []
    for (let dx = 0; dx < sizeInCells; dx++)
      for (let dz = 0; dz < sizeInCells; dz++)
        occupiedCells.push({ x: cellX + dx, z: cellZ + dz })

    // ── Instanced decor path ───────────────────────────────────────────────
    if (e.userData.isInstanced) {
      const def       = e.userData.def          as Entity
      const slot      = e.userData.instanceSlot as number
      const worldPos  = e.position.clone()
      const rotY      = (e.userData.rotY as number) ?? 0
      const originalY = worldPos.y

      w.entities = w.entities.filter(en => en !== e)
      occupiedCells.forEach(c => w.tilesFactory.markFree(c.x, c.z, 1))
      placementStore.hoveredCell = null
      placementStore.canPlace    = true
      setHoveredPopup(null)

      // Build the action object first so callbacks can mutate cancelAnimation on it.
      // TypeScript requires the object to be fully initialised before we reference it,
      // so we use a typed intermediate variable.
      const action = {
        type            : "delete" as const,
        entityObject    : e,
        occupiedCells,
        sizeInCells,
        savedHoveredCell,
        // cancelAnimation is overwritten immediately below
        cancelAnimation : () => {},
        originalY,
        originalScale   : new THREE.Vector3(1, 1, 1),
        originalRotation: new THREE.Euler(0, rotY, 0),

        onRestore: (_w: NonNullable<typeof World.current>) => {
          // Cancel any in-progress remove animation first
          action.cancelAnimation()
          // proxy.position was mutated by the fall animation — the appear
          // animation will move it back progressively (no instant jump)
          e.position.set(worldPos.x, originalY - 2, worldPos.z)
          animateInstanceAppear(_w, def, slot, worldPos, rotY, originalY, e)
        },

        onRemove: (_w: NonNullable<typeof World.current>) => {
          // Start a new remove animation and store its cancel handle
          // so a subsequent undo can cancel it mid-flight
          action.cancelAnimation = animateInstanceRemove(_w, def, slot, worldPos, rotY, e)
        },
      } satisfies HistoryAction

      // Kick off the initial delete animation
      action.cancelAnimation = animateInstanceRemove(w, def, slot, worldPos, rotY, e)

      historyStore.push(action)
      return
    }

    // ── Standard (full-mesh) path ─────────────────────────────────────────
    const startY     = e.position.y
    const startScale = e.scale.clone()
    const startRot   = e.rotation.clone()
    const duration   = 400
    const startTime  = performance.now()
    let   cancelled  = false
    let   rafId      = 0

    function cancelAnimation() { cancelled = true; cancelAnimationFrame(rafId) }

    historyStore.push({
      type: "delete", entityObject: e, occupiedCells, sizeInCells,
      savedHoveredCell, cancelAnimation,
      originalY: startY, originalScale: startScale, originalRotation: startRot,
    })

    w.entities = w.entities.filter(en => en !== e)
    occupiedCells.forEach(c => w.tilesFactory.markFree(c.x, c.z, 1))
    placementStore.hoveredCell = null
    placementStore.canPlace    = true
    setHoveredPopup(null)

    function animate(now: number) {
      if (cancelled) return
      const t = Math.min((now - startTime) / duration, 1)
      e.position.y = startY + Math.sin(t * Math.PI) * 0.3 + t * t * -3
      e.scale.setScalar(startScale.x * (1 - t * 0.7))
      if (t < 1) rafId = requestAnimationFrame(animate)
      else w?.scene.remove(e)
    }
    rafId = requestAnimationFrame(animate)
  }

  // ─── Rotate ───────────────────────────────────────────────────────────────

  const handleRotate = (popup: PopupInfo) => {
    cancelClose()
    const e = popup.entityObject
    const w = World.current

    // ── Instanced decor path ───────────────────────────────────────────────
    if (e.userData.isInstanced && w) {
      const def      = e.userData.def          as Entity
      const slot     = e.userData.instanceSlot as number
      const worldPos = e.position.clone()
      const curRot   = (e.userData.rotY as number) ?? 0

      if (Math.abs(targetRotY.current - curRot) > 0.01) {
        currentRotY.current = curRot
        targetRotY.current  = curRot
      }

      targetRotY.current += THREE.MathUtils.degToRad(90)

      cancelAnimationFrame(rotRafRef.current)
      const animateRot = () => {
        currentRotY.current += (targetRotY.current - currentRotY.current) * 0.3
        w.instanceManager.setTransform(def, slot, worldPos, currentRotY.current)
        e.userData.rotY  = currentRotY.current
        e.rotation.y     = currentRotY.current   // keeps proxy (hitbox) in sync

        if (Math.abs(targetRotY.current - currentRotY.current) > 0.001) {
          rotRafRef.current = requestAnimationFrame(animateRot)
        } else {
          w.instanceManager.setTransform(def, slot, worldPos, targetRotY.current)
          e.userData.rotY = targetRotY.current
          e.rotation.y    = targetRotY.current   // final snap
        }
      }
      animateRot()
      return
    }

    // ── Standard (full-mesh) path ─────────────────────────────────────────
    if (Math.abs(targetRotY.current - e.rotation.y) > 0.01) {
      currentRotY.current = e.rotation.y
      targetRotY.current  = e.rotation.y
    }

    targetRotY.current += THREE.MathUtils.degToRad(90)

    cancelAnimationFrame(rotRafRef.current)
    function animateRot() {
      currentRotY.current += (targetRotY.current - currentRotY.current) * 0.3
      e.rotation.y = currentRotY.current
      if (Math.abs(targetRotY.current - currentRotY.current) > 0.001)
        rotRafRef.current = requestAnimationFrame(animateRot)
      else e.rotation.y = targetRotY.current
    }
    animateRot()
  }

  if (!hoveredPopup) return null

  return (
    <div
      className="entity-popup"
      ref={popupRef}
      onMouseEnter={() => {
        isOverPopup.current = true
        cancelClose()
      }}
      onMouseLeave={() => {
        isOverPopup.current = false
        scheduleClose()
      }}
      style={{
        position : "absolute",
        display  : "flex",
        gap      : "4px",
        left     : hoveredPopup.screenPos.x,
        top      : hoveredPopup.screenPos.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="entity-popup-bridge" />

      <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>
        ↻
      </UIButton>

      <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>
        🗑️
      </UIButton>
    </div>
  )
}