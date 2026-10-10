/** @vitest-environment jsdom */
/* eslint-disable tripboard/no-untranslated-jsx-text -- test fixtures */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from './select'

describe('select', () => {
  afterEach(cleanup)

  it('T-26-07 associates the label, fires onChange and can be disabled', () => {
    const onChange = vi.fn()
    render(
      <Select label="Category" defaultValue="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    )
    const select = screen.getByLabelText('Category')
    expect(select.tagName).toBe('SELECT')
    fireEvent.change(select, { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledOnce()
    cleanup()

    render(
      <Select label="Category" hideLabel disabled>
        <option>A</option>
      </Select>,
    )
    expect(screen.getByLabelText('Category')).toBeDisabled()
    expect(screen.getByText('Category')).toHaveClass('sr-only')
  })
})
