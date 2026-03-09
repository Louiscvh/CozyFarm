// src/render/OutlineSystem.ts
import * as THREE from "three"
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass }    from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { World } from "../game/world/World"

const dummyMat = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  depthTest: false,
})

export class OutlineSystem {
  static instance: OutlineSystem | null = null

  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private outlinePass: OutlinePass
  private scene: THREE.Scene
  private outlineScene: THREE.Scene

  private ghostGroup: THREE.Group
  private currentEntity: THREE.Object3D | null = null
  private activeGhost: THREE.Group | null = null

  // Cache proxy meshes
  private ghostCache = new Map<any, THREE.Group>()
  private entityProxyCache = new Map<string, THREE.Group>()

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer
    this.scene = scene
    this.outlineScene = new THREE.Scene()

    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight

    this.composer = new EffectComposer(renderer)
    this.outlinePass = new OutlinePass(new THREE.Vector2(w, h), this.outlineScene, camera)

    this.outlinePass.visibleEdgeColor.set("#ffffff")
    this.outlinePass.hiddenEdgeColor.set("#ffffff")

    this.outlinePass.edgeStrength = 6
    this.outlinePass.edgeThickness = 2
    this.outlinePass.edgeGlow = 0
    this.outlinePass.pulsePeriod = 0

    const renderPass = new RenderPass(this.outlineScene, camera)
    renderPass.clear = false
    renderer.info.autoReset = false

    this.outlinePass.renderScene = this.outlineScene
    this.outlinePass.renderCamera = camera
    this.composer.addPass(renderPass)
    this.composer.addPass(this.outlinePass)

    this.ghostGroup = new THREE.Group()
    this.ghostGroup.visible = false
    this.outlineScene.add(this.ghostGroup)

    OutlineSystem.instance = this
  }

  private buildProxyGroupFromObject(source: THREE.Object3D) {
    const group = new THREE.Group()

    source.updateWorldMatrix(true, true)
    const sourceInv = new THREE.Matrix4().copy(source.matrixWorld).invert()

    source.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const relative = new THREE.Matrix4().multiplyMatrices(sourceInv, obj.matrixWorld)
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      relative.decompose(pos, quat, scale)

      const proxy = new THREE.Mesh(obj.geometry, dummyMat)
      proxy.position.copy(pos)
      proxy.quaternion.copy(quat)
      proxy.scale.copy(scale)
      proxy.frustumCulled = false
      group.add(proxy)
    })

    return group
  }

  setHovered(entity: THREE.Object3D | null) {
    if (entity === this.currentEntity) return

    this.currentEntity = entity

    if (!entity) {
      this.outlinePass.selectedObjects = []
      this.ghostGroup.visible = false
      this.activeGhost = null
      return
    }

    if (!entity.userData.isInstanced) {
      let proxy = this.entityProxyCache.get(entity.uuid)
      if (!proxy) {
        proxy = this.buildProxyGroupFromObject(entity)
        this.entityProxyCache.set(entity.uuid, proxy)
      }

      if (this.activeGhost !== proxy) {
        this.ghostGroup.clear()
        this.ghostGroup.add(proxy)
        this.activeGhost = proxy
      }

      this.ghostGroup.visible = true
      this.outlinePass.selectedObjects = [this.ghostGroup]
      return
    }

    const world = World.current
    if (!world) return

    const def = entity.userData.def
    let cached = this.ghostCache.get(def)

    if (!cached) {
      const entries = world.instanceManager.getSubMeshEntries(def)
      if (!entries || entries.length === 0) return

      cached = new THREE.Group()

      for (const { geometry, localMat } of entries) {
        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        localMat.decompose(pos, quat, scale)

        const mesh = new THREE.Mesh(geometry, dummyMat)
        mesh.position.copy(pos)
        mesh.quaternion.copy(quat)
        mesh.scale.copy(scale)
        mesh.frustumCulled = false

        cached.add(mesh)
      }

      this.ghostCache.set(def, cached)
    }

    if (this.activeGhost !== cached) {
      this.ghostGroup.clear()
      this.ghostGroup.add(cached)
      this.activeGhost = cached
    }

    this.ghostGroup.visible = true
    this.outlinePass.selectedObjects = [this.ghostGroup]
  }

  render() {
    const camera = (World.current?.camera ?? this.outlinePass.renderCamera) as THREE.Camera
    camera.layers.enableAll()

    this.renderer.render(this.scene, camera)

    if (this.outlinePass.selectedObjects.length === 0 || !this.currentEntity) return

    this.ghostGroup.position.copy(this.currentEntity.position)
    this.ghostGroup.rotation.set(
      0,
      this.currentEntity.userData.rotY ?? this.currentEntity.rotation.y,
      0
    )

    const previousAutoClear = this.renderer.autoClear
    this.renderer.autoClear = false
    this.composer.render()
    this.renderer.autoClear = previousAutoClear
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h)
    this.outlinePass.resolution.set(w, h)
  }
}
