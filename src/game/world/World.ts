// src/game/world/World.ts
import * as THREE from "three"
import { TileFactory, getFixedEntities, DECOR_CATEGORIES } from "./tile/TileFactory"
import { createEntity } from "../entity/EntityFactory"
import { placeOnCell } from "../entity/utils/placeOnCell"
import { getFootprint } from "../entity/Entity"
import type { Entity } from "../entity/Entity"
import { Weather } from "../system/Weather"
import { InstancedEntityManager } from "../entity/InstancedEntityManager"
import { debugHitboxEnabled } from "../entity/EntityFactory"
import { CropManager } from "../farming/CropManager"
import { computeGrowthRate } from "../farming/GrowthConditions"

export class World {
  static current: World | null = null

  private static readonly TREE_IDS = new Set(["tree1", "tree2", "tree3", "tree_orange"])

  readonly size: number = 50
  readonly tileSize: number
  readonly cellSize: number
  readonly sizeInCells: number

  public entities: THREE.Object3D[] = []
  public weather!: Weather

  scene: THREE.Scene
  camera!: THREE.Camera

  public tilesFactory: TileFactory
  public instanceManager: InstancedEntityManager
  public cropManager: CropManager

  constructor(scene: THREE.Scene, tileSize: number = 2) {
    World.current    = this
    this.scene       = scene
    this.tileSize    = tileSize
    this.cellSize    = tileSize / 2
    this.sizeInCells = this.size * 2

    this.tilesFactory    = new TileFactory(scene, this.size, tileSize)
    this.instanceManager = new InstancedEntityManager(scene)
    this.cropManager = new CropManager(scene, this)  // ← ajouter

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
        const now = performance.now() / 1000

        if (this.weather) this.weather.update(deltaTime)

        this.tilesFactory.tickTransitions(deltaTime)   // ← ajouter ici

        // ── Conditions de croissance ──────────────────────────────────
        const { growthRate, wateredMult } = computeGrowthRate(this.weather ?? null)
        this.cropManager.update(deltaTime, growthRate, wateredMult)
        this.cropManager.updateReadyPulse(now)

        const torchIntensity = this.weather ? 1 - this.weather.daylight : 1
        for (const entity of this.entities) {
            if (!entity.userData.isTorch) continue
                ; (entity as any).updateTorch(now, torchIntensity)
        }

        this.applyTreeWind(now)
    }

  private applyTreeWind(now: number) {
    const baseFrequency = 0.65
    const swayAmplitude = 0.045

    for (const entity of this.entities) {
      if (!World.TREE_IDS.has(entity.userData.id)) continue

      const baseRotY = entity.userData.baseRotY ?? entity.userData.rotY ?? entity.rotation.y
      entity.userData.baseRotY = baseRotY

      const phaseSeed = entity.userData.windPhase ?? ((entity.userData.cellX ?? 0) * 0.37 + (entity.userData.cellZ ?? 0) * 0.91)
      entity.userData.windPhase = phaseSeed

      const windOffset = Math.sin(now * baseFrequency + phaseSeed) * swayAmplitude
      const targetRotY = baseRotY + windOffset

      if (entity.userData.isInstanced) {
        this.instanceManager.setTransform(
          entity.userData.def,
          entity.userData.instanceSlot,
          entity.position,
          targetRotY,
          entity.scale.x
        )
        entity.userData.rotY = targetRotY
      } else {
        entity.rotation.y = targetRotY
      }
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

  moveEntitySafe(
    entity: THREE.Object3D,
    newCellX: number,
    newCellZ: number
  ): boolean {
    const size = entity.userData.sizeInCells
  
    if (!this.tilesFactory.canSpawn(newCellX, newCellZ, size)) {
      return false
    }
  
    // 1️⃣ Libérer anciennes tiles
    this.tilesFactory.markFree(
      entity.userData.cellX,
      entity.userData.cellZ,
      size
    )
  
    // 2️⃣ Marquer nouvelles tiles
    this.tilesFactory.markOccupied(newCellX, newCellZ, size)
  
    // 3️⃣ Update userData
    entity.userData.cellX = newCellX
    entity.userData.cellZ = newCellZ
  
    const half   = this.sizeInCells / 2
    const worldX = (newCellX - half + size / 2) * this.cellSize
    const worldZ = (newCellZ - half + size / 2) * this.cellSize
  
    // 4️⃣ Instanced
    if (entity.userData.isInstanced) {
      entity.position.set(worldX, entity.position.y, worldZ)
  
      this.instanceManager.setTransform(
        entity.userData.def,
        entity.userData.instanceSlot,
        entity.position,
        entity.userData.rotY ?? 0
      )
    }
    // 5️⃣ Normal mesh
    else {
      entity.position.set(worldX, entity.position.y, worldZ)
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

    const defaultRotDeg = def.rotation?.y || 0
    entity.rotation.y = THREE.MathUtils.degToRad(defaultRotDeg)

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

    const defaultRotDeg = def.rotation?.y || 0
    const rotY = THREE.MathUtils.degToRad(defaultRotDeg)

    const half     = this.sizeInCells / 2
    const worldX   = (cellX - half + sizeInCells / 2) * this.cellSize
    const worldZ   = (cellZ - half + sizeInCells / 2) * this.cellSize
    const extraY = def.yOffset ?? 0
    const instancePos = new THREE.Vector3(worldX, extraY, worldZ)
    const slot = this.instanceManager.add(def, instancePos, rotY)

    const proxy = new THREE.Group()
    proxy.position.set(worldX, extraY, worldZ)
    proxy.rotation.y = rotY
    // Reuse the shared geometry from the pool — no new BoxGeometry per instance
    const hitMesh = new THREE.Mesh(
      info.hitboxGeo,
      new THREE.MeshBasicMaterial({ visible: false })
    )
    hitMesh.position.copy(info.boxCenter)
    hitMesh.name              = "__hitbox__"
    hitMesh.userData.isHitBox = true

    // WireframeGeometry is also shared per pool
    if (!info.hitboxGeo.userData.wireframe) {
      info.hitboxGeo.userData.wireframe = new THREE.WireframeGeometry(info.hitboxGeo)
    }
    const line = new THREE.LineSegments(
      info.hitboxGeo.userData.wireframe as THREE.WireframeGeometry,
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
    proxy.userData.rotY         = rotY // Stocker la rotation actuelle

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
