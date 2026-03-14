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
    emissiveIntensity: 2.9,
  })
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), coreMat)
  core.position.y = 0.18
  root.add(core)

  const flameOuterMat = new THREE.MeshStandardMaterial({
    color: 0xff7f1f,
    emissive: new THREE.Color(0xff5a00),
    emissiveIntensity: 2.7,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  })
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 8), flameOuterMat)
  flameOuter.position.y = 0.34
  root.add(flameOuter)

  const flameInnerMat = new THREE.MeshStandardMaterial({
    color: 0xffc470,
    emissive: new THREE.Color(0xffa23a),
    emissiveIntensity: 2.3,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  })
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.27, 8), flameInnerMat)
  flameInner.position.y = 0.33
  root.add(flameInner)

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
    size: 0.09,
    transparent: true,
    opacity: 0.76,
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

    coreMat.emissiveIntensity = 1.9 + intensity * 2.5 + flicker * 0.8
    flameOuterMat.emissiveIntensity = 1.6 + intensity * 2.8 + flicker * 0.95
    flameInnerMat.emissiveIntensity = 1.3 + intensity * 2.2 + flicker * 0.7

    flameOuter.scale.set(1 + flicker * 0.22, 1.02 + flicker * 0.5, 1 + flicker * 0.22)
    flameOuter.position.y = 0.34 + flicker * 0.022
    flameInner.scale.set(1 + flicker * 0.18, 1 + flicker * 0.35, 1 + flicker * 0.18)
    flameInner.position.y = 0.33 + flicker * 0.017

    const positions = particlesGeometry.attributes.position.array as Float32Array
    for (let i = 0; i < CAMPFIRE_PARTICLE_COUNT; i++) {
      const stride = i * 3
      const swirl = now * 1.5 + i * 0.53

      positions[stride] += Math.sin(swirl) * 0.00065
      positions[stride + 2] += Math.cos(swirl) * 0.00065
      positions[stride + 1] += particleVelocity[i] * (0.65 + intensity * 0.75)

      if (positions[stride + 1] > 0.86) {
        positions[stride] = Math.cos(swirl * 1.2) * 0.045
        positions[stride + 1] = 0.16 + (i % 3) * 0.025
        positions[stride + 2] = Math.sin(swirl * 1.2) * 0.045
      }
    }
    particlesGeometry.attributes.position.needsUpdate = true

    particlesMaterial.opacity = 0.58 + intensity * 0.36
  }

  return root
}
