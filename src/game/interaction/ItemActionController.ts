// src/game/interaction/ItemActionController.ts
import * as THREE from "three"
import { placementStore } from "../../ui/store/PlacementStore"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { itemActionRegistry } from "./ItemActionRegistry"
import { isPlaceable, isUsableOnEntity, isUsableOnTile, type ItemDef } from "../entity/ItemDef"
import { World } from "../world/World"
import { soundManager } from "../system/SoundManager"
import { ghostMat } from "../shared/GhostMaterial"
import { ALL_CROPS } from "../farming/CropDefinition"
import { getAreaOffsetsForLevel, getAreaOffsetsForTool, toolLevelStore } from "../../ui/store/ToolLevelStore"
import { TREE_MIN_AXE_LEVEL } from "../items/AxeItem"

export class ItemActionController {

    // ── Three.js helpers ──────────────────────────────────────────────────────
    private readonly raycaster = new THREE.Raycaster()
    private readonly mouse = new THREE.Vector2()

    // ── Highlight state ───────────────────────────────────────────────────────
    private lastHighlighted: THREE.Object3D | null = null

    // ── Drag detection ────────────────────────────────────────────────────────
    private mouseDownPos = { x: 0, y: 0 }
    private activeTouchId: number | null = null

    // ── Store subscription ────────────────────────────────────────────────────
    private unsubscribeStore: (() => void) | null = null

    // ── Bound listeners ───────────────────────────────────────────────────────
    private readonly _onMouseDown = this.onMouseDown.bind(this)
    private readonly _onMouseMove = this.onMouseMove.bind(this)
    private readonly _onClick = this.onClick.bind(this)
    private readonly _onTouchStart = this.onTouchStart.bind(this)
    private readonly _onTouchMove = this.onTouchMove.bind(this)
    private readonly _onTouchEnd = this.onTouchEnd.bind(this)

    // ── Injected dependencies ─────────────────────────────────────────────────
    private readonly camera: THREE.Camera
    private readonly renderer: THREE.WebGLRenderer
    private readonly world: World

    constructor(camera: THREE.Camera, renderer: THREE.WebGLRenderer, world: World) {
        this.camera = camera
        this.renderer = renderer
        this.world = world
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    init(): void {
        window.addEventListener("mousedown", this._onMouseDown)
        window.addEventListener("mousemove", this._onMouseMove)
        window.addEventListener("click", this._onClick)
        window.addEventListener("touchstart", this._onTouchStart, { passive: false })
        window.addEventListener("touchmove", this._onTouchMove, { passive: false })
        window.addEventListener("touchend", this._onTouchEnd)
        window.addEventListener("touchcancel", this._onTouchEnd)
        this.unsubscribeStore = placementStore.subscribe(() => this.onStoreChange())
    }

    dispose(): void {
        this.unsubscribeStore?.()
        this.setHighlight(null)
        this.renderer.domElement.style.cursor = "default"
        window.removeEventListener("mousedown", this._onMouseDown)
        window.removeEventListener("mousemove", this._onMouseMove)
        window.removeEventListener("click", this._onClick)
        window.removeEventListener("touchstart", this._onTouchStart)
        window.removeEventListener("touchmove", this._onTouchMove)
        window.removeEventListener("touchend", this._onTouchEnd)
        window.removeEventListener("touchcancel", this._onTouchEnd)
    }

    // ─── Helpers généraux ─────────────────────────────────────────────────────


    private isUiTarget(target: EventTarget | null): boolean {
        return !!(target as HTMLElement | null)?.closest?.("#ui-root")
    }

    private updatePointer(clientX: number, clientY: number): void {
        const rect = this.renderer.domElement.getBoundingClientRect()
        this.mouse.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            ((clientY - rect.top) / rect.height) * -2 + 1,
        )
        this.raycaster.setFromCamera(this.mouse, this.camera)
    }

    private isDrag(e: MouseEvent): boolean {
        const dx = e.clientX - this.mouseDownPos.x
        const dy = e.clientY - this.mouseDownPos.y
        return Math.sqrt(dx * dx + dy * dy) > 5
    }

