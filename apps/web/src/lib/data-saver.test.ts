import { describe, expect, it } from 'vitest'
import { readDataSaver, resolveDataSaver } from './data-saver'

// T-38-05
describe('resolveDataSaver', () => {
  it('lets on and off win over the connection', () => {
    expect(
      resolveDataSaver('on', { saveData: false, effectiveType: '4g' }),
    ).toBe(true)
    expect(
      resolveDataSaver('off', { saveData: true, effectiveType: '2g' }),
    ).toBe(false)
  })

  it('follows saveData and slow connections in auto', () => {
    expect(resolveDataSaver('auto', { saveData: true })).toBe(true)
    expect(resolveDataSaver('auto', { effectiveType: 'slow-2g' })).toBe(true)
    expect(resolveDataSaver('auto', { effectiveType: '2g' })).toBe(true)
    expect(resolveDataSaver('auto', { effectiveType: '4g' })).toBe(false)
    expect(resolveDataSaver('auto', undefined)).toBe(false)
    expect(resolveDataSaver(null, null)).toBe(false)
  })

  it('treats an unknown stored value as auto', () => {
    expect(resolveDataSaver('maybe', { saveData: true })).toBe(true)
    expect(resolveDataSaver('maybe', { effectiveType: '4g' })).toBe(false)
  })

  it('treats a throwing localStorage as auto without an error', () => {
    const broken = () => {
      throw new Error('blocked')
    }
    expect(resolveDataSaver(broken, { saveData: true })).toBe(true)
    expect(resolveDataSaver(broken, { effectiveType: '4g' })).toBe(false)
    expect(readDataSaver({ getItem: broken })).toBe('auto')
  })
})
