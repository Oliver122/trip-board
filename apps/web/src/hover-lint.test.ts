import { describe, expect, it } from 'vitest'
import { missingHover, missingHoverInTree } from './hover-lint'

describe('hover lint', () => {
  it('T-20-02 flags a bare button and accepts shared hover classes', () => {
    expect(
      missingHover(
        'export function Bad(){ return <button type="button">Go</button> }',
      ),
    ).toEqual(['button'])
    expect(
      missingHover(
        'export function Good(){ return <button className={hoverClass.ghost}>Go</button> }',
      ),
    ).toEqual([])
    expect(
      missingHover(
        'export function Also(){ return <a className={buttonVariants()}>Go</a> }',
      ),
    ).toEqual([])
    expect(
      missingHover('<Link className="underline" to="/">Home</Link>'),
    ).toEqual(['Link'])
  })

  it('T-20-02 every clickable control in the app uses a shared hover class', () => {
    const root = new URL('.', import.meta.url).pathname
    expect(missingHoverInTree(root)).toEqual([])
  })
})