    private getEffectiveTileType(cellX: number, cellZ: number): string | undefined {
        if (this.world.tilesFactory.isSoil(cellX, cellZ)) return "soil"
        return this.world.tilesFactory.getTileTypeAtCell(cellX, cellZ)
    }

    private isSeedItem(item: ItemDef | null): boolean {
        return !!item && !!ALL_CROPS.find(def => def.seedItemId === item.id)
    }


    private getToolOffsets(item: ItemDef): Array<{ x: number; z: number }> {
        if (!isUsableOnTile(item)) return [{ x: 0, z: 0 }]
        if (item.id !== "hoe" && item.id !== "watering_can" && item.id !== "shovel" && item.id !== "planter") return [{ x: 0, z: 0 }]
        if (item.id === "planter") return getAreaOffsetsForTool("planter", toolLevelStore.getLevel("planter"))
        return getAreaOffsetsForLevel(toolLevelStore.getLevel(item.id))
    }

    private canUseOnTileCell(item: ItemDef & { usage: { targetTileTypes: readonly string[]; allowOnCrop?: boolean; actionId: string } }, cellX: number, cellZ: number): boolean {
        const effectiveTileType = this.getEffectiveTileType(cellX, cellZ)
        if (!effectiveTileType) return false

        if (item.usage.actionId === "farming:add_stake") {
            const crop = this.world.cropManager.getCrop(cellX, cellZ)
            return !!crop?.def.supportsStake && !crop.hasStake
        }

        if (item.usage.actionId === "farming:uproot_or_untill") {
            const crop = this.world.cropManager.getCrop(cellX, cellZ)
            const hasLooseStake = this.world.cropManager.hasLooseStake(cellX, cellZ)
            const hasSnow = this.world.tilesFactory.hasSnowAtCell(cellX, cellZ)
            const canUntill = effectiveTileType === "soil"
            return !!crop || hasLooseStake || canUntill || hasSnow
        }

        if (item.usage.actionId === "scanner:inspect") {
            const isValidTile = item.usage.targetTileTypes.includes(effectiveTileType)
            return isValidTile && !!this.world.cropManager.getCrop(cellX, cellZ)
        }

        if (item.usage.actionId === "farming:bulk_plant_or_harvest") {
            const crop = this.world.cropManager.getCrop(cellX, cellZ)
            if (crop?.isReady) return true
            if (crop) return false

            const preferredSeedId = placementStore.preferredBulkSeedId
            return ALL_CROPS.some(def =>
                (def.seedItemId === preferredSeedId || preferredSeedId === null)
                && inventoryStore.getQty(def.seedItemId) > 0
                && (def.plantTileTypes ?? ["soil"]).includes(effectiveTileType)
            ) || ALL_CROPS.some(def =>
                inventoryStore.getQty(def.seedItemId) > 0
                && (def.plantTileTypes ?? ["soil"]).includes(effectiveTileType)
            )
        }

        const hasCrop = !!this.world.cropManager.getCrop(cellX, cellZ)
        const cropBlocks = hasCrop && !item.usage.allowOnCrop
        const blocked = (this.world.tilesFactory.isOccupied(cellX, cellZ) && effectiveTileType !== "soil") || cropBlocks
        const isValid = item.usage.targetTileTypes.includes(effectiveTileType)
        return isValid && !blocked
    }


