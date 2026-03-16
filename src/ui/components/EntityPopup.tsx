import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { animateRotate, pushDeleteAction, historyStore } from "../store/HistoryStore"
import { getFootprint } from "../../game/entity/Entity"
import type { Entity } from "../../game/entity/Entity"
import { OutlineSystem } from "../../render/OutlineSystem"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const targetRotY  = useRef<number>(0)
  const rotRafRef   = useRef<number>(0)
  const popupRef    = useRef<HTMLDivElement | null>(null)
  const closeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverPopup = useRef(false)
  const pendingEntityIdRef = useRef<string | null>(null)
  const pointerDownRef = useRef(false)
  const currentPosRef = useRef<{ x: number; y: number } | null>(null)
  const targetPosRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number>(0)

  const HOVER_OPEN_DELAY_MS = 250
  const POPUP_LERP = 0.22

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setHoveredPopup(null), 300)
  }

  const cancelOpen = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    pendingEntityIdRef.current = null
  }

  const scheduleOpen = (popup: PopupInfo) => {
    if (hoveredPopup?.id === popup.id) {
      cancelOpen()
      setHoveredPopup(popup)
      return
    }

    if (pendingEntityIdRef.current === popup.id && openTimer.current) return

    cancelOpen()
    pendingEntityIdRef.current = popup.id
    openTimer.current = setTimeout(() => {
      setHoveredPopup(popup)
      openTimer.current = null
      pendingEntityIdRef.current = null
    }, HOVER_OPEN_DELAY_MS)
  }


  useEffect(() => {
    const updatePopupPosition = () => {
      const w = World.current
      const popup = hoveredPopup

      if (!w || !popup) {
        rafRef.current = requestAnimationFrame(updatePopupPosition)
        return
      }

      const hitbox = popup.entityObject.getObjectByName("__hitbox__")
      if (!hitbox || !w.entities.includes(popup.entityObject)) {
        setHoveredPopup(null)
        rafRef.current = requestAnimationFrame(updatePopupPosition)
        return
      }

      const box = new THREE.Box3().setFromObject(hitbox)
      const topCenter = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.max.y + 0.3,
        (box.min.z + box.max.z) / 2,
      ).project(w.camera)

      targetPosRef.current = {
        x: (topCenter.x + 1) / 2 * window.innerWidth,
        y: (-topCenter.y + 1) / 2 * window.innerHeight,
      }

      if (!currentPosRef.current || !targetPosRef.current) {
        currentPosRef.current = targetPosRef.current
      } else {
        currentPosRef.current = {
          x: THREE.MathUtils.lerp(currentPosRef.current.x, targetPosRef.current.x, POPUP_LERP),
          y: THREE.MathUtils.lerp(currentPosRef.current.y, targetPosRef.current.y, POPUP_LERP),
        }
      }

      if (popupRef.current && currentPosRef.current) {
        popupRef.current.style.left = `${currentPosRef.current.x}px`
        popupRef.current.style.top = `${currentPosRef.current.y}px`
      }

      rafRef.current = requestAnimationFrame(updatePopupPosition)
    }

    if (hoveredPopup && popupRef.current && targetPosRef.current) {
      popupRef.current.style.left = `${targetPosRef.current.x}px`
      popupRef.current.style.top = `${targetPosRef.current.y}px`
    }

    rafRef.current = requestAnimationFrame(updatePopupPosition)
    return () => cancelAnimationFrame(rafRef.current)
  }, [hoveredPopup])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const mouse     = new THREE.Vector2()

    function onMouseMove(e: MouseEvent) {
      const w = World.current
      if (!w || !w.camera) return
      if (placementStore.selectedItem) { cancelClose(); cancelOpen(); OutlineSystem.instance?.setHovered(null); setHoveredPopup(null); return }
      if (isOverPopup.current)         { cancelClose(); return }

      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitboxes = w.entities
        .map(en => en.getObjectByName("__hitbox__"))
        .filter(Boolean) as THREE.Object3D[]
      const intersects = raycaster.intersectObjects(hitboxes, false)

      if (intersects.length === 0) {
        if (pointerDownRef.current) return
        OutlineSystem.instance?.setHovered(null)
        cancelOpen(); scheduleClose(); return
      }

      const entity = intersects[0].object.parent!
      OutlineSystem.instance?.setHovered(entity)
      const box    = new THREE.Box3().setFromObject(intersects[0].object)
      const topCenter = new THREE.Vector3(
        (box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2
      ).project(w.camera)

      cancelClose()
      scheduleOpen({
        entityObject: entity,
        id          : entity.uuid,
      })

      targetPosRef.current = {
        x: (topCenter.x + 1) / 2 * window.innerWidth,
        y: (-topCenter.y + 1) / 2 * window.innerHeight,
      }
      if (!currentPosRef.current) currentPosRef.current = targetPosRef.current
    }

    function onPointerDown() {
      pointerDownRef.current = true
    }

    function onPointerUp() {
      pointerDownRef.current = false
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("mouseup", onPointerUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("mouseup", onPointerUp)
      cancelClose()
      cancelOpen()
      OutlineSystem.instance?.setHovered(null)
    }
  }, [])

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = (popup: PopupInfo) => {
    cancelClose()
    cancelOpen()
    isOverPopup.current = false
    const w = World.current
    if (!w) return

    const savedHoveredCell = placementStore.hoveredCell
    placementStore.hoveredCell = null
    placementStore.canPlace    = true
    setHoveredPopup(null)
    OutlineSystem.instance?.setHovered(null)

    pushDeleteAction(w, popup.entityObject, savedHoveredCell)
  }

  // ─── Move ─────────────────────────────────────────────────────────────────

  const handleMove = (popup: PopupInfo) => {
    cancelClose()
    cancelOpen()
    isOverPopup.current = false
    setHoveredPopup(null)
    OutlineSystem.instance?.setHovered(null)
    const w = World.current
    if (!w) return
    const e = popup.entityObject
    const def = e.userData.def as Entity | undefined
    const cellX = e.userData.cellX as number | undefined
    const cellZ = e.userData.cellZ as number | undefined

    if (!def || cellX === undefined || cellZ === undefined) return

    // Fall back to runtime footprint if definition is incomplete
    const sizeInCells = getFootprint(def) || (e.userData.sizeInCells as number) || 1

    const originalPos  = e.position.clone()
    const originalRotY = e.userData.isInstanced ? (e.userData.rotY ?? 0) : e.rotation.y
  
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
    cancelOpen()
    OutlineSystem.instance?.setHovered(null)
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
        left     : 0,
        top      : 0,
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
