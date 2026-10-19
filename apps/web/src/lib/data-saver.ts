import { useSyncExternalStore } from 'react'

/** Step 38 (R-38-06): low-data mode, stored per device. */
export type DataSaverSetting = 'auto' | 'on' | 'off'

export const dataSaverStorageKey = 'dataSaver'

export type ConnectionInfo = {
  saveData?: boolean
  effectiveType?: string
}

type ConnectionLike = ConnectionInfo & {
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

export function parseDataSaver(value: unknown): DataSaverSetting {
  return value === 'on' || value === 'off' ? value : 'auto'
}

/** Reads the stored setting; unreadable storage or an unknown value is `auto`. */
export function readDataSaver(
  storage: Pick<Storage, 'getItem'> | null | undefined = safeStorage(),
): DataSaverSetting {
  try {
    return parseDataSaver(storage?.getItem(dataSaverStorageKey))
  } catch {
    return 'auto'
  }
}

/**
 * Whether low data is on. `stored` is the raw stored value or a reader that
 * may throw; `on`/`off` win, `auto` follows the connection.
 */
export function resolveDataSaver(
  stored: unknown,
  connection: ConnectionInfo | null | undefined,
): boolean {
  let setting: DataSaverSetting
  try {
    setting = parseDataSaver(typeof stored === 'function' ? stored() : stored)
  } catch {
    setting = 'auto'
  }
  if (setting !== 'auto') return setting === 'on'
  if (!connection) return false
  return (
    connection.saveData === true ||
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g'
  )
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function currentConnection(): ConnectionLike | null {
  if (typeof navigator === 'undefined') return null
  return (
    (navigator as Navigator & { connection?: ConnectionLike }).connection ??
    null
  )
}

const listeners = new Set<() => void>()
let snapshot: { setting: DataSaverSetting; on: boolean } | null = null

function compute() {
  const setting = readDataSaver()
  return { setting, on: resolveDataSaver(setting, currentConnection()) }
}

function emit() {
  const next = compute()
  if (
    !snapshot ||
    snapshot.setting !== next.setting ||
    snapshot.on !== next.on
  ) {
    snapshot = next
    for (const listener of listeners) listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    currentConnection()?.addEventListener?.('change', emit)
    window.addEventListener('storage', emit)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      currentConnection()?.removeEventListener?.('change', emit)
      window.removeEventListener('storage', emit)
    }
  }
}

function getSnapshot() {
  if (!snapshot) snapshot = compute()
  return snapshot
}

const serverSnapshot = { setting: 'auto' as DataSaverSetting, on: false }

/** Stores the setting (ignored when storage is unavailable) and notifies every hook. */
export function setDataSaver(setting: DataSaverSetting) {
  try {
    safeStorage()?.setItem(dataSaverStorageKey, setting)
  } catch {
    /* storage blocked: the setting lasts for this page only */
  }
  const next = {
    setting,
    on: resolveDataSaver(setting, currentConnection()),
  }
  snapshot = next
  for (const listener of listeners) listener()
}

/** Low-data state for components; `on` updates live with the setting and the connection. */
export function useDataSaver(): {
  setting: DataSaverSetting
  on: boolean
  setSetting: (setting: DataSaverSetting) => void
} {
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => serverSnapshot,
  )
  return { ...state, setSetting: setDataSaver }
}

/** Test helper: forget the cached snapshot. */
export function resetDataSaverState() {
  snapshot = null
}
