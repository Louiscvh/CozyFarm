import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { animateRotate, pushDeleteAction, historyStore } from "../store/HistoryStore"
import { getFootprint, isConnectableEntity, supportsManualRotation } from "../../game/entity/Entity"
import type { Entity } from "../../game/entity/Entity"
import { OutlineSystem } from "../../render/OutlineSystem"
import { Renderer } from "../../render/Renderer"
import { WorldPopup } from "./WorldPopup"
import { MarketPopup } from "./MarketPopup"
import { soundManager } from "../../game/system/SoundManager"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
}

function getEntityHitEntries(entities: THREE.Object3D[]) {
  return entities
    .map(entity => ({ entity, hitbox: entity.getObjectByName("__hitbox__") }))
    .filter((entry): entry is { entity: THREE.Object3D; hitbox: THREE.Object3D } => !!entry.hitbox)
}

function raycastEntityHitboxes(
  raycaster: THREE.Raycaster,
  hitEntries: Array<{ entity: THREE.Object3D; hitbox: THREE.Object3D }>,
) {
  const worldHitPoint = new THREE.Vector3()

  const hits = hitEntries
    .map((entry) => {
      entry.hitbox.updateWorldMatrix(true, false)

      const geometry = entry.hitbox as THREE.Mesh
      if (!geometry.geometry.boundingBox) {
        geometry.geometry.computeBoundingBox()
      }

      const localBox = geometry.geometry.boundingBox
      if (!localBox) return null

      const worldBox = localBox.clone().applyMatrix4(entry.hitbox.matrixWorld)
      const hitPoint = raycaster.ray.intersectBox(worldBox, worldHitPoint.clone())
      if (!hitPoint) return null

      return {
        entity: entry.entity,
        hitbox: entry.hitbox,
        distance: raycaster.ray.origin.distanceToSquared(hitPoint),
      }
    })
    .filter((hit): hit is { entity: THREE.Object3D; hitbox: THREE.Object3D; distance: number } => !!hit)
    .sort((a, b) => a.distance - b.distance)

  return hits[0] ?? null
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const [marketEntity, setMarketEntity] = useState<THREE.Object3D | null>(null)
  const targetRotY = useRef<number>(0)
  const rotRafRef = useRef<number>(0)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverPopup = useRef(false)
  const pendingEntityIdRef = useRef<string | null>(null)
  const pointerDownRef = useRef(false)
  const pointerDownPosRef = useRef({ x: 0, y: 0 })
  const pointerMovedRef = useRef(false)
  const marketCursorActiveRef = useRef(false)

  const HOVER_OPEN_DELAY_MS = 250
  const CLICK_DRAG_THRESHOLD_PX = 8

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

    const setMarketCursor = (enabled: boolean) => {
      const canvas = Renderer.instance?.renderer?.domElement
      if (!canvas) return
      if (enabled) {
        if (!marketCursorActiveRef.current) {
          canvas.style.cursor = "pointer"
          marketCursorActiveRef.current = true
        }
        return
      }

      if (marketCursorActiveRef.current) {
        canvas.style.cursor = "default"
        marketCursorActiveRef.current = false
      }
    }

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
      if (pointerDownRef.current) {
        const dx = e.clientX - pointerDownPosRef.current.x
        const dy = e.clientY - pointerDownPosRef.current.y
        if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) {
          pointerMovedRef.current = true
        }
      }

      const w = World.current
      if (!w || !w.camera) return
      if (placementStore.selectedItem) { setMarketCursor(false); cancelClose(); cancelOpen(); applyHoverTarget(null); setHoveredPopup(null); return }
      if (isOverPopup.current) { cancelClose(); return }

      const renderer = Renderer.instance?.renderer
      if (!renderer) return
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        setMarketCursor(false)
        if (pointerDownRef.current) return
        applyHoverTarget(null)
        return
      }

      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitEntries = getEntityHitEntries(w.entities)

      const owner = raycastEntityHitboxes(raycaster, hitEntries)?.entity ?? null

      if (!owner) {
        setMarketCursor(false)
        if (pointerDownRef.current) return
        applyHoverTarget(null)
        return
      }

      if (owner.userData.id === "market") {
        setMarketCursor(true)
        if (pointerDownRef.current) return
        OutlineSystem.instance?.setHovered(owner)
        cancelOpen()
        scheduleClose()
        return
      }

      setMarketCursor(false)
      applyHoverTarget(owner)
    }

    function onPointerDown(e: MouseEvent) {
      pointerDownRef.current = true
      pointerMovedRef.current = false
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY }
    }

    function onPointerUp() {
      pointerDownRef.current = false
    }

    function onClick(e: MouseEvent) {
      if (pointerMovedRef.current) {
        pointerMovedRef.current = false
        return
      }

      const w = World.current
      if (!w || !w.camera || placementStore.selectedItem) return

      const renderer = Renderer.instance?.renderer
      if (!renderer) return

      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return

      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, w.camera)

      const hitEntries = getEntityHitEntries(w.entities)
      const owner = raycastEntityHitboxes(raycaster, hitEntries)

      if (!owner || owner.entity.userData.id !== "market") {
        setMarketEntity(null)
        return
      }

      OutlineSystem.instance?.setHovered(owner.entity)
      setHoveredPopup(null)
      setMarketEntity(owner.entity)
      soundManager.playSuccess()
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
      setMarketCursor(false)
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

    w.connectableSystem.unregister(popup.entityObject)
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
    w.connectableSystem.unregister(e)
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
      w.connectableSystem.register(e)
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

    const isConnectable = isConnectableEntity(e.userData.def as Entity | undefined)
    const prevRotY = isConnectable
      ? ((e.userData.connectableVariantRotY as number | undefined) ?? 0)
      : (e.userData.isInstanced ? (e.userData.rotY ?? 0) : e.rotation.y)
    if (Math.abs(targetRotY.current - prevRotY) > 0.01) targetRotY.current = prevRotY
    const nextRotY = targetRotY.current + THREE.MathUtils.degToRad(90)
    targetRotY.current = nextRotY

    historyStore.push({ type: "rotate", entityObject: e, prevRotY, nextRotY })
    cancelAnimationFrame(rotRafRef.current)
    if (isConnectable) {
      e.userData.connectableVariantRotY = nextRotY
      w.connectableSystem.refreshEntity(e)
      return
    }
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
            {supportsManualRotation(hoveredPopup.entityObject.userData.def as Entity | undefined) && (
              <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>↻</UIButton>
            )}
            <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
          </>
        )}
      </WorldPopup>

      <MarketPopup
        open={!!marketEntity}
        marketEntity={marketEntity}
        onClose={() => setMarketEntity(null)}
      />
    </>
  )
}
