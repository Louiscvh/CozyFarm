// src/game/interaction/useItemAction.ts
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { placementStore } from "../../ui/store/PlacementStore"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { itemActionRegistry } from "./ItemActionRegistry"
import { isUsableOnEntity, isUsableOnTile } from "../entity/ItemDef"
import { World } from "../world/World"

interface UseItemActionOptions {
    camera: THREE.Camera
    renderer: THREE.WebGLRenderer
}

export function useItemAction({ camera, renderer }: UseItemActionOptions) {
    const raycasterRef = useRef(new THREE.Raycaster())
    const mouseRef = useRef(new THREE.Vector2())

    useEffect(() => {
        const world = World.current
        if (!world) return

        const toNDC = (e: MouseEvent): THREE.Vector2 => {
            const rect = renderer.domElement.getBoundingClientRect()
            return new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                ((e.clientY - rect.top) / rect.height) * -2 + 1,
            )
        }

        const getHitboxesForEntityIds = (targetIds: readonly string[]): THREE.Object3D[] => {
            const boxes: THREE.Object3D[] = []
            for (const entity of world.entities) {
                if (!targetIds.includes(entity.userData.id as string)) continue
                entity.traverse(child => {
                    if (child.userData.isHitBox) boxes.push(child)
                })
            }
            return boxes
        }

        // ── Highlight ──────────────────────────────────────────────────────────────

        let lastHighlighted: THREE.Object3D | null = null

        const setHighlight = (proxy: THREE.Object3D | null) => {
            if (lastHighlighted === proxy) return

            if (lastHighlighted) {
                lastHighlighted.traverse(obj => {
                    const mesh = obj as THREE.Mesh
                    if (!mesh.isMesh || mesh.userData.isHitBox) return
                    if (mesh.userData._origEmissive !== undefined) {
                        ; (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
                            mesh.userData._origEmissive
                        delete mesh.userData._origEmissive
                    }
                })
            }

            lastHighlighted = proxy
            if (!proxy) return

            proxy.traverse(obj => {
                const mesh = obj as THREE.Mesh
                if (!mesh.isMesh || mesh.userData.isHitBox) return
                const mat = mesh.material as THREE.MeshStandardMaterial
                if (!mat.emissive) return
                mesh.userData._origEmissive = mat.emissiveIntensity
                mat.emissiveIntensity = 0.35
            })
        }

        // ── Drag detection ─────────────────────────────────────────────────────────

        let mouseDownPos = { x: 0, y: 0 }

        const onMouseDown = (e: MouseEvent) => {
            mouseDownPos = { x: e.clientX, y: e.clientY }
        }

        // ── Mouse move ─────────────────────────────────────────────────────────────

        const onMouseMove = (e: MouseEvent) => {
            const item = placementStore.selectedItem
             
            const hoveredCell = placementStore.hoveredCell
            if (hoveredCell && !placementStore.selectedItem) {
                const crop = world.cropManager.getCrop(hoveredCell.cellX, hoveredCell.cellZ)

                if (crop?.isReady) {
                    renderer.domElement.style.cursor = "pointer"
                    return
                }
            }

            // ── use_on_entity : highlight + curseur pointer ──────────────────────────
            if (isUsableOnEntity(item)) {
                mouseRef.current.copy(toNDC(e))
                raycasterRef.current.setFromCamera(mouseRef.current, camera)

                const hitboxes = getHitboxesForEntityIds(item.usage.targetEntityIds)
                const hits = raycasterRef.current.intersectObjects(hitboxes, false)

                if (hits.length > 0) {
                    const proxy = hits[0].object.parent
                    setHighlight(proxy ?? null)
                    renderer.domElement.style.cursor = "pointer"
                } else {
                    setHighlight(null)
                    renderer.domElement.style.cursor = "default"
                }
                return
            }

            // ── use_on_tile : curseur pointer si tile valide ─────────────────────────
            if (isUsableOnTile(item)) {
                if (!placementStore.hoveredCell) {
                    renderer.domElement.style.cursor = "default"
                    return
                }

                const { cellX, cellZ } = placementStore.hoveredCell

                let effectiveTileType: string | undefined =
                    world.tilesFactory.getTileTypeAtCell(cellX, cellZ)

                if (world.tilesFactory.isSoil(cellX, cellZ)) {
                    effectiveTileType = "soil"
                }

                // ← occupied bloque uniquement si ce n'est PAS du soil
                // (le soil est occupé par construction mais reste utilisable pour planter)
                const blocked =
                    world.tilesFactory.isOccupied(cellX, cellZ) &&
                    effectiveTileType !== "soil"

                if (blocked) {
                    renderer.domElement.style.cursor = "default"
                    return
                }

                const isValid =
                    !!effectiveTileType &&
                    item.usage.targetTileTypes.includes(effectiveTileType)

                renderer.domElement.style.cursor = isValid ? "pointer" : "default"
                return
            }

            // ── Pas d'item utilisable sélectionné ────────────────────────────────────
            setHighlight(null)
            renderer.domElement.style.cursor = "default"
        }

        // ── Click ──────────────────────────────────────────────────────────────────

        const onClick = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest("#ui-root")) return

            // Ignore si c'était un drag caméra
            const dx = e.clientX - mouseDownPos.x
            const dy = e.clientY - mouseDownPos.y
            if (Math.sqrt(dx * dx + dy * dy) > 5) return

            mouseRef.current.copy(toNDC(e))
            raycasterRef.current.setFromCamera(mouseRef.current, camera)

            // ── 1. Récolte libre (sans item sélectionné) ───────────────────────────
            const hoveredCell = placementStore.hoveredCell
            if (hoveredCell && !placementStore.selectedItem) {
                const { cellX, cellZ } = hoveredCell
                const crop = world.cropManager.getCrop(cellX, cellZ)
                if (crop?.isReady) {
                    const success = itemActionRegistry.executeEntityAction("farming:harvest", {
                        targetEntityId: "crop",
                        cellX,
                        cellZ,
                        itemId: "",
                    })
                    if (success) { playSuccessSound(); return }
                }
            }

            // ── 2. Items use_on_entity / use_on_tile ───────────────────────────────
            const item = placementStore.selectedItem
            if (!item) return

            // ── use_on_entity ────────────────────────────────────────────────────────
            if (isUsableOnEntity(item)) {
                const hitboxes = getHitboxesForEntityIds(item.usage.targetEntityIds)
                if (!hitboxes.length) return

                const hits = raycasterRef.current.intersectObjects(hitboxes, false)
                if (!hits.length) return

                const proxy = hits[0].object.parent
                if (!proxy) return

                if (inventoryStore.getQty(item.id) <= 0) { playErrorSound(); return }

                const hitPoint = hits[0].point
                const half = world.sizeInCells / 2
                const cellX = Math.floor(hitPoint.x / world.cellSize + half)
                const cellZ = Math.floor(hitPoint.z / world.cellSize + half)

                const entityCellX = proxy.userData.cellX as number
                const entityCellZ = proxy.userData.cellZ as number
                const entitySize = proxy.userData.sizeInCells as number

                const inBounds =
                    cellX >= entityCellX &&
                    cellX < entityCellX + entitySize &&
                    cellZ >= entityCellZ &&
                    cellZ < entityCellZ + entitySize

                if (!inBounds) { playErrorSound(); return }

                const success = itemActionRegistry.executeEntityAction(item.usage.actionId, {
                    targetEntityId: proxy.userData.id as string,
                    cellX,
                    cellZ,
                    itemId: item.id,
                })

                if (success) {
                    if (item.usage.consumeOnUse !== false) {
                        inventoryStore.consume(item.id)
                        if (inventoryStore.getQty(item.id) <= 0) placementStore.cancel()
                    }
                    playSuccessSound()
                } else {
                    playErrorSound()
                }
                return
            }

            // ── use_on_tile ──────────────────────────────────────────────────────────
            if (isUsableOnTile(item)) {
                if (!placementStore.hoveredCell) return
                const { cellX, cellZ } = placementStore.hoveredCell

                let effectiveTileType: string | undefined =
                    world.tilesFactory.getTileTypeAtCell(cellX, cellZ)

                if (world.tilesFactory.isSoil(cellX, cellZ)) {
                    effectiveTileType = "soil"
                }

                if (!effectiveTileType || !item.usage.targetTileTypes.includes(effectiveTileType)) {
                    playErrorSound()
                    return
                }

                if (inventoryStore.getQty(item.id) <= 0) { playErrorSound(); return }

                const success = itemActionRegistry.executeTileAction(item.usage.actionId, {
                    tileType: effectiveTileType,
                    cellX,
                    cellZ,
                    itemId: item.id,
                })

                if (success) {
                    if (item.usage.consumeOnUse !== false) {
                        inventoryStore.consume(item.id)
                        if (inventoryStore.getQty(item.id) <= 0) placementStore.cancel()
                    }
                    playSuccessSound()
                } else {
                    playErrorSound()
                }
            }
        }

        // ── Cleanup cursor quand on désélectionne ──────────────────────────────────

        const unsubscribe = placementStore.subscribe(() => {
            const item = placementStore.selectedItem
            if (!item || (!isUsableOnEntity(item) && !isUsableOnTile(item))) {
                renderer.domElement.style.cursor = "default"
                setHighlight(null)
            }
        })

        window.addEventListener("mousedown", onMouseDown)
        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("click", onClick)

        return () => {
            unsubscribe()
            setHighlight(null)
            renderer.domElement.style.cursor = "default"
            window.removeEventListener("mousedown", onMouseDown)
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("click", onClick)
        }
    }, [camera, renderer])
}

function playSuccessSound() {
    try {
        const audio = new Audio(new URL("../../assets/click.mp3", import.meta.url).href)
        audio.volume = 0.5
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