    // ─── Sink ghost (animation de plantation) ────────────────────────────────
    /**
     * Anime le ghost de graine (géré par PlacementController via placementStore.ghostMesh)
     * en l'enfonçant dans le sol au moment du clic.
     */
    private sinkSeedGhost(): void {
        const ghost = placementStore.ghostMesh
        if (!ghost) return

        // Décroche immédiatement du store — PlacementController ne le touchera plus
        placementStore.ghostMesh = null

        const startX = ghost.position.x
        const startY = ghost.position.y
        const startZ = ghost.position.z
        const startScale = ghost.scale.x
        const startRotY = ghost.rotation.y
        const startTime = performance.now()
        const duration = 80

        const animate = () => {
            const t = Math.min(1, (performance.now() - startTime) / duration)
            const ease = t * t

            ghost.position.set(startX, startY - ease * 0.35, startZ)
            ghost.rotation.y = startRotY + ease * Math.PI
            ghost.scale.setScalar(Math.max(0, startScale * (1 - ease)))

            if (t < 1) {
                requestAnimationFrame(animate)
            } else {
                this.world.scene.remove(ghost)
                ghost.traverse(obj => {
                    if (!(obj as THREE.Mesh).isMesh) return
                    const mesh = obj as THREE.Mesh
                    mesh.geometry?.dispose()
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                    mats.forEach(m => { if (m !== ghostMat) m.dispose() })
                })
            }
        }
        animate()
    }

    // ─── Highlight ────────────────────────────────────────────────────────────

    private setHighlight(proxy: THREE.Object3D | null): void {
        if (this.lastHighlighted === proxy) return

        if (this.lastHighlighted) {
            this.lastHighlighted.traverse(obj => {
                const mesh = obj as THREE.Mesh
                if (!mesh.isMesh || mesh.userData.isHitBox) return
                if (mesh.userData._origEmissive === undefined) return
                    ; (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = mesh.userData._origEmissive
                delete mesh.userData._origEmissive
            })
        }

        this.lastHighlighted = proxy
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

    // ─── Cursor helpers ───────────────────────────────────────────────────────

    private setCursor(cursor: string): void {
        this.renderer.domElement.style.cursor = cursor
    }

    private updateCursorForPlacement(): void {
        this.setCursor(placementStore.canPlace ? "pointer" : "not-allowed")
    }

    private updateCursorForHarvestHover(): void {
        const { hoveredCell } = placementStore
        if (!hoveredCell) return
        const crop = this.world.cropManager.getCrop(hoveredCell.cellX, hoveredCell.cellZ)
        this.setCursor(crop?.isReady ? "pointer" : "not-allowed")
    }

    private updateCursorForEntityHover(item: ItemDef): void {
        const { hoveredCell } = placementStore
        if (!hoveredCell) { this.setHighlight(null); this.setCursor("default"); return }

        const { cellX, cellZ } = hoveredCell
        const targetIds = (item.usage as { targetEntityIds: readonly string[] }).targetEntityIds

        const entity = this.world.entities.find(ent =>
            targetIds.includes(ent.userData.id as string) &&
            ent.userData.cellX <= cellX && cellX < ent.userData.cellX + (ent.userData.sizeInCells ?? 1) &&
            ent.userData.cellZ <= cellZ && cellZ < ent.userData.cellZ + (ent.userData.sizeInCells ?? 1)
        )

        if (!entity) {
            this.setHighlight(null)
            this.setCursor("not-allowed")
            return
        }

        this.setHighlight(entity)

        const entityId = entity.userData.id as string
        if (item.id === "axe") {
            const requiredLevel = TREE_MIN_AXE_LEVEL[entityId as keyof typeof TREE_MIN_AXE_LEVEL] ?? 1
            const axeLevel = toolLevelStore.getLevel("axe")
            this.setCursor(axeLevel >= requiredLevel ? "pointer" : "not-allowed")
            return
        }

        this.setCursor("pointer")
    }

    private updateCursorForTileHover(item: ItemDef): void {
        if (!isUsableOnTile(item)) { this.setCursor("default"); return }

        const { hoveredCell } = placementStore
        if (!hoveredCell) { this.setCursor("default"); return }

        const canUse = this.getToolOffsets(item).some(offset =>
            this.canUseOnTileCell(item, hoveredCell.cellX + offset.x, hoveredCell.cellZ + offset.z)
        )

        this.setCursor(canUse ? "pointer" : "not-allowed")
    }

    // ─── Mouse events ─────────────────────────────────────────────────────────

    private onTouchStart(e: TouchEvent): void {
        if (e.touches.length !== 1 || this.isUiTarget(e.target)) return
        const touch = e.touches[0]
        this.activeTouchId = touch.identifier
        this.mouseDownPos = { x: touch.clientX, y: touch.clientY }
        this.updatePointer(touch.clientX, touch.clientY)
        this.onMouseMove()
    }

    private onTouchMove(e: TouchEvent): void {
        if (e.touches.length !== 1 || this.activeTouchId === null || this.isUiTarget(e.target)) return
        const touch = Array.from(e.touches).find(candidate => candidate.identifier === this.activeTouchId)
        if (!touch) return
        e.preventDefault()
        this.updatePointer(touch.clientX, touch.clientY)
        this.onMouseMove()
    }

    private onTouchEnd(e: TouchEvent): void {
        if (this.activeTouchId === null) return
        const touch = Array.from(e.changedTouches).find(candidate => candidate.identifier === this.activeTouchId)
        this.activeTouchId = null
        if (!touch || this.isUiTarget(e.target)) return
        this.onClick(new MouseEvent("click", { clientX: touch.clientX, clientY: touch.clientY }))
    }


    private onMouseDown(e: MouseEvent): void {
        this.mouseDownPos = { x: e.clientX, y: e.clientY }
    }

    private onMouseMove(): void {
        const item = placementStore.selectedItem
        const hoveredCell = placementStore.hoveredCell

        // Ghost item (plaçable ou graine) — cursor géré par PlacementController
        if (item && (isPlaceable(item) || !!ALL_CROPS.find(c => c.seedItemId === item.id)?.usePlacementGhost)) {
            this.updateCursorForPlacement()
            return
        }

        if (hoveredCell && !item) {
            this.updateCursorForHarvestHover()
            return
        }

        if (isUsableOnEntity(item)) {
            this.updateCursorForEntityHover(item)
            return
        }

        if (isUsableOnTile(item)) {
            this.updateCursorForTileHover(item)
            return
        }

        this.setHighlight(null)
        this.setCursor("default")
    }

    // ─── Click ────────────────────────────────────────────────────────────────

    private onClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).closest("#ui-root")) return
        if (this.isDrag(e)) return

