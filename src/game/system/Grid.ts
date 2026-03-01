// src/game/placement/Grid.ts
import * as THREE from "three"
import { World } from "../../game/world/World"

// ─── Static grid — 1 draw call ────────────────────────────────────────────────

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

  // Build all line segments into a single geometry → 1 draw call
  const positions: number[] = []

  for (let i = -halfWorld; i <= halfWorld; i++) {
    const pos = i * cellSize
    // Horizontal
    positions.push(min, 0, pos,  max, 0, pos)
    // Vertical
    positions.push(pos, 0, min,  pos, 0, max)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))

  const mat = new THREE.LineBasicMaterial({
    color      : 0xffffff,
    transparent: true,
    opacity    : STATIC_OPACITY,
    depthWrite : false,
  })

  staticGridGroup.add(new THREE.LineSegments(geo, mat))
}

function setStaticOpacity(opacity: number) {
  const seg = staticGridGroup.children[0] as THREE.LineSegments | undefined
  if (!seg) return
  ;(seg.material as THREE.LineBasicMaterial).opacity = opacity
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

// ─── Reveal grid — 1 draw call ────────────────────────────────────────────────
// Per-segment opacity is encoded as vertex color brightness (grayscale),
// so the whole reveal grid is a single LineSegments → 1 draw call.

const REVEAL_RADIUS = 4
const SEGMENTS      = 8

export const revealGroup = new THREE.Group()
revealGroup.position.y = 0.055
revealGroup.visible    = false

let _revealSegments: THREE.LineSegments | null = null

export function buildRevealGrid(cellSize: number, footprint: number = 1) {
  // Dispose previous geometry
  if (_revealSegments) {
    _revealSegments.geometry.dispose()
    revealGroup.remove(_revealSegments)
    _revealSegments = null
  }

  const lineOffset = footprint % 2 !== 0 ? -cellSize / 2 : 0
  const maxDist    = Math.max(footprint * cellSize, 2.5)
  const segSize    = maxDist / SEGMENTS

  const positions: number[] = []
  const colors   : number[] = []

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
      // Opacity encoded as grayscale brightness — avoids per-object draw calls
      const brightness = Math.max((1 - t * t) * 0.6, 0.1)

      // Horizontal segment
      positions.push(segStart, 0, linePos,  segEnd, 0, linePos)
      colors.push(brightness, brightness, brightness,  brightness, brightness, brightness)

      // Vertical segment (perpendicular)
      positions.push(linePos, 0, segStart,  linePos, 0, segEnd)
      colors.push(brightness, brightness, brightness,  brightness, brightness, brightness)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("color",    new THREE.Float32BufferAttribute(colors,    3))

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent : true,
    opacity     : 1,
    depthWrite  : false,
  })

  _revealSegments = new THREE.LineSegments(geo, mat)
  revealGroup.add(_revealSegments)
}