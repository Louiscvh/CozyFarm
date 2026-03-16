import * as THREE from "three"
import type { RainIntensity } from "./Rain"

interface SnowConfig {
  count: number
  speed: number
  spread: number
  opacity: number
  sizePx: number
}

const SNOW_CONFIGS: Record<RainIntensity, SnowConfig> = {
  none: { count: 0, speed: 0, spread: 90, opacity: 0, sizePx: 0 },
  light: { count: 2400, speed: 1.8, spread: 90, opacity: 0.85, sizePx: 5 },
  moderate: { count: 4200, speed: 2.4, spread: 100, opacity: 0.9, sizePx: 7 },
  heavy: { count: 6200, speed: 3.2, spread: 110, opacity: 0.95, sizePx: 9 },
}

const VERT = /* glsl */`
  attribute float aSeed;

  uniform float uLocalTime;
  uniform float uSpeed;
  uniform float uSpread;
  uniform float uPointSize;
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

    float height = 90.0;
    float phase  = r4 * height;
    float y = mod(height - uLocalTime * uSpeed * (0.8 + r3 * 0.4) + phase, height);

    float swayX = sin(uLocalTime * 0.8 + aSeed * 12.0) * 0.35;
    float swayZ = cos(uLocalTime * 0.7 + aSeed * 9.0) * 0.35;

    vec3 worldPos = vec3(x + swayX, uCamPos.y + y - (height * 0.5), z + swayZ);

    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uPointSize;
  }
`

const FRAG = /* glsl */`
  uniform float uOpacity;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    float alpha = smoothstep(0.5, 0.2, d) * uOpacity;
    if (alpha <= 0.01) discard;
    gl_FragColor = vec4(vec3(1.0), alpha);
  }
`

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export class Snow {
  private readonly scene: THREE.Scene

  private points: THREE.Points | null = null
  private geo: THREE.BufferGeometry | null = null
  private mat: THREE.ShaderMaterial | null = null

  private localTime = 0

  private transitionT = 1
  private readonly transitionDuration = 1.1
  private fromOpacity = 0
  private toOpacity = 0
  private fromSpeed = 0
  private toSpeed = 0
  private fromSize = 0
  private toSize = 0

  private currentOpacity = 0
  private currentSpeed = 0
  private currentSize = 0

  private currentTarget: RainIntensity = "none"

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setIntensity(intensity: RainIntensity) {
    if (intensity === this.currentTarget) return

    if (intensity === "none") {
      this.destroy()
      this.currentTarget = "none"
      this.currentOpacity = 0
      this.currentSpeed = 0
      this.currentSize = 0
      this.transitionT = 1
      return
    }

    const cfg = SNOW_CONFIGS[intensity]

    this.fromOpacity = this.currentOpacity
    this.fromSpeed = this.currentSpeed
    this.fromSize = this.currentSize

    this.toOpacity = cfg.opacity
    this.toSpeed = cfg.speed
    this.toSize = cfg.sizePx

    this.transitionT = 0
    this.currentTarget = intensity

    this.rebuild(cfg)
  }

  update(dt: number, cameraPosition: THREE.Vector3) {
    if (!this.mat) return

    this.localTime += dt

    if (this.transitionT < 1) {
      this.transitionT = Math.min(1, this.transitionT + dt / this.transitionDuration)
    }

    this.currentOpacity = lerp(this.fromOpacity, this.toOpacity, this.transitionT)
    this.currentSpeed = lerp(this.fromSpeed, this.toSpeed, this.transitionT)
    this.currentSize = lerp(this.fromSize, this.toSize, this.transitionT)

    this.mat.uniforms.uLocalTime.value = this.localTime
    this.mat.uniforms.uSpeed.value = this.currentSpeed
    this.mat.uniforms.uSpread.value = SNOW_CONFIGS[this.currentTarget].spread
    this.mat.uniforms.uPointSize.value = this.currentSize
    this.mat.uniforms.uOpacity.value = this.currentOpacity
    this.mat.uniforms.uCamPos.value.copy(cameraPosition)
  }

  dispose() {
    this.destroy()
  }

  private rebuild(cfg: SnowConfig) {
    this.destroy()

    this.localTime = 0
    const count = cfg.count

    const seeds = new Float32Array(count)
    const pos = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      seeds[i] = Math.random() * 1000
      pos[i * 3] = 0
      pos[i * 3 + 1] = 0
      pos[i * 3 + 2] = 0
    }

    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    this.geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uLocalTime: { value: 0 },
        uSpeed: { value: this.currentSpeed },
        uSpread: { value: cfg.spread },
        uPointSize: { value: this.currentSize },
        uOpacity: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
      },
    })

    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.scene.add(this.points)
  }

  private destroy() {
    if (!this.points) return
    this.scene.remove(this.points)
    this.geo?.dispose()
    this.mat?.dispose()
    this.points = null
    this.geo = null
    this.mat = null
  }
}
