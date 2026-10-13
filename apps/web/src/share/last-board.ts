// The board a user opened last, so /share can preselect it (R-33-08).
const key = 'tripboard.lastBoard'

export function rememberLastBoard(tripId: string): void {
  try {
    window.localStorage.setItem(key, tripId)
  } catch {
    // Storage may be blocked; the share page then preselects nothing.
  }
}

export function lastBoard(): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
