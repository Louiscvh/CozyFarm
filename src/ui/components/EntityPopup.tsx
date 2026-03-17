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
import { Renderer } from "../../render/Renderer"
import { WorldPopup } from "./WorldPopup"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const targetRotY = useRef<number>(0)
  const rotRafRef = useRef<number>(0)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverPopup = useRef(false)
  const pendingEntityIdRef = useRef<string | null>(null)
  const pointerDownRef = useRef(false)

  const HOVER_OPEN_DELAY_MS = 250

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

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const applyHoverTarget = (target: THREE.Object3D | null) => {
      OutlineSystem.instance?.setHovered(target)

      if (!target) {
        cancelOpen()
        scheduleClose()
        return
      }

      cancelClose()
      scheduleOpen({
        entityObject: target,
        id: target.uuid,
      })
    }

    function onMouseMove(e: MouseEvent) {
      const w = World.current
      if (!w || !w.camera) return
      if (placementStore.selectedItem) { cancelClose(); cancelOpen(); applyHoverTarget(null); setHoveredPopup(null); return }
      if (isOverPopup.current) { cancelClose(); return }

      const renderer = Renderer.instance?.renderer
      if (!renderer) return
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        if (pointerDownRef.current) return
        applyHoverTarget(null)
        return
      }

      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitEntries = w.entities
        .map(entity => ({ entity, hitbox: entity.getObjectByName("__hitbox__") }))
        .filter((entry): entry is { entity: THREE.Object3D; hitbox: THREE.Object3D } => !!entry.hitbox)

      const ownerByHitbox = new Map(hitEntries.map(entry => [entry.hitbox, entry.entity]))
      const intersections = raycaster.intersectObjects(hitEntries.map(entry => entry.hitbox), true)

      let owner: THREE.Object3D | null = null
      for (const intersection of intersections) {
        let node: THREE.Object3D | null = intersection.object
        while (node) {
          const found = ownerByHitbox.get(node)
          if (found) {
            owner = found
            break
          }
          node = node.parent
        }
        if (owner) break
      }

      if (!owner) {
        if (pointerDownRef.current) return
        applyHoverTarget(null)
        return
      }

      applyHoverTarget(owner)
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
      applyHoverTarget(null)
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleDelete = (popup: PopupInfo) => {
    cancelClose()
    cancelOpen()
    isOverPopup.current = false
    const w = World.current
    if (!w) return

    const savedHoveredCell = placementStore.hoveredCell
    placementStore.hoveredCell = null
    placementStore.canPlace = true
    setHoveredPopup(null)
    OutlineSystem.instance?.setHovered(null)

    pushDeleteAction(w, popup.entityObject, savedHoveredCell)
  }

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

    const sizeInCells = getFootprint(def) || (e.userData.sizeInCells as number) || 1

    const originalPos = e.position.clone()
    const originalRotY = e.userData.isInstanced ? (e.userData.rotY ?? 0) : e.rotation.y

    w.entities = w.entities.filter(en => en !== e)
    w.tilesFactory.markFree(cellX, cellZ, sizeInCells)

    if (e.userData.isInstanced) w.instanceManager.hide(def, e.userData.instanceSlot)
    w.scene.remove(e)

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

  return (
    <WorldPopup
      open={!!hoveredPopup}
      anchorObject={hoveredPopup?.entityObject ?? null}
      onClose={() => setHoveredPopup(null)}
      anchorResolver={(entityObject) => {
        const w = World.current
        if (!w || !w.entities.includes(entityObject)) return null
        return entityObject.getObjectByName("__hitbox__") ?? null
      }}
      className="entity-popup"
      style={{ display: "flex", gap: "4px" }}
      onMouseEnter={() => { isOverPopup.current = true; cancelClose() }}
      onMouseLeave={() => { isOverPopup.current = false; scheduleClose() }}
    >
      {!!hoveredPopup && (
        <>
          <div className="entity-popup-bridge" />
          <UIButton className="move-btn" onClick={() => handleMove(hoveredPopup)}>✥</UIButton>
          <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>↻</UIButton>
          <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
        </>
      )}
    </WorldPopup>
  )
}
