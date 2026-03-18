// src/render/Renderer.ts
import * as THREE from "three"
import { CameraController } from "./CameraController"
import { World } from "../game/world/World"
import { OutlineSystem } from "./OutlineSystem"
import { soundManager } from "../game/system/SoundManager"

export class Renderer {
  static instance: Renderer | null = null

  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  cameraDefaultPosition: {
    left: number,
    right: number,
    top: number,
    bot: number
  }
  renderer: THREE.WebGLRenderer
  cameraController: CameraController
  world: World
  outlineSystem: OutlineSystem
  mouse = new THREE.Vector2()

  constructor() {
    Renderer.instance = this

    // --- Scene ---
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color("#ffb3a7")

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.domElement.style.willChange = "transform"

    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    document.body.appendChild(this.renderer.domElement)

    // --- Camera ---
    this.cameraDefaultPosition = { top: 20, left: 20, right: 20, bot: 20 }
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new THREE.OrthographicCamera(
      -this.cameraDefaultPosition.left * aspect, this.cameraDefaultPosition.right * aspect,
      this.cameraDefaultPosition.top, -this.cameraDefaultPosition.bot,
      0.01, 100
    )
    this.cameraController = new CameraController(this.camera)

    // --- World (après la caméra) ---
    this.world = new World(this.scene, 1)
    this.world.setCamera(this.camera)
    this.world.setWeather();

    this.outlineSystem = new OutlineSystem(this.renderer, this.scene, this.camera)


    // --- Ambiance sonore ---
    soundManager.scheduleWarmup()
    soundManager.initAmbient()

    // --- Input ---
    window.addEventListener("mousemove", e => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    })

    // --- Resize ---
    window.addEventListener("resize", this.onResize)
  }


  private onResize = () => {
    const aspect = window.innerWidth / window.innerHeight
    this.camera.left   = -this.cameraDefaultPosition.left * aspect
    this.camera.right  =  this.cameraDefaultPosition.right * aspect
    this.camera.top    =  this.cameraDefaultPosition.top
    this.camera.bottom = -this.cameraDefaultPosition.bot
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

    render() {
        this.renderer.info.reset()   // ← reset une seule fois par frame
        this.cameraController.update()
        this.outlineSystem.render()  // le composer accumule tous ses passes sans reset intermédiaire
    }

  resetCameraToHome() {
    this.cameraController.resetToHome()
  }
}