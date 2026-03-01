// src/ui/components/PerfMonitor.tsx
import { useEffect, useRef, useState } from "react"
import { Renderer } from "../../render/Renderer"
import "./PerfMonitor.css"

interface Props {
  onClose: () => void
}

const HISTORY = 120
const W = 232
const H = 44

type Snap = {
  fps:        number
  frameMs:    number
  drawCalls:  number
  triangles:  number
  geometries: number
  textures:   number
  memMB:      number | null
}

function Sparkline({ values, max, color, danger }: {
  values:  number[]
  max:     number
  color:   string
  danger?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx || !values.length) return
    ctx.clearRect(0, 0, W, H)

    if (danger != null) {
      const dy = H - (danger / max) * H
      ctx.save()
      ctx.strokeStyle = "rgba(255,60,80,0.3)"
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, dy); ctx.lineTo(W, dy); ctx.stroke()
      ctx.restore()
    }

    const step = W / (HISTORY - 1)
    const pts = Array.from({ length: HISTORY }, (_, i) => {
      const v = values[values.length - HISTORY + i] ?? 0
      return { x: i * step, y: H - Math.min((v / max) * H, H) }
    })

    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, color.replace("rgb", "rgba").replace(")", ",0.28)"))
    grad.addColorStop(1, color.replace("rgb", "rgba").replace(")", ",0.0)"))
    ctx.fillStyle = grad
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.lineTo(pts[pts.length - 1].x, H)
    ctx.lineTo(0, H)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = "round"
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }, [values, max, color, danger])

  return <canvas ref={ref} width={W} height={H} className="pm-canvas" />
}

export function PerfMonitor({ onClose }: Props) {
  const [snap, setSnap] = useState<Snap | null>(null)
  const [fpsH, setFpsH] = useState<number[]>([])
  const [msH,  setMsH]  = useState<number[]>([])
  const [dcH,  setDcH]  = useState<number[]>([])

  const lastT  = useRef(performance.now())
  const frames = useRef(0)
  const lastM  = useRef(performance.now())
  const raf    = useRef(0)

  useEffect(() => {
    const tick = () => {
      raf.current = requestAnimationFrame(tick)
      const now   = performance.now()
      const delta = now - lastT.current
      lastT.current = now
      frames.current++

      if (now - lastM.current >= 250) {
        const elapsed = now - lastM.current
        const fps = Math.round((frames.current / elapsed) * 1000)
        frames.current = 0
        lastM.current  = now

        const info  = Renderer.instance!.renderer.info
        const memMB = (performance as any).memory
          ? Math.round((performance as any).memory.usedJSHeapSize / 1048576)
          : null

        setSnap({ fps, frameMs: Math.round(delta * 10) / 10, drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, memMB })
        setFpsH(h => [...h.slice(-(HISTORY - 1)), fps])
        setMsH(h  => [...h.slice(-(HISTORY - 1)), Math.round(delta * 10) / 10])
        setDcH(h  => [...h.slice(-(HISTORY - 1)), info.render.calls])
      }
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  if (!snap) return null

  const fpsColor = snap.fps >= 55 ? "rgb(70,220,120)" : snap.fps >= 30 ? "rgb(255,195,50)" : "rgb(255,65,85)"
  const fpsTag   = snap.fps >= 55 ? "SMOOTH" : snap.fps >= 30 ? "OK" : "DROP"

  return (
    <div className="pm-panel">
      <div className="pm-header">
        <span className="pm-title">PERF MONITOR</span>
        <div className="pm-fps" style={{ color: fpsColor }}>
          <span className="pm-fps-n">{snap.fps}</span>
          <span className="pm-fps-u">fps</span>
          <span className="pm-fps-tag">{fpsTag}</span>
        </div>
        <button className="pm-close" onClick={onClose}>✕</button>
      </div>

      <div className="pm-graph">
        <div className="pm-graph-head"><span>FPS</span><span>60</span></div>
        <Sparkline values={fpsH} max={60} color="rgb(70,220,120)" danger={30} />
      </div>

      <div className="pm-graph">
        <div className="pm-graph-head"><span>FRAME TIME</span><span>33ms</span></div>
        <Sparkline values={msH} max={33} color="rgb(100,150,255)" danger={16.6} />
      </div>

      <div className="pm-graph">
        <div className="pm-graph-head"><span>DRAW CALLS</span><span>500</span></div>
        <Sparkline values={dcH} max={500} color="rgb(255,175,55)" />
      </div>

      <div className="pm-stats">
        <div className="pm-stat"><span>frame</span><b>{snap.frameMs}<em>ms</em></b></div>
        <div className="pm-stat"><span>draw calls</span><b>{snap.drawCalls}</b></div>
        <div className="pm-stat"><span>triangles</span><b>{(snap.triangles / 1000).toFixed(1)}<em>k</em></b></div>
        <div className="pm-stat"><span>geometries</span><b>{snap.geometries}</b></div>
        <div className="pm-stat"><span>textures</span><b>{snap.textures}</b></div>
        {snap.memMB !== null && <div className="pm-stat"><span>js heap</span><b>{snap.memMB}<em>MB</em></b></div>}
      </div>
    </div>
  )
}