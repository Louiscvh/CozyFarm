// src/game/placement/usePlacement.ts
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { placementStore } from "../store/PlacementStore"
//import { historyStore } from "../store/HistoryStore"
import { World } from "../../game/world/World"
import { getFootprint } from "../../game/entity/Entity"
import {
  staticGridGroup,
  buildStaticGrid,
  showGridForGhost,
  hideGridForGhost,
  revealGroup,
  buildRevealGrid,
} from "../../game/system/Grid"

interface UsePlacementOptions {
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
}

// ── Meshs de base ─────────────────────────────────────────────
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshBasicMaterial({ visible: true, side: THREE.DoubleSide })
)
groundPlane.rotation.x = -Math.PI / 2

const highlightMatOk  = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false })
const highlightMatBad = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false })
const highlightMesh   = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMatOk)
highlightMesh.rotation.x = -Math.PI / 2
highlightMesh.position.y = 0.055
highlightMesh.visible    = false

// ── Ghost ─────────────────────────────────────────────────────
const ghostMat = new THREE.MeshBasicMaterial({ color:0x00ff00, transparent:true, opacity:0.5, depthWrite:false, depthTest:false })

function applyGhostMaterials(root: THREE.Object3D) {
  const toRemove: THREE.Object3D[] = []
  const toReMat: THREE.Mesh[] = []

  root.traverse(obj => {
    if (obj.userData.isHitBox || obj.name === "__hitbox__") { toRemove.push(obj); return }
    if ((obj as THREE.Mesh).isMesh) toReMat.push(obj as THREE.Mesh)
    if ((obj as THREE.PointLight).isLight) (obj as THREE.PointLight).visible = false
  })

  toRemove.forEach(o => o.parent?.remove(o))
  toReMat.forEach(m => m.material = ghostMat)
}

function setGhostColor(canPlace: boolean) {
  ghostMat.color.set(canPlace ? 0x00ff00 : 0xff2244)
}

