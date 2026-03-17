class MoneyStore {
  private amount = 0
  private listeners: Array<(amount: number) => void> = []

  getAmount() {
    return this.amount
  }

  add(amount: number) {
    if (amount <= 0) return
    this.amount += amount
    this.listeners.forEach(listener => listener(this.amount))
  }

  subscribe(listener: (amount: number) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }
}

export const moneyStore = new MoneyStore()
