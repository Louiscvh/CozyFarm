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
    this.renderer.shadowMap.enabled = true       // <- activation
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap  // optionnel, plus doux
    document.body.appendChild(this.renderer.domElement)

    // --- World ---
    this.world = new World(this.scene, 2)
    this.cameraDefaultPosition = {top: 20, left: 20, right: 20, bot: 20}
    // --- Camera ---
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new THREE.OrthographicCamera(
      -this.cameraDefaultPosition.left * aspect, this.cameraDefaultPosition.right * aspect,
      this.cameraDefaultPosition.top, -this.cameraDefaultPosition.bot,
      0.01, 100
    )
    this.cameraController = new CameraController(this.camera)


    // --- Ambiance sonore ---
    this.setupAmbientAudio("../assets/ambient.mp3")

    // --- Input ---
    window.addEventListener("mousemove", e => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    })

    // --- Resize ---
    window.addEventListener("resize", this.onResize)
  }

  private setupAmbientAudio(url: string) {
    try {
      this.ambientAudio = new Audio(new URL(url, import.meta.url).href)
      this.ambientAudio.loop = true
      this.ambientAudio.volume = 0.5

      const startOnce = () => this.ambientAudio?.play().catch(() => {})
      const opts: AddEventListenerOptions = { once: true }

      window.addEventListener("pointerdown", startOnce, opts)
      window.addEventListener("keydown", startOnce, opts)
      window.addEventListener("touchstart", startOnce, opts)
    } catch {
      // ignore si échec
    }
  }

  private onResize = () => {
    const aspect = window.innerWidth / window.innerHeight
    this.camera.left = -this.cameraDefaultPosition.left * aspect
    this.camera.right = this.cameraDefaultPosition.right * aspect
    this.camera.top = this.cameraDefaultPosition.top
    this.camera.bottom = -this.cameraDefaultPosition.bot
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  render() {
    this.cameraController.update()
    this.renderer.render(this.scene, this.camera)
    this.world.updateSun()
  }

  resetCameraToHome() {
    this.cameraController.resetToHome()
  }
}