import * as THREE from "three"
import type { TorchObject3D } from "../torch/TorchMesh"

export function createCampfireMesh(): TorchObject3D {
  const root = new THREE.Group() as TorchObject3D

  const groundAsh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 0.06, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 1 })
  )
  groundAsh.position.y = 0.03
  root.add(groundAsh)

  const logGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8)
  const logMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1b, roughness: 0.95 })

  const log1 = new THREE.Mesh(logGeo, logMat)
  log1.rotation.z = Math.PI / 2.8
  log1.position.y = 0.12

  const log2 = new THREE.Mesh(logGeo, logMat)
  log2.rotation.z = -Math.PI / 2.8
  log2.position.y = 0.12

  const log3 = new THREE.Mesh(logGeo, logMat)
  log3.rotation.x = Math.PI / 2
  log3.position.y = 0.12

  root.add(log1, log2, log3)

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: new THREE.Color(0xff3300),
      emissiveIntensity: 2.2,
    })
  )
  core.position.y = 0.21
  root.add(core)

  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 7, 7),
    new THREE.MeshStandardMaterial({
      color: 0xff8c00,
      emissive: new THREE.Color(0xff6600),
      emissiveIntensity: 2.1,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    })
  )
  flame.scale.set(0.9, 1.7, 0.9)
  flame.position.y = 0.33
  root.add(flame)

  root.userData.isFireSource = true
  root.userData.fireType = "campfire"
  root.userData.fireRange = 10
  root.userData.fireStrength = 1.8

  root.updateFireVisual = function(now: number, fireIntensity: number) {
    const phase = root.id * 0.31
    const flicker = Math.sin(now * 8 + phase) * 0.13 + Math.sin(now * 5.7 + phase * 2) * 0.08
    const intensity = THREE.MathUtils.clamp(fireIntensity, 0, 1)

    ;(core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + intensity * 1.2 + flicker * 0.45
    ;(flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + intensity * 1.4 + flicker * 0.55

    flame.scale.set(0.9 + flicker * 0.25, 1.7 + flicker * 0.35, 0.9 + flicker * 0.25)
    flame.position.y = 0.33 + flicker * 0.018
  }

  return root
}
