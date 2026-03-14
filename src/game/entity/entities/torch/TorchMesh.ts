import * as THREE from "three"

export interface TorchObject3D extends THREE.Group {
  updateFireVisual(now: number, fireIntensity: number): void
}

export function createTorchMesh(): TorchObject3D {
  const root = new THREE.Group() as TorchObject3D

  const handleGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.75, 6)
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x4a2e12,
    roughness: 0.95,
    metalness: 0,
  })
  const handle = new THREE.Mesh(handleGeo, handleMat)
  handle.position.y = 0.37
  handle.castShadow = true
  root.add(handle)

  const wrapGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.18, 6)
  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x7a4a22,
    roughness: 0.9,
  })
  const wrap = new THREE.Mesh(wrapGeo, wrapMat)
  wrap.position.y = 0.78
  root.add(wrap)

  const emberBaseGeo = new THREE.ConeGeometry(0.085, 0.08, 6)
  const emberBaseMat = new THREE.MeshStandardMaterial({
    color: 0xff3300,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 2.4,
  })
  const emberBase = new THREE.Mesh(emberBaseGeo, emberBaseMat)
  emberBase.position.y = 0.91
  root.add(emberBase)

  function makeFlameLayer(scaleX: number, scaleY: number, offsetY: number, opacity: number): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.09, 6, 6)
    geo.scale(scaleX, scaleY, scaleX)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xff8800).lerp(new THREE.Color(0xff2200), offsetY / 0.3),
      emissive: new THREE.Color(0xff5500),
      emissiveIntensity: 1.8,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = 0.97 + offsetY
    return mesh
  }

  const flame0 = makeFlameLayer(1.0, 1.6, 0, 0.9)
  const flame1 = makeFlameLayer(0.7, 1.9, 0.06, 0.7)
  const flame2 = makeFlameLayer(0.4, 1.4, 0.14, 0.42)
  root.add(flame0, flame1, flame2)

  root.userData.isFireSource = true
  root.userData.fireType = "torch"
  root.userData.fireRange = 7
  root.userData.fireStrength = 1

  root.updateFireVisual = function(now: number, fireIntensity: number) {
    const id = root.id
    const flicker = Math.sin(now * 11 + id) * 0.15
      + Math.sin(now * 7.4 + id * 1.3) * 0.07

    const intensity = THREE.MathUtils.clamp(fireIntensity, 0, 1)
    const glow = 0.8 + intensity * 0.9 + flicker * 0.4

    emberBaseMat.emissiveIntensity = 1.6 + glow * 0.7

    flame0.scale.setScalar(1 + flicker * 0.15)
    flame1.scale.set(1 + flicker * 0.2, 1 - flicker * 0.1, 1 + flicker * 0.2)
    flame2.scale.set(1 + flicker * 0.1, 1 + flicker * 0.25, 1 + flicker * 0.1)
    flame2.position.y = 1.11 + flicker * 0.02

    const flameEmissive = 1 + glow
    ;(flame0.material as THREE.MeshStandardMaterial).emissiveIntensity = flameEmissive
    ;(flame1.material as THREE.MeshStandardMaterial).emissiveIntensity = flameEmissive * 0.95
    ;(flame2.material as THREE.MeshStandardMaterial).emissiveIntensity = flameEmissive * 0.85
  }

  return root
}
