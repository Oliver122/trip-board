import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { settle } from './settle'

export async function expectNoSeriousViolations(
  page: Page,
  options?: { include?: string; label?: string } | string,
) {
  const label = typeof options === 'string' ? options : options?.label
  const include = typeof options === 'string' ? undefined : options?.include
  await settle(page)
  const builder = new AxeBuilder({ page })
  if (include) builder.include(include)
  const results = await builder.analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious, label).toEqual([])
}
