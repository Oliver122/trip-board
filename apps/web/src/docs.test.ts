import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(`../../../docs/${path}`, import.meta.url), 'utf8')

describe('docs guard', () => {
  it('T-38-15 describes the phone layout, low data and Open in Google Maps', () => {
    const design = read('DESIGN.md')
    const section = design.slice(
      design.indexOf('### 3.7'),
      design.indexOf('### 3.8'),
    )
    expect(section).toMatch(/bottom (tab )?bar/i)
    expect(section).toContain('Low data')
    expect(section).toContain('Open in Google Maps')
    expect(read('PROJECT_SCOPE.md')).not.toMatch(
      /dedicated (simplified )?phone UI/i,
    )
  })
})
