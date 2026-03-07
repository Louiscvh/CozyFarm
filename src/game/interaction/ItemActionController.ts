// src/game/interaction/ItemActionController.ts
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { placementStore } from "../../ui/store/PlacementStore"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { itemActionRegistry } from "./ItemActionRegistry"
import { isPlaceable, isUsableOnEntity, isUsableOnTile, type ItemDef } from "../entity/ItemDef"
import { World } from "../world/World"
import { soundManager } from "../system/SoundManager"
import { ghostMat, applyGhostMaterials } from "../shared/GhostMaterial"
import { ALL_CROPS, type CropDefinition } from "../farming/CropDefinition"

export class ItemActionController {

    // ── Three.js helpers ──────────────────────────────────────────────────────
    private readonly raycaster = new THREE.Raycaster()
    private readonly mouse = new THREE.Vector2()
    private readonly gltfLoader = new GLTFLoader()

    // ── Highlight state ───────────────────────────────────────────────────────
    private lastHighlighted: THREE.Object3D | null = null

    // ── Seed ghost state ──────────────────────────────────────────────────────
    private seedGhost: THREE.Object3D | null = null
    private seedGhostRaf: number = 0
    private seedGhostCell: string = ""
    private seedGhostTarget = new THREE.Vector3()
    private seedGhostCurrent = new THREE.Vector3()
    private seedGhostToken: number = 0 
    // ── Drag detection ────────────────────────────────────────────────────────
    private mouseDownPos = { x: 0, y: 0 }

    // ── Store subscription ────────────────────────────────────────────────────
    private unsubscribeStore: (() => void) | null = null

