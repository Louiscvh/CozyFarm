import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { historyStore } from "../store/HistoryStore"
import { Renderer } from "../../render/Renderer"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
  screenPos: { x: number; y: number }
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const rotRafRef      = useRef<number>(0)
  const currentRotY    = useRef<number>(0)
  const targetRotY     = useRef<number>(0)
  const popupRef       = useRef<HTMLDivElement | null>(null)
  const closeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMouseEvent = useRef<{ clientX: number; clientY: number } | null>(null)

  // ← Source de vérité : la souris est-elle physiquement sur la popup ?
  // Mis à jour par onMouseEnter/onMouseLeave — jamais de faux négatif.
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
        if (isOverPopup.current) return current  // souris sur la popup → ne pas fermer

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

      // ← Vérification par ref — fiable même si le DOM n'est pas encore mis à jour
      if (isOverPopup.current) {
        cancelClose()
        return
      }

      const cam = w.camera
      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight)  * 2 + 1

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

  const handleDelete = (popup: PopupInfo) => {
    cancelClose()
    isOverPopup.current = false
    const w = World.current
    if (!w) return
    const e = popup.entityObject

    const cellX       = e.userData.cellX       as number
    const cellZ       = e.userData.cellZ       as number
    const sizeInCells = (e.userData.sizeInCells as number) ?? 1

    const occupiedCells: { x: number; z: number }[] = []
    for (let dx = 0; dx < sizeInCells; dx++)
      for (let dz = 0; dz < sizeInCells; dz++)
        occupiedCells.push({ x: cellX + dx, z: cellZ + dz })

    const startY     = e.position.y
    const startScale = e.scale.clone()
    const startRot   = e.rotation.clone()
    const duration   = 400
    const startTime  = performance.now()
    let cancelled    = false
    let rafId        = 0

    function cancelAnimation() { cancelled = true; cancelAnimationFrame(rafId) }

    historyStore.push({
      type: "delete", entityObject: e, occupiedCells, sizeInCells,
      savedHoveredCell: placementStore.hoveredCell, cancelAnimation,
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

  const handleRotate = (popup: PopupInfo) => {
    cancelClose()
    const e = popup.entityObject

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
      onMouseEnter={() => { isOverPopup.current = true;  cancelClose()     }}
      onMouseLeave={() => { isOverPopup.current = false; scheduleClose()   }}
      style={{
        position: "absolute",
        display: "flex",
        gap: "4px",
        left: hoveredPopup.screenPos.x,
        top:  hoveredPopup.screenPos.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>↻</UIButton>
      <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
    </div>
  )
}