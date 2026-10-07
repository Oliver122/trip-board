import { expect, test } from '@playwright/test'

test(
  'WebGL context is available for the map',
  { tag: '@mobile' },
  async ({ page }) => {
    await page.setContent('<!doctype html><title>webgl</title>')
    const ok = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      return gl != null
    })
    expect(
      ok,
      'This browser has no WebGL context, so MapLibre cannot load the map',
    ).toBe(true)
  },
)
