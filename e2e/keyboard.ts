import type { Locator, Page } from '@playwright/test'

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Move focus to `target` from a known element.
 * WebKit skips links and buttons on plain Tab unless full keyboard access is on,
 * which Option-Tab (Alt+Tab) provides.
 */
export async function focusByKeyboard(page: Page, target: Locator) {
  const browserName = page.context().browser()?.browserType().name()
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  await page.evaluate((selector) => {
    const dialog = document.querySelector('[role="dialog"]')
    const root = dialog ?? document.body
    root.querySelector<HTMLElement>(selector)?.focus()
  }, focusable)
  for (let step = 0; step < 80; step += 1) {
    const focused = await target.evaluate((element) => {
      const active = document.activeElement
      return (
        element === active ||
        (active instanceof Node && element.contains(active))
      )
    })
    if (focused) return
    await page.keyboard.press(tab)
  }
  throw new Error('Could not reach the control with Tab')
}
