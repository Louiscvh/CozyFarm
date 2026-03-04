// src/render/OutlineSystem.ts
import * as THREE from "three"
import { World } from "../game/world/World"

// ── Matériau outline : BackSide + depthTest:true ──────────────
// Les back-faces du mesh agrandi sont occludées par le depth buffer
// de l'objet original déjà rendu → seul le bord visible qui dépasse
// reste dessiné. Aucun stencil nécessaire.
const outlineMat = new THREE.MeshBasicMaterial({
  color:      0xffffff,
  side:       THREE.BackSide,
  depthWrite: false,
  depthTest:  true,
  transparent: true,
  opacity:    0.95,
})

export class OutlineSystem {
  static instance: OutlineSystem | null = null

  private scene:         THREE.Scene
  private currentEntity: THREE.Object3D | null = null

  private outlineGroup: THREE.Group

  private outlineCache = new Map<any, THREE.Group>()

  private _scale = 1.02

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.scene = scene
    renderer.info.autoReset = false

    this.outlineGroup = new THREE.Group()
    this.outlineGroup.scale.setScalar(this._scale)
    this.outlineGroup.renderOrder = 999
    this.outlineGroup.visible = false

    scene.add(this.outlineGroup)

    OutlineSystem.instance = this
  }

  // ── Construction du groupe outline ────────────────────────

  private buildOutlineForEntity(entity: THREE.Object3D) {
    const world    = World.current
    const def      = entity.userData.def
    const cacheKey = entity.userData.isInstanced ? def : entity.uuid

    if (this.outlineCache.has(cacheKey)) {
      this.outlineGroup.clear()
      this.outlineGroup.add(this.outlineCache.get(cacheKey)!.clone(true))
      return
    }

    const oGrp = new THREE.Group()

    const addMesh = (geometry: THREE.BufferGeometry, localMat: THREE.Matrix4) => {
      const pos   = new THREE.Vector3()
      const quat  = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      localMat.decompose(pos, quat, scale)

      if (!geometry.attributes.normal) geometry.computeVertexNormals()

      const om = new THREE.Mesh(geometry, outlineMat)
      om.position.copy(pos)
      om.quaternion.copy(quat)
      om.scale.copy(scale)
      om.renderOrder = 999
      oGrp.add(om)
    }

    if (entity.userData.isInstanced && world) {
      const entries = world.instanceManager.getSubMeshEntries(def)
      if (!entries || entries.length === 0) return
      for (const { geometry, localMat } of entries) {
        addMesh(geometry, localMat)
      }
    } else {
      entity.updateWorldMatrix(true, true)
      const rootInv = entity.matrixWorld.clone().invert()
      entity.traverse(obj => {
        if (!(obj as THREE.Mesh).isMesh) return
        if (obj.userData.isHitBox || obj.name === "__hitbox__") return
        const mesh = obj as THREE.Mesh
        mesh.updateWorldMatrix(true, false)
        const localMat = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld)
        addMesh(mesh.geometry, localMat)
      })
    }

    this.outlineCache.set(cacheKey, oGrp)
    this.outlineGroup.clear()
    this.outlineGroup.add(oGrp.clone(true))
  }

  // ── API publique ──────────────────────────────────────────

  setHovered(entity: THREE.Object3D | null) {
    this.currentEntity = entity
    if (!entity) {
      this.outlineGroup.visible = false
      return
    }
    this.buildOutlineForEntity(entity)
    this.outlineGroup.visible = true
  }

  syncPosition() {
    if (!this.currentEntity) return
    const pos  = this.currentEntity.position
    const rotY = this.currentEntity.userData.isInstanced
      ? (this.currentEntity.userData.rotY ?? 0)
      : this.currentEntity.rotation.y

    this.outlineGroup.position.copy(pos)
    this.outlineGroup.rotation.set(0, rotY, 0)
  }

  /**
   * Scale du groupe outline (défaut 1.08 = bordure de 8%).
   * 1.04 = bordure fine, 1.12 = bordure épaisse.
   */
  setThickness(scale: number) {
    this._scale = scale
    this.outlineGroup.scale.setScalar(scale)
  }

  setColor(hex: number) {
    outlineMat.color.set(hex)
  }

  resize(_w: number, _h: number) { /* pas de composer */ }
}