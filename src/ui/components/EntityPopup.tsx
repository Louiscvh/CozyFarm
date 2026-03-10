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
import { OutlineSystem } from "../../render/OutlineSystem"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
  screenPos: { x: number; y: number }
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const hoveredPopupRef = useRef<PopupInfo | null>(null)
  const targetRotY  = useRef<number>(0)
  const rotRafRef   = useRef<number>(0)
  const popupRef    = useRef<HTMLDivElement | null>(null)
  const closeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverPopup = useRef(false)
  const pendingEntityIdRef = useRef<string | null>(null)
  const pointerNdcRef = useRef(new THREE.Vector2())
  const pointerReadyRef = useRef(false)

  const HOVER_OPEN_DELAY_MS = 250
  const FOLLOW_SMOOTHING = 0.34

  const getEntityTopScreenPos = (entityObject: THREE.Object3D, camera: THREE.Camera) => {
    const hitbox = entityObject.getObjectByName("__hitbox__")
    if (!hitbox) return null

    const box = new THREE.Box3().setFromObject(hitbox)
    const topCenter = new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      box.max.y + 0.3,
      (box.min.z + box.max.z) / 2,
    ).project(camera)

    return {
      x: (topCenter.x + 1) / 2 * window.innerWidth,
      y: (-topCenter.y + 1) / 2 * window.innerHeight,
    }
  }

  const smoothScreenPos = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => ({
    x: THREE.MathUtils.lerp(from.x, to.x, FOLLOW_SMOOTHING),
    y: THREE.MathUtils.lerp(from.y, to.y, FOLLOW_SMOOTHING),
  })

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
    if (hoveredPopupRef.current?.id === popup.id) {
      cancelOpen()
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
    hoveredPopupRef.current = hoveredPopup
  }, [hoveredPopup])


  useEffect(() => {
    const r = Renderer.instance
    if (!r) return
    const prev = r.cameraController.onUpdate

    r.cameraController.onUpdate = () => {
      prev?.()
      const w = World.current
      if (!w || !pointerReadyRef.current) return

      const mouse = pointerNdcRef.current
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, w.camera)

      const hitboxes = w.entities
        .map(en => en.getObjectByName("__hitbox__"))
        .filter(Boolean) as THREE.Object3D[]
      const intersects = raycaster.intersectObjects(hitboxes, false)

      if (intersects.length > 0) {
        const entity = intersects[0].object.parent!
        OutlineSystem.instance?.setHovered(entity)
      } else if (!isOverPopup.current) {
        OutlineSystem.instance?.setHovered(null)
      }

      setHoveredPopup(current => {
        if (!current) return null
        if (!w.entities.includes(current.entityObject)) return null
        if (isOverPopup.current) return current

        const hitbox = current.entityObject.getObjectByName("__hitbox__")
        if (!hitbox) return null
        if (raycaster.intersectObject(hitbox, false).length === 0) return null

        const targetPos = getEntityTopScreenPos(current.entityObject, w.camera)
        if (!targetPos) return null
        const { x, y } = smoothScreenPos(current.screenPos, targetPos)
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
      if (placementStore.selectedItem) { cancelClose(); cancelOpen(); OutlineSystem.instance?.setHovered(null); setHoveredPopup(null); return }
      if (isOverPopup.current)         { cancelClose(); return }

      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      pointerNdcRef.current.copy(mouse)
      pointerReadyRef.current = true
      raycaster.setFromCamera(mouse, w.camera)

      const hitboxes = w.entities
        .map(en => en.getObjectByName("__hitbox__"))
        .filter(Boolean) as THREE.Object3D[]
      const intersects = raycaster.intersectObjects(hitboxes, false)

      if (intersects.length === 0) {
        OutlineSystem.instance?.setHovered(null)
        cancelOpen(); scheduleClose(); return
      }

      const entity = intersects[0].object.parent!
      OutlineSystem.instance?.setHovered(entity)
      const topScreenPos = getEntityTopScreenPos(entity, w.camera)
      if (!topScreenPos) return

      cancelClose()
      scheduleOpen({
        entityObject: entity,
        id          : entity.uuid,
        screenPos   : topScreenPos,
      })
    }

    window.addEventListener("mousemove", onMouseMove)
    return () => { window.removeEventListener("mousemove", onMouseMove); cancelClose(); cancelOpen(); OutlineSystem.instance?.setHovered(null) }
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
    const e           = popup.entityObject
    const def         = e.userData.def as Entity
    const cellX       = e.userData.cellX as number
    const cellZ       = e.userData.cellZ as number

    // Derive footprint from the definition — never rely solely on userData.sizeInCells
    const sizeInCells = getFootprint(def)

    if (!def || cellX === undefined || cellZ === undefined) return

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
