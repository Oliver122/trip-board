import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

// The change panel of step 42 (C-OPS-53): generated from fixtures, opened over
// file://. Runs only in the ui-review project (C-OPS-49).

const root = process.cwd()
const fixtureDir = join(root, 'test-results', 'ui-changes-fixture')
const panel = pathToFileURL(join(fixtureDir, 'out', 'index.html')).href
// A 1 × 1 px JPEG
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

test.beforeAll(async () => {
  rmSync(fixtureDir, { recursive: true, force: true })
  const changes = await import('../../scripts/ui-review/changes.mjs')
  const findings = changes.findingsTable(
    readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8'),
  )
  const sets = changes.implementationSets(
    readFileSync(join(root, 'docs', 'MOBILE_SKETCH.md'), 'utf8'),
  )
  const entries = sets.flatMap((set: { set: string; ids: string[] }) =>
    set.ids.map((id) => {
      const row = findings.find((entry: { id: string }) => entry.id === id)
      const width = row.widths.includes('390') ? 390 : row.widths[0]
      return {
        id,
        set: set.set,
        done: `Fixture text for ${id}.`,
        files: ['package.json'],
        images: [`${row.screens[0]}-${width}-light`],
      }
    }),
  )
  for (const side of ['before', 'after']) {
    mkdirSync(join(fixtureDir, side), { recursive: true })
    writeFileSync(
      join(fixtureDir, side, 'findings.json'),
      JSON.stringify({ commit: `${side}01`, groups: [] }),
    )
    for (const entry of entries) {
      for (const image of entry.images) {
        writeFileSync(join(fixtureDir, side, `${image}.jpg`), jpeg)
      }
    }
  }
  writeFileSync(
    join(fixtureDir, 'changes.json'),
    JSON.stringify({ step: 42, base: 'before01', changes: entries }),
  )
  execFileSync(
    'node',
    [
      join(root, 'scripts', 'ui-review', 'changes.mjs'),
      '--before',
      join(fixtureDir, 'before'),
      '--after',
      join(fixtureDir, 'after'),
      '--manifest',
      join(fixtureDir, 'changes.json'),
      '--out',
      join(fixtureDir, 'out'),
    ],
    { cwd: root },
  )
})

const card = (page: Page, id: string) => page.locator(`article#${id}`)

async function mark(page: Page, id: string, verdict: string, note: string) {
  await card(page, id).getByLabel(verdict, { exact: true }).check()
  await card(page, id).getByRole('textbox').fill(note)
}

test('T-42-03 verdicts are kept, filtered, counted and exported', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('file:')) requests.push(request.url())
  })
  await page.route(/^https?:/, (route) => route.abort())
  await page.goto(panel)
  const total = await page.locator('article').count()
  expect(total).toBe(29)

  await mark(page, 'U-02', 'Accepted', 'looks good')
  await mark(page, 'U-03', 'Needs work', 'pin too small')
  await page.reload()
  await expect(card(page, 'U-02').getByLabel('Accepted')).toBeChecked()
  await expect(card(page, 'U-03').getByLabel('Needs work')).toBeChecked()
  await expect(card(page, 'U-02').getByRole('textbox')).toHaveValue(
    'looks good',
  )
  await expect(card(page, 'U-03').getByRole('textbox')).toHaveValue(
    'pin too small',
  )

  await page.getByLabel('Show').selectOption('needs-work')
  await expect(page.locator('article:not([hidden])')).toHaveCount(1)
  await expect(page.locator('#count-accepted')).toHaveText('1')
  await expect(page.locator('#count-needs')).toHaveText('1')
  await expect(page.locator('#count-open')).toHaveText(String(total - 2))

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export verdicts' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('ui-changes-42-verdicts.json')
  const body = JSON.parse(readFileSync((await file.path())!, 'utf8'))
  expect(body.step).toBe(42)
  expect(body.verdicts).toHaveLength(total)
  expect(body.verdicts.find((v: { id: string }) => v.id === 'U-02')).toEqual({
    id: 'U-02',
    verdict: 'accepted',
    note: 'looks good',
  })
  expect(
    body.verdicts.find((v: { id: string }) => v.id === 'U-24').verdict,
  ).toBe('open')
  expect(requests).toEqual([])
})

test('T-42-03 the page still marks cards when localStorage throws', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const fail = () => {
      throw new Error('storage blocked')
    }
    Storage.prototype.getItem = fail
    Storage.prototype.setItem = fail
  })
  await page.goto(panel)
  await mark(page, 'U-02', 'Accepted', 'session only')
  await expect(card(page, 'U-02').getByLabel('Accepted')).toBeChecked()
  await expect(page.locator('#count-accepted')).toHaveText('1')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`T-42-04 the panel passes axe and the keyboard reaches every control in ${scheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(panel)
    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
    )
    expect(serious).toEqual([])

    const reached = new Set<string>()
    // 29 cards with two image links, a radio group and a note, plus filter and export
    for (let step = 0; step < 29 * 4 + 5; step += 1) {
      await page.keyboard.press('Tab')
      const key = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        if (!element) return ''
        const article = element.closest('article')
        const kind =
          element.tagName === 'INPUT'
            ? `radio-${(element as HTMLInputElement).name}`
            : element.tagName === 'TEXTAREA'
              ? 'note'
              : element.id || element.tagName
        return `${article?.id ?? ''}/${kind}`
      })
      reached.add(key)
    }
    expect(reached.has('/export')).toBe(true)
    const ids = await page
      .locator('article')
      .evaluateAll((nodes) => nodes.map((node) => node.id))
    for (const id of ids) {
      expect(reached.has(`${id}/radio-v-${id}`), `${id} radio`).toBe(true)
      expect(reached.has(`${id}/note`), `${id} note`).toBe(true)
    }
  })
}
