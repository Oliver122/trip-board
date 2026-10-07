import { describe, expect, it } from 'vitest'
import { markDuplicates } from './duplicates'

const fushimiInari = {
  title: 'Fushimi Inari',
  link: null,
  lat: 34.967,
  lng: 135.772,
}

describe('markDuplicates', () => {
  it('T-23-04 flags a matching link, a nearby matching title, and a repeat within the file', () => {
    const rows = [
      {
        title: 'Kinkaku-ji',
        link: 'https://maps.google.com/?q=1',
        lat: null,
        lng: null,
      },
      { title: 'fushimi inari', link: null, lat: 34.9684, lng: 135.772 },
      { title: 'Fushimi Inari', link: null, lat: 34.969, lng: 135.775 },
      { title: 'Fushimi Inari', link: null, lat: 34.9684, lng: 135.772 },
    ]
    const existing = [
      {
        title: 'Kinkaku-ji copy',
        link: 'https://maps.google.com/?q=1',
        lat: 0,
        lng: 0,
      },
      fushimiInari,
    ]

    const flags = markDuplicates(rows, existing)
    expect(flags[0]).toBe(true)
    expect(flags[1]).toBe(true)
    expect(flags[2]).toBe(false)
    expect(flags[3]).toBe(true)
  })
})
