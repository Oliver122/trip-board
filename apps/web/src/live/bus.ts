const memberListeners = new Set<() => void>()

export function onMembersRefresh(listener: () => void): () => void {
  memberListeners.add(listener)
  return () => memberListeners.delete(listener)
}

export function emitMembersRefresh(): void {
  for (const listener of memberListeners) listener()
}
