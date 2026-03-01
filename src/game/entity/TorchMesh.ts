// src/game/entity/TorchMesh.ts
import * as THREE from "three"

const EMBER_COUNT = 6

export interface TorchObject3D extends THREE.Group {
  updateTorch(now: number, torchIntensity: number, camera?: THREE.Camera): void
}

export function createTorchMesh(): TorchObject3D {
  const root = new THREE.Group() as TorchObject3D

  // --- Manche bois ---
  const handleGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.75, 7)
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x4a2e12,
    roughness: 0.95,
    metalness: 0.0,
  })
  const handle = new THREE.Mesh(handleGeo, handleMat)
  handle.position.y = 0.37
  handle.castShadow = true
  root.add(handle)

  // --- Bandage tissu ---
  const wrapGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.18, 8)
  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x7a4a22,
    roughness: 0.9,
  })
  const wrap = new THREE.Mesh(wrapGeo, wrapMat)
  wrap.position.y = 0.78
  root.add(wrap)

  // --- Braise incandescente ---
  const emberBaseGeo = new THREE.CylinderGeometry(0.0, 0.08, 0.08, 8)
  const emberBaseMat = new THREE.MeshStandardMaterial({
    color: 0xff3300,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 3,
  })
  const emberBase = new THREE.Mesh(emberBaseGeo, emberBaseMat)
  emberBase.position.y = 0.91
  root.add(emberBase)

  // --- 3 couches de flamme ---
  function makeFlameLayer(scaleX: number, scaleY: number, offsetY: number, opacity: number): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.09, 7, 7)
    geo.scale(scaleX, scaleY, scaleX)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xff8800).lerp(new THREE.Color(0xff2200), offsetY / 0.3),
      emissive: new THREE.Color(0xff5500),
      emissiveIntensity: 2.5,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = 0.97 + offsetY
    mesh.castShadow = false
    mesh.receiveShadow = false
    return mesh
  }

  const flame0 = makeFlameLayer(1.0, 1.6, 0.00, 0.95)
  const flame1 = makeFlameLayer(0.7, 1.9, 0.06, 0.75)
  const flame2 = makeFlameLayer(0.4, 1.4, 0.14, 0.45)
  root.add(flame0, flame1, flame2)

  // --- Particules braises (THREE.Points) ---
  const emberPositions = new Float32Array(EMBER_COUNT * 3)
  for (let i = 0; i < EMBER_COUNT; i++) {
    emberPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.1
    emberPositions[i * 3 + 1] = 1.05 + Math.random() * 0.15
    emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.1
  }
  const emberGeometry = new THREE.BufferGeometry()
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3))

  const emberMaterial = new THREE.PointsMaterial({
    color: 0xff9900,
    size: 1,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const emberPoints = new THREE.Points(emberGeometry, emberMaterial)
  root.add(emberPoints)

  // --- Lumière ---
  const light = new THREE.PointLight(0xff7200, 0, 10)
  light.position.y = 1.1
  light.castShadow = false
  root.add(light)

  // --- Tag ---
  root.userData.isTorch = true

  // --- Animation ---
  root.updateTorch = function(now: number, torchIntensity: number, camera?: THREE.Camera) {
    const id = root.id
    const flicker = Math.sin(now * 13 + id) * 0.15
                  + Math.sin(now * 7.7 + id * 1.3) * 0.08
                  + Math.sin(now * 23 + id * 2.1) * 0.04

    // --- Lumière optimisée ---
    if (!camera || root.position.distanceTo(camera.position) < 10) {
      light.intensity = torchIntensity * (2.5 + flicker * 1.2)
    } else {
      light.intensity = 0
    }

    // --- Flammes ---
    flame0.scale.set(1 + flicker * 0.3, 1 + flicker * 0.2, 1 + flicker * 0.3)
    flame1.scale.set(1 + flicker * 0.4, 1 - flicker * 0.1, 1 + flicker * 0.4)
    flame2.scale.set(1 + flicker * 0.2, 1 + flicker * 0.5, 1 + flicker * 0.2)
    flame2.position.y = 1.11 + flicker * 0.03

    // --- Braises ---
    const positions = emberPoints.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < EMBER_COUNT; i++) {
      positions[i * 3 + 1] += 0.008 + Math.random() * 0.004
      positions[i * 3 + 0] += (Math.random() - 0.5) * 0.004
      if (positions[i * 3 + 1] > 1.35) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 0.08
        positions[i * 3 + 1] = 1.02
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.08
      }
    }
    emberPoints.geometry.attributes.position.needsUpdate = true
  }

  return root
}