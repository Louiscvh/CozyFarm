import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"
import { historyStore } from "../store/HistoryStore"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
  screenPos: { x: number; y: number }
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const rotRafRef   = useRef<number>(0)
  const currentRotY = useRef<number>(0)
  const targetRotY  = useRef<number>(0)
  const popupRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function onMouseMove(e: MouseEvent) {
      const w = World.current
      if (!w || !w.camera) return
      const cam = w.camera
    
      if (placementStore.selectedItem) {
        setHoveredPopup(null)
        return
      }
    
      // 🔥 Priorité absolue à la popup — si on est dessus, on ne fait rien
      if (popupRef.current) {
        const rect = popupRef.current.getBoundingClientRect()
        const inside =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        if (inside) return
      }
    
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    
      raycaster.setFromCamera(mouse, cam)
    
      const hitboxes: THREE.Object3D[] = []
      for (const entity of w.entities) {
        const hitbox = entity.getObjectByName("__hitbox__")
        if (hitbox) hitboxes.push(hitbox)
      }
    
      const intersects = raycaster.intersectObjects(hitboxes, false)
    
      if (intersects.length > 0) {
        const hit = intersects[0].object
        const entity = hit.parent!
    
        const box = new THREE.Box3().setFromObject(hit)
        const topCenter = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y,
          (box.min.z + box.max.z) / 2
        )
        topCenter.y += 0.3
        topCenter.project(cam)
    
        const x = (topCenter.x + 1) / 2 * window.innerWidth
        const y = (-topCenter.y + 1) / 2 * window.innerHeight
    
        setHoveredPopup({ entityObject: entity, id: entity.uuid, screenPos: { x, y } })
        return
      }
    
      setHoveredPopup(null)
    }


    window.addEventListener("mousemove", onMouseMove)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
    }
  }, [])

  const handleDelete = (popup: PopupInfo) => {
    const w = World.current
    if (!w) return
    const e = popup.entityObject

    const tileX    = e.userData.tileX    as number
    const tileZ    = e.userData.tileZ    as number
    const tileSize = (e.userData.tileSize as number) ?? 1

    const occupiedTiles: { x: number; z: number; size: number }[] = []
    for (let dx = 0; dx < tileSize; dx++) {
      for (let dz = 0; dz < tileSize; dz++) {
        occupiedTiles.push({ x: tileX + dx, z: tileZ + dz, size: 1 })
      }
    }

    const startY     = e.position.y
    const startScale = e.scale.clone()
    const startRot   = e.rotation.clone()
    const duration   = 400
    const startTime  = performance.now()
    let   cancelled  = false
    let   rafId      = 0

    function cancelAnimation() {
      cancelled = true
      cancelAnimationFrame(rafId)
    }

    historyStore.push({
      type: "delete",
      entityObject: e,
      occupiedTiles,
      savedHoveredTile: placementStore.hoveredTile,
      cancelAnimation,
      originalY: startY,
      originalScale: startScale,
      originalRotation: startRot,
    })

    w.entities = w.entities.filter(en => en !== e)
    occupiedTiles.forEach(t => w.tilesFactory.markFree(t.x, t.z, t.size))
    placementStore.hoveredTile = null
    placementStore.canPlace = true
    setHoveredPopup(null)

    function animate(now: number) {
      if (cancelled) return
      const t = Math.min((now - startTime) / duration, 1)
      e.position.y = startY + Math.sin(t * Math.PI) * 0.3 + t * t * -3
      e.scale.setScalar(startScale.x * (1 - t * 0.7))
      if (t < 1) {
        rafId = requestAnimationFrame(animate)
      } else {
        w?.scene.remove(e)
      }
    }

    rafId = requestAnimationFrame(animate)
  }

  const handleRotate = (popup: PopupInfo) => {
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
      if (Math.abs(targetRotY.current - currentRotY.current) > 0.001) {
        rotRafRef.current = requestAnimationFrame(animateRot)
      } else {
        e.rotation.y = targetRotY.current
      }
    }
    animateRot()
  }

  if (!hoveredPopup) return null

  return (
    <div
      className="entity-popup"
      ref={popupRef}
      style={{
        position: "absolute",
        display: "flex",
        gap: '4px',
        left: hoveredPopup.screenPos.x,
        top: hoveredPopup.screenPos.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <UIButton className="rotate-btn" onClick={() => handleRotate(hoveredPopup)}>↻</UIButton>
      <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
    </div>
  )
}