    // ── Bound listeners ───────────────────────────────────────────────────────
    private readonly _onMouseDown = this.onMouseDown.bind(this)
    private readonly _onMouseMove = this.onMouseMove.bind(this)
    private readonly _onClick = this.onClick.bind(this)

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
        this.unsubscribeStore = placementStore.subscribe(() => this.onStoreChange())
    }

    dispose(): void {
        this.unsubscribeStore?.()
        this.setHighlight(null)
        this.removeSeedGhost()
        this.renderer.domElement.style.cursor = "default"
        window.removeEventListener("mousedown", this._onMouseDown)
        window.removeEventListener("mousemove", this._onMouseMove)
        window.removeEventListener("click", this._onClick)
    }

    // ─── Helpers généraux ─────────────────────────────────────────────────────

    private toNDC(e: MouseEvent): THREE.Vector2 {
        const rect = this.renderer.domElement.getBoundingClientRect()
        return new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            ((e.clientY - rect.top) / rect.height) * -2 + 1,
        )
    }

    private isDrag(e: MouseEvent): boolean {
        const dx = e.clientX - this.mouseDownPos.x
        const dy = e.clientY - this.mouseDownPos.y
        return Math.sqrt(dx * dx + dy * dy) > 5
    }

    private getHitboxesForEntityIds(targetIds: readonly string[]): THREE.Object3D[] {
        const boxes: THREE.Object3D[] = []
        for (const entity of this.world.entities) {
            if (!targetIds.includes(entity.userData.id as string)) continue
            entity.traverse(child => {
                if (child.userData.isHitBox) boxes.push(child)
            })
        }
        return boxes
    }

    private getEffectiveTileType(cellX: number, cellZ: number): string | undefined {
        if (this.world.tilesFactory.isSoil(cellX, cellZ)) return "soil"
        return this.world.tilesFactory.getTileTypeAtCell(cellX, cellZ)
    }

    private cellToWorldPos(cellX: number, cellZ: number): THREE.Vector3 {
        const half = this.world.sizeInCells / 2
        return new THREE.Vector3(
            (cellX - half + 0.5) * this.world.cellSize,
            0,
            (cellZ - half + 0.5) * this.world.cellSize,
        )
    }

    // ─── Crop def helpers ─────────────────────────────────────────────────────

    private getCropDefForSeed(item: ItemDef): CropDefinition | null {
        return ALL_CROPS.find(def => def.seedItemId === item.id) ?? null
    }

    private isSeedItem(item: ItemDef | null): item is ItemDef {
        return !!item && !!this.getCropDefForSeed(item)
    }

    // ─── Seed ghost ───────────────────────────────────────────────────────────

    private removeSeedGhost(): void {
        cancelAnimationFrame(this.seedGhostRaf)
        this.seedGhostRaf = 0
        this.seedGhostCell = ""
        this.seedGhostToken++   // ← invalide tout build en cours

        if (!this.seedGhost) return
        this.world.scene.remove(this.seedGhost)
        this.seedGhost.traverse(obj => {
            if (!(obj as THREE.Mesh).isMesh) return
            const mesh = obj as THREE.Mesh
            mesh.geometry?.dispose()
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach(m => { if (m !== ghostMat) m.dispose() })
        })
        this.seedGhost = null
    }

    private async buildSeedGhost(cropDef: CropDefinition, cellX: number, cellZ: number): Promise<void> {
        const lastPhase = cropDef.phases[cropDef.phases.length - 1]
        const modelPath = lastPhase?.modelPath ?? cropDef.phases.find(p => p.modelPath)?.modelPath
        if (!modelPath) return

        const token = ++this.seedGhostToken
        const worldPos = this.cellToWorldPos(cellX, cellZ)
        this.seedGhostTarget.copy(worldPos)
        this.seedGhostCurrent.copy(worldPos)
        this.seedGhostCell = `${cellX}|${cellZ}`

        let root: THREE.Object3D
        try {
            const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
                this.gltfLoader.load(modelPath, resolve, undefined, reject)
            })
            root = gltf.scene.clone()
        } catch {
            return
        }

        if (this.seedGhostToken !== token) return

        const scale = lastPhase.modelScale ?? 1
        root.scale.setScalar(scale)

        const box = new THREE.Box3().setFromObject(root)
        const yOffset = (box.min.y < 0 ? -box.min.y : 0)
        root.position.set(worldPos.x, yOffset, worldPos.z)

        applyGhostMaterials(root)
        this.world.scene.add(root)
        this.seedGhost = root

        const baseY = yOffset
        const startTime = performance.now()

        const animate = () => {
            this.seedGhostRaf = requestAnimationFrame(animate)
            if (!this.seedGhost) return

            this.seedGhostCurrent.lerp(this.seedGhostTarget, 0.25)

            const t = (performance.now() - startTime) / 1000
            const floatY = Math.sin(t * 2) * 0.04

            this.seedGhost.position.set(
                this.seedGhostCurrent.x,
                baseY + floatY,
                this.seedGhostCurrent.z,
            )
            this.seedGhost.rotation.y += 0.012
        }
        animate()
    }

    private updateSeedGhost(item: ItemDef, cellX: number, cellZ: number): void {
        const isSoil = this.world.tilesFactory.isSoil(cellX, cellZ)
        const hasCrop = !!this.world.cropManager.getCrop(cellX, cellZ)

        if (!isSoil || hasCrop) { this.removeSeedGhost(); return }

        const cropDef = this.getCropDefForSeed(item)
        if (!cropDef) { this.removeSeedGhost(); return }

        const cellKey = `${cellX}|${cellZ}`

        if (this.seedGhost) {
            // Ghost déjà présent : met à jour la cible si on a changé de cellule
            if (this.seedGhostCell !== cellKey) {
                this.seedGhostTarget.copy(this.cellToWorldPos(cellX, cellZ))
                this.seedGhostCell = cellKey
            }
            return
        }

        // Pas encore de ghost : on le construit (async)
        this.buildSeedGhost(cropDef, cellX, cellZ)
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
        this.setCursor(crop?.isReady ? "pointer" : "default")
    }

    private updateCursorForEntityHover(e: MouseEvent, item: ItemDef): void {
        this.mouse.copy(this.toNDC(e))
        this.raycaster.setFromCamera(this.mouse, this.camera)

        const hitboxes = this.getHitboxesForEntityIds((item as any).usage.targetEntityIds)
        const hits = this.raycaster.intersectObjects(hitboxes, false)

        if (hits.length > 0) {
            this.setHighlight(hits[0].object.parent ?? null)
            this.setCursor("pointer")
        } else {
            this.setHighlight(null)
            this.setCursor("default")
        }
    }

    private updateCursorForTileHover(item: ItemDef): void {
        const { hoveredCell } = placementStore
        if (!hoveredCell) { this.setCursor("default"); return }

        const { cellX, cellZ } = hoveredCell
        const effectiveTileType = this.getEffectiveTileType(cellX, cellZ)
        const hasCrop = !!this.world.cropManager.getCrop(cellX, cellZ)
        const cropBlocks = hasCrop && !(item as any).usage.allowOnCrop
        const blocked = (this.world.tilesFactory.isOccupied(cellX, cellZ) && effectiveTileType !== "soil") || cropBlocks
        const isValid = !!effectiveTileType && (item as any).usage.targetTileTypes.includes(effectiveTileType)

        this.setCursor(isValid && !blocked ? "pointer" : "not-allowed")
    }

    // ─── Mouse events ─────────────────────────────────────────────────────────

    private onMouseDown(e: MouseEvent): void {
        this.mouseDownPos = { x: e.clientX, y: e.clientY }
    }

    private onMouseMove(e: MouseEvent): void {
        const item = placementStore.selectedItem
        const hoveredCell = placementStore.hoveredCell

        if (item && isPlaceable(item)) {
            this.removeSeedGhost()
            this.updateCursorForPlacement()
            return
        }

        if (hoveredCell && !item) {
            this.removeSeedGhost()
            this.updateCursorForHarvestHover()
            return
        }

        if (isUsableOnEntity(item)) {
            this.removeSeedGhost()
            this.updateCursorForEntityHover(e, item)
            return
        }

        if (isUsableOnTile(item)) {
            if (hoveredCell && this.isSeedItem(item)) {
                this.updateSeedGhost(item, hoveredCell.cellX, hoveredCell.cellZ)
            } else {
                this.removeSeedGhost()
            }
            this.updateCursorForTileHover(item)
            return
        }

        this.removeSeedGhost()
        this.setHighlight(null)
        this.setCursor("default")
    }

    // ─── Click ────────────────────────────────────────────────────────────────

    private onClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).closest("#ui-root")) return
        if (this.isDrag(e)) return

        this.mouse.copy(this.toNDC(e))
        this.raycaster.setFromCamera(this.mouse, this.camera)

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

        const hitboxes = this.getHitboxesForEntityIds(item.usage.targetEntityIds)
        if (!hitboxes.length) return

        const hits = this.raycaster.intersectObjects(hitboxes, false)
        if (!hits.length) return

        const proxy = hits[0].object.parent
        if (!proxy) return

        if (inventoryStore.getQty(item.id) <= 0) { soundManager.playError(); return }

        const { cellX, cellZ } = this.hitPointToCell(hits[0].point)
        if (!this.isHitInEntityBounds(proxy, cellX, cellZ)) { soundManager.playError(); return }

        const success = itemActionRegistry.executeEntityAction(item.usage.actionId, {
            targetEntityId: proxy.userData.id as string,
            cellX,
            cellZ,
            itemId: item.id,
        })

        if (success) {
            this.consumeItemIfNeeded(item)
            soundManager.playSuccess()
        } else {
            soundManager.playError()
        }
    }

    // ─── Use on tile ──────────────────────────────────────────────────────────

    private handleUseOnTile(item: ItemDef): void {
        if (!isUsableOnTile(item)) return
        if (!placementStore.hoveredCell) return

        const { cellX, cellZ } = placementStore.hoveredCell
        const effectiveTileType = this.getEffectiveTileType(cellX, cellZ)
        const hasCrop = !!this.world.cropManager.getCrop(cellX, cellZ)
        const cropBlocks = hasCrop && !item.usage.allowOnCrop

        if (!effectiveTileType || !item.usage.targetTileTypes.includes(effectiveTileType) || cropBlocks) {
            soundManager.playError()
            return
        }

        if (inventoryStore.getQty(item.id) <= 0) { soundManager.playError(); return }

        const success = itemActionRegistry.executeTileAction(item.usage.actionId, {
            tileType: effectiveTileType,
            cellX,
            cellZ,
            itemId: item.id,
        })

        if (success) {
            this.consumeItemIfNeeded(item)
            if (this.isSeedItem(item)) this.removeSeedGhost()
            soundManager.playSuccess()
        } else {
            soundManager.playError()
        }
    }

    // ─── Item consumption ─────────────────────────────────────────────────────

    private consumeItemIfNeeded(item: ItemDef): void {
        if (!isUsableOnEntity(item) && !isUsableOnTile(item)) return
        if (item.usage.consumeOnUse === false) return

        inventoryStore.consume(item.id)
        if (inventoryStore.getQty(item.id) <= 0) placementStore.cancel()
    }

    // ─── Coordinate helpers ───────────────────────────────────────────────────

    private hitPointToCell(point: THREE.Vector3): { cellX: number; cellZ: number } {
        const half = this.world.sizeInCells / 2
        return {
            cellX: Math.floor(point.x / this.world.cellSize + half),
            cellZ: Math.floor(point.z / this.world.cellSize + half),
        }
    }

    private isHitInEntityBounds(proxy: THREE.Object3D, cellX: number, cellZ: number): boolean {
        const { cellX: ecx, cellZ: ecz, sizeInCells: size } = proxy.userData as {
            cellX: number; cellZ: number; sizeInCells: number
        }
        return cellX >= ecx && cellX < ecx + size && cellZ >= ecz && cellZ < ecz + size
    }

    // ─── Store change ─────────────────────────────────────────────────────────

    private onStoreChange(): void {
        const item = placementStore.selectedItem
        if (!item || (!isUsableOnEntity(item) && !isUsableOnTile(item))) {
            this.setCursor("default")
            this.setHighlight(null)
            this.removeSeedGhost()
        }
    }
}