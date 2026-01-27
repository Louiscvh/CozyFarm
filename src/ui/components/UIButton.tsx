import "./UIButton.css"
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react"

type UIButtonProps = {
  variant?: "primary" | "ghost"
  size?: "md" | "lg"
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

let clickAudio: HTMLAudioElement | null = null

const playClickSound = () => {
  try {
    if (!clickAudio) {
      const url = new URL("../../assets/click.mp3", import.meta.url).href
      clickAudio = new Audio(url)
      clickAudio.volume = 0.6
    }
    clickAudio.currentTime = 0
    clickAudio.play().catch(() => {})
  } catch {
    // on ignore les erreurs audio
  }
}

export const UIButton = ({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: UIButtonProps) => {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    playClickSound()
    rest.onClick?.(e)
  }

  return (
    <button className={classes} {...rest} onClick={handleClick}>
      {children}
    </button>
  )
}

