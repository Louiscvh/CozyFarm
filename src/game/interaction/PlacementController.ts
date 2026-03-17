// src/game/placement/PlacementController.ts
import * as THREE from "three"
import { Line2 } from "three/addons/lines/Line2.js"
import { LineGeometry } from "three/addons/lines/LineGeometry.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { placementStore } from "../../ui/store/PlacementStore"
import { historyStore } from "../../ui/store/HistoryStore"
import { World } from "../world/World"
import { getFootprint } from "../entity/Entity"
import { isPlaceable, getItemEntity, isUsableOnTile } from "../entity/ItemDef"
import type { ItemDef } from "../entity/ItemDef"
import { toolLevelStore } from "../../ui/store/ToolLevelStore"
import {
    staticGridGroup,
    buildStaticGrid,
    showGridForGhost,
    hideGridForGhost,
    revealGroup,
    buildRevealGrid,
    GRID_Y,
} from "../system/Grid"
import { soundManager } from "../system/SoundManager"
import { ghostMat, applyGhostMaterials } from "../shared/GhostMaterial"
import { ALL_CROPS } from "../farming/CropDefinition"

// ─── Shared meshes (module-level, instanciés une seule fois) ──────────────────

const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshBasicMaterial({ visible: false }),
)
groundPlane.rotation.x = -Math.PI / 2

const highlightMatOk = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, depthTest: true })
const highlightMatBad = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false, depthTest: true })
const highlightMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMatOk)
highlightMesh.rotation.x = -Math.PI / 2
highlightMesh.position.y = 0.055
highlightMesh.visible = false

const HOVER_BORDER_INSET = 0.02
type HoverShape = "single" | "square"
const hoverBorderGeo = new LineGeometry()
const hoverInnerHalf = 0.5 - HOVER_BORDER_INSET
hoverBorderGeo.setPositions([
    -hoverInnerHalf, 0, hoverInnerHalf,
    hoverInnerHalf, 0, hoverInnerHalf,
    hoverInnerHalf, 0, -hoverInnerHalf,
    -hoverInnerHalf, 0, -hoverInnerHalf,
    -hoverInnerHalf, 0, hoverInnerHalf,
])
const hoverBorderMat = new LineMaterial({
    color: 0xffffff, linewidth: 6, opacity: 1, transparent: true,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
})
const hoverCellMesh = new Line2(hoverBorderGeo, hoverBorderMat)
hoverCellMesh.position.y = 0.06
hoverCellMesh.visible = false
hoverCellMesh.frustumCulled = false

const SOIL_SURFACE_Y = -0.05
const HOVER_SURFACE_OFFSET_Y = 0.005
const GHOST_SCALE_FACTOR = 0.99999

// ─── Controller ───────────────────────────────────────────────────────────────

export class PlacementController {

    // ── Three.js helpers ──────────────────────────────────────────────────────
    private readonly raycaster = new THREE.Raycaster()
    private readonly mouse = new THREE.Vector2()
    private readonly gltfLoader = new GLTFLoader()

    // ── Ghost state ───────────────────────────────────────────────────────────
    private ghost: THREE.Object3D | null = null
    private yOffset: number = 0
    private targetPos = new THREE.Vector3()
    private currentPos = new THREE.Vector3()
    private targetRotY = 0
    private currentRotY = 0
    private ghostRaf = 0
    private ghostStartTime = 0
    private _ghostToken = 0   // annule les builds async en cours

    // ── Hover state ───────────────────────────────────────────────────────────
    private hoverTargetPos = new THREE.Vector3()
    private hoverCurrentPos = new THREE.Vector3()
    private hoverRaf = 0
    private hoverInitialized = false
    private currentHoverShape: HoverShape = "single"
    private currentHoverFootprint = 1

    // ── Click state ───────────────────────────────────────────────────────────
    private mouseDownPos = { x: 0, y: 0 }
    private skipNextClick = false

    // ── Store subscription ────────────────────────────────────────────────────
    private lastSelectedId: string | null = null
    private unsubscribeStore: (() => void) | null = null
    private unsubscribeToolLevel: (() => void) | null = null

