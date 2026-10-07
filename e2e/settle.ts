import type { Page } from '@playwright/test'

/** Wait until CSS transitions and finite animations have finished. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    const deadline = performance.now() + 2_000
    while (performance.now() < deadline) {
      const running = document.getAnimations().filter((animation) => {
        if (animation.playState !== 'running') return false
        const iterations = animation.effect?.getComputedTiming().iterations
        return iterations !== Infinity
      })
      if (running.length === 0) return
      await Promise.all(
        running.map((animation) => animation.finished.catch(() => undefined)),
      )
    }
  })
}
