// src/render/Renderer.ts
import * as THREE from "three"
import { CameraController } from "./CameraController"
import { World } from "../game/world/World"

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

  mouse = new THREE.Vector2()
  private ambientAudio: HTMLAudioElement | null = null

  constructor() {
    Renderer.instance = this

    // --- Scene ---
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color("#ffb3a7")

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
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

    // --- Ambiance sonore ---
    this.setupAmbientAudio()

    // --- Input ---
    window.addEventListener("mousemove", e => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    })

    // --- Resize ---
    window.addEventListener("resize", this.onResize)
  }

  private setupAmbientAudio() {
    this.ambientAudio = new Audio("/sounds/ambient.mp3")
    this.ambientAudio.loop = true
    this.ambientAudio.volume = 0.5

    const startOnce = () => this.ambientAudio?.play().catch(() => {})
    const opts: AddEventListenerOptions = { once: true }

    window.addEventListener("pointerdown", startOnce, opts)
    window.addEventListener("keydown", startOnce, opts)
    window.addEventListener("touchstart", startOnce, opts)
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
    this.cameraController.update()
    this.renderer.render(this.scene, this.camera)
  }

  resetCameraToHome() {
    this.cameraController.resetToHome()
  }
}