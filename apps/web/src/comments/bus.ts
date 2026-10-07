type Listener = (spotId: string | null) => void

const listeners = new Set<Listener>()

/**
 * A comment was written, edited, deleted or marked read in this tab, or a
 * live `comment` event arrived. `spotId` is null when the change is trip-wide.
 */
export function onCommentsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitCommentsChanged(spotId: string | null): void {
  for (const listener of listeners) listener(spotId)
}
