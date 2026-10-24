/** @vitest-environment jsdom */
/* eslint-disable tripboard/no-untranslated-jsx-text -- test fixtures */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [on, setOn] = useState(false)
  return (
    <Switch checked={on} onChange={setOn} disabled={disabled}>
      Only visible on map
    </Switch>
  )
}

describe('switch', () => {
  afterEach(cleanup)

  it('T-42-09 is a switch whose aria-checked follows the value', () => {
    render(<Harness />)
    const toggle = screen.getByRole('switch', { name: 'Only visible on map' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByText('Only visible on map'))
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('T-42-09 toggles with Space', () => {
    render(<Harness />)
    const toggle = screen.getByRole('switch')
    toggle.focus()
    fireEvent.keyDown(toggle, { key: ' ', code: 'Space' })
    fireEvent.keyUp(toggle, { key: ' ', code: 'Space' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(toggle, { key: ' ', code: 'Space' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('T-42-09 does nothing when disabled', () => {
    const onChange = vi.fn()
    render(
      <Switch checked={false} onChange={onChange} disabled>
        Only visible on map
      </Switch>,
    )
    fireEvent.click(screen.getByText('Only visible on map'))
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('switch')).toBeDisabled()
  })
})
