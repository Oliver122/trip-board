/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { parseTransfer, type TransferLike } from './drop'

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function transfer(
  data: Record<string, string>,
  files: File[] = [],
): TransferLike {
  return { files, getData: (type) => data[type] ?? '' }
}

describe('drop and paste parser', () => {
  it('T-34-04 turns a data:image URI into a file', () => {
    const result = parseTransfer(
      transfer({ 'text/plain': `data:image/png;base64,${png}` }),
    )
    expect(result.kind).toBe('files')
    if (result.kind !== 'files') return
    expect(result.files[0].type).toBe('image/png')
    expect(result.files[0].size).toBeGreaterThan(10)
  })

  it('T-34-04 unwraps a Google imgres link', () => {
    const link =
      'https://www.google.com/imgres?imgurl=https%3A%2F%2Fa.example%2Fx.jpg&tbnid=1&docid=2'
    expect(parseTransfer(transfer({ 'text/uri-list': link }))).toEqual({
      kind: 'url',
      url: 'https://a.example/x.jpg',
    })
  })

  it('T-34-04 reads the src of a dropped <img>', () => {
    const html =
      '<meta charset="utf-8"><a href="/p"><img src="https://b.example/y.png" alt="y"></a>'
    expect(parseTransfer(transfer({ 'text/html': html }))).toEqual({
      kind: 'url',
      url: 'https://b.example/y.png',
    })
    const data = `<img src="data:image/png;base64,${png}">`
    expect(parseTransfer(transfer({ 'text/html': data })).kind).toBe('files')
  })

  it('T-34-04 takes the first URL of a uri-list with comments', () => {
    const list =
      '# dragged from a tab\r\nhttps://c.example/1.jpg\r\nhttps://c.example/2.jpg'
    expect(parseTransfer(transfer({ 'text/uri-list': list }))).toEqual({
      kind: 'url',
      url: 'https://c.example/1.jpg',
    })
  })

  it('T-34-04 passes files through and rejects other text', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    expect(parseTransfer(transfer({}, [file]))).toEqual({
      kind: 'files',
      files: [file],
    })
    expect(parseTransfer(transfer({ 'text/plain': 'hello' }))).toEqual({
      kind: 'none',
    })
    expect(
      parseTransfer(transfer({ 'text/plain': 'ftp://a.example/x' })),
    ).toEqual({ kind: 'none' })
    expect(parseTransfer(transfer({}))).toEqual({ kind: 'none' })
  })
})
