import { type CSSProperties, type MouseEventHandler, type ReactNode, useEffect, useRef } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import "./WorldPopup.css"

interface WorldPopupProps {
  readonly open: boolean
  readonly anchorObject?: THREE.Object3D | null
  readonly anchorWorldPosition?: THREE.Vector3 | null
  readonly onClose?: () => void
  readonly anchorResolver?: (anchorObject: THREE.Object3D) => THREE.Object3D | null
  readonly offsetY?: number
  readonly className?: string
  readonly style?: CSSProperties
  readonly children: ReactNode
  readonly onMouseEnter?: MouseEventHandler<HTMLDivElement>
  readonly onMouseLeave?: MouseEventHandler<HTMLDivElement>
}

export function WorldPopup({
  open,
  anchorObject = null,
  anchorWorldPosition = null,
  onClose,
  anchorResolver,
  offsetY = 0.3,
  className,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
}: WorldPopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null)
  const currentPosRef = useRef<{ x: number; y: number } | null>(null)
  const targetPosRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number>(0)

  const POPUP_LERP = 0.22

  useEffect(() => {
    if (!open) return

    const updatePopupPosition = () => {
      const w = World.current
      if (!w) {
        rafRef.current = requestAnimationFrame(updatePopupPosition)
        return
      }

      let worldAnchor: THREE.Vector3 | null = null

      if (anchorObject) {
        const anchor = anchorResolver ? anchorResolver(anchorObject) : anchorObject
        if (anchor) {
          const box = new THREE.Box3().setFromObject(anchor)
          worldAnchor = new THREE.Vector3(
            (box.min.x + box.max.x) / 2,
            box.max.y + offsetY,
            (box.min.z + box.max.z) / 2,
          )
        }
      }

      if (!worldAnchor && anchorWorldPosition) {
        worldAnchor = anchorWorldPosition.clone()
      }

      if (!worldAnchor) {
        onClose?.()
        rafRef.current = requestAnimationFrame(updatePopupPosition)
        return
      }

      const topCenter = worldAnchor.project(w.camera)

      targetPosRef.current = {
        x: (topCenter.x + 1) / 2 * window.innerWidth,
        y: (-topCenter.y + 1) / 2 * window.innerHeight,
      }

      if (!currentPosRef.current || !targetPosRef.current) {
        currentPosRef.current = targetPosRef.current
      } else {
        currentPosRef.current = {
          x: THREE.MathUtils.lerp(currentPosRef.current.x, targetPosRef.current.x, POPUP_LERP),
          y: THREE.MathUtils.lerp(currentPosRef.current.y, targetPosRef.current.y, POPUP_LERP),
        }
      }

      if (popupRef.current && currentPosRef.current) {
        popupRef.current.style.left = `${currentPosRef.current.x}px`
        popupRef.current.style.top = `${currentPosRef.current.y}px`
      }

      rafRef.current = requestAnimationFrame(updatePopupPosition)
    }

    rafRef.current = requestAnimationFrame(updatePopupPosition)
    return () => cancelAnimationFrame(rafRef.current)
  }, [anchorObject, anchorResolver, anchorWorldPosition, offsetY, onClose, open])

  if (!open || (!anchorObject && !anchorWorldPosition)) return null

  return (
    <div
      className={["world-popup", className].filter(Boolean).join(" ")}
      ref={popupRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "translate(-50%, -50%)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}
