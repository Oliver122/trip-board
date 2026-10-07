/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { ErrorNotice, FieldError } from './notice'

describe('error notices', () => {
  it('T-20-07 links a field error and renders an alert notice', () => {
    render(
      <FieldError message="Enter a name.">
        <input aria-label="Name" />
      </FieldError>,
    )
    const field = screen.getByRole('textbox', { name: 'Name' })
    const errorId = field.getAttribute('aria-describedby')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(errorId).toBeTruthy()
    const alert = document.getElementById(errorId ?? '')
    expect(alert).toHaveTextContent('Enter a name.')
    expect(alert?.querySelector('svg')).toBeTruthy()

    const message = 'Could not save.'
    render(<ErrorNotice>{message}</ErrorNotice>)
    const notice = screen.getAllByRole('alert').at(-1)
    expect(notice?.querySelector('svg')).toBeTruthy()
    expect(notice).toHaveTextContent('Could not save.')
  })
})
