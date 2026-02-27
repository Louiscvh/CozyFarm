// src/world/TileShaders.ts
import * as THREE from "three"

// ─── Bruit léger (hash + interpolation, pas de Simplex) ───────────────────────
// Beaucoup moins cher que Simplex fbm multi-octaves

const CHEAP_NOISE = /* glsl */`
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
      f.y
    );
  }
`

// ─── Vertex shader commun (pas de bumping, trop cher) ─────────────────────────

const SIMPLE_VERT = /* glsl */`
  varying vec2 vWorldXZ;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ─── Grass ────────────────────────────────────────────────────────────────────

export function createGrassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SIMPLE_VERT,
    fragmentShader: /* glsl */`
      ${CHEAP_NOISE}
      varying vec2 vWorldXZ;

      void main() {
        float n = noise2(vWorldXZ * 0.18);
        float n2 = noise2(vWorldXZ * 0.6 + vec2(5.3, 2.1));

        vec3 dark  = vec3(0.22, 0.42, 0.18);
        vec3 light = vec3(0.36, 0.58, 0.24);
        vec3 dry   = vec3(0.50, 0.53, 0.22);

        vec3 color = mix(dark, light, n);
        color = mix(color, dry, n2 * 0.22);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

// ─── Sand ─────────────────────────────────────────────────────────────────────

export function createSandMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SIMPLE_VERT,
    fragmentShader: /* glsl */`
      ${CHEAP_NOISE}
      varying vec2 vWorldXZ;

      void main() {
        float n  = noise2(vWorldXZ * 0.15);
        float n2 = noise2(vWorldXZ * 0.55 + vec2(3.7, 1.4));

        vec3 c1 = vec3(0.82, 0.70, 0.44);
        vec3 c2 = vec3(0.70, 0.57, 0.33);
        vec3 c3 = vec3(0.90, 0.80, 0.56);

        vec3 color = mix(c1, c2, n);
        color = mix(color, c3, n2 * 0.28);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

// ─── Stone ────────────────────────────────────────────────────────────────────

export function createStoneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SIMPLE_VERT,
    fragmentShader: /* glsl */`
      ${CHEAP_NOISE}
      varying vec2 vWorldXZ;

      void main() {
        float n  = noise2(vWorldXZ * 0.25);
        float n2 = noise2(vWorldXZ * 1.1 + vec2(7.2, 4.8));

        vec3 c1 = vec3(0.48, 0.45, 0.42);
        vec3 c2 = vec3(0.62, 0.59, 0.56);
        vec3 c3 = vec3(0.30, 0.27, 0.25);

        // légère fissure simulée
        float crack = step(0.82, n2);
        vec3 color = mix(c1, c2, n);
        color = mix(color, c3, crack * 0.35);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

// ─── Water (animée, très légère) ──────────────────────────────────────────────

export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    vertexShader: SIMPLE_VERT,
    fragmentShader: /* glsl */`
      ${CHEAP_NOISE}
      uniform float uTime;
      varying vec2 vWorldXZ;

      void main() {
        // Ondulation UV animée, pas de calcul de vague en vertex
        vec2 uv1 = vWorldXZ * 0.2 + vec2(uTime * 0.06, uTime * 0.04);
        vec2 uv2 = vWorldXZ * 0.35 - vec2(uTime * 0.05, uTime * 0.03);

        float n1 = noise2(uv1);
        float n2 = noise2(uv2);
        float n  = mix(n1, n2, 0.5);

        float foam = step(0.78, n2);

        vec3 deep    = vec3(0.06, 0.26, 0.54);
        vec3 shallow = vec3(0.16, 0.54, 0.74);
        vec3 foamCol = vec3(0.82, 0.92, 0.98);

        vec3 color = mix(deep, shallow, n);
        color = mix(color, foamCol, foam * 0.35);

        gl_FragColor = vec4(color, 0.88);
      }
    `,
  })
}

// ─── Update uniforms ──────────────────────────────────────────────────────────

export type TileMaterials = Map<string, THREE.ShaderMaterial>

export function updateTileMaterials(materials: TileMaterials, deltaTime: number) {
  const waterMat = materials.get("water")
  if (waterMat) waterMat.uniforms.uTime.value += deltaTime
}