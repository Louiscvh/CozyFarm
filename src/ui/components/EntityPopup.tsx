import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { animateRotate, pushDeleteAction, historyStore } from "../store/HistoryStore"
import { Renderer } from "../../render/Renderer"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
  screenPos: { x: number; y: number }
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const targetRotY  = useRef<number>(0)
  const rotRafRef   = useRef<number>(0)
  const popupRef    = useRef<HTMLDivElement | null>(null)
  const closeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        if (raycaster.intersectObject(hitbox, false).length === 0) return null

        const box = new THREE.Box3().setFromObject(hitbox)
        const topCenter = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y + 0.3,
          (box.min.z + box.max.z) / 2
        ).project(w.camera)

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
    const mouse     = new THREE.Vector2()

    function onMouseMove(e: MouseEvent) {
      const w = World.current
      if (!w || !w.camera) return

      if (placementStore.selectedItem) { cancelClose(); setHoveredPopup(null); return }
      if (isOverPopup.current)         { cancelClose(); return }

      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitboxes = w.entities
        .map(en => en.getObjectByName("__hitbox__"))
        .filter(Boolean) as THREE.Object3D[]

      const intersects = raycaster.intersectObjects(hitboxes, false)

      if (intersects.length === 0) { scheduleClose(); return }

      const hit    = intersects[0].object
      const entity = hit.parent!
      const box    = new THREE.Box3().setFromObject(hit)
      const topCenter = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.max.y + 0.3,
        (box.min.z + box.max.z) / 2
      ).project(w.camera)

      const x = (topCenter.x + 1) / 2 * window.innerWidth
      const y = (-topCenter.y + 1) / 2 * window.innerHeight

      cancelClose()
      setHoveredPopup({ entityObject: entity, id: entity.uuid, screenPos: { x, y } })
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

    const savedHoveredCell = placementStore.hoveredCell
    placementStore.hoveredCell = null
    placementStore.canPlace    = true
    setHoveredPopup(null)

    pushDeleteAction(w, popup.entityObject, savedHoveredCell)
  }

  // ─── Rotate ───────────────────────────────────────────────────────────────

  const handleRotate = (popup: PopupInfo) => {
    cancelClose()
    const e = popup.entityObject
    const w = World.current
    if (!w) return

    const prevRotY = e.userData.isInstanced ? (e.userData.rotY ?? 0) : e.rotation.y

    if (Math.abs(targetRotY.current - prevRotY) > 0.01) targetRotY.current = prevRotY
    const nextRotY = targetRotY.current + THREE.MathUtils.degToRad(90)
    targetRotY.current = nextRotY

    historyStore.push({ type: "rotate", entityObject: e, prevRotY, nextRotY })

    cancelAnimationFrame(rotRafRef.current)
    animateRotate(w, e, nextRotY)
  }

  if (!hoveredPopup) return null

  return (
    <div
      className="entity-popup"
      ref={popupRef}
      onMouseEnter={() => { isOverPopup.current = true;  cancelClose()   }}
      onMouseLeave={() => { isOverPopup.current = false; scheduleClose() }}
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
      <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>↻</UIButton>
      <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
    </div>
  )
}