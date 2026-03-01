// src/game/placement/Grid.ts
import * as THREE from "three"
import { World } from "../../game/world/World"

// ─── Static grid ──────────────────────────────────────────────────────────────

const STATIC_OPACITY = 0.1
const DEBUG_OPACITY  = 0.5

export const staticGridGroup = new THREE.Group()
staticGridGroup.position.y = 0.055
staticGridGroup.visible    = false

let _built          = false
let _debugForceGrid = false

export function buildStaticGrid(cellSize: number) {
  if (_built) return
  _built = true

  const world = World.current
  if (!world) return

  const halfWorld = world.sizeInCells / 2
  const min = -halfWorld * cellSize
  const max =  halfWorld * cellSize
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: STATIC_OPACITY, depthWrite: false })

  for (let i = -halfWorld; i <= halfWorld; i++) {
    const pos = i * cellSize
    staticGridGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(min, 0, pos), new THREE.Vector3(max, 0, pos)]),
      mat.clone()
    ))
    staticGridGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos, 0, min), new THREE.Vector3(pos, 0, max)]),
      mat.clone()
    ))
  }
}

function setStaticOpacity(opacity: number) {
  staticGridGroup.children.forEach(child => {
    const mat = (child as THREE.Line).material as THREE.LineBasicMaterial
    if (mat) mat.opacity = opacity
  })
}

/** Show at normal opacity for ghost placement (no-op if debug-forced). */
export function showGridForGhost() {
  if (_debugForceGrid) return
  setStaticOpacity(STATIC_OPACITY)
  staticGridGroup.visible = true
}

/** Hide after ghost is gone (no-op if debug-forced). */
export function hideGridForGhost() {
  if (_debugForceGrid) return
  staticGridGroup.visible = false
}

/** Toggle persistent debug visibility at full opacity. */
export function toggleDebugGrid() {
  _debugForceGrid = !_debugForceGrid
  setStaticOpacity(_debugForceGrid ? DEBUG_OPACITY : STATIC_OPACITY)
  staticGridGroup.visible = _debugForceGrid
}

// ─── Reveal grid ──────────────────────────────────────────────────────────────

const REVEAL_RADIUS = 4
const SEGMENTS      = 8

export const revealGroup = new THREE.Group()
revealGroup.position.y = 0.055
revealGroup.visible    = false

export function buildRevealGrid(cellSize: number, footprint: number = 1) {
  revealGroup.clear?.() || revealGroup.children.splice(0)

  const lineOffset = footprint % 2 !== 0 ? -cellSize / 2 : 0
  const maxDist    = Math.max(footprint * cellSize, 2.5)
  const segSize    = maxDist / SEGMENTS

  for (let i = -REVEAL_RADIUS; i <= REVEAL_RADIUS; i++) {
    const linePos = i * cellSize + lineOffset
    const perp    = Math.sqrt(maxDist * maxDist - linePos * linePos)
    if (!perp) continue

    const segCount = Math.ceil((perp * 2) / segSize)
    for (let j = 0; j < segCount; j++) {
      const segStart = -perp + j * segSize
      const segEnd   = Math.min(segStart + segSize, perp)
      const segMid   = (segStart + segEnd) / 2
      const t        = Math.min(Math.sqrt(segMid * segMid + linePos * linePos) / maxDist, 1)
      const opacity  = Math.max((1 - t * t) * 0.6, 0.1)
      const mat      = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false })

      revealGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(segStart, 0, linePos), new THREE.Vector3(segEnd, 0, linePos)]),
        mat
      ))
      revealGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(linePos, 0, segStart), new THREE.Vector3(linePos, 0, segEnd)]),
        mat.clone()
      ))
    }
  }
}