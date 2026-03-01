// src/game/world/World.ts
import * as THREE from "three"
import { TileFactory, getFixedEntities, DECOR_CATEGORIES } from "./TileFactory"
import { createEntity } from "../entity/EntityFactory"
import { placeOnCell } from "../entity/utils/placeOnCell"
import { getFootprint } from "../entity/Entity"
import type { Entity } from "../entity/Entity"
import { Weather } from "../system/Weather"
import { InstancedEntityManager } from "../entity/InstancedEntityManager"
import { debugHitboxEnabled } from "../entity/EntityFactory"

export class World {
  static current: World | null = null

  readonly size: number = 80
  readonly tileSize: number
  readonly cellSize: number
  readonly sizeInCells: number

  public entities: THREE.Object3D[] = []
  public weather!: Weather

  scene: THREE.Scene
  camera!: THREE.Camera

  public tilesFactory: TileFactory
  public instanceManager: InstancedEntityManager

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    World.current    = this
    this.scene       = scene
    this.tileSize    = tileSize
    this.cellSize    = tileSize / 2
    this.sizeInCells = this.size * 2

    this.tilesFactory    = new TileFactory(scene, this.size, tileSize)
    this.instanceManager = new InstancedEntityManager(scene)

    this.initialize()
  }

  // ─── Camera & Weather ─────────────────────────────────────────────────────

  setCamera(camera: THREE.Camera) {
    this.camera = camera
  }

  setWeather() {
    this.weather = new Weather(this.scene, this.camera)
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  update(deltaTime: number) {
    if (!this.weather) return
    this.weather.update(deltaTime)

    const now = performance.now() / 1000
    const torchIntensity = 1 - this.weather.daylight

    for (const entity of this.entities) {
      if (!entity.userData.isTorch) continue
      ;(entity as any).updateTorch(now, torchIntensity)
    }
  }

  // ─── Coordonnées ──────────────────────────────────────────────────────────

  worldToCellIndex(worldX: number, worldZ: number): { cellX: number; cellZ: number } {
    const halfCells = this.sizeInCells / 2
    return {
      cellX: Math.floor(worldX / this.cellSize + halfCells),
      cellZ: Math.floor(worldZ / this.cellSize + halfCells),
    }
  }

  tileToCell(tileX: number, tileZ: number): { cellX: number; cellZ: number } {
    return { cellX: tileX * 2, cellZ: tileZ * 2 }
  }

  // ─── Terrain checks ───────────────────────────────────────────────────────

  private isValidSpawnTerrain(cellX: number, cellZ: number, sizeInCells: number): boolean {
    for (let dx = 0; dx < sizeInCells; dx++) {
      for (let dz = 0; dz < sizeInCells; dz++) {
        const type = this.tilesFactory.getTileTypeAtCell(cellX + dx, cellZ + dz)
        if (type === "water") return false
      }
    }
    return true
  }

  // ─── Standard entity spawn (user-placed + fixed decor) ────────────────────

  async spawnEntitySafe(
    def: Entity,
    cellX: number,
    cellZ: number,
    sizeInCells?: number
  ): Promise<THREE.Object3D | null> {
    const cells = sizeInCells ?? getFootprint(def)

    if (!this.tilesFactory.canSpawn(cellX, cellZ, cells)) return null

    // Auto-route to instanced path if a pool is already prepared for this entity
    if (this.instanceManager.getInfo(def)) {
      this.tilesFactory.markOccupied(cellX, cellZ, cells)
      return this._spawnProxy(def, cellX, cellZ, cells)
    }

    // Full mesh path (entities with no pool: torches, etc.)
    this.tilesFactory.markOccupied(cellX, cellZ, cells)

    const entity = await createEntity(def, this.tileSize)
    entity.userData.id          = def.id
    entity.userData.cellX       = cellX
    entity.userData.cellZ       = cellZ
    entity.userData.sizeInCells = cells

    placeOnCell(entity, cellX, cellZ, this.cellSize, this.sizeInCells, cells)
    this.scene.add(entity)
    this.entities.push(entity)

    return entity
  }

  /** Pre-warm instanced pools for a list of entity definitions. */
  async preparePoolsForEntities(defs: { entity: Entity; maxQty: number }[]) {
    for (const { entity, maxQty } of defs) {
      await this.instanceManager.preparePool(entity, this.tileSize, maxQty)
    }
  }

  // ─── Instanced proxy (shared by decor + user-placed entities) ───────────────

  /**
   * Create a lightweight proxy Group for an instanced entity.
   * Assumes the pool is already prepared and cells are already marked occupied.
   */
  private _spawnProxy(
    def: Entity,
    cellX: number,
    cellZ: number,
    sizeInCells: number
  ): THREE.Object3D | null {
    const info = this.instanceManager.getInfo(def)
    if (!info) return null

    const half     = this.sizeInCells / 2
    const worldX   = (cellX - half + sizeInCells / 2) * this.cellSize
    const worldZ   = (cellZ - half + sizeInCells / 2) * this.cellSize
    const worldPos = new THREE.Vector3(worldX, info.yOffset, worldZ)

    const slot = this.instanceManager.add(def, worldPos, 0)

    const proxy   = new THREE.Group()
    proxy.position.copy(worldPos)

    const hitGeo  = new THREE.BoxGeometry(info.boxSize.x, info.boxSize.y, info.boxSize.z)
    const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }))
    hitMesh.position.copy(info.boxCenter)
    hitMesh.name              = "__hitbox__"
    hitMesh.userData.isHitBox = true

    const wire = new THREE.WireframeGeometry(hitGeo)
    const line = new THREE.LineSegments(
      wire,
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false })
    )
    line.visible = debugHitboxEnabled
    hitMesh.add(line)
    proxy.add(hitMesh)

    proxy.userData.id           = def.id
    proxy.userData.def          = def
    proxy.userData.cellX        = cellX
    proxy.userData.cellZ        = cellZ
    proxy.userData.sizeInCells  = sizeInCells
    proxy.userData.isInstanced  = true
    proxy.userData.instanceSlot = slot
    proxy.userData.rotY         = 0

    this.scene.add(proxy)
    this.entities.push(proxy)
    return proxy
  }

  async spawnDecorInstanced(
    def: Entity,
    cellX: number,
    cellZ: number,
    sizeInCells: number
  ): Promise<THREE.Object3D | null> {
    if (!this.tilesFactory.canSpawn(cellX, cellZ, sizeInCells)) return null
    if (!this.instanceManager.getInfo(def)) return null   // pool not prepared
    this.tilesFactory.markOccupied(cellX, cellZ, sizeInCells)
    return this._spawnProxy(def, cellX, cellZ, sizeInCells)
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private async initialize() {
    await this.populateDecor()
  }

  private async populateDecor() {
    const totalCells = this.sizeInCells * this.sizeInCells

    // 1. Pre-warm instanced pools for fixed entities (small count, maxCount = 4 is enough)
    for (const e of getFixedEntities(this.size / 2)) {
      await this.instanceManager.preparePool(e.def, this.tileSize, 4)
    }

    // 2. Pre-warm instanced pools for every random-decor type.
    //    maxCount = the full quota for that category (worst-case: all the same type).
    for (const cat of DECOR_CATEGORIES) {
      const maxPerType = Math.round(totalCells * cat.density / 4) + 16   // +16 safety margin
      for (const type of cat.types) {
        await this.instanceManager.preparePool(type, this.tileSize, maxPerType)
      }
    }

    // 3. Fixed / hand-placed entities — now instanced too.
    for (const e of getFixedEntities(this.size / 2)) {
      const { cellX, cellZ } = this.tileToCell(e.tileX, e.tileZ)
      await this.spawnDecorInstanced(e.def, cellX, cellZ, e.size)
    }

    // 4. Random ambient decor — instanced.
    for (const cat of DECOR_CATEGORIES) {
      const count       = Math.round(totalCells * cat.density / 4)
      let   placed      = 0
      let   attempts    = 0
      const maxAttempts = count * 50

      while (placed < count && attempts < maxAttempts) {
        attempts++

        const cellX = Math.floor(Math.random() * this.sizeInCells)
        const cellZ = Math.floor(Math.random() * this.sizeInCells)
        const type  = cat.types[Math.floor(Math.random() * cat.types.length)]
        const cells = getFootprint(type)

        if (!this.isValidSpawnTerrain(cellX, cellZ, cells)) continue

        const ok = await this.spawnDecorInstanced(type, cellX, cellZ, cells)
        if (ok) placed++
      }
    }
  }
}