// ── Hook principal ────────────────────────────────────────────
export function usePlacement({ camera, renderer }: UsePlacementOptions) {
  const raycaster   = useRef(new THREE.Raycaster())
  const mouse       = useRef(new THREE.Vector2())
  const ghostRef    = useRef<THREE.Object3D | null>(null)
  const yOffsetRef  = useRef<number>(0)
  const targetPos   = useRef(new THREE.Vector3())
  const currentPos  = useRef(new THREE.Vector3())
  const targetRotY  = useRef<number>(0)
  const currentRotY = useRef<number>(0)
  const rafRef      = useRef<number>(0)

  useEffect(() => {
    const world = World.current
    if (!world) return

    world.scene.add(groundPlane, highlightMesh, staticGridGroup, revealGroup)
    buildStaticGrid(world.cellSize)

    const snapToCell = (x: number, z: number) => {
      const half = world.sizeInCells / 2
      return {
        cellX: Math.floor(x / world.cellSize + half),
        cellZ: Math.floor(z / world.cellSize + half),
      }
    }

    const cellToWorld = (cellX: number, cellZ: number, footprint: number) => {
      const half   = world.sizeInCells / 2
      const startX = (cellX - half) * world.cellSize
      const startZ = (cellZ - half) * world.cellSize
      return {
        x: startX + footprint * world.cellSize / 2,
        z: startZ + footprint * world.cellSize / 2,
      }
    }

    const getPlaceCells = (cellX: number, cellZ: number, footprint: number) => {
      const half = Math.floor(footprint / 2)
      return { placeCellX: cellX - half, placeCellZ: cellZ - half }
    }

    // ── Ghost ──────────────────────────────────────────────
    const removeGhost = () => {
      cancelAnimationFrame(rafRef.current)
      if (ghostRef.current) {
        world.scene.remove(ghostRef.current)
        ghostRef.current.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh
            mesh.geometry?.dispose()
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach(m => { if (m !== ghostMat) m.dispose() })
          }
        })
        ghostRef.current = null
        placementStore.ghostMesh = null
      }
      yOffsetRef.current = 0
      highlightMesh.visible = false
      revealGroup.visible = false
      hideGridForGhost()
    }

    async function buildGhost(entity: typeof placementStore.selectedItem) {
      if (!entity || !world) return removeGhost()

        let initialRotationDeg = 0
      
        if (placementStore.moveOrigin) {
          // Si on déplace, on prend la rotation actuelle de l'objet (en degrés)
          initialRotationDeg = Math.round(THREE.MathUtils.radToDeg(placementStore.moveOrigin.rotY))
        } else {
          // Si c'est un nouvel item, on prend la rotation forcée de la def (ex: 180)
          initialRotationDeg = entity.entity.rotation?.y || 0
        }
    
      // On synchronise le store immédiatement
      placementStore.rotation = initialRotationDeg
      const targetRotRad = THREE.MathUtils.degToRad(initialRotationDeg)

      removeGhost()
      const { createEntity } = await import("../../game/entity/EntityFactory")
      const root = await createEntity(entity.entity, world.tileSize)

      yOffsetRef.current = root.position.y
      applyGhostMaterials(root)
      
      // ── 2. SYNCHRONISATION DES REFS ──
      // On force les refs à la rotation cible pour éviter que le ghost ne tourne 
      // de 0 vers 180 au moment où il apparaît (téléportation angulaire immédiate)
      root.rotation.y = targetRotRad 
      currentRotY.current = targetRotRad
      targetRotY.current = targetRotRad
    
      const footprint = getFootprint(entity.entity)
      buildRevealGrid(world.cellSize, footprint)
      revealGroup.visible = true
      
      // Positionnement initial (si la souris survole déjà une cellule)
      if (placementStore.hoveredCell) {
        const { cellX, cellZ } = placementStore.hoveredCell
        const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)
        const { x, z } = cellToWorld(placeCellX, placeCellZ, footprint)
        
        targetPos.current.set(x, yOffsetRef.current, z)
        currentPos.current.copy(targetPos.current)
        
        const canPlace = world.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint)
        setGhostColor(canPlace)
        
        highlightMesh.scale.set(footprint * world.cellSize, footprint * world.cellSize, 1)
        highlightMesh.position.set(x, 0.055, z)
        highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
        highlightMesh.visible = true
        revealGroup.position.set(x, 0.056, z)
        showGridForGhost()
      }
    
      root.position.copy(currentPos.current)
      world.scene.add(root)
      ghostRef.current = root
      placementStore.ghostMesh = root
    
      const animateGhost = () => {
        rafRef.current = requestAnimationFrame(animateGhost)
        if (!ghostRef.current) return
        
        currentPos.current.lerp(targetPos.current, 0.35)
        ghostRef.current.position.copy(currentPos.current)
        
        // L'interpolation fluide pour la rotation
        currentRotY.current += (targetRotY.current - currentRotY.current) * 0.3
        ghostRef.current.rotation.y = currentRotY.current
        
        if (highlightMesh.visible)
          highlightMesh.position.set(currentPos.current.x, 0.055, currentPos.current.z)
      }
      animateGhost()
    }

    // ── Events ───────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.current.set(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1
      )
      raycaster.current.setFromCamera(mouse.current, camera)
      const hits = raycaster.current.intersectObject(groundPlane)
      if (!hits.length) return

      const { cellX, cellZ } = snapToCell(hits[0].point.x, hits[0].point.z)
      placementStore.hoveredCell = { cellX, cellZ }

      if (!placementStore.selectedItem) {
        revealGroup.visible = false
        return
      }

      const footprint = getFootprint(placementStore.selectedItem.entity)
      const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)
      placementStore.canPlace = world.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint)

      const { x, z } = cellToWorld(placeCellX, placeCellZ, footprint)
      targetPos.current.set(x, yOffsetRef.current, z)
      setGhostColor(placementStore.canPlace)

      highlightMesh.visible = true
      highlightMesh.position.set(x, 0.055, z)
      highlightMesh.material = placementStore.canPlace ? highlightMatOk : highlightMatBad
      revealGroup.position.set(x, 0.056, z)
      revealGroup.visible = true
    }

    let mouseDownPos = { x: 0, y: 0 }
    const onMouseDown = (e: MouseEvent) => { mouseDownPos = { x: e.clientX, y: e.clientY } }

    const onClick = async (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("#ui-root")) return
      if (skipNextClick) { skipNextClick = false; return }
      if (!placementStore.selectedItem || !placementStore.hoveredCell) return

      const dx = e.clientX - mouseDownPos.x
      const dy = e.clientY - mouseDownPos.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) return
      if (!placementStore.canPlace) { playSound(true); return }

      const { cellX, cellZ }           = placementStore.hoveredCell
      const item                        = placementStore.selectedItem
      const footprint                   = getFootprint(item.entity)
      const { placeCellX, placeCellZ }  = getPlaceCells(cellX, cellZ, footprint)

      if (placementStore.moveEntity) {
        const ent = placementStore.moveEntity
        const origin = placementStore.moveOrigin!
        const footprint = getFootprint(ent.userData.def)
        
        // 1. CALCULER les nouvelles valeurs
        const { x: newX, z: newZ } = cellToWorld(placeCellX, placeCellZ, footprint)
        const newRotY = targetRotY.current
        const newPos = new THREE.Vector3(newX, yOffsetRef.current || origin.pos.y, newZ)
      
        // 2. ENREGISTRER DANS L'HISTORIQUE (AVANT de muter l'objet)
        // On utilise origin.pos pour le "from" et newPos pour le "to"
        /*historyStore.push({
          type: "move",
          entityObject: ent,
          fromCell: { x: origin.cellX, z: origin.cellZ },
          toCell: { x: placeCellX, z: placeCellZ },
          fromRot: origin.rotY,
          toRot: newRotY,
          size: footprint
        })*/
      
        // 3. MAINTENANT, on applique les changements physiques
        ent.position.copy(newPos)
        ent.rotation.y = newRotY
        ent.userData.cellX = placeCellX
        ent.userData.cellZ = placeCellZ
        ent.userData.rotY = newRotY // Très important pour l'instance manager
      
        ent.updateMatrix()
        ent.updateMatrixWorld(true)
      
        if (ent.userData.isInstanced) {
          world.instanceManager.show(ent.userData.def, ent.userData.instanceSlot, newPos, newRotY)
        }
      
        world.scene.add(ent)
        if (!world.entities.includes(ent)) world.entities.push(ent)
        world.tilesFactory.markOccupied(placeCellX, placeCellZ, footprint)
      
        placementStore.completeMove()
        removeGhost()
        playSound(false)
        return
      }

      // ── Normal place from inventory ────────────────────────────────────
      const entity = await world.spawnEntitySafe(item.entity, placeCellX, placeCellZ, footprint)
      if (!entity) { playSound(true); return }

      // Stamp cell metadata so handleMove / handleDelete can rely on them
      entity.userData.cellX       = placeCellX
      entity.userData.cellZ       = placeCellZ
      entity.userData.sizeInCells = footprint

      if (entity.userData.isInstanced) {
        entity.userData.rotY = targetRotY.current
        entity.rotation.y    = targetRotY.current
        world.instanceManager.setTransform(
          entity.userData.def as any,
          entity.userData.instanceSlot,
          entity.position,
          targetRotY.current
        )
      } else {
        entity.rotation.y = targetRotY.current
      }

      playSound(false)
    }

    const playSound = (isError: boolean) => {
      try {
        const file  = isError ? "click_error.mp3" : "click.mp3"
        const url   = new URL(`../../assets/${file}`, import.meta.url).href
        const audio = new Audio(url)
        audio.volume = isError ? 0.4 : 0.6
        audio.play().catch(() => {})
      } catch (err) {
        console.warn("Audio play failed", err)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { placementStore.cancel(); removeGhost(); return }
      if ((e.key === "r" || e.key === "R") && placementStore.selectedItem) {
        placementStore.rotate()
        targetRotY.current += THREE.MathUtils.degToRad(90)
      }
    }

    let lastSelectedId: string | null = null
    let skipNextClick = false

    const unsubscribe = placementStore.subscribe(() => {
      const currentId = placementStore.selectedItem?.id ?? null
      if (currentId !== lastSelectedId) {
        lastSelectedId = currentId
        if (!placementStore.selectedItem) {
          removeGhost()
        } else {
          // Sync targetRotY immediately from moveOrigin so onClick gets the right value
          // even if buildGhost hasn't finished yet
          if (placementStore.moveOrigin) {
            targetRotY.current = placementStore.moveOrigin.rotY
            skipNextClick = true // ignore the click that triggered startMove
          }
          buildGhost(placementStore.selectedItem)
        }
      }
    })

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mousedown", onMouseDown)
    window.addEventListener("click",     onClick)
    window.addEventListener("keydown",   onKeyDown)

    return () => {
      unsubscribe()
      removeGhost()
      world.scene.remove(groundPlane, highlightMesh, staticGridGroup, revealGroup)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("click",     onClick)
      window.removeEventListener("keydown",   onKeyDown)
    }
  }, [camera, renderer])
}