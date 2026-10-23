import { expect, test, type Page } from '@playwright/test'
import { runChecks, type CheckName } from './ui-review/checks'

async function check(page: Page, html: string, width: 1280 | 768 | 390) {
  await page.setViewportSize({ width, height: 800 })
  await page.setContent(
    `<!doctype html><html><body style="margin:0;font:16px sans-serif">${html}</body></html>`,
  )
  return runChecks(page, {
    screen: 'fixture',
    width,
    theme: 'light',
    locale: 'en',
  })
}

const only = (results: Awaited<ReturnType<typeof check>>, name: CheckName) =>
  results.filter((result) => result.check === name)

test('T-40-02 @chromium target-size flags a 30 px button at 390 px and not at 1280 px', async ({
  page,
}) => {
  const html =
    '<button style="width:30px;height:30px;padding:0" aria-label="Zoom in">+</button>'
  const phone = only(await check(page, html, 390), 'target-size')
  expect(phone).toHaveLength(1)
  expect(phone[0]).toMatchObject({
    check: 'target-size',
    screen: 'fixture',
    width: 390,
    theme: 'light',
    locale: 'en',
    name: 'Zoom in',
  })
  expect(phone[0].box).toEqual({ x: 0, y: 0, width: 30, height: 30 })
  expect(phone[0].selector.split(' > ').length).toBeLessThanOrEqual(4)
  expect(only(await check(page, html, 1280), 'target-size')).toHaveLength(0)
})

test('T-40-02 @chromium target-size exempts a link in running text but not a lone link', async ({
  page,
}) => {
  const inText =
    '<p style="margin:0">Read the <a href="#x" style="font-size:12px">terms</a> first.</p>'
  expect(only(await check(page, inText, 390), 'target-size')).toHaveLength(0)
  const alone =
    '<div><a href="#x" style="display:inline-block;width:20px;height:20px">x</a></div>'
  expect(only(await check(page, alone, 390), 'target-size')).toHaveLength(1)
})

test('T-40-02 @chromium truncated-no-full-text needs a title for an ellipsis', async ({
  page,
}) => {
  const box =
    'width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis'
  const text = 'A very long spot name that does not fit'
  const without = await check(page, `<div style="${box}">${text}</div>`, 1280)
  expect(only(without, 'truncated-no-full-text')).toHaveLength(1)
  expect(only(without, 'clipped-text')).toHaveLength(0)
  const withTitle = await check(
    page,
    `<div style="${box}" title="${text}">${text}</div>`,
    1280,
  )
  expect(only(withTitle, 'truncated-no-full-text')).toHaveLength(0)
})

test('T-40-02 @chromium overlap ignores nested controls and reports two overlapping siblings once', async ({
  page,
}) => {
  const nested =
    '<button style="width:100px;height:50px">Card<span role="button" style="position:absolute;left:10px;top:10px;width:20px;height:20px">x</span></button>'
  expect(only(await check(page, nested, 1280), 'overlap')).toHaveLength(0)
  const siblings =
    '<button style="position:absolute;left:0;top:0;width:60px;height:40px">A</button><button style="position:absolute;left:40px;top:10px;width:60px;height:40px">B</button>'
  const found = only(await check(page, siblings, 1280), 'overlap')
  expect(found).toHaveLength(1)
  expect(found[0].name).toBe('A / B')
})

test('T-40-02 @chromium offscreen exempts controls in a horizontal scroller', async ({
  page,
}) => {
  const scroller =
    '<div style="width:200px;overflow-x:auto"><div style="width:600px;display:flex"><button style="margin-left:300px;width:100px;height:30px">In scroller</button></div></div>'
  expect(only(await check(page, scroller, 1280), 'offscreen')).toHaveLength(0)
  const pushed =
    '<button style="position:absolute;left:1250px;width:100px;height:30px">Pushed</button>'
  const found = only(await check(page, pushed, 1280), 'offscreen')
  expect(found).toHaveLength(1)
  expect(found[0].name).toBe('Pushed')
})

