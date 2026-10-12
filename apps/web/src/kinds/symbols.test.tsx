/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react'
import {
  kindSymbolCount,
  kindSymbolIcons,
  kindSymbols,
} from '@tripboard/shared'
import * as lucide from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { KindSymbolIcon, symbolIcons } from './symbols'

const step28 = [
  'exclamation',
  'question',
  'dot',
  'star',
  'heart',
  'food',
  'coffee',
  'camera',
  'shopping',
  'nature',
  'temple',
  'cat',
]

describe('kind symbols', () => {
  afterEach(cleanup)

  it('T-29-01 has 64 unique keys and keeps the step 28 order', () => {
    expect(kindSymbols).toHaveLength(64)
    expect(kindSymbolCount).toBe(64)
    expect(new Set(kindSymbols).size).toBe(64)
    expect(kindSymbols.slice(0, 12)).toEqual(step28)
    expect(kindSymbols).not.toContain('home')
    expect(kindSymbols).not.toContain('calendar')
  })

  it('T-29-01 renders an icon for every key that matches the shared mapping', () => {
    for (const key of kindSymbols) {
      const { container, unmount } = render(<KindSymbolIcon symbol={key} />)
      expect(container.querySelector(`[data-icon="${key}"]`)).not.toBeNull()
      const name = kindSymbolIcons[key]
      if (name) {
        expect(symbolIcons[key]).toBe(
          (lucide as unknown as Record<string, unknown>)[name],
        )
      } else {
        expect(symbolIcons[key]).toBeUndefined()
      }
      unmount()
    }
  })

  it('T-29-01 has an en and de name for every key', async () => {
    for (const lng of ['en', 'de']) {
      await i18n.changeLanguage(lng)
      for (const key of kindSymbols) {
        expect(i18n.exists(`kinds.symbols.${key}`)).toBe(true)
        expect(i18n.t(`kinds.symbols.${key}`)).not.toBe(`kinds.symbols.${key}`)
      }
    }
    await i18n.changeLanguage('en')
  })
})
