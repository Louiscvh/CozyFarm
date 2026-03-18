// src/game/entity/InstancedEntityManager.ts
import * as THREE from "three"
import { assetManager } from "../../render/AssetManager"
import { scaleModelToCells } from "./utils/scaleModelToCells"
import type { Entity } from "./Entity"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PoolInfo {
  /** Shift applied to proxy.position.y so the model sits on the ground */
  yOffset: number
  /** Full bounding-box size of the model (after scale + entity rotation) */
  boxSize: THREE.Vector3
  /** Bounding-box center in model-local space (before yOffset) */
  boxCenter: THREE.Vector3
  /**
   * Shared BoxGeometry for proxy hitboxes — one per pool instead of one per instance.
   * All proxies of the same entity type reuse this geometry.
   */
  hitboxGeo: THREE.BoxGeometry
}

interface SubMeshEntry {
  mesh: THREE.InstancedMesh
  sourceName: string
  /**
   * The sub-mesh's world matrix when the template root is at world origin
   * (i.e. with entity-definition scale + rotation already applied).
   * Used as the "local" part of the instance matrix.
   */
  localMat: THREE.Matrix4
}

interface Pool {
  entries: SubMeshEntry[]
  active: boolean[]   // per-slot occupancy
  highWater: number   // one past the highest ever-active slot
  maxCount: number
  info: PoolInfo
}

// ── Shared temporaries (no per-frame allocations) ─────────────────────────────

const _dummy = new THREE.Object3D()
const _mat4  = new THREE.Matrix4()
const _zero  = new THREE.Matrix4().makeScale(0, 0, 0)

// ── Manager ───────────────────────────────────────────────────────────────────

export class InstancedEntityManager {
  private scene: THREE.Scene
  private pools = new Map<string, Pool>()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  // ── Pool key ──────────────────────────────────────────────────────────────

  static key(def: Entity): string {
    const r = def.rotation ?? {}
    return `${def.model}§${def.modelSize}§${r.x ?? 0}§${r.y ?? 0}§${r.z ?? 0}`
  }

  // ── Pool lifecycle ────────────────────────────────────────────────────────

  /**
   * Load the model, build InstancedMesh pools and return bounding info.
   * Idempotent: calling twice for the same def is a no-op.
   */
  async preparePool(def: Entity, tileSize: number, maxCount: number): Promise<PoolInfo> {
    const k = InstancedEntityManager.key(def)
  
    const existing = this.pools.get(k)
    if (existing) {
      if (existing.maxCount >= maxCount) return existing.info
      for (const e of existing.entries) this.scene.remove(e.mesh)
      this.pools.delete(k)
    }
  
    const cellSize = tileSize / 2
    const gltf     = await assetManager.loadGLTF(def.model)
  
    const tmpl = gltf.scene.clone(true)
    scaleModelToCells(tmpl, def.modelSize, cellSize)
    tmpl.updateMatrixWorld(true)
  
    // 1. Bounding box AVANT yOffset
    const box   = new THREE.Box3().setFromObject(tmpl)
    const boxSz = new THREE.Vector3()
    box.getSize(boxSz)
  
    // 2. Bake le yOffset dans le template
    const yOffset = -box.min.y
    tmpl.position.y = yOffset
    tmpl.updateMatrixWorld(true)
  
    // 3. Recompute boxCenter APRÈS déplacement
    const box2   = new THREE.Box3().setFromObject(tmpl)
    const boxCtr = new THREE.Vector3()
    box2.getCenter(boxCtr)
  
    const info: PoolInfo = {
      yOffset,
      boxSize   : boxSz.clone(),
      boxCenter : boxCtr.clone(),
      hitboxGeo : new THREE.BoxGeometry(boxSz.x, boxSz.y, boxSz.z),
    }
  
    const cast    = def.castShadow    !== false
    const receive = def.receiveShadow !== false
  
    const entries: SubMeshEntry[] = []
  
    tmpl.traverse(obj => {
      if (!(obj as THREE.Mesh).isMesh) return
      const src = obj as THREE.Mesh
  
      const im = new THREE.InstancedMesh(src.geometry, src.material, maxCount)
      im.castShadow    = cast
      im.receiveShadow = receive
      im.count         = 0
      im.frustumCulled = false
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      for (let i = 0; i < maxCount; i++) im.setMatrixAt(i, _zero)
      im.instanceMatrix.needsUpdate = true
  
      this.scene.add(im)
      // localMat inclut maintenant le yOffset — y=0 sera toujours correct à l'usage
      entries.push({ mesh: im, sourceName: src.name, localMat: src.matrixWorld.clone() })
    })
  
    this.pools.set(k, {
      entries,
      active   : new Array(maxCount).fill(false),
      highWater: 0,
      maxCount,
      info,
    })
  
    return info
  }

  getInfo(def: Entity): PoolInfo | undefined {
    return this.pools.get(InstancedEntityManager.key(def))?.info
  }