test('T-40-02 @chromium overflow-x flags a page wider than the viewport', async ({
  page,
}) => {
  const wide = '<div style="width:600px;height:20px">wide</div>'
  const found = only(await check(page, wide, 390), 'overflow-x')
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ name: '', selector: 'html' })
  expect(found[0].box.width).toBe(600)
  expect(
    only(await check(page, '<p>fits</p>', 390), 'overflow-x'),
  ).toHaveLength(0)
})

test('T-40-02 @chromium clipped-text flags hidden overflow without an ellipsis', async ({
  page,
}) => {
  const clipped =
    '<div data-testid="label" style="width:50px;overflow:hidden;white-space:nowrap">Much too long for this box</div>'
  const found = only(await check(page, clipped, 1280), 'clipped-text')
  expect(found).toHaveLength(1)
  expect(found[0].selector).toBe('div[data-testid="label"]')
  const fits =
    '<div style="width:300px;overflow:hidden;white-space:nowrap">Short</div>'
  expect(only(await check(page, fits, 1280), 'clipped-text')).toHaveLength(0)
})

test('T-40-02 @chromium small-text flags text below 12 px', async ({
  page,
}) => {
  const small = '<p style="font-size:10px">tiny note</p>'
  const found = only(await check(page, small, 1280), 'small-text')
  expect(found).toHaveLength(1)
  expect(found[0].name).toBe('tiny note')
  expect(found[0].selector.split(' > ').length).toBeLessThanOrEqual(4)
  expect(
    only(
      await check(page, '<p style="font-size:12px">ok</p>', 1280),
      'small-text',
    ),
  ).toHaveLength(0)
})

test('T-40-02 @chromium selectors replace UUIDs in test ids with <id>', async ({
  page,
}) => {
  const html =
    '<button data-testid="pin-20000000-0000-0000-0000-000000000001" style="width:20px;height:20px;padding:0">p</button><div data-testid="member-10000000-0000-0000-0000-000000000002"><button style="width:20px;height:20px;padding:0">m</button></div>'
  const found = only(await check(page, html, 390), 'target-size')
  expect(found.map((result) => result.selector).sort()).toEqual([
    '[data-testid="member-<id>"] button',
    'button[data-testid="pin-<id>"]',
  ])
})

test('T-40-02 @chromium visually hidden text is not reported', async ({
  page,
}) => {
  const html =
    '<label style="position:absolute;width:1px;height:1px;overflow:hidden;white-space:nowrap;font-size:8px">A long screen reader only label</label>'
  const results = await check(page, html, 390)
  expect(only(results, 'clipped-text')).toHaveLength(0)
  expect(only(results, 'small-text')).toHaveLength(0)
})

test('T-40-02 @chromium a button under a fixed full-screen overlay is not reported', async ({
  page,
}) => {
  const html =
    '<button style="position:absolute;left:10px;top:10px;width:20px;height:20px;padding:0">Under</button><button style="position:absolute;left:20px;top:15px;width:20px;height:20px;padding:0">Also under</button><div style="position:fixed;inset:0;background:#fff"><button style="position:absolute;left:200px;top:200px;width:60px;height:60px">Over</button></div>'
  const results = await check(page, html, 390)
  expect(only(results, 'target-size')).toHaveLength(0)
  expect(only(results, 'overlap')).toHaveLength(0)
})

test('T-40-02 @chromium a hidden checkbox is judged by its 44 px label', async ({
  page,
}) => {
  const hidden =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)'
  const big =
    '<label style="display:flex;width:44px;height:44px;align-items:center"><input type="checkbox" style="' +
    hidden +
    '">A</label>'
  expect(only(await check(page, big, 390), 'target-size')).toHaveLength(0)
  const small =
    '<label style="display:flex;width:30px;height:30px;align-items:center"><input type="checkbox" style="' +
    hidden +
    '">B</label>'
  const found = only(await check(page, small, 390), 'target-size')
  expect(found).toHaveLength(1)
  expect(found[0].box.width).toBe(30)
})
