// src/game/placement/usePlacement.ts
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { placementStore } from "../store/PlacementStore"
import { historyStore } from "../store/HistoryStore"
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
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
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
    if (obj.userData.isHitBox || obj.name==="__hitbox__") { toRemove.push(obj); return }
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
  const ghostRef    = useRef<THREE.Object3D|null>(null)
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

    const snapToCell = (x:number,z:number) => {
      const half = world!.sizeInCells/2
      return { cellX: Math.floor(x/world!.cellSize+half), cellZ: Math.floor(z/world!.cellSize+half) }
    }

    const cellToWorld = (cellX:number,cellZ:number,footprint:number) => {
      const half = world!.sizeInCells/2
      const startX = (cellX-half)*world!.cellSize
      const startZ = (cellZ-half)*world!.cellSize
      return { x: startX + footprint*world!.cellSize/2, z: startZ + footprint*world!.cellSize/2 }
    }

    const getPlaceCells = (cellX:number,cellZ:number,footprint:number) => {
      const half = Math.floor(footprint/2)
      return { placeCellX:cellX-half, placeCellZ:cellZ-half }
    }

    // ── Ghost ──────────────────────────────────────────────
    const removeGhost = () => {
      cancelAnimationFrame(rafRef.current)
      if (ghostRef.current) {
        world!.scene.remove(ghostRef.current)
        ghostRef.current.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh
            mesh.geometry?.dispose()
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach(m=>{if(m!==ghostMat)m.dispose()})
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
      if (!entity) return removeGhost()
      removeGhost()
      const { createEntity } = await import("../../game/entity/EntityFactory")
      const root = await createEntity(entity.entity, world!.tileSize)
      yOffsetRef.current = root.position.y
      applyGhostMaterials(root)
      root.frustumCulled = false
      root.traverse(o=>o.frustumCulled=false)
      buildRevealGrid(world!.cellSize, getFootprint(entity.entity))
      revealGroup.visible = true

      const footprint = getFootprint(entity.entity)
      if (placementStore.hoveredCell) {
        const { cellX, cellZ } = placementStore.hoveredCell
        const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)
        const { x, z } = cellToWorld(placeCellX, placeCellZ, footprint)
        targetPos.current.set(x, yOffsetRef.current, z)
        const canPlace = world!.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint)
        setGhostColor(canPlace)
        highlightMesh.scale.set(footprint*world!.cellSize, footprint*world!.cellSize, 1)
        highlightMesh.position.set(x, 0.055, z)
        revealGroup.position.set(x, 0.056, z)
        highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
        highlightMesh.visible = true
        showGridForGhost()
      } else {
        targetPos.current.set(0,-9999,0)
        highlightMesh.visible = false
        revealGroup.visible = false
      }

      const initRot = THREE.MathUtils.degToRad(placementStore.rotation)
      currentRotY.current = targetRotY.current = initRot
      root.rotation.y = initRot
      root.position.copy(currentPos.current)

      world!.scene.add(root)
      ghostRef.current = root
      placementStore.ghostMesh = root

      const animateGhost = () => {
        rafRef.current = requestAnimationFrame(animateGhost)
        if (!ghostRef.current) return
        currentPos.current.lerp(targetPos.current,0.35)
        ghostRef.current.position.copy(currentPos.current)
        currentRotY.current += (targetRotY.current-currentRotY.current)*0.3
        ghostRef.current.rotation.y = currentRotY.current
        if (highlightMesh.visible) highlightMesh.position.set(currentPos.current.x,0.055,currentPos.current.z)
        if (ghostRef.current.userData.isTorch) (ghostRef.current as any).updateTorch(performance.now()/1000,0)
      }
      animateGhost()
    }

    // ── Events ───────────────────────────────────────────────
    const onMouseMove = (e:MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.current.set(
        ((e.clientX-rect.left)/rect.width)*2-1,
        ((e.clientY-rect.top)/rect.height)*-2+1
      )
      raycaster.current.setFromCamera(mouse.current,camera)
      const hits = raycaster.current.intersectObject(groundPlane)
      if (!hits.length) return
      const { cellX, cellZ } = snapToCell(hits[0].point.x, hits[0].point.z)
      placementStore.hoveredCell = { cellX, cellZ }

      if (!placementStore.selectedItem) {
        revealGroup.visible=false
        return
      }

      const footprint = getFootprint(placementStore.selectedItem.entity)
      const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)
      placementStore.canPlace = world!.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint)

      const { x, z } = cellToWorld(placeCellX, placeCellZ, footprint)
      targetPos.current.set(x, yOffsetRef.current, z)
      setGhostColor(placementStore.canPlace)

      highlightMesh.visible = true
      highlightMesh.position.set(x,0.055,z)
      highlightMesh.material = placementStore.canPlace ? highlightMatOk : highlightMatBad
      revealGroup.position.set(x,0.056,z)
      revealGroup.visible = true
    }

    let mouseDownPos = {x:0,y:0}
    const onMouseDown = (e:MouseEvent) => { mouseDownPos = {x:e.clientX,y:e.clientY} }
    const onClick = async (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("#ui-root")) return
      if (!placementStore.selectedItem || !placementStore.hoveredCell) return

      const dx = e.clientX - mouseDownPos.x
      const dy = e.clientY - mouseDownPos.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) return

      if (!placementStore.canPlace) {
        playSound(true)
        return
      }

      const { cellX, cellZ } = placementStore.hoveredCell
      const item = placementStore.selectedItem
      const footprint = getFootprint(item.entity)
      const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)

      const entity = await world!.spawnEntitySafe(item.entity, placeCellX, placeCellZ, footprint)

      if (!entity) {
        playSound(true)
        return
      }

      if (entity.userData.isInstanced) {
        const def  = entity.userData.def  as typeof placementStore.selectedItem extends { entity: infer E } ? E : never
        const slot = entity.userData.instanceSlot as number
        entity.userData.rotY = targetRotY.current
        entity.rotation.y    = targetRotY.current
        world!.instanceManager.setTransform(def as any, slot, entity.position, targetRotY.current)
      } else {
        entity.rotation.y = targetRotY.current
      }

      historyStore.push({
        type           : "place",
        entityObject   : entity,
        cellX          : placeCellX,
        cellZ          : placeCellZ,
        sizeInCells    : footprint,
        originalY      : entity.position.y,
        originalScale  : entity.scale.clone(),
        originalRotation: entity.rotation.clone(),
      })

      playSound(false)
    }

    const playSound = (isError: boolean) => {
      try {
        const file = isError ? "click_error.mp3" : "click.mp3"
        const url = new URL(`../../assets/${file}`, import.meta.url).href
        const audio = new Audio(url)
        audio.volume = isError ? 0.4 : 0.6
        audio.play().catch(() => {})
      } catch (err) {
        console.warn("Audio play failed", err)
      }
    }

    const onKeyDown = (e:KeyboardEvent) => {
      if (e.key==="Escape") { placementStore.cancel(); removeGhost(); return }
      if ((e.key==="r"||e.key==="R") && placementStore.selectedItem) {
        placementStore.rotate(); targetRotY.current+=THREE.MathUtils.degToRad(90)
      }
    }

    let lastSelectedId: string|null = null
    const unsubscribe = placementStore.subscribe(()=>{
      const currentId = placementStore.selectedItem?.id ?? null
      if(currentId!==lastSelectedId){
        lastSelectedId=currentId
        if(!placementStore.selectedItem) removeGhost()
        else buildGhost(placementStore.selectedItem)
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