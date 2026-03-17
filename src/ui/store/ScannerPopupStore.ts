interface ScannerPopupState {
  open: boolean
  cellX: number
  cellZ: number
}

class ScannerPopupStore {
  private state: ScannerPopupState = { open: false, cellX: 0, cellZ: 0 }
  private listeners: (() => void)[] = []

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== fn)
    }
  }

  private notify(): void {
    this.listeners.forEach(fn => fn())
  }

  getSnapshot(): ScannerPopupState {
    return this.state
  }

  openAt(cellX: number, cellZ: number): void {
    this.state = { open: true, cellX, cellZ }
    this.notify()
  }

  close(): void {
    if (!this.state.open) return
    this.state = { ...this.state, open: false }
    this.notify()
  }
}

export const scannerPopupStore = new ScannerPopupStore()
