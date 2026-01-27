import * as THREE from "three"
import { CameraController } from "./CameraController"
import { World } from "../game/world/World"

export class Renderer {
  static instance: Renderer | null = null
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer

  cameraController: CameraController

  world!: World

  mouse = new THREE.Vector2()

  private ambientAudio: HTMLAudioElement | null = null

  constructor() {
    Renderer.instance = this
    this.scene = new THREE.Scene()
    // ciel sunset rose-orangé
    this.scene.background = new THREE.Color("#ffb3a7")
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    document.body.appendChild(this.renderer.domElement)

    const aspect = window.innerWidth / window.innerHeight
    const size = 20
    this.camera = new THREE.OrthographicCamera(
      -size * aspect, size * aspect,
      size, -size,
      0.01, 500
    )

    this.cameraController = new CameraController(this.camera)

    // --- World ---
    this.world = new World(this.scene, 60, 2)

    // --- Ambiance sonore ---
    // on prépare la musique, mais on ne la lance qu'au premier input utilisateur
    try {
      const url = new URL("../assets/ambient.mp3", import.meta.url).href
      this.ambientAudio = new Audio(url)
      this.ambientAudio.loop = true
      this.ambientAudio.volume = 0.5

      const startOnce = () => {
        if (!this.ambientAudio) return
        // certains navigateurs peuvent encore bloquer; on ignore simplement les erreurs
        this.ambientAudio.play().catch(() => {})
      }

      const opts: AddEventListenerOptions = { once: true }
      window.addEventListener("pointerdown", startOnce, opts)
      window.addEventListener("keydown", startOnce, opts)
      window.addEventListener("touchstart", startOnce, opts)
    } catch {
      // si jamais l'URL échoue, on ne casse pas le renderer
    }

    window.addEventListener("mousemove", (e) => {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    })

    // --- Resize ---
    window.addEventListener("resize", () => {
      const aspect = window.innerWidth / window.innerHeight
      const size = 20
      this.camera.left = -size * aspect
      this.camera.right = size * aspect
      this.camera.top = size
      this.camera.bottom = -size
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })
  }

  render() {
    this.cameraController.update()  
    this.renderer.render(this.scene, this.camera)
  }

  resetCameraToHome() {
    this.cameraController.resetToHome()
  }
}