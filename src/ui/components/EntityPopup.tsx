import { useEffect, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./EntityPopup.css"
import { UIButton } from "./UIButton"
import { placementStore } from "../store/PlacementStore"

interface PopupInfo {
  entityObject: THREE.Object3D
  id: string
  screenPos: { x: number; y: number }
}

interface DeletedEntity {
  entityObject: THREE.Object3D
  occupiedTiles: { x: number; z: number; size: number }[]
}

export function EntityPopups() {
  const [hoveredPopup, setHoveredPopup] = useState<PopupInfo | null>(null)
  const deletedStack = useState<DeletedEntity[]>([])[0]

  useEffect(() => {
    const w = World.current
    if (!w || !w.camera) return
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function onMouseMove(e: MouseEvent) {
        const w2 = World.current
        if (!w2 || !w2.camera) return
        const cam = w2.camera
      
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      
        raycaster.setFromCamera(mouse, cam)
      
        const intersects = raycaster.intersectObjects(w2.entities, true)
        if (intersects.length > 0) {
          let target: THREE.Object3D = intersects[0].object
          while (target.parent && !w2.entities.includes(target)) target = target.parent
      
          // calculer le centre exact de l'entité
          const box = new THREE.Box3().setFromObject(target)
          const center = new THREE.Vector3()
          box.getCenter(center) // centre de la bounding box
      
          // projeter dans l'espace écran
          center.project(cam)
          const x = (center.x + 1) / 2 * window.innerWidth
          const y = (-center.y + 1) / 2 * window.innerHeight
      
          setHoveredPopup({
            entityObject: target,
            id: target.uuid,
            screenPos: { x, y },
          })
          return
        }
      
        setHoveredPopup(null)
      }

    function onKeyDown(e: KeyboardEvent) {
      const w2 = World.current
      if (!w2) return

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        const last = deletedStack.pop()
        if (!last) return
        const { entityObject, occupiedTiles } = last

        w2.scene.add(entityObject)
        w2.entities.push(entityObject)
        occupiedTiles.forEach(t => w2.markOccupied(t.x, t.z, t.size))

        if (placementStore.hoveredTile) {
          const { tileX, tileZ } = placementStore.hoveredTile
          const isOnTile = occupiedTiles.some(t => t.x === tileX && t.z === tileZ)
          if (isOnTile) placementStore.canPlace = w2.canSpawn(tileX, tileZ, 1)
        }
      }
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const handleDelete = (popup: PopupInfo) => {
    const w = World.current
    if (!w) return
    const e = popup.entityObject
  
    const tileX = e.userData.tileX as number
    const tileZ = e.userData.tileZ as number
    const tileSize = (e.userData.tileSize as number) ?? 1
  
    const occupiedTiles: { x: number; z: number; size: number }[] = []
    for (let dx = 0; dx < tileSize; dx++) {
      for (let dz = 0; dz < tileSize; dz++) {
        occupiedTiles.push({ x: tileX + dx, z: tileZ + dz, size: 1 })
      }
    }
  
    deletedStack.push({ entityObject: e, occupiedTiles })
    w.entities = w.entities.filter(en => en !== e)
    occupiedTiles.forEach(t => w.markFree(t.x, t.z, t.size))
    placementStore.hoveredTile = null
    placementStore.canPlace = true
    setHoveredPopup(null)
  
    // Animation : sursaut vers le haut puis chute en rétrécissant
    const startY = e.position.y
    const startScale = e.scale.x
    const duration = 400 // ms
    const startTime = performance.now()
  
    function animate(now: number) {
      const t = Math.min((now - startTime) / duration, 1)
  
      // Sursaut : monte légèrement au début puis chute
      // easing : petit bounce au début (t=0→0.2) puis chute accélérée
      const bounce = Math.sin(t * Math.PI) * 0.3        // arc en cloche, hauteur max 0.3
      const fall   = t * t * -3                          // chute quadratique vers le bas
      e.position.y = startY + bounce + fall
  
      // Rétrécit progressivement, accéléré en fin
      const scale = startScale * (1 - t * t)
      e.scale.set(scale, scale, scale)
  
      if (t < 1) {
        requestAnimationFrame(animate)
      } else {
        w?.scene.remove(e)
      }
    }
  
    requestAnimationFrame(animate)
  }

  if (!hoveredPopup) return null

  return (
    <div
    className="entity-popup"
    style={{
        position: "absolute",
        left: hoveredPopup.screenPos.x,
        top: hoveredPopup.screenPos.y,
        transform: "translate(-50%, -50%)",
    }}
    >
        <UIButton className="delete-btn" onClick={() => handleDelete(hoveredPopup)}>🗑️</UIButton>
    </div>
  )
}