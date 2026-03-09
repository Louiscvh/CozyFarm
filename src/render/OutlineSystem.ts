// src/render/OutlineSystem.ts
import * as THREE from "three"
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass }    from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass }     from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
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

  private ghostGroup: THREE.Group
  private currentEntity: THREE.Object3D | null = null
  private activeGhost: THREE.Group | null = null


  // 🔥 Cache des ghost meshes par def
  private ghostCache = new Map<any, THREE.Group>()

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer
    this.scene = scene

    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight


    this.composer = new EffectComposer(renderer)
    this.outlinePass = new OutlinePass(new THREE.Vector2(w, h), scene, camera)

    this.outlinePass.visibleEdgeColor.set("#ffffff")
    this.outlinePass.hiddenEdgeColor.set("#ffffff")

    this.outlinePass.edgeStrength = 6        // intensité
    this.outlinePass.edgeThickness = 2     // épaisseur
    this.outlinePass.edgeGlow = 0            // pas de glow
    this.outlinePass.pulsePeriod = 0         // pas d'animation

    const renderPass = new RenderPass(scene, camera)
    renderer.info.autoReset = false
    const gammaPass  = new ShaderPass(GammaCorrectionShader)
    this.outlinePass.renderScene = scene
    this.outlinePass.renderCamera = camera
    this.composer.addPass(renderPass)
    this.composer.addPass(this.outlinePass)
    this.composer.addPass(gammaPass)

    // 🔥 ghostGroup global unique
    this.ghostGroup = new THREE.Group()
    this.scene.add(this.ghostGroup)

    OutlineSystem.instance = this
  }

  // ==========================
  // SET HOVER
  // ==========================

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
      this.outlinePass.selectedObjects = [entity]
      this.ghostGroup.visible = false
      this.activeGhost = null
      return
    }

    const world = World.current
    if (!world) return

    const def = entity.userData.def

    // 🔥 Récupère ou crée le ghost depuis cache
    let cached = this.ghostCache.get(def)

    if (!cached) {
      const entries = world.instanceManager.getSubMeshEntries(def)
      if (!entries || entries.length === 0) return

      cached = new THREE.Group()

      for (const { geometry, localMat } of entries) {
        const pos   = new THREE.Vector3()
        const quat  = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        localMat.decompose(pos, quat, scale)

        const mesh = new THREE.Mesh(geometry, dummyMat)
        mesh.position.copy(pos)
        mesh.quaternion.copy(quat)
        mesh.scale.copy(scale)

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

  // ==========================
  // RENDER
  // ==========================

  render() {
    if (this.ghostGroup.visible && this.currentEntity) {
      this.ghostGroup.position.copy(this.currentEntity.position)
      this.ghostGroup.rotation.set(
        0,
        this.currentEntity.userData.rotY ?? this.currentEntity.rotation.y,
        0
      )
    }
    const camera = (World.current?.camera ?? this.outlinePass.renderCamera) as THREE.Camera
    camera.layers.enableAll()

    if (this.outlinePass.selectedObjects.length === 0) {
      this.renderer.render(this.scene, camera)
      return
    }

    this.composer.render()

  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h)
    this.outlinePass.resolution.set(w, h)
  }
}
