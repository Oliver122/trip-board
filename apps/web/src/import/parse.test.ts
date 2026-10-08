import { describe, expect, it } from 'vitest'
import { parseImportFile } from './parse'
import { maxImportFileBytes } from './model'

function file(name: string, content: string, type = 'text/plain'): File {
  return new File([content], name, { type })
}

describe('parseImportFile', () => {
  it('R-23-02 shows a KML hint for a .kmz or .zip file', async () => {
    expect(await parseImportFile(file('list.kmz', 'x'))).toEqual({
      ok: false,
      error: 'kmz',
    })
    expect(await parseImportFile(file('Takeout.zip', 'x'))).toEqual({
      ok: false,
      error: 'kmz',
    })
  })

  it('R-23-02 is an error for an unsupported file without a preview', async () => {
    expect(await parseImportFile(file('notes.txt', 'x'))).toEqual({
      ok: false,
      error: 'unsupported',
    })
  })

  it('R-23-02 is an error for a file over 5 MB', async () => {
    const big = file('list.csv', 'x'.repeat(maxImportFileBytes + 1))
    expect(await parseImportFile(big)).toEqual({
      ok: false,
      error: 'too_large',
    })
  })

  it('T-23-14 a CSV with 501 rows is an error naming the 500 limit', async () => {
    const rows = Array.from({ length: 501 }, (_unused, index) => `Row ${index}`)
    const csv = `Title\r\n${rows.join('\r\n')}\r\n`
    const result = await parseImportFile(file('list.csv', csv, 'text/csv'))
    expect(result).toEqual({ ok: false, error: 'too_many_rows' })
  })
})
