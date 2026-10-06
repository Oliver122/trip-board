import type { Trip } from '@tripboard/shared'

const memberListeners = new Set<(members?: Trip['members']) => void>()

export function onMembersRefresh(
  listener: (members?: Trip['members']) => void,
): () => void {
  memberListeners.add(listener)
  return () => memberListeners.delete(listener)
}

export function emitMembersRefresh(members?: Trip['members']): void {
  for (const listener of memberListeners) listener(members)
}