  forEachMaterial(def: Entity, visitor: (material: THREE.Material, sourceName: string) => void): void {
    const pool = this.pools.get(InstancedEntityManager.key(def))
    if (!pool) return
    for (const entry of pool.entries) {
      const materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]
      for (const material of materials) visitor(material, entry.sourceName)
    }
  }

  // ── Instance CRUD ─────────────────────────────────────────────────────────

  /** Add a new instance. Returns the slot index. */
  add(def: Entity, worldPos: THREE.Vector3, rotY: number): number {
    const pool = this._pool(def)

    // Find a free slot (reuse gaps left by hidden instances)
    let slot = pool.highWater
    for (let i = 0; i < pool.highWater; i++) {
      if (!pool.active[i]) { slot = i; break }
    }

    // Pool full — grow by 50% so subsequent adds don't thrash
    if (slot >= pool.maxCount) this._grow(pool)

    pool.active[slot] = true
    pool.highWater    = Math.max(pool.highWater, slot + 1)

    this._write(pool, slot, worldPos, rotY, 1)
    this._flush(pool)
    return slot
  }

  /** Double the capacity of a pool by replacing each InstancedMesh with a larger one. */
  private _grow(pool: Pool): void {
    const newMax = Math.ceil(pool.maxCount * 1.5)

    for (const e of pool.entries) {
      const old = e.mesh

      const grown = new THREE.InstancedMesh(old.geometry, old.material, newMax)
      grown.castShadow    = old.castShadow
      grown.receiveShadow = old.receiveShadow
      grown.frustumCulled = false
      grown.count         = old.count

      // Copy existing matrices
      for (let i = 0; i < old.count; i++) {
        const m = new THREE.Matrix4()
        old.getMatrixAt(i, m)
        grown.setMatrixAt(i, m)
      }
      // Zero-fill the new slots
      for (let i = old.count; i < newMax; i++) grown.setMatrixAt(i, _zero)
      grown.instanceMatrix.needsUpdate = true

      this.scene.remove(old)
      this.scene.add(grown)
      e.mesh = grown
    }

    // Extend the active array with false for new slots
    for (let i = pool.maxCount; i < newMax; i++) pool.active.push(false)
    pool.maxCount = newMax
  }

  /** Hide a slot (scale = 0, marked free). */
  hide(def: Entity, slot: number): void {
    const pool = this._pool(def)
    pool.active[slot] = false
    for (const e of pool.entries) {
      e.mesh.setMatrixAt(slot, _zero)
      e.mesh.instanceMatrix.needsUpdate = true
    }
  }

  /** Re-activate a previously hidden slot. */
  show(def: Entity, slot: number, worldPos: THREE.Vector3, rotY: number): void {
    const pool        = this._pool(def)
    pool.active[slot] = true
    this._write(pool, slot, worldPos, rotY, 1)
    this._flush(pool)
  }

  /**
   * Update position + rotation + optional scale for one slot.
   * Used by the delete animation (scale-down) and rotate animation.
   */
  setTransform(def: Entity, slot: number, worldPos: THREE.Vector3, rotY: number, scale = 1): void {
    const pool = this._pool(def)
    this._write(pool, slot, worldPos, rotY, scale)
    for (const e of pool.entries) e.mesh.instanceMatrix.needsUpdate = true
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _pool(def: Entity): Pool {
    const p = this.pools.get(InstancedEntityManager.key(def))
    if (!p) throw new Error(`Pool not prepared: ${InstancedEntityManager.key(def)}`)
    return p
  }

  /**
   * Write instance matrix for one slot.
   *
   * Formula:  finalMatrix = T(worldPos) × RY(rotY) × scale × localMat
   *
   * `localMat` already encodes the entity-definition rotation + model scale,
   * so the user-supplied rotY is layered on top without double-applying anything.
   */
  private _write(pool: Pool, slot: number, pos: THREE.Vector3, rotY: number, scale: number): void {
    _dummy.position.copy(pos)
    _dummy.rotation.set(0, rotY, 0)
    _dummy.scale.setScalar(scale)
    _dummy.updateMatrix()

    for (const e of pool.entries) {
      _mat4.copy(_dummy.matrix).multiply(e.localMat)
      e.mesh.setMatrixAt(slot, _mat4)
    }
  }

   reserveSlot(def: Entity, slot: number): void {
        const pool = this._pool(def)
        pool.active[slot] = true
        pool.highWater = Math.max(pool.highWater, slot + 1)
  }

  /** Recompute `count` (= last active slot + 1) and push to all sub-meshes. */
  private _flush(pool: Pool): void {
    let hw = 0
    for (let i = 0; i < pool.maxCount; i++) if (pool.active[i]) hw = i + 1
    pool.highWater = hw
    for (const e of pool.entries) {
      e.mesh.count = hw
      e.mesh.instanceMatrix.needsUpdate = true
    }
  }

  getSubMeshEntries(def: Entity): { geometry: THREE.BufferGeometry; localMat: THREE.Matrix4 }[] | undefined {
    const pool = this.pools.get(InstancedEntityManager.key(def))
    if (!pool) return undefined
    return pool.entries.map(e => ({ geometry: e.mesh.geometry, localMat: e.localMat }))
  }
}