        this.updatePointer(e.clientX, e.clientY)

        if (this.tryHarvestCrop()) return

        const item = placementStore.selectedItem
        if (!item) return

        if (isUsableOnEntity(item)) { this.handleUseOnEntity(item); return }
        if (isUsableOnTile(item)) { this.handleUseOnTile(item); return }
    }

    // ─── Harvest ──────────────────────────────────────────────────────────────

    private tryHarvestCrop(): boolean {
        const { hoveredCell, selectedItem } = placementStore
        if (!hoveredCell || selectedItem) return false

        const { cellX, cellZ } = hoveredCell
        const crop = this.world.cropManager.getCrop(cellX, cellZ)
        if (!crop?.isReady) return false

        const success = itemActionRegistry.executeEntityAction("farming:harvest", {
            targetEntityId: "crop",
            cellX,
            cellZ,
            itemId: "",
        })

        if (success) soundManager.playSuccess()
        return success
    }

    // ─── Use on entity ────────────────────────────────────────────────────────

    private handleUseOnEntity(item: ItemDef): void {
        if (!isUsableOnEntity(item)) return

        const { hoveredCell } = placementStore
        if (!hoveredCell) return

        const { cellX, cellZ } = hoveredCell

        // Trouve l'entité ciblée à la cellule survolée
        const entity = this.world.entities.find(e =>
            item.usage.targetEntityIds.includes(e.userData.id as string) &&
            e.userData.cellX <= cellX && cellX < e.userData.cellX + (e.userData.sizeInCells ?? 1) &&
            e.userData.cellZ <= cellZ && cellZ < e.userData.cellZ + (e.userData.sizeInCells ?? 1)
        )
        if (!entity) { soundManager.playError(); return }

        if (inventoryStore.getQty(item.id) <= 0) { soundManager.playError(); return }

        const success = itemActionRegistry.executeEntityAction(item.usage.actionId, {
            targetEntityId: entity.userData.id as string,
            cellX: entity.userData.cellX as number,
            cellZ: entity.userData.cellZ as number,
            itemId: item.id,
        })

        if (success) {
            this.consumeItemIfNeeded(item)
            this.playToolSuccessSound(item)
        } else {
            soundManager.playError()
        }
    }

    // ─── Use on tile ──────────────────────────────────────────────────────────

    private handleUseOnTile(item: ItemDef, silentError = false): boolean {
        if (!isUsableOnTile(item)) return false

        let targetCell = placementStore.hoveredCell

        if (item.usage.actionId === "scanner:inspect") {
            const cropMeshes = this.world.cropManager.getMeshes()
            const cropIntersects = this.raycaster.intersectObjects(cropMeshes, true)
            const hit = cropIntersects.find(intersection => {
                let node: THREE.Object3D | null = intersection.object
                while (node) {
                    if (node.userData.isCrop && typeof node.userData.cellX === "number" && typeof node.userData.cellZ === "number") return true
                    node = node.parent
                }
                return false
            })

            if (hit) {
                let node: THREE.Object3D | null = hit.object
                while (node) {
                    if (node.userData.isCrop && typeof node.userData.cellX === "number" && typeof node.userData.cellZ === "number") {
                        targetCell = { cellX: node.userData.cellX as number, cellZ: node.userData.cellZ as number }
                        break
                    }
                    node = node.parent
                }
            }
        }

        if (!targetCell) return false

        const { cellX, cellZ } = targetCell

        if (item.usage.actionId === "scanner:inspect") {
            if (!this.world.cropManager.getCrop(cellX, cellZ)) {
                if (!silentError) soundManager.playError()
                return false
            }

            const tileType = this.getEffectiveTileType(cellX, cellZ) ?? "soil"
            const success = itemActionRegistry.executeTileAction(item.usage.actionId, {
                tileType,
                cellX,
                cellZ,
                itemId: item.id,
            })

            if (success) {
                this.playToolSuccessSound(item)
            } else {
                if (!silentError) soundManager.playError()
            }
            return success
        }

        const canUse = this.getToolOffsets(item).some(offset =>
            this.canUseOnTileCell(item, cellX + offset.x, cellZ + offset.z)
        )

        if (!canUse) {
            if (!silentError) soundManager.playError()
            return false
        }
        const effectiveTileType = this.getEffectiveTileType(cellX, cellZ) ?? item.usage.targetTileTypes[0]

        if (inventoryStore.getQty(item.id) <= 0) {
            if (!silentError) soundManager.playError()
            return false
        }

        const success = itemActionRegistry.executeTileAction(item.usage.actionId, {
            tileType: effectiveTileType,
            cellX,
            cellZ,
            itemId: item.id,
        })

        if (success) {
            this.consumeItemIfNeeded(item)
            if (this.isSeedItem(item)) this.sinkSeedGhost()

            this.playToolSuccessSound(item)
        } else {
            if (!silentError) soundManager.playError()
        }
        return success
    }

    private playToolSuccessSound(item: ItemDef): void {
        if (item.id === "hoe" || item.id === "shovel") {
            soundManager.playCrop()
            return
        }

        if (item.id === "watering_can") {
            soundManager.playWateringCan()
            return
        }

        if (item.id === "axe") {
            soundManager.playAxe()
            return
        }

        soundManager.playSuccess()
    }

    // ─── Item consumption ─────────────────────────────────────────────────────

    private consumeItemIfNeeded(item: ItemDef): void {
        if (!isUsableOnEntity(item) && !isUsableOnTile(item)) return
        if (item.usage.consumeOnUse === false) return

        inventoryStore.consume(item.id)
        if (inventoryStore.getQty(item.id) <= 0) placementStore.cancel()
    }

    // ─── Store change ─────────────────────────────────────────────────────────

    private onStoreChange(): void {
        const item = placementStore.selectedItem
        const isSeedGhost = !!item && !!ALL_CROPS.find(c => c.seedItemId === item.id)?.usePlacementGhost
        if (!item || (!isUsableOnEntity(item) && !isUsableOnTile(item) && !isSeedGhost)) {
            this.setCursor("default")
            this.setHighlight(null)
        }
    }
}
