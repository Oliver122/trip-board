/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChipGroup, type ChipOption } from './chip-group'

const few: ChipOption[] = [
  { value: 'a', label: 'Food', count: 3 },
  { value: 'b', label: 'Sights' },
  { value: 'c', label: 'Café' },
]

const many: ChipOption[] = Array.from({ length: 10 }, (_, index) => ({
  value: `k${index}`,
  label: index === 3 ? 'Crème brûlée' : `Kind ${index}`,
}))

function Harness({
  options,
  max,
  initial = [],
}: {
  options: ChipOption[]
  max?: number
  initial?: string[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <ChipGroup
      options={options}
      value={value}
      onChange={setValue}
      label="Kinds"
      max={max}
      maxHint="At most 2"
    />
  )
}

describe('chip group', () => {
  afterEach(cleanup)

  it('T-29-12 toggles aria-pressed and shows the count', () => {
    render(<Harness options={few} />)
    const food = screen.getByRole('button', { name: /Food/ })
    expect(food).toHaveAttribute('aria-pressed', 'false')
    expect(food).toHaveTextContent('3')
    fireEvent.click(food)
    expect(food).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(food)
    expect(food).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('group', { name: 'Kinds' })).toBeInTheDocument()
  })

  it('T-29-12 disables the unpressed chips at max with a hint', () => {
    render(<Harness options={few} max={2} initial={['a', 'b']} />)
    expect(screen.getByRole('button', { name: 'Café' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Food/ })).toBeEnabled()
    expect(screen.getByText('At most 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sights' }))
    expect(screen.getByRole('button', { name: 'Café' })).toBeEnabled()
    expect(screen.queryByText('At most 2')).toBeNull()
  })

  it('T-29-12 arrow keys move focus, one chip is in the tab order, Space toggles', () => {
    render(<Harness options={few} />)
    const [first, second, third] = screen.getAllByRole('button')
    expect(first).toHaveAttribute('tabindex', '0')
    expect(second).toHaveAttribute('tabindex', '-1')
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(second).toHaveFocus()
    fireEvent.keyDown(second!, { key: 'ArrowDown' })
    expect(third).toHaveFocus()
    fireEvent.keyDown(third!, { key: 'ArrowRight' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first!, { key: 'ArrowLeft' })
    expect(third).toHaveFocus()
    // A native button turns Space and Enter into a click.
    fireEvent.click(third!)
    expect(third).toHaveAttribute('aria-pressed', 'true')
  })

  it('T-29-12 shows a search field only above 8 options and filters labels', () => {
    const { unmount } = render(<Harness options={few} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    unmount()
    render(<Harness options={many} />)
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'creme' } })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Crème brûlée' })).toBeVisible()
    fireEvent.change(search, { target: { value: 'KIND 1' } })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
