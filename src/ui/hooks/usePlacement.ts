// src/game/placement/usePlacement.ts
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { placementStore } from "../store/PlacementStore"
import { World } from "../../game/world/World"
import { Line2 } from "three/addons/lines/Line2.js"
import { LineGeometry } from "three/addons/lines/LineGeometry.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { getFootprint } from "../../game/entity/Entity"
import { isPlaceable, getItemEntity } from "../../game/entity/ItemDef"
import type { ItemDef } from "../../game/entity/ItemDef"
import {
    staticGridGroup,
    buildStaticGrid,
    showGridForGhost,
    hideGridForGhost,
    revealGroup,
    buildRevealGrid,
    GRID_Y,
} from "../../game/system/Grid"

interface UsePlacementOptions {
    camera: THREE.Camera
    renderer: THREE.WebGLRenderer
}

// ── Meshs de base ──────────────────────────────────────────────────────────────

const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshBasicMaterial({ visible: false })
)
groundPlane.rotation.x = -Math.PI / 2

const highlightMatOk = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false })
const highlightMatBad = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false })
const highlightMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMatOk)
highlightMesh.rotation.x = -Math.PI / 2
highlightMesh.position.y = 0.055
highlightMesh.visible = false

// ── Hover cursor ───────────────────────────────────────────────────────────────

const hoverBorderGeo = new LineGeometry()
hoverBorderGeo.setPositions([-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 0, 0.5])
const hoverBorderMat = new LineMaterial({
    color: 0xffffff, linewidth: 4, opacity: 1, transparent: true,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
})
const hoverCellMesh = new Line2(hoverBorderGeo, hoverBorderMat)
hoverCellMesh.position.y = GRID_Y + 0.002
hoverCellMesh.visible = false

// ── Ghost ──────────────────────────────────────────────────────────────────────

const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false })

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

// ── Hook ───────────────────────────────────────────────────────────────────────

