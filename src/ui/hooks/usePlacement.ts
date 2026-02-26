// src/game/placement/usePlacement.ts
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { placementStore } from "../store/PlacementStore"
import { World } from "../../game/world/World"

interface UsePlacementOptions {
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
}

const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
)
groundPlane.rotation.x = -Math.PI / 2

const highlightMatOk  = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35, depthWrite: false })
const highlightMatBad = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false })
const highlightMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMatOk)
highlightMesh.rotation.x = -Math.PI / 2
highlightMesh.position.y = 0.02
highlightMesh.visible = false

function setGhostColor(ghost: THREE.Object3D, canPlace: boolean) {
  const color = canPlace ? 0x00ff00 : 0xff2244
  ghost.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mats = Array.isArray((obj as THREE.Mesh).material)
        ? (obj as THREE.Mesh).material as THREE.Material[]
        : [(obj as THREE.Mesh).material as THREE.Material]
      mats.forEach((m) => (m as THREE.MeshBasicMaterial).color.set(color))
    }
  })
}

export function usePlacement({ camera, renderer }: UsePlacementOptions) {
  const raycaster    = useRef(new THREE.Raycaster())
  const mouse        = useRef(new THREE.Vector2())
  const ghostRef     = useRef<THREE.Object3D | null>(null)
  const yOffsetRef   = useRef<number>(0)
  const targetPos    = useRef(new THREE.Vector3())
  const currentPos   = useRef(new THREE.Vector3())
  const targetRotY   = useRef<number>(0)
  const currentRotY  = useRef<number>(0)
  const rafRef       = useRef<number>(0)

  useEffect(() => {
    const world = World.current
    if (!world) return

    world.scene.add(groundPlane)
    world.scene.add(highlightMesh)

    function tileToWorld(tileX: number, tileZ: number, size: number) {
      const halfWorld    = world!.size / 2
      const centerOffset = ((size - 1) / 2) * world!.tileSize
      return {
        x: (tileX - halfWorld) * world!.tileSize + centerOffset,
        z: (tileZ - halfWorld) * world!.tileSize + centerOffset,
      }
    }

    function snapToTile(worldX: number, worldZ: number) {
      return world!.worldToTileIndex(worldX, worldZ)
    }

    // ----------------------------------------------------------------
    // buildGhost — appelé uniquement quand l'item sélectionné change
    // ----------------------------------------------------------------
    async function buildGhost(entity: typeof placementStore.selectedItem) {
        if (!entity) return
        removeGhost()
      
        const { createEntity } = await import("../../game/entity/EntityFactory")
        const root = await createEntity(entity.entity, world!.tileSize)
      
        // Applique le matériau ghost sur tous les meshes
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).material = new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
            })
          }
          // Cache les lights du ghost — on ne veut pas qu'elles éclairent la scène
          if ((obj as THREE.PointLight).isLight) {
            obj.visible = false
          }
        })
        const size = entity.entity.sizeInTiles

      root.frustumCulled = false
      root.traverse((obj) => { obj.frustumCulled = false })

      highlightMesh.scale.set(world!.tileSize * size, world!.tileSize * size, 1)

      // Initialise position — pas d'easing au premier affichage
      if (placementStore.hoveredTile) {
        const { x, z } = tileToWorld(placementStore.hoveredTile.tileX, placementStore.hoveredTile.tileZ, size)
        currentPos.current.set(x, yOffsetRef.current, z)
        targetPos.current.set(x, yOffsetRef.current, z)
        root.position.copy(currentPos.current)
        const canPlace = world!.canSpawn(placementStore.hoveredTile.tileX, placementStore.hoveredTile.tileZ, size)
        setGhostColor(root, canPlace)
        highlightMesh.position.set(x, 0.02, z)
        highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
        highlightMesh.visible = true
      } else {
        currentPos.current.set(0, yOffsetRef.current, 0)
        targetPos.current.set(0, yOffsetRef.current, 0)
        root.position.copy(currentPos.current)
      }

      // Initialise rotation — pas d'easing au premier affichage
      const initRot = THREE.MathUtils.degToRad(placementStore.rotation)
      currentRotY.current = initRot
      targetRotY.current  = initRot
      root.rotation.y     = initRot

      world!.scene.add(root)
      ghostRef.current = root
      placementStore.ghostMesh = root

      // Boucle d'easing position + rotation
      cancelAnimationFrame(rafRef.current)
      function animateGhost() {
        rafRef.current = requestAnimationFrame(animateGhost)
        if (!ghostRef.current) return
      
        currentPos.current.lerp(targetPos.current, 0.35)
        ghostRef.current.position.copy(currentPos.current)
      
        currentRotY.current += (targetRotY.current - currentRotY.current) * 0.3
        ghostRef.current.rotation.y = currentRotY.current
      
        // Animation torche dans le ghost
        if (ghostRef.current.userData.isTorch) {
          const now = performance.now() / 1000
          ;(ghostRef.current as any).updateTorch(now, 0) // intensité 0 — pas de lumière dans le ghost
        }
      }
      animateGhost()
    }

    // ----------------------------------------------------------------
    // removeGhost
    // ----------------------------------------------------------------
    function removeGhost() {
      cancelAnimationFrame(rafRef.current)
      if (ghostRef.current) {
        world!.scene.remove(ghostRef.current)
        ghostRef.current.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh
            mesh.geometry?.dispose()
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach((m) => m.dispose())
          }
        })
        ghostRef.current = null
        placementStore.ghostMesh = null
      }
      yOffsetRef.current = 0
      highlightMesh.visible = false
    }

    // ----------------------------------------------------------------
    // onMouseMove
    // ----------------------------------------------------------------
    function onMouseMove(e: MouseEvent) {
      if (!placementStore.selectedItem) return

      const rect = renderer.domElement.getBoundingClientRect()
      mouse.current.set(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1
      )

      raycaster.current.setFromCamera(mouse.current, camera)
      const hits = raycaster.current.intersectObject(groundPlane)
      if (!hits.length) return

      const hit = hits[0].point
      const { tileX, tileZ } = snapToTile(hit.x, hit.z)
      const size = Math.max(1, Math.ceil(placementStore.selectedItem.entity.sizeInTiles ?? 1))
      const canPlace = world!.canSpawn(tileX, tileZ, size)

      placementStore.hoveredTile = { tileX, tileZ }
      placementStore.canPlace    = canPlace

      const { x, z } = tileToWorld(tileX, tileZ, size)

      if (ghostRef.current) {
        targetPos.current.set(x, yOffsetRef.current, z)
        setGhostColor(ghostRef.current, canPlace)
      }

      highlightMesh.visible = true
      highlightMesh.position.set(x, 0.02, z)
      highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
    }

    let clickAudio: HTMLAudioElement | null = null

    const playClickSound = () => {
      try {
        if (!clickAudio) {
          const url = new URL("../../assets/click.mp3", import.meta.url).href
          clickAudio = new Audio(url)
          clickAudio.volume = 0.6
        }
        clickAudio.currentTime = 0
        clickAudio.play().catch(() => {})
      } catch {
        // on ignore les erreurs audio
      }
    }

    // ----------------------------------------------------------------
    // onClick — avec détection de drag
    // ----------------------------------------------------------------
    let mouseDownPos = { x: 0, y: 0 }

    function onMouseDown(e: MouseEvent) {
      mouseDownPos = { x: e.clientX, y: e.clientY }
    }

    async function onClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest("#ui-root")) return
      if (!placementStore.selectedItem || !placementStore.hoveredTile) return
      if (!placementStore.canPlace) return

      // Si la souris a bougé de plus de 5px entre mousedown et click, c'est un drag — on ignore
      const dx = e.clientX - mouseDownPos.x
      const dy = e.clientY - mouseDownPos.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) return

      const { tileX, tileZ } = placementStore.hoveredTile
      const item = placementStore.selectedItem
      const size = Math.max(1, Math.ceil(item.entity.sizeInTiles ?? 1))

      const entity = await world!.spawnEntitySafe(item.entity, tileX, tileZ, size)
      if (!entity) return

      entity.rotation.y = targetRotY.current

      playClickSound()
    }

    // ----------------------------------------------------------------
    // onKeyDown
    // ----------------------------------------------------------------
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        placementStore.cancel()
        removeGhost()
        return
      }

      if ((e.key === "r" || e.key === "R") && placementStore.selectedItem) {
        placementStore.rotate()
        targetRotY.current += THREE.MathUtils.degToRad(90)
      }
    }

    // ----------------------------------------------------------------
    // Abonnement store — reconstruire le ghost uniquement si l'item change
    // ----------------------------------------------------------------
    let lastSelectedId: string | null = null
    const unsubscribe = placementStore.subscribe(() => {
      const currentId = placementStore.selectedItem?.id ?? null
      if (currentId !== lastSelectedId) {
        lastSelectedId = currentId
        if (!placementStore.selectedItem) {
          removeGhost()
        } else {
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
      world.scene.remove(groundPlane)
      world.scene.remove(highlightMesh)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("click",     onClick)
      window.removeEventListener("keydown",   onKeyDown)
    }
  }, [camera, renderer])
}