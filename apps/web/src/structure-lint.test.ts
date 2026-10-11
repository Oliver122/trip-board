import { describe, expect, it } from 'vitest'
import {
  e2eCleanupViolations,
  e2eLocaleViolations,
  e2eSuiteLocaleViolations,
  e2eStabilityViolations,
  structureViolations,
  structureViolationsInTree,
} from './structure-lint'

describe('structure lint', () => {
  it('T-29-15 flags kind options rendered as checkboxes and passes the chip group', () => {
    const bad = `<fieldset><legend>{t('board.category')}</legend>
  {(kinds ?? []).map((kind) => (
    <label key={kind.id}><input type="checkbox" checked /> {kind.name}</label>
  ))}
</fieldset>`
    for (const file of [
      'spots/SpotToolbar.tsx',
      'spots/SpotPanel.tsx',
      'import/ImportDialog.tsx',
    ]) {
      expect(structureViolations(bad, file)).toEqual(['kind checkbox'])
    }
    const bySection = `<fieldset><legend>{t('board.category')}</legend>
  <label><input type="checkbox" /> Home</label>
</fieldset>`
    expect(structureViolations(bySection, 'spots/SpotPanel.tsx')).toEqual([
      'kind checkbox',
    ])
    const good = `<fieldset><legend>{t('board.category')}</legend>
  <ChipGroup options={kinds.map((kind) => ({ value: kind.id }))} />
</fieldset>
`
    expect(structureViolations(good, 'spots/SpotPanel.tsx')).toEqual([])
    // A checkbox far from the category section (primary home base) is fine.
    const farAway = `<p>{t('board.category')}</p><ChipGroup />${' '.repeat(800)}<label><input type="checkbox" checked={primary} /></label>`
    expect(structureViolations(farAway, 'spots/SpotPanel.tsx')).toEqual([])
    // Other files may use checkboxes freely.
    expect(structureViolations(bad, 'admin/Other.tsx')).toEqual([])
  })

  it('T-26-14 flags window.confirm anywhere', () => {
    expect(
      structureViolations('if (window.confirm("x")) go()', 'pages/A.tsx'),
    ).toEqual(['window.confirm'])
  })

  it('T-26-14 flags fixed inset-0 outside the modal', () => {
    const source = '<div className="fixed inset-0 z-40" />'
    expect(structureViolations(source, 'trips/CreateTripDialog.tsx')).toEqual([
      'fixed inset-0',
    ])
    expect(structureViolations(source, 'components/ui/modal.tsx')).toEqual([])
  })

  it('T-26-14 flags a raw select outside the shared select', () => {
    const source = '<select value={a} onChange={b}></select>'
    expect(structureViolations(source, 'spots/SpotToolbar.tsx')).toEqual([
      '<select',
    ])
    expect(structureViolations(source, 'components/ui/select.tsx')).toEqual([])
  })

  it('T-26-14 flags fetch outside api/ and the allow-list', () => {
    const source = 'const r = await fetch("/x")'
    expect(structureViolations(source, 'spots/panel.ts')).toEqual(['fetch('])
    expect(structureViolations(source, 'api/http.ts')).toEqual([])
    expect(structureViolations(source, 'spots/api/client.ts')).toEqual([
      'fetch(',
    ])
    for (const file of [
      'session.tsx',
      'use-locale.ts',
      'pages/LoginPage.tsx',
      'dev-login.tsx',
    ]) {
      expect(structureViolations(source, file)).toEqual([])
    }
  })

  it('T-26-14 the app has no duplicated dialog, confirm, select or fetch code', () => {
    const root = new URL('.', import.meta.url).pathname
    expect(structureViolationsInTree(root)).toEqual([])
  })

  it('T-27-02 flags setLocale in a test that logs in as a seeded user', () => {
    const bad = `test('a', async ({ page }) => {
  await login(page, aiko)
  await setLocale(page, 'de')
})`
    const literal = bad.replace('aiko', "'100000000000000001'")
    const fresh = `test('a', async ({ page }) => {
  await login(page, freshDiscordId())
  await setLocale(page, 'de')
})
test('b', async ({ page }) => {
  await login(page, sven)
})`
    expect(e2eStabilityViolations(bad)).toEqual(['setLocale on seeded user'])
    expect(e2eStabilityViolations(literal)).toEqual([
      'setLocale on seeded user',
    ])
    expect(e2eStabilityViolations(fresh)).toEqual([])
  })

  it('T-27-03 flags sleeps, slow, retries and long timeouts', () => {
    expect(e2eStabilityViolations('await page.waitForTimeout(500)')).toEqual([
      'waitForTimeout',
    ])
    expect(e2eStabilityViolations('test.slow()')).toEqual(['test.slow'])
    expect(
      e2eStabilityViolations('test.describe.configure({ retries: 2 })'),
    ).toEqual(['retries'])
    expect(e2eStabilityViolations('test.setTimeout(60_000)')).toEqual([
      'test.setTimeout > 30s',
    ])
    expect(e2eStabilityViolations('test.setTimeout(30_000)')).toEqual([])
    expect(e2eStabilityViolations('await expect(x).toBeVisible()')).toEqual([])
  })

  it('T-27-02/T-27-03 e2e/cleanup.spec.ts has no stability violations', () => {
    expect(e2eCleanupViolations()).toEqual([])
  })

  it('T-27-02 flags a non-English language stored on a seeded user in any spec', () => {
    const helper = `async function run(page: Page, locale: 'en' | 'de') {
  await login(page, aikoId)
  await setLocale(page, locale)
}`
    const german = `test('a', async ({ page }) => {
  await signIn(page, tomId)
  await setLocale(page, 'de')
})`
    const english = `test('a', async ({ page }) => {
  await login(page, sven)
  await setLocale(page, 'en')
})`
    const shown = `test('a', async ({ page }) => {
  await login(page, '100000000000000001')
  await showLocale(page, 'de')
})`
    expect(e2eLocaleViolations(helper)).toEqual([
      'non-English setLocale on seeded user',
    ])
    expect(e2eLocaleViolations(german)).toEqual([
      'non-English setLocale on seeded user',
    ])
    const hook = `test.beforeEach(async ({ page }) => {
  await login(page, '100000000000000001')
})

test('a', async ({ page }) => {
  await setLocale(page, 'de')
})`
    expect(e2eLocaleViolations(hook)).toEqual([
      'non-English setLocale on seeded user',
    ])
    expect(e2eLocaleViolations(english)).toEqual([])
    expect(e2eLocaleViolations(shown)).toEqual([])
  })

  it('T-27-02 no e2e spec stores German on a seeded user', () => {
    expect(e2eSuiteLocaleViolations()).toEqual([])
  })
})
