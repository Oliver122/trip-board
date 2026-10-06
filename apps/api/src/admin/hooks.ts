export type AdminHooks = {
  beforeCommit?: () => Promise<void>
}

export async function finishWrite(hooks: AdminHooks): Promise<void> {
  if (hooks.beforeCommit) await hooks.beforeCommit()
}
