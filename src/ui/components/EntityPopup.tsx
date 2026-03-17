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
import { WorldPopup } from "./WorldPopup"
import { MarketPopup } from "./MarketPopup"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const [marketCell, setMarketCell] = useState<{ cellX: number; cellZ: number } | null>(null)
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

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function onMouseMove(e: MouseEvent) {
      const w = World.current
      if (!w || !w.camera) return
      if (placementStore.selectedItem) { cancelClose(); cancelOpen(); OutlineSystem.instance?.setHovered(null); setHoveredPopup(null); return }
      if (isOverPopup.current) { cancelClose(); return }

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitEntries = w.entities
        .map(entity => ({ entity, hitbox: entity.getObjectByName("__hitbox__") }))
        .filter((entry): entry is { entity: THREE.Object3D; hitbox: THREE.Object3D } => !!entry.hitbox)

      const intersects = raycaster.intersectObjects(hitEntries.map(entry => entry.hitbox), true)

      if (intersects.length === 0) {
        if (pointerDownRef.current) return
        OutlineSystem.instance?.setHovered(null)
        cancelOpen(); scheduleClose(); return
      }

      const hitObject = intersects[0].object
      const owner = hitEntries.find(entry => {
        let node: THREE.Object3D | null = hitObject
        while (node) {
          if (node === entry.hitbox) return true
          node = node.parent
        }
        return false
      })

      if (!owner) {
        OutlineSystem.instance?.setHovered(null)
        cancelOpen(); scheduleClose(); return
      }

      OutlineSystem.instance?.setHovered(owner.entity)

      cancelClose()
      scheduleOpen({
        entityObject: owner.entity,
        id: owner.entity.uuid,
      })
    }

    function onPointerDown() {
      pointerDownRef.current = true
    }

    function onPointerUp() {
      pointerDownRef.current = false
    }

    function onClick(e: MouseEvent) {
      const w = World.current
      if (!w || !w.camera || placementStore.selectedItem) return

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitEntries = w.entities
        .map(entity => ({ entity, hitbox: entity.getObjectByName("__hitbox__") }))
        .filter((entry): entry is { entity: THREE.Object3D; hitbox: THREE.Object3D } => !!entry.hitbox)

      const intersects = raycaster.intersectObjects(hitEntries.map(entry => entry.hitbox), true)
      if (intersects.length === 0) return

      const hitObject = intersects[0].object
      const owner = hitEntries.find(entry => {
        let node: THREE.Object3D | null = hitObject
        while (node) {
          if (node === entry.hitbox) return true
          node = node.parent
        }
        return false
      })

      if (!owner || owner.entity.userData.id !== "market") return

      setMarketCell({
        cellX: owner.entity.userData.cellX as number,
        cellZ: owner.entity.userData.cellZ as number,
      })
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("mouseup", onPointerUp)
    window.addEventListener("click", onClick)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("mouseup", onPointerUp)
      window.removeEventListener("click", onClick)
      cancelClose()
      cancelOpen()
      OutlineSystem.instance?.setHovered(null)
    }
  }, [])

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
    <>
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

      <MarketPopup
        open={!!marketCell}
        marketCell={marketCell}
        onClose={() => setMarketCell(null)}
      />
    </>
  )
}
