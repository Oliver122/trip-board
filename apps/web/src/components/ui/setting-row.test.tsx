/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingRow } from './setting-row'

afterEach(cleanup)

describe('SettingRow', () => {
  it('shows the value and opens its options', () => {
    const onChange = vi.fn()
    render(
      <SettingRow
        label="Theme"
        hint="Pick one"
        value="light"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={onChange}
      />,
    )
    const row = screen.getByRole('button', { name: /Theme/ })
    expect(row).toHaveTextContent('Light')
    expect(screen.queryByRole('radio')).toBeNull()
    fireEvent.click(row)
    expect(screen.getByText('Pick one')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledWith('dark')
  })
})
