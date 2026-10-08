import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('T-23-01 reads a Takeout list CSV with a BOM, quoted fields, and an unknown column', () => {
    const longTitle = 'A'.repeat(130)
    const note = '"Loved it, would go again\nSo pretty"'
    const url = '"https://maps.google.com/?q=35,135"'
    const text =
      '﻿' +
      'Title,Note,URL,Comment,Tags\r\n' +
      `Kinkaku-ji,${note},${url},Bring cash,temple\r\n` +
      `${longTitle},,,,\r\n` +
      ',Note only,,,\r\n'

    const result = parseCsv(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('google_csv')
    expect(result.skipped).toBe(1)
    expect(result.rows).toHaveLength(2)

    const [kinkakuji, cut] = result.rows
    expect(kinkakuji).toMatchObject({
      title: 'Kinkaku-ji',
      info: 'Loved it, would go again\nSo pretty\n\nBring cash',
      link: 'https://maps.google.com/?q=35,135',
      lat: 35,
      lng: 135,
      shortened: false,
    })
    expect(cut?.title).toBe('A'.repeat(120))
    expect(cut?.shortened).toBe(true)
  })

  it('T-23-01 is an error when the file has no Title column', () => {
    const result = parseCsv('Note,URL\r\nSomething,https://example.com\r\n')
    expect(result).toEqual({ ok: false, error: 'no_title_column' })
  })
})
