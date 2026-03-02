// src/world/Rain.ts
import * as THREE from "three"

export type RainIntensity = "none" | "light" | "moderate" | "heavy"

interface RainConfig {
  count: number
  speed: number
  spread: number
  opacity: number
  color: string
  dropLength: number
}

const RAIN_CONFIGS: Record<RainIntensity, RainConfig> = {
  none:     { count: 0,    speed: 0,  spread: 60, opacity: 0,    color: "#aaccff", dropLength: 0.5 },
  light:    { count: 800,  speed: 12, spread: 60, opacity: 0.45, color: "#cce8ff", dropLength: 0.4 },
  moderate: { count: 2000, speed: 18, spread: 60, opacity: 0.6,  color: "#aaccff", dropLength: 0.55 },
  heavy:    { count: 4000, speed: 26, spread: 60, opacity: 0.9, color: "#88aaee", dropLength: 0.75 },
}

const VERT = /* glsl */`
  attribute float aSeed;
  attribute float aEnd;

  uniform float uLocalTime;
  uniform float uSpeed;
  uniform float uSpread;
  uniform float uDropLength;
  uniform vec3  uCamPos;

  float rand(float n) {
    return fract(sin(n * 127.1 + 311.7) * 43758.5453);
  }

  void main() {
    float r1 = rand(aSeed);
    float r2 = rand(aSeed + 1.0);
    float r3 = rand(aSeed + 2.0);
    float r4 = rand(aSeed + 3.0);

    float x = uCamPos.x + (r1 - 0.5) * uSpread;
    float z = uCamPos.z + (r2 - 0.5) * uSpread;

    float height = 35.0;
    float phase  = r4 * height;
    float y = mod(height - uLocalTime * uSpeed * (0.8 + r3 * 0.4) + phase, height);

    float finalY = uCamPos.y + y - aEnd * uDropLength;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, finalY, z, 1.0);
  }
`

const FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export class Rain {
  private scene: THREE.Scene

  private mesh: THREE.LineSegments | null = null
  private geo:  THREE.BufferGeometry | null = null
  private mat:  THREE.ShaderMaterial | null = null

  private localTime = 0

  // Transition uniquement pour les changements entre niveaux actifs
  // (light ↔ moderate ↔ heavy). Jamais utilisée pour → none.
  private fromOpacity    = 0
  private fromSpeed      = 0
  private fromDropLength = 0.5
  private toOpacity      = 0
  private toSpeed        = 0
  private toDropLength   = 0.5

  private transitionProgress         = 1
  private readonly transitionDuration = 1.5

  private currentOpacity    = 0
  private currentSpeed      = 0
  private currentDropLength = 0.5

  private currentTarget: RainIntensity = "none"

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setIntensity(intensity: RainIntensity) {
    if (intensity === this.currentTarget) return

    // → none : destruction immédiate, zéro rendu
    if (intensity === "none") {
      this._destroy()
      this.currentTarget      = "none"
      this.currentOpacity     = 0
      this.currentSpeed       = 0
      this.currentDropLength  = 0.5
      this.transitionProgress = 1
      return
    }

    const cfg = RAIN_CONFIGS[intensity]

    this.fromOpacity    = this.currentOpacity
    this.fromSpeed      = this.currentSpeed
    this.fromDropLength = this.currentDropLength

    this.toOpacity      = cfg.opacity
    this.toSpeed        = cfg.speed
    this.toDropLength   = cfg.dropLength

    this.transitionProgress = 0
    this.currentTarget      = intensity

    this._rebuild(cfg)
  }

  update(deltaTime: number, cameraPosition: THREE.Vector3) {
    if (!this.mat) return

    this.localTime += deltaTime

    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + deltaTime / this.transitionDuration)
    }

    const t = smoothstep(0, 1, this.transitionProgress)

    this.currentOpacity    = lerp(this.fromOpacity,    this.toOpacity,    t)
    this.currentSpeed      = lerp(this.fromSpeed,      this.toSpeed,      t)
    this.currentDropLength = lerp(this.fromDropLength, this.toDropLength, t)

    this.mat.uniforms.uLocalTime.value  = this.localTime
    this.mat.uniforms.uSpeed.value      = this.currentSpeed
    this.mat.uniforms.uDropLength.value = this.currentDropLength
    this.mat.uniforms.uOpacity.value    = this.currentOpacity
    this.mat.uniforms.uCamPos.value.copy(cameraPosition)
    this.mat.uniforms.uSpread.value     = RAIN_CONFIGS[this.currentTarget].spread || 60
  }

  dispose() {
    this._destroy()
  }

  private _rebuild(cfg: RainConfig) {
    this._destroy()

    this.localTime = 0 // repart de 0 → pas d'artefact de position
    this.count = cfg.count

    const seeds   = new Float32Array(this.count * 2)
    const ends    = new Float32Array(this.count * 2)
    const indices = new Uint32Array(this.count * 2)

    for (let i = 0; i < this.count; i++) {
      const seed       = Math.random() * 1000
      seeds[i * 2]     = seed
      seeds[i * 2 + 1] = seed
      ends[i * 2]      = 0.0
      ends[i * 2 + 1]  = 1.0
      indices[i * 2]     = i * 2
      indices[i * 2 + 1] = i * 2 + 1
    }

    const dummyPos = new Float32Array(this.count * 2 * 3)

    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute("position", new THREE.BufferAttribute(dummyPos, 3))
    this.geo.setAttribute("aSeed",    new THREE.BufferAttribute(seeds, 1))
    this.geo.setAttribute("aEnd",     new THREE.BufferAttribute(ends,  1))
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1))

    this.mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      uniforms: {
        uLocalTime:  { value: 0 },
        uSpeed:      { value: this.currentSpeed },
        uSpread:     { value: cfg.spread },
        uDropLength: { value: this.currentDropLength },
        uOpacity:    { value: 0 },
        uColor:      { value: new THREE.Color(cfg.color) },
        uCamPos:     { value: new THREE.Vector3() },
      },
    })

    this.mesh = new THREE.LineSegments(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  private count = 0

  private _destroy() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.geo?.dispose()
      this.mat?.dispose()
      this.mesh = null
      this.geo  = null
      this.mat  = null
    }
    this.count = 0
  }
}