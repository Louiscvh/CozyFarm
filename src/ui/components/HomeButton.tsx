import "./HomeButton.css"
import { Renderer } from "../../render/Renderer"
import { UIButton } from "./UIButton"

export const HomeButton = () => {
  const handleClick = () => {
    Renderer.instance?.resetCameraToHome()
  }

  return (
    <UIButton
      aria-label="Revenir à la ferme"
      className="ui-home-button"
      variant="primary"
      size="md"
      onClick={handleClick}
    >
      <svg
        className="ui-home-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M4 11.5L12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-4.5h-5V20H5a1 1 0 0 1-1-1v-7.5Z"
          fill="white"
        />
        <path
          d="M3 11.5 12 4l9 7.5"
          fill="none"
          stroke="#2e4732"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </UIButton>
  )
}

