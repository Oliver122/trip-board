/** @vitest-environment jsdom */
import { kindSymbolIndex } from '@tripboard/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetTextureState, symbolTexture } from './textures'

function useManifest(version: string, filled: number[]) {
  // Node's own `localStorage` global can shadow jsdom's, so stub it.
  const stored = JSON.stringify({ version, filled })
  vi.stubGlobal('localStorage', { getItem: () => stored })
  resetTextureState()
}

describe('symbolTexture', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetTextureState()
  })

  it('T-29-20 is null for every symbol while the manifest is empty', () => {
    useManifest('none', [])
    expect(symbolTexture('food')).toBeNull()
  })

  it('T-29-20 gives the versioned url and the cell position of a filled symbol', () => {
    expect(kindSymbolIndex('food')).toBe(5)
    useManifest('abc123', [0, 5, 63])
    expect(symbolTexture('food')).toEqual({
      url: '/textures/kind-symbols.png?v=abc123',
      position: `${(5 * 100) / 7}% 0%`,
    })
    expect(symbolTexture('exclamation')?.position).toBe('0% 0%')
    expect(symbolTexture('bookmark')?.position).toBe('100% 100%')
    expect(symbolTexture('cat')).toBeNull()
  })

  it('T-29-20 ignores a broken override and uses the bundled manifest', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{nope' })
    resetTextureState()
    expect(symbolTexture('food')).toBeNull()
  })
})
