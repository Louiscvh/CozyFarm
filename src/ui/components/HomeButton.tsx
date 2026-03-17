import "./HomeButton.css"
import { useEffect, useState } from "react"
import { Renderer } from "../../render/Renderer"
import { UIButton } from "./UIButton"
import { moneyStore } from "../store/MoneyStore"

export const HomeButton = () => {
  const [money, setMoney] = useState(moneyStore.getAmount())

  useEffect(() => moneyStore.subscribe(setMoney), [])

  const handleClick = () => {
    Renderer.instance?.resetCameraToHome()
  }

  return (
    <div className="ui-top-left-actions">
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

      <UIButton className="ui-money-button static" data-money-counter="true" aria-label="Argent">
        <span>💰</span>
        <span>{money}</span>
      </UIButton>
    </div>
  )
}