export function usePlacement({ camera, renderer }: UsePlacementOptions) {
    const raycaster = useRef(new THREE.Raycaster())
    const mouse = useRef(new THREE.Vector2())
    const ghostRef = useRef<THREE.Object3D | null>(null)
    const yOffsetRef = useRef<number>(0)

    const targetPos = useRef(new THREE.Vector3())
    const currentPos = useRef(new THREE.Vector3())
    const targetRotY = useRef<number>(0)
    const currentRotY = useRef<number>(0)
    const rafRef = useRef<number>(0)

    const hoverTargetPos = useRef(new THREE.Vector3())
    const hoverCurrentPos = useRef(new THREE.Vector3())
    const hoverRafRef = useRef<number>(0)
    const hoverInitialized = useRef(false)

    useEffect(() => {
        const world = World.current
        if (!world) return

        world.scene.add(groundPlane, highlightMesh, hoverCellMesh, staticGridGroup, revealGroup)
        buildStaticGrid(world.cellSize)

        // ── Helpers ─────────────────────────────────────────────────────────────

        const snapToCell = (x: number, z: number) => {
            const half = world.sizeInCells / 2
            return {
                cellX: Math.floor(x / world.cellSize + half),
                cellZ: Math.floor(z / world.cellSize + half),
            }
        }

        const cellToWorld = (cellX: number, cellZ: number, footprint: number) => {
            const half = world.sizeInCells / 2
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

        // ── Hover animation ──────────────────────────────────────────────────────

        const startHoverAnim = () => {
            if (hoverRafRef.current) return
            const loop = () => {
                hoverRafRef.current = requestAnimationFrame(loop)
                const dist = hoverCurrentPos.current.distanceTo(hoverTargetPos.current)
                if (dist < 0.005) {
                    hoverCurrentPos.current.copy(hoverTargetPos.current)
                } else {
                    hoverCurrentPos.current.lerp(hoverTargetPos.current, Math.min(1, 0.28 + dist * 0.6))
                }
                hoverCellMesh.position.set(hoverCurrentPos.current.x, GRID_Y + 0.002, hoverCurrentPos.current.z)
            }
            loop()
        }

        const stopHoverAnim = () => {
            cancelAnimationFrame(hoverRafRef.current)
            hoverRafRef.current = 0
            hoverInitialized.current = false
        }

        // ── Ghost ────────────────────────────────────────────────────────────────

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
            hoverCellMesh.visible = false
            stopHoverAnim()
            revealGroup.visible = false
            hideGridForGhost()
        }

        /**
         * Ne construit un ghost QUE pour les items plaçables.
         * Les items use_on_* ne passent jamais ici.
         */
        async function buildGhost(item: ItemDef) {
            if (!item || !isPlaceable(item) || !world) return removeGhost()

            const entity = getItemEntity(item)

            let initialRotationDeg = 0
            if (placementStore.moveOrigin) {
                initialRotationDeg = Math.round(THREE.MathUtils.radToDeg(placementStore.moveOrigin.rotY))
            } else {
                initialRotationDeg = entity.rotation?.y || 0
            }

            placementStore.rotation = initialRotationDeg
            const targetRotRad = THREE.MathUtils.degToRad(initialRotationDeg)

            removeGhost()

            const { createEntity } = await import("../../game/entity/EntityFactory")
            const root = await createEntity(entity, world.tileSize)

            const info = world.instanceManager.getInfo(entity)
            const groundSnap = info?.yOffset ?? (() => {
                const box = new THREE.Box3().setFromObject(root)
                return -box.min.y
            })()
            yOffsetRef.current = groundSnap + (entity.yOffset ?? 0)

            applyGhostMaterials(root)
            root.rotation.y = targetRotRad
            currentRotY.current = targetRotRad
            targetRotY.current = targetRotRad

            const footprint = getFootprint(entity)
            buildRevealGrid(world.cellSize, footprint)
            revealGroup.visible = true

            if (placementStore.hoveredCell) {
                const { cellX, cellZ } = placementStore.hoveredCell
                const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)
                const { x, z } = cellToWorld(placeCellX, placeCellZ, footprint)

                targetPos.current.set(x, yOffsetRef.current, z)
                currentPos.current.copy(targetPos.current)

                const canPlace = world.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint)
                setGhostColor(canPlace)

                highlightMesh.scale.set(footprint * world.cellSize, footprint * world.cellSize, 1)
                highlightMesh.position.set(x, GRID_Y, z)
                highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
                highlightMesh.visible = true
                revealGroup.position.set(x, GRID_Y + 0.0055, z)
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
                currentRotY.current += (targetRotY.current - currentRotY.current) * 0.3
                ghostRef.current.rotation.y = currentRotY.current
                if (highlightMesh.visible) {
                    highlightMesh.position.set(currentPos.current.x, GRID_Y, currentPos.current.z)
                }
            }
            animateGhost()
        }

        // ── Mouse move ───────────────────────────────────────────────────────────

        const onMouseMove = (e: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect()
            mouse.current.set(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                ((e.clientY - rect.top) / rect.height) * -2 + 1,
            )
            raycaster.current.setFromCamera(mouse.current, camera)
            const hits = raycaster.current.intersectObject(groundPlane)
            if (!hits.length) return

            const { cellX, cellZ } = snapToCell(hits[0].point.x, hits[0].point.z)
            placementStore.hoveredCell = { cellX, cellZ }

            const selectedItem = placementStore.selectedItem

            // Hors mode placement (ou item non-plaçable) : curseur hover simple
            if (!selectedItem || !isPlaceable(selectedItem)) {
                const { x, z } = cellToWorld(cellX, cellZ, 1)
                hoverTargetPos.current.set(x, GRID_Y + 0.002, z)

                if (!hoverInitialized.current) {
                    hoverCurrentPos.current.copy(hoverTargetPos.current)
                    hoverCellMesh.position.set(x, GRID_Y + 0.002, z)
                    hoverCellMesh.scale.set(world.cellSize, 1, world.cellSize)
                    hoverInitialized.current = true
                }

                hoverCellMesh.visible = true
                revealGroup.visible = false
                startHoverAnim()
                return
            }

            // Mode placement d'une entité
            hoverCellMesh.visible = false
            stopHoverAnim()

            const entity = getItemEntity(selectedItem)
            const footprint = getFootprint(entity)
            const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)

            placementStore.canPlace = world.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint)
            const { x, z } = cellToWorld(placeCellX, placeCellZ, footprint)

            targetPos.current.set(x, yOffsetRef.current, z)
            setGhostColor(placementStore.canPlace)

            highlightMesh.visible = true
            highlightMesh.position.set(x, GRID_Y, z)
            highlightMesh.material = placementStore.canPlace ? highlightMatOk : highlightMatBad
            revealGroup.position.set(x, GRID_Y + 0.0055, z)
            revealGroup.visible = true
        }

        // ── Click ─────────────────────────────────────────────────────────────────

        let mouseDownPos = { x: 0, y: 0 }
        let skipNextClick = false

        const onMouseDown = (e: MouseEvent) => { mouseDownPos = { x: e.clientX, y: e.clientY } }

        const onClick = async (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest("#ui-root")) return
            if (skipNextClick) { skipNextClick = false; return }

            const item = placementStore.selectedItem

            // Ce hook ne traite QUE les items plaçables.
            // Les use_on_* sont pris en charge par useItemAction.
            if (!item || !isPlaceable(item)) return
            if (!placementStore.hoveredCell) return

            const dx = e.clientX - mouseDownPos.x
            const dy = e.clientY - mouseDownPos.y
            if (Math.sqrt(dx * dx + dy * dy) > 5) return
            if (!placementStore.canPlace) { playErrorSound(); return }

            const entity = getItemEntity(item)
            const footprint = getFootprint(entity)
            const { cellX, cellZ } = placementStore.hoveredCell
            const { placeCellX, placeCellZ } = getPlaceCells(cellX, cellZ, footprint)

            // ── Mode déplacement ────────────────────────────────────────────────
            if (placementStore.moveEntity) {
                const ent = placementStore.moveEntity

                const { x: newX, z: newZ } = (() => {
                    const half = world.sizeInCells / 2
                    const startX = (placeCellX - half) * world.cellSize
                    const startZ = (placeCellZ - half) * world.cellSize
                    return { x: startX + footprint * world.cellSize / 2, z: startZ + footprint * world.cellSize / 2 }
                })()

                const newRotY = targetRotY.current
                const extraY = (ent.userData.def?.yOffset ?? 0) as number
                const newPos = new THREE.Vector3(newX, extraY, newZ)

                ent.position.copy(newPos)
                ent.rotation.y = newRotY
                ent.userData.cellX = placeCellX
                ent.userData.cellZ = placeCellZ
                ent.userData.rotY = newRotY
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
                playSuccessSound()
                return
            }

            // ── Placement normal ────────────────────────────────────────────────
            const spawnedEntity = await world.spawnEntitySafe(entity, placeCellX, placeCellZ, footprint)
            if (!spawnedEntity) { playErrorSound(); return }

            spawnedEntity.userData.cellX = placeCellX
            spawnedEntity.userData.cellZ = placeCellZ
            spawnedEntity.userData.sizeInCells = footprint

            if (spawnedEntity.userData.isInstanced) {
                spawnedEntity.userData.rotY = targetRotY.current
                spawnedEntity.rotation.y = targetRotY.current
                world.instanceManager.setTransform(
                    spawnedEntity.userData.def as any,
                    spawnedEntity.userData.instanceSlot,
                    spawnedEntity.position,
                    targetRotY.current,
                )
            } else {
                spawnedEntity.rotation.y = targetRotY.current
            }

            playSuccessSound()
        }

        // ── Clavier ───────────────────────────────────────────────────────────────

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") { placementStore.cancel(); removeGhost(); return }
            if ((e.key === "r" || e.key === "R") && placementStore.selectedItem && isPlaceable(placementStore.selectedItem)) {
                placementStore.rotate()
                targetRotY.current += THREE.MathUtils.degToRad(90)
            }
        }

        // ── Souscription au store ─────────────────────────────────────────────────

        let lastSelectedId: string | null = null

        const unsubscribe = placementStore.subscribe(() => {
            const currentId = placementStore.selectedItem?.id ?? null
            if (currentId === lastSelectedId) return
            lastSelectedId = currentId

            if (!placementStore.selectedItem) {
                removeGhost()
                return
            }

            // Seuls les items plaçables déclenchent un ghost
            if (!isPlaceable(placementStore.selectedItem)) {
                removeGhost()
                return
            }

            if (placementStore.moveOrigin) {
                targetRotY.current = placementStore.moveOrigin.rotY
                skipNextClick = true
            }

            buildGhost(placementStore.selectedItem)
        })

        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mousedown", onMouseDown)
        window.addEventListener("click", onClick)
        window.addEventListener("keydown", onKeyDown)

        return () => {
            unsubscribe()
            removeGhost()
            stopHoverAnim()
            world.scene.remove(groundPlane, highlightMesh, hoverCellMesh, staticGridGroup, revealGroup)
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mousedown", onMouseDown)
            window.removeEventListener("click", onClick)
            window.removeEventListener("keydown", onKeyDown)
        }
    }, [camera, renderer])
}

function playSuccessSound() {
    try {
        const audio = new Audio(new URL("../../assets/click.mp3", import.meta.url).href)
        audio.volume = 0.6
        audio.play().catch(() => { })
    } catch { }
}

function playErrorSound() {
    try {
        const audio = new Audio(new URL("../../assets/click_error.mp3", import.meta.url).href)
        audio.volume = 0.4
        audio.play().catch(() => { })
    } catch { }
}