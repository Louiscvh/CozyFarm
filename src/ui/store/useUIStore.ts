// ui/store/useUIStore.ts
import { create } from "zustand"

type UIState = {
  money: number
  tooltipVisible: boolean
  tooltipText: string
  tooltipX: number
  tooltipY: number
}

export const useUIStore = create<UIState>(() => ({
  money: 0,
  tooltipVisible: false,
  tooltipText: "",
  tooltipX: 0,
  tooltipY: 0,
}))