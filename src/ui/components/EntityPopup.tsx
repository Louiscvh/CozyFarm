import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { animateRotate, pushDeleteAction, historyStore } from "../store/HistoryStore"
import { Renderer } from "../../render/Renderer"
import { getFootprint } from "../../game/entity/Entity"
import type { Entity } from "../../game/entity/Entity"

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
          (box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2
        ).project(w.camera)

        const x = (topCenter.x + 1) / 2 * window.innerWidth
        const y = (-topCenter.y + 1) / 2 * window.innerHeight
        if (Math.abs(x - current.screenPos.x) < 0.5 && Math.abs(y - current.screenPos.y) < 0.5)
          return current
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

      const entity = intersects[0].object.parent!
      const box    = new THREE.Box3().setFromObject(intersects[0].object)
      const topCenter = new THREE.Vector3(
        (box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2
      ).project(w.camera)

      cancelClose()
      setHoveredPopup({
        entityObject: entity,
        id          : entity.uuid,
        screenPos   : {
          x: (topCenter.x + 1) / 2 * window.innerWidth,
          y: (-topCenter.y + 1) / 2 * window.innerHeight,
        },
      })
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

  // ─── Move ─────────────────────────────────────────────────────────────────

  const handleMove = (popup: PopupInfo) => {
    cancelClose()
    isOverPopup.current = false
    setHoveredPopup(null)
    const w = World.current
    if (!w) return
    const e           = popup.entityObject
    const def         = e.userData.def as Entity
    const cellX       = e.userData.cellX as number
    const cellZ       = e.userData.cellZ as number

    // Derive footprint from the definition — never rely solely on userData.sizeInCells
    const sizeInCells = getFootprint(def)

    if (!def || cellX === undefined || cellZ === undefined) return

    const originalPos  = e.position.clone()
    const originalRotY = e.userData.isInstanced ? (e.userData.rotY ?? 0) : e.rotation.y
    console.log(
      THREE.MathUtils.radToDeg(originalRotY), 
    );
    // Remove from world — hide visually but keep the Object3D alive
    w.entities = w.entities.filter(en => en !== e)
    // Free all cells occupied by this entity
    w.tilesFactory.markFree(cellX, cellZ, sizeInCells)

    // Always remove proxy from scene (removes hitbox too — prevents raycaster hits during move)
    if (e.userData.isInstanced) w.instanceManager.hide(def, e.userData.instanceSlot)
    w.scene.remove(e)

    // Called if the player presses Escape — restores everything
    const onCancel = () => {
      w.tilesFactory.markOccupied(cellX, cellZ, sizeInCells)
      e.userData.cellX = cellX
      e.userData.cellZ = cellZ
      e.position.copy(originalPos)
      e.rotation.y = originalRotY

      if (e.userData.isInstanced) {
        w.instanceManager.show(def, e.userData.instanceSlot, originalPos, originalRotY)
      }
      w.scene.add(e)
      w.entities.push(e)
    }

    placementStore.startMove(def, e, cellX, cellZ, originalRotY, onCancel)
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
      <UIButton className="move-btn"   onClick={() => handleMove(hoveredPopup)}>✥</UIButton>
      <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>↻</UIButton>
      <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
    </div>
  )
}