    // ── Bound listeners ───────────────────────────────────────────────────────
    private readonly _onMouseMove = this.onMouseMove.bind(this)
    private readonly _onMouseDown = this.onMouseDown.bind(this)
    private readonly _onClick = this.onClick.bind(this)
    private readonly _onKeyDown = this.onKeyDown.bind(this)

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
        this.world.scene.add(groundPlane, highlightMesh, hoverCellMesh, staticGridGroup, revealGroup)
        buildStaticGrid(this.world.cellSize)

        window.addEventListener("mousemove", this._onMouseMove)
        window.addEventListener("mousedown", this._onMouseDown)
        window.addEventListener("click", this._onClick)
        window.addEventListener("keydown", this._onKeyDown)

        this.unsubscribeStore = placementStore.subscribe(() => this.onStoreChange())
        this.unsubscribeToolLevel = toolLevelStore.subscribe(() => this.onToolLevelChange())
    }

    dispose(): void {
        this.unsubscribeStore?.()
        this.unsubscribeToolLevel?.()
        this.removeGhost()
        this.stopHoverAnim()
        hoverCellMesh.visible = false

        this.world.scene.remove(groundPlane, highlightMesh, hoverCellMesh, staticGridGroup, revealGroup)

        window.removeEventListener("mousemove", this._onMouseMove)
        window.removeEventListener("mousedown", this._onMouseDown)
        window.removeEventListener("click", this._onClick)
        window.removeEventListener("keydown", this._onKeyDown)
    }

    // ─── Item type helpers ────────────────────────────────────────────────────

    private isSeedGhostItem(item: ItemDef): boolean {
        const cropDef = ALL_CROPS.find(c => c.seedItemId === item.id)
        return !!cropDef?.usePlacementGhost
    }

    private isStakeGhostItem(item: ItemDef): boolean {
        return item.id === "stake"
    }

    private isGhostItem(item: ItemDef): boolean {
        return isPlaceable(item) || this.isSeedGhostItem(item) || this.isStakeGhostItem(item)
    }

    private canPlaceSeed(cellX: number, cellZ: number): boolean {
        const selectedItem = placementStore.selectedItem
        const cropDef = selectedItem ? ALL_CROPS.find(c => c.seedItemId === selectedItem.id) : null
        const allowedTiles = cropDef?.plantTileTypes ?? ["soil"]
        const tileType = this.world.tilesFactory.getTileTypeAtCell(cellX, cellZ) ?? ""
        return allowedTiles.includes(tileType)
            && !this.world.cropManager.hasCrop(cellX, cellZ)
    }

    private hasCropInArea(cellX: number, cellZ: number, sizeInCells: number): boolean {
        for (let dx = 0; dx < sizeInCells; dx++) {
            for (let dz = 0; dz < sizeInCells; dz++) {
                if (this.world.cropManager.hasCrop(cellX + dx, cellZ + dz)) return true
            }
        }
        return false
    }

    private getSeedHoverY(cellX: number, cellZ: number): number {
        const baseY = this.world.tilesFactory.isSoil(cellX, cellZ) ? SOIL_SURFACE_Y : GRID_Y
        return baseY + HOVER_SURFACE_OFFSET_Y
    }

    private getHoverCursorY(cellX: number, cellZ: number, _shape: HoverShape, footprint: number): number {
        let maxBaseY = GRID_Y
        const half = Math.floor(footprint / 2)
        const startX = cellX - half
        const startZ = cellZ - half

        for (let dx = 0; dx < footprint; dx++) {
            for (let dz = 0; dz < footprint; dz++) {
                const isSoil = this.world.tilesFactory.isSoil(startX + dx, startZ + dz)
                const baseY = isSoil ? SOIL_SURFACE_Y : GRID_Y
                if (baseY > maxBaseY) maxBaseY = baseY
            }
        }

        return maxBaseY + 0.006
    }

    // ─── Helpers de coordonnées ───────────────────────────────────────────────

    private snapToCell(x: number, z: number): { cellX: number; cellZ: number } {
        const half = this.world.sizeInCells / 2
        return {
            cellX: Math.floor(x / this.world.cellSize + half),
            cellZ: Math.floor(z / this.world.cellSize + half),
        }
    }

    private cellToWorld(cellX: number, cellZ: number, footprint: number): { x: number; z: number } {
        const half = this.world.sizeInCells / 2
        const startX = (cellX - half) * this.world.cellSize
        const startZ = (cellZ - half) * this.world.cellSize
        return {
            x: startX + footprint * this.world.cellSize / 2,
            z: startZ + footprint * this.world.cellSize / 2,
        }
    }

    private getPlaceCells(cellX: number, cellZ: number, footprint: number): { placeCellX: number; placeCellZ: number } {
        const half = Math.floor(footprint / 2)
        return { placeCellX: cellX - half, placeCellZ: cellZ - half }
    }

    // ─── Hover animation ──────────────────────────────────────────────────────

    private startHoverAnim(): void {
        if (this.hoverRaf) return
        const loop = () => {
            this.hoverRaf = requestAnimationFrame(loop)
            const dist = this.hoverCurrentPos.distanceTo(this.hoverTargetPos)
            if (dist < 0.005) {
                this.hoverCurrentPos.copy(this.hoverTargetPos)
            } else {
                this.hoverCurrentPos.lerp(this.hoverTargetPos, Math.min(1, 0.28 + dist * 0.6))
            }
            hoverCellMesh.position.set(this.hoverCurrentPos.x, this.hoverCurrentPos.y, this.hoverCurrentPos.z)
        }
        loop()
    }

    private stopHoverAnim(): void {
        cancelAnimationFrame(this.hoverRaf)
        this.hoverRaf = 0
        this.hoverInitialized = false
    }

    // ─── Ghost ────────────────────────────────────────────────────────────────

    private removeGhost(keepGrid = false): void {
        this._ghostToken++
        cancelAnimationFrame(this.ghostRaf)
        if (this.ghost) {
            this.world.scene.remove(this.ghost)
            this.ghost.traverse(obj => {
                if (!(obj as THREE.Mesh).isMesh) return
                const mesh = obj as THREE.Mesh
                mesh.geometry?.dispose()
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                mats.forEach(m => { if (m !== ghostMat) m.dispose() })
            })
            this.ghost = null
            placementStore.ghostMesh = null
        }
        this.yOffset = 0
        highlightMesh.visible = false
        if (!keepGrid) {
            revealGroup.visible = false   // ← conditionné aussi
            hideGridForGhost()
        }
    }

    private startGhostAnimation(): void {
        this.ghostStartTime = performance.now()

        const animate = () => {
            this.ghostRaf = requestAnimationFrame(animate)

            if (placementStore.ghostMesh === null && this.ghost !== null) {
                this.ghost = null
                cancelAnimationFrame(this.ghostRaf)
                this.ghostRaf = 0
                const item = placementStore.selectedItem
                if (item && (this.isSeedGhostItem(item) || this.isStakeGhostItem(item))) this.buildGhost(item)
                return
            }

            if (!this.ghost) return

            this.currentPos.lerp(this.targetPos, 0.35)

            const t = (performance.now() - this.ghostStartTime) / 1000
            const floatY = Math.sin(t * 2) * 0.04

            this.ghost.position.set(
                this.currentPos.x,
                this.yOffset + floatY,
                this.currentPos.z,
            )

            this.currentRotY += (this.targetRotY - this.currentRotY) * 0.3
            this.ghost.rotation.y = this.currentRotY

            // Le highlight est déjà positionné sur la cellule cible dans updatePlacementGhost().
            // Le recoller ici à currentPos (interpolée) provoque un aller-retour visuel
            // à chaque changement de cellule ("vibration").
        }
        animate()
    }

    private async buildGhost(item: ItemDef): Promise<void> {
        if (!item || !this.isGhostItem(item)) return this.removeGhost()

        if (this.isSeedGhostItem(item)) return this.buildSeedGhost(item)
        if (this.isStakeGhostItem(item)) return this.buildStakeGhost()

        // ── Entité plaçable ───────────────────────────────────────────────────
        const entity = getItemEntity(item)

        const initialRotDeg = placementStore.moveOrigin
            ? Math.round(THREE.MathUtils.radToDeg(placementStore.moveOrigin.rotY))
            : entity.rotation?.y || 0

        placementStore.rotation = initialRotDeg
        const targetRotRad = THREE.MathUtils.degToRad(initialRotDeg)

        this.removeGhost()

        // Maintient le hover pendant le chargement async
        if (placementStore.hoveredCell) {
            const { cellX, cellZ } = placementStore.hoveredCell
            this.updateHoverCursor(cellX, cellZ, this.getHoverFootprint(placementStore.selectedItem), this.getHoverShape(placementStore.selectedItem))
        }

        const token = ++this._ghostToken
        const { createEntity } = await import("../entity/EntityFactory")
        const root = await createEntity(entity, this.world.tileSize)
        if (this._ghostToken !== token) return

        const info = this.world.instanceManager.getInfo(entity)
        const groundSnap = info?.yOffset ?? (() => {
            const box = new THREE.Box3().setFromObject(root)
            return box.min.y < 0 ? -box.min.y : 0
        })()
        this.yOffset = groundSnap

        applyGhostMaterials(root)
        root.scale.multiplyScalar(GHOST_SCALE_FACTOR)
        root.rotation.y = targetRotRad
        this.currentRotY = targetRotRad
        this.targetRotY = targetRotRad

        const footprint = getFootprint(entity)
        buildRevealGrid(this.world.cellSize, footprint)
        revealGroup.visible = true

        if (placementStore.hoveredCell) {
            const { cellX, cellZ } = placementStore.hoveredCell
            const { placeCellX, placeCellZ } = this.getPlaceCells(cellX, cellZ, footprint)
            const { x, z } = this.cellToWorld(placeCellX, placeCellZ, footprint)
            const canPlace = this.world.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint) && !this.hasCropInArea(placeCellX, placeCellZ, footprint)

            this.targetPos.set(x, this.yOffset, z)
            this.currentPos.copy(this.targetPos)
            ghostMat.color.set(canPlace ? 0xffffff : 0xff2244)

            highlightMesh.scale.set(footprint * this.world.cellSize, footprint * this.world.cellSize, 1)
            highlightMesh.position.set(x, this.getSeedHoverY(cellX, cellZ), z)
            highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
            highlightMesh.visible = true
            revealGroup.position.set(x, GRID_Y + 0.0055, z)
            showGridForGhost()
        }

        root.position.copy(this.currentPos)
        this.world.scene.add(root)
        this.ghost = root
        placementStore.ghostMesh = root

        this.startGhostAnimation()
    }

    private buildStakeGhost(): void {
        this.removeGhost()

        const root = new THREE.Mesh(
            new THREE.CylinderGeometry(this.world.cellSize * 0.025, this.world.cellSize * 0.03, this.world.cellSize * 0.9, 8),
            ghostMat,
        )
        root.scale.setScalar(GHOST_SCALE_FACTOR)
        root.castShadow = true
        root.userData.isStakeGhost = true

        this.yOffset = this.world.cellSize * 0.45

        revealGroup.visible = false
        hideGridForGhost()

        if (placementStore.hoveredCell) {
            const { cellX, cellZ } = placementStore.hoveredCell
            const { x, z } = this.cellToWorld(cellX, cellZ, 1)
            this.targetPos.set(x, this.yOffset, z)
            this.currentPos.copy(this.targetPos)

            const crop = this.world.cropManager.getCrop(cellX, cellZ)
            const canPlace = !!crop?.def.supportsStake && !crop.hasStake
            placementStore.canPlace = canPlace
            ghostMat.color.set(canPlace ? 0xffffff : 0xff2244)

            const hoverY = this.getSeedHoverY(cellX, cellZ)
            highlightMesh.scale.set(this.world.cellSize, this.world.cellSize, 1)
            highlightMesh.position.set(x, hoverY, z)
            highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
            highlightMesh.visible = true
        }

        root.position.copy(this.currentPos)
        this.world.scene.add(root)
        this.ghost = root
        placementStore.ghostMesh = root

        this.startGhostAnimation()
    }

    private async buildSeedGhost(item: ItemDef): Promise<void> {
        const cropDef = ALL_CROPS.find(c => c.seedItemId === item.id)
        if (!cropDef) return

        const lastPhase = cropDef.phases[cropDef.phases.length - 1]
        const modelPath = lastPhase?.modelPath ?? cropDef.phases.find(p => p.modelPath)?.modelPath
        if (!modelPath) return

        // Si un ghost existe déjà on le supprime, sinon on incrémente juste le token
        if (this.ghost) {
            this.removeGhost()
        } else {
            this._ghostToken++
        }

        // Ne pas afficher le curseur hover blanc pendant ce chargement async,
        // sinon il flash brièvement après la plantation en changeant de cellule.

        const token = ++this._ghostToken
        let root: THREE.Object3D
        try {
            const gltf = await new Promise<{ scene: THREE.Object3D }>((res, rej) =>
                this.gltfLoader.load(modelPath, res, undefined, rej)
            )
            root = gltf.scene.clone()
        } catch { return }
        if (this._ghostToken !== token) return

        const scale = cropDef.ghostModelScale ?? lastPhase.modelScale ?? 1
        root.scale.setScalar(scale * GHOST_SCALE_FACTOR)

        const box = new THREE.Box3().setFromObject(root)
        const phaseYOffset = lastPhase.yOffset ?? cropDef.yOffset ?? 0
        this.yOffset = (box.min.y < 0 ? -box.min.y : 0) + phaseYOffset

        applyGhostMaterials(root)

        // Grille optionnelle selon la CropDefinition
        const showGrid = cropDef.showPlacementGrid ?? false
        if (showGrid) {
            buildRevealGrid(this.world.cellSize, 1)
            revealGroup.visible = true
            showGridForGhost()
        } else {
            revealGroup.visible = false
            hideGridForGhost()
        }

        if (placementStore.hoveredCell) {
            const { cellX, cellZ } = placementStore.hoveredCell
            const { x, z } = this.cellToWorld(cellX, cellZ, 1)
            const canPlace = this.canPlaceSeed(cellX, cellZ)
            const hoverY = this.getSeedHoverY(cellX, cellZ)

            this.targetPos.set(x, this.yOffset, z)
            this.currentPos.copy(this.targetPos)
            ghostMat.color.set(canPlace ? 0xffffff : 0xff2244)

            highlightMesh.scale.set(this.world.cellSize, this.world.cellSize, 1)
            highlightMesh.position.set(x, hoverY, z)
            highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
            highlightMesh.visible = true

            if (showGrid) revealGroup.position.set(x, GRID_Y + 0.0055, z)
        }

        root.position.copy(this.currentPos)
        this.world.scene.add(root)
        this.ghost = root
        placementStore.ghostMesh = root

        this.startGhostAnimation()
    }

    // ─── Mouse move ───────────────────────────────────────────────────────────

    private getHoverShape(item: ItemDef | null): HoverShape {
        if (!item || !isUsableOnTile(item)) return "single"
        if (item.id !== "hoe" && item.id !== "watering_can" && item.id !== "shovel") return "single"

        const level = toolLevelStore.getLevel(item.id)
        if (level >= 2) return "square"
        return "single"
    }

    private updateHoverShapeGeometry(shape: HoverShape, footprint: number): void {
        if (shape === this.currentHoverShape && footprint === this.currentHoverFootprint) return

        const inner = 0.5 - HOVER_BORDER_INSET
        const outer = footprint / 2 - HOVER_BORDER_INSET

        if (shape === "square") {
            hoverBorderGeo.setPositions([
                -outer, 0, outer,
                outer, 0, outer,
                outer, 0, -outer,
                -outer, 0, -outer,
                -outer, 0, outer,
            ])
        } else {
            hoverBorderGeo.setPositions([
                -inner, 0, inner,
                inner, 0, inner,
                inner, 0, -inner,
                -inner, 0, -inner,
                -inner, 0, inner,
            ])
        }

        this.currentHoverShape = shape
        this.currentHoverFootprint = footprint
    }

    private getHoverFootprint(item: ItemDef | null): number {
        if (!item || !isUsableOnTile(item)) return 1
        if (item.id !== "hoe" && item.id !== "watering_can" && item.id !== "shovel") return 1

        const level = toolLevelStore.getLevel(item.id)
        if (level === 2) return 2
        if (level >= 3) return 3
        return 1
    }

    private updateHoverCursor(cellX: number, cellZ: number, footprint: number, shape: HoverShape): void {
        this.updateHoverShapeGeometry(shape, footprint)

        const half = Math.floor(footprint / 2)
        const { x, z } = this.cellToWorld(cellX - half, cellZ - half, footprint)
        const hoverY = this.getHoverCursorY(cellX, cellZ, shape, footprint)
        this.hoverTargetPos.set(x, hoverY, z)
        hoverCellMesh.scale.set(this.world.cellSize, 1, this.world.cellSize)

        if (!this.hoverInitialized) {
            this.hoverCurrentPos.copy(this.hoverTargetPos)
            hoverCellMesh.position.set(x, hoverY, z)
            this.hoverInitialized = true
        }

        hoverCellMesh.visible = true
        revealGroup.visible = false
        this.startHoverAnim()
    }

    private updatePlacementGhost(cellX: number, cellZ: number, item: ItemDef): void {
        hoverCellMesh.visible = false
        this.stopHoverAnim()

        if (!this.ghost && (this.isSeedGhostItem(item) || this.isStakeGhostItem(item))) {
            this.buildGhost(item)
            return
        }

        let canPlace: boolean
        let x: number
        let z: number
        let highlightY = this.getSeedHoverY(cellX, cellZ)

        if (this.isSeedGhostItem(item)) {
            const cropDef = ALL_CROPS.find(c => c.seedItemId === item.id)
            const showGrid = cropDef?.showPlacementGrid ?? false

            const pos = this.cellToWorld(cellX, cellZ, 1)
            x = pos.x
            z = pos.z
            canPlace = this.canPlaceSeed(cellX, cellZ)
            highlightY = this.getSeedHoverY(cellX, cellZ)
            highlightMesh.scale.set(this.world.cellSize, this.world.cellSize, 1)

            if (showGrid) {
                revealGroup.position.set(x, GRID_Y + 0.0055, z)
                revealGroup.visible = true
                showGridForGhost()
            } else {
                revealGroup.visible = false
                hideGridForGhost()
            }
        } else if (this.isStakeGhostItem(item)) {
            const pos = this.cellToWorld(cellX, cellZ, 1)
            x = pos.x
            z = pos.z
            const crop = this.world.cropManager.getCrop(cellX, cellZ)
            canPlace = !!crop?.def.supportsStake && !crop.hasStake
            highlightY = this.getSeedHoverY(cellX, cellZ)
            highlightMesh.scale.set(this.world.cellSize, this.world.cellSize, 1)
            revealGroup.visible = false
            hideGridForGhost()
        } else {
            const entity = getItemEntity(item)
            const footprint = getFootprint(entity)
            const { placeCellX, placeCellZ } = this.getPlaceCells(cellX, cellZ, footprint)
            const pos = this.cellToWorld(placeCellX, placeCellZ, footprint)
            x = pos.x
            z = pos.z
            canPlace = this.world.tilesFactory.canSpawn(placeCellX, placeCellZ, footprint) && !this.hasCropInArea(placeCellX, placeCellZ, footprint)
            highlightY = this.getSeedHoverY(cellX, cellZ)
            highlightMesh.scale.set(footprint * this.world.cellSize, footprint * this.world.cellSize, 1)
            revealGroup.position.set(x, GRID_Y + 0.0055, z)
            revealGroup.visible = true
            showGridForGhost()
        }

        placementStore.canPlace = canPlace
        this.targetPos.set(x, this.yOffset, z)
        ghostMat.color.set(canPlace ? 0xffffff : 0xff2244)

        highlightMesh.visible = true
        highlightMesh.position.set(x, highlightY, z)
        highlightMesh.material = canPlace ? highlightMatOk : highlightMatBad
    }

    private onMouseMove(e: MouseEvent): void {
        const rect = this.renderer.domElement.getBoundingClientRect()
        this.mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            ((e.clientY - rect.top) / rect.height) * -2 + 1,
        )
        this.raycaster.setFromCamera(this.mouse, this.camera)
        const hits = this.raycaster.intersectObject(groundPlane)
        if (!hits.length) return

        const { cellX, cellZ } = this.snapToCell(hits[0].point.x, hits[0].point.z)
        placementStore.hoveredCell = { cellX, cellZ }

        const selectedItem = placementStore.selectedItem
        if (!selectedItem || !this.isGhostItem(selectedItem)) {
            this.updateHoverCursor(cellX, cellZ, this.getHoverFootprint(selectedItem), this.getHoverShape(selectedItem))
        } else {
            this.updatePlacementGhost(cellX, cellZ, selectedItem)
        }
    }

    // ─── Click ────────────────────────────────────────────────────────────────

    private onMouseDown(e: MouseEvent): void {
        this.mouseDownPos = { x: e.clientX, y: e.clientY }
    }

    private isDrag(e: MouseEvent): boolean {
        const dx = e.clientX - this.mouseDownPos.x
        const dy = e.clientY - this.mouseDownPos.y
        return Math.sqrt(dx * dx + dy * dy) > 5
    }

    private handleMove(placeCellX: number, placeCellZ: number, footprint: number): void {
        const ent = placementStore.moveEntity!
        const fromCellX = ent.userData.cellX as number
        const fromCellZ = ent.userData.cellZ as number
        const fromRotY = ent.userData.rotY as number
        const newRotY = this.targetRotY
        // Preserve current vertical placement (includes procedural/hitbox adjustments)
        const extraY = ent.position.y

        const half = this.world.sizeInCells / 2
        const startX = (placeCellX - half) * this.world.cellSize
        const startZ = (placeCellZ - half) * this.world.cellSize
        const newPos = new THREE.Vector3(
            startX + footprint * this.world.cellSize / 2,
            extraY,
            startZ + footprint * this.world.cellSize / 2,
        )

        ent.position.copy(newPos)
        ent.rotation.y = newRotY
        ent.userData.cellX = placeCellX
        ent.userData.cellZ = placeCellZ
        ent.userData.rotY = newRotY
        ent.updateMatrix()
        ent.updateMatrixWorld(true)

        if (ent.userData.isInstanced) {
            this.world.instanceManager.show(ent.userData.def, ent.userData.instanceSlot, newPos, newRotY)
        }

        this.world.scene.add(ent)
        if (!this.world.entities.includes(ent)) this.world.entities.push(ent)
        this.world.tilesFactory.markOccupied(placeCellX, placeCellZ, footprint)

        historyStore.push({
            type: "move",
            entityObject: ent,
            fromCell: { x: fromCellX, z: fromCellZ },
            toCell: { x: placeCellX, z: placeCellZ },
            fromRot: fromRotY,
            toRot: newRotY,
            size: footprint,
        })

        placementStore.completeMove()
        this.removeGhost()
        soundManager.playSuccess()
    }

    private async handlePlace(item: ItemDef, placeCellX: number, placeCellZ: number, footprint: number): Promise<void> {
        const entity = getItemEntity(item)
        if (this.hasCropInArea(placeCellX, placeCellZ, footprint)) { soundManager.playError(); return }
        const spawnedEntity = await this.world.spawnEntitySafe(entity, placeCellX, placeCellZ, footprint)
        if (!spawnedEntity) { soundManager.playError(); return }

        const finalScale = spawnedEntity.scale.clone()
        spawnedEntity.scale.set(0, 0, 0)

        spawnedEntity.userData.cellX = placeCellX
        spawnedEntity.userData.cellZ = placeCellZ
        spawnedEntity.userData.sizeInCells = footprint

        if (spawnedEntity.userData.isInstanced) {
            spawnedEntity.userData.rotY = this.targetRotY
            spawnedEntity.rotation.y = this.targetRotY
            this.world.instanceManager.setTransform(
                spawnedEntity.userData.def as any,
                spawnedEntity.userData.instanceSlot,
                spawnedEntity.position,
                this.targetRotY,
            )
        } else {
            spawnedEntity.rotation.y = this.targetRotY
        }

        historyStore.push({
            type: "place",
            entityObject: spawnedEntity,
            cellX: placeCellX,
            cellZ: placeCellZ,
            sizeInCells: footprint,
            originalY: spawnedEntity.position.y,
            originalScale: finalScale.clone(),
            originalRotation: spawnedEntity.rotation.clone(),
        })

        const animStart = performance.now()
        const durationMs = 300
        const zeroScale = new THREE.Vector3(0, 0, 0)
        const animateSpawn = (now: number) => {
            const t = Math.min((now - animStart) / durationMs, 1)
            const ease = 1 - Math.pow(1 - t, 3)
            spawnedEntity.scale.lerpVectors(zeroScale, finalScale, ease)

            if (spawnedEntity.userData.isInstanced) {
                this.world.instanceManager.setTransform(
                    spawnedEntity.userData.def as any,
                    spawnedEntity.userData.instanceSlot,
                    spawnedEntity.position,
                    spawnedEntity.userData.rotY ?? spawnedEntity.rotation.y,
                    spawnedEntity.scale.x,
                )
            }

            if (t < 1) {
                requestAnimationFrame(animateSpawn)
            } else {
                spawnedEntity.scale.copy(finalScale)
                if (spawnedEntity.userData.isInstanced) {
                    this.world.instanceManager.setTransform(
                        spawnedEntity.userData.def as any,
                        spawnedEntity.userData.instanceSlot,
                        spawnedEntity.position,
                        spawnedEntity.userData.rotY ?? spawnedEntity.rotation.y,
                        finalScale.x,
                    )
                }
            }
        }
        requestAnimationFrame(animateSpawn)

        soundManager.playSuccess()
    }

    private async onClick(e: MouseEvent): Promise<void> {
        if ((e.target as HTMLElement).closest("#ui-root")) return
        if (this.skipNextClick) { this.skipNextClick = false; return }
        if (this.isDrag(e)) return

        const item = placementStore.selectedItem
        if (!item || !this.isGhostItem(item)) return
        if (!placementStore.hoveredCell) return

        // Les graines et tuteurs : le clic est géré par ItemActionController
        if (this.isSeedGhostItem(item) || this.isStakeGhostItem(item)) return

        if (!placementStore.canPlace) { soundManager.playError(); return }

        const entity = getItemEntity(item)
        const footprint = getFootprint(entity)
        const { cellX, cellZ } = placementStore.hoveredCell
        const { placeCellX, placeCellZ } = this.getPlaceCells(cellX, cellZ, footprint)

        if (placementStore.moveEntity) {
            this.handleMove(placeCellX, placeCellZ, footprint)
        } else {
            await this.handlePlace(item, placeCellX, placeCellZ, footprint)
        }
    }

    // ─── Clavier ──────────────────────────────────────────────────────────────

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            const ent = placementStore.moveEntity
            if (ent) {
                this.world.tilesFactory.markOccupied(
                    ent.userData.cellX,
                    ent.userData.cellZ,
                    ent.userData.sizeInCells,
                )
            }
            placementStore.cancel()
            this.removeGhost()
            return
        }

        if ((e.key === "r" || e.key === "R") && placementStore.selectedItem && isPlaceable(placementStore.selectedItem)) {
            placementStore.rotate()
            this.targetRotY += THREE.MathUtils.degToRad(90)
        }
    }

    // ─── Store ────────────────────────────────────────────────────────────────


    private onToolLevelChange(): void {
        const hoveredCell = placementStore.hoveredCell
        if (!hoveredCell) return

        const selectedItem = placementStore.selectedItem
        if (selectedItem && this.isGhostItem(selectedItem)) return

        this.updateHoverCursor(
            hoveredCell.cellX,
            hoveredCell.cellZ,
            this.getHoverFootprint(selectedItem),
            this.getHoverShape(selectedItem),
        )
    }

    private onStoreChange(): void {
        const currentId = placementStore.selectedItem?.id ?? null
        if (currentId === this.lastSelectedId) return
        this.lastSelectedId = currentId

        if (!placementStore.selectedItem || !this.isGhostItem(placementStore.selectedItem)) {
            this.removeGhost()
            return
        }

        if (placementStore.moveOrigin) {
            this.targetRotY = placementStore.moveOrigin.rotY
            this.skipNextClick = true

            const ent = placementStore.moveEntity
            if (ent) {
                this.world.tilesFactory.markFree(
                    ent.userData.cellX,
                    ent.userData.cellZ,
                    ent.userData.sizeInCells,
                )
            }
        }

        this.buildGhost(placementStore.selectedItem)
    }
}
