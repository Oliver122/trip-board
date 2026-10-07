import { test as base, expect } from '@playwright/test'
import { watchWebgl } from './map'

export const test = base.extend({
  page: async ({ page }, use) => {
    watchWebgl(page)
    await use(page)
  },
})

export { expect }
export type { Locator, Page } from '@playwright/test'
