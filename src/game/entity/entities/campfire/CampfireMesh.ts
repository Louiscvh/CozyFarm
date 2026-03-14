import * as THREE from "three"
import type { TorchObject3D } from "../torch/TorchMesh"

const CAMPFIRE_PARTICLE_COUNT = 18

export function createCampfireMesh(): TorchObject3D {
  const root = new THREE.Group() as TorchObject3D

  const rockGeo = new THREE.DodecahedronGeometry(0.07, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6a68, roughness: 1 })
  for (let i = 0; i < 7; i++) {
    const rock = new THREE.Mesh(rockGeo, rockMat)
    const a = (i / 7) * Math.PI * 2
    rock.position.set(Math.cos(a) * 0.23, 0.03, Math.sin(a) * 0.23)
    rock.rotation.set(a * 0.3, a, -a * 0.2)
    root.add(rock)
  }

  const logGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.58, 10)
  const logMat = new THREE.MeshStandardMaterial({ color: 0x5b3417, roughness: 0.97 })

  const logHeights = [0.055, 0.065, 0.075, 0.06]
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(logGeo, logMat)
    const a = (i / 4) * Math.PI * 2
    log.position.y = logHeights[i]
    log.position.x = Math.cos(a) * 0.03
    log.position.z = Math.sin(a) * 0.03
    log.rotation.set(Math.PI / 2.9, a, Math.PI / 2.8)
    root.add(log)
  }

  const emberCoreMat = new THREE.MeshStandardMaterial({
    color: 0xff4d1f,
    emissive: new THREE.Color(0xff3d00),
    emissiveIntensity: 2.6,
  })
  const emberCore = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), emberCoreMat)
  emberCore.position.y = 0.17
  root.add(emberCore)

  const flameOuterMat = new THREE.MeshStandardMaterial({
    color: 0xff7f2a,
    emissive: new THREE.Color(0xff5a00),
    emissiveIntensity: 2.4,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  })
  const flameOuter = new THREE.Mesh(new THREE.SphereGeometry(0.16, 9, 9), flameOuterMat)
  flameOuter.scale.set(0.9, 1.85, 0.9)
  flameOuter.position.y = 0.32
  root.add(flameOuter)

  const flameInnerMat = new THREE.MeshStandardMaterial({
    color: 0xffc266,
    emissive: new THREE.Color(0xffa833),
    emissiveIntensity: 2.1,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const flameInner = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), flameInnerMat)
  flameInner.scale.set(0.75, 1.5, 0.75)
  flameInner.position.y = 0.3
  root.add(flameInner)

  const particlePositions = new Float32Array(CAMPFIRE_PARTICLE_COUNT * 3)
  const particleVelocity = new Float32Array(CAMPFIRE_PARTICLE_COUNT)
  const particlePhase = new Float32Array(CAMPFIRE_PARTICLE_COUNT)

  for (let i = 0; i < CAMPFIRE_PARTICLE_COUNT; i++) {
    const stride = i * 3
    const angle = (i / CAMPFIRE_PARTICLE_COUNT) * Math.PI * 2
    const r = 0.05 + (i % 4) * 0.01

    particlePositions[stride] = Math.cos(angle) * r
    particlePositions[stride + 1] = 0.17 + (i % 3) * 0.025
    particlePositions[stride + 2] = Math.sin(angle) * r

    particleVelocity[i] = 0.007 + (i % 5) * 0.0009
    particlePhase[i] = i * 0.43
  }

  const particlesGeometry = new THREE.BufferGeometry()
  particlesGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3))

  const particlesMaterial = new THREE.PointsMaterial({
    color: 0xffaa55,
    size: 0.048,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const particles = new THREE.Points(particlesGeometry, particlesMaterial)
  root.add(particles)

  root.userData.isFireSource = true
  root.userData.fireType = "campfire"
  root.userData.fireRange = 12
  root.userData.fireStrength = 2.2

  root.updateFireVisual = function(now: number, fireIntensity: number) {
    const phase = root.id * 0.31
    const flicker = Math.sin(now * 8 + phase) * 0.14 + Math.sin(now * 5.7 + phase * 2) * 0.09
    const intensity = THREE.MathUtils.clamp(fireIntensity, 0, 1)

    emberCoreMat.emissiveIntensity = 1.9 + intensity * 1.9 + flicker * 0.7
    flameOuterMat.emissiveIntensity = 1.6 + intensity * 2.1 + flicker * 0.8
    flameInnerMat.emissiveIntensity = 1.2 + intensity * 1.7 + flicker * 0.55

    flameOuter.scale.set(0.9 + flicker * 0.25, 1.85 + flicker * 0.45, 0.9 + flicker * 0.25)
    flameOuter.position.y = 0.32 + flicker * 0.02
    flameInner.scale.set(0.75 + flicker * 0.2, 1.5 + flicker * 0.25, 0.75 + flicker * 0.2)
    flameInner.position.y = 0.3 + flicker * 0.016

    const positions = particlesGeometry.attributes.position.array as Float32Array
    for (let i = 0; i < CAMPFIRE_PARTICLE_COUNT; i++) {
      const stride = i * 3
      const swirl = now * 1.6 + particlePhase[i]

      positions[stride] += Math.sin(swirl) * 0.0006
      positions[stride + 2] += Math.cos(swirl) * 0.0006
      positions[stride + 1] += particleVelocity[i] * (0.65 + intensity * 0.7)

      if (positions[stride + 1] > 0.8) {
        const resetAngle = swirl * 1.3
        positions[stride] = Math.cos(resetAngle) * 0.04
        positions[stride + 1] = 0.16 + (i % 3) * 0.02
        positions[stride + 2] = Math.sin(resetAngle) * 0.04
      }
    }
    particlesGeometry.attributes.position.needsUpdate = true

    particlesMaterial.opacity = 0.55 + intensity * 0.35
  }

  return root
}
