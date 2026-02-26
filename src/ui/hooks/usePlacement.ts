// src/game/placement/usePlacement.ts
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { placementStore } from "../store/PlacementStore"
import { World } from "../../game/world/World"
import { createEntity } from "../../game/entity/EntityFactory"
import { placeOnTile } from "../../game/entity/utils/placeOnTile"

interface UsePlacementOptions {
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
}

const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
)
groundPlane.rotation.x = -Math.PI / 2

const highlightMatOk  = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.35, depthWrite: false })
const highlightMatBad = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false })
const highlightMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMatOk)
highlightMesh.rotation.x = -Math.PI / 2
highlightMesh.position.y = 0.02
highlightMesh.visible = false

function setGhostColor(ghost: THREE.Object3D, canPlace: boolean) {
  const color = canPlace ? 0xffffff : 0xff2244
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
  const raycaster  = useRef(new THREE.Raycaster())
  const mouse      = useRef(new THREE.Vector2())
  const ghostRef   = useRef<THREE.Object3D | null>(null)
  const yOffsetRef = useRef<number>(0)

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

      const { assetManager } = await import("../../render/AssetManager")
      const gltf = await assetManager.loadGLTF(entity.entity.model)
      const root = gltf.scene.clone(true)

      const size = entity.entity.sizeInTiles
      const { scaleModelToTiles } = await import("../../game/entity/utils/scaleModelToTiles")
      scaleModelToTiles(root, size, world!.tileSize)
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          })
        }
      })

      root.frustumCulled = false
      root.traverse((obj) => { obj.frustumCulled = false })

      // Rotation courante du store
      root.rotation.y = THREE.MathUtils.degToRad(placementStore.rotation)

      highlightMesh.scale.set(world!.tileSize * size, world!.tileSize * size, 1)

      if (placementStore.hoveredTile) {
        const { x, z } = tileToWorld(placementStore.hoveredTile.tileX, placementStore.hoveredTile.tileZ, size)
        root.position.set(x, yOffsetRef.current, z)
        const canPlace = world!.canSpawn(placementStore.hoveredTile.tileX, placementStore.hoveredTile.tileZ, size)
        setGhostColor(root, canPlace)
        highlightMesh.position.set(x, 0.02, z)
        highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
        highlightMesh.visible = true
      } else {
        root.position.set(0, yOffsetRef.current, 0)
      }

      world!.scene.add(root)
      ghostRef.current = root
      placementStore.ghostMesh = root
    }

    // ----------------------------------------------------------------
    // removeGhost
    // ----------------------------------------------------------------
    function removeGhost() {
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
        ghostRef.current.position.x = x
        ghostRef.current.position.z = z
        ghostRef.current.position.y = yOffsetRef.current
        setGhostColor(ghostRef.current, canPlace)
      }

      highlightMesh.visible = true
      highlightMesh.position.set(x, 0.02, z)
      highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
    }

    // ----------------------------------------------------------------
    // onClick
    // ----------------------------------------------------------------
    async function onClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest("#ui-root")) return
      if (!placementStore.selectedItem || !placementStore.hoveredTile) return
      if (!placementStore.canPlace) return

      const { tileX, tileZ } = placementStore.hoveredTile
      const item = placementStore.selectedItem
      const size = Math.max(1, Math.ceil(item.entity.sizeInTiles ?? 1))

      if (!world!.canSpawn(tileX, tileZ, size)) return

      world!.markOccupied(tileX, tileZ, size)

      const entity = await createEntity(item.entity, world!.tileSize)
      entity.rotation.y = THREE.MathUtils.degToRad(placementStore.rotation)
      placeOnTile(entity, tileX, tileZ, world!.tileSize, world!.size, size)
      world!.scene.add(entity)
      world!.entities.push(entity)
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
        // ✅ Mettre à jour le store (notifie l'UI pour afficher le bon degré)
        placementStore.rotate()
        // ✅ Appliquer immédiatement la rotation au ghost sans le reconstruire
        if (ghostRef.current) {
          ghostRef.current.rotation.y = THREE.MathUtils.degToRad(placementStore.rotation)
        }
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
      // La rotation est gérée directement dans onKeyDown, pas ici
    })

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("click",     onClick)
    window.addEventListener("keydown",   onKeyDown)

    return () => {
      unsubscribe()
      removeGhost()
      world.scene.remove(groundPlane)
      world.scene.remove(highlightMesh)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("click",     onClick)
      window.removeEventListener("keydown",   onKeyDown)
    }
  }, [camera, renderer])
}