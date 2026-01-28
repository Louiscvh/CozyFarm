import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"

type LoaderContextType = {
  loading: boolean
  startLoading: () => void
  stopLoading: () => void
}

const LoaderContext = createContext<LoaderContextType | null>(null)

export const LoaderProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true)

  return (
    <LoaderContext.Provider
      value={{
        loading,
        startLoading: () => setLoading(true),
        stopLoading: () => setLoading(false),
      }}
    >
      {children}
    </LoaderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLoader = () => {
  const ctx = useContext(LoaderContext)
  if (!ctx) throw new Error("useLoader must be used inside LoaderProvider")
  return ctx
}
