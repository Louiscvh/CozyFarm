import * as THREE from "three"
import type { TorchObject3D } from "../torch/TorchMesh"

const CAMPFIRE_PARTICLE_COUNT = 20

export function createCampfireMesh(): TorchObject3D {
  const root = new THREE.Group() as TorchObject3D

  const logGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8)
  const logMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1b, roughness: 0.95 })

  const log1 = new THREE.Mesh(logGeo, logMat)
  log1.rotation.z = Math.PI / 2.8
  log1.position.y = 0.06

  const log2 = new THREE.Mesh(logGeo, logMat)
  log2.rotation.z = -Math.PI / 2.8
  log2.position.y = 0.06

  const log3 = new THREE.Mesh(logGeo, logMat)
  log3.rotation.x = Math.PI / 2
  log3.position.y = 0.06

  root.add(log1, log2, log3)

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: new THREE.Color(0xff3300),
    emissiveIntensity: 2.6,
  })
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), coreMat)
  core.position.y = 0.19
  root.add(core)

  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff8c00,
    emissive: new THREE.Color(0xff6600),
    emissiveIntensity: 2.4,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  })
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), flameMat)
  flame.scale.set(0.9, 1.8, 0.9)
  flame.position.y = 0.32
  root.add(flame)

  const particlePositions = new Float32Array(CAMPFIRE_PARTICLE_COUNT * 3)
  const particleVelocity = new Float32Array(CAMPFIRE_PARTICLE_COUNT)
  for (let i = 0; i < CAMPFIRE_PARTICLE_COUNT; i++) {
    const stride = i * 3
    const angle = (i / CAMPFIRE_PARTICLE_COUNT) * Math.PI * 2
    const radius = 0.05 + (i % 4) * 0.012

    particlePositions[stride] = Math.cos(angle) * radius
    particlePositions[stride + 1] = 0.16 + (i % 3) * 0.03
    particlePositions[stride + 2] = Math.sin(angle) * radius
    particleVelocity[i] = 0.007 + (i % 5) * 0.001
  }

  const particlesGeometry = new THREE.BufferGeometry()
  particlesGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3))

  const particlesMaterial = new THREE.PointsMaterial({
    color: 0xffb366,
    size: 0.082,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const particles = new THREE.Points(particlesGeometry, particlesMaterial)
  root.add(particles)

  root.userData.isFireSource = true
  root.userData.fireType = "campfire"
  root.userData.fireRange = 13
  root.userData.fireStrength = 2.5

  root.updateFireVisual = function(now: number, fireIntensity: number) {
    const phase = root.id * 0.31
    const flicker = Math.sin(now * 8 + phase) * 0.15 + Math.sin(now * 5.7 + phase * 2) * 0.1
    const intensity = THREE.MathUtils.clamp(fireIntensity, 0, 1)

    coreMat.emissiveIntensity = 1.8 + intensity * 2.2 + flicker * 0.7
    flameMat.emissiveIntensity = 1.5 + intensity * 2.4 + flicker * 0.8

    flame.scale.set(0.9 + flicker * 0.28, 1.8 + flicker * 0.42, 0.9 + flicker * 0.28)
    flame.position.y = 0.32 + flicker * 0.02

    const positions = particlesGeometry.attributes.position.array as Float32Array
    for (let i = 0; i < CAMPFIRE_PARTICLE_COUNT; i++) {
      const stride = i * 3
      const swirl = now * 1.5 + i * 0.53

      positions[stride] += Math.sin(swirl) * 0.00065
      positions[stride + 2] += Math.cos(swirl) * 0.00065
      positions[stride + 1] += particleVelocity[i] * (0.65 + intensity * 0.75)

      if (positions[stride + 1] > 0.84) {
        positions[stride] = Math.cos(swirl * 1.2) * 0.045
        positions[stride + 1] = 0.16 + (i % 3) * 0.025
        positions[stride + 2] = Math.sin(swirl * 1.2) * 0.045
      }
    }
    particlesGeometry.attributes.position.needsUpdate = true

    particlesMaterial.opacity = 0.58 + intensity * 0.35
  }

  return root
}
