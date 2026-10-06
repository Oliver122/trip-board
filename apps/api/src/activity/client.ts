import { AsyncLocalStorage } from 'node:async_hooks'

const clientIds = new AsyncLocalStorage<string | null>()

export function enterClientId(clientId: string | null): void {
  clientIds.enterWith(clientId)
}

export function currentClientId(): string | null {
  return clientIds.getStore() ?? null
}
