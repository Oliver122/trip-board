/** @vitest-environment jsdom */
/* eslint-disable tripboard/no-untranslated-jsx-text -- test fixtures */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { Button } from './button'
import { ConfirmProvider, useConfirm, type ConfirmOptions } from './confirm'

function Harness({
  opts,
  onResult,
}: {
  opts: ConfirmOptions
  onResult: (value: boolean) => void
}) {
  const confirm = useConfirm()
  return <Button onClick={() => void confirm(opts).then(onResult)}>ask</Button>
}

async function ask(opts: ConfirmOptions) {
  const results: boolean[] = []
  render(
    <ConfirmProvider>
      <Harness opts={opts} onResult={(v) => results.push(v)} />
    </ConfirmProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'ask' }))
  await screen.findByTestId('confirm-dialog')
  return results
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('useConfirm', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('T-26-05 resolves true on accept and focuses the confirm button', async () => {
    const results = await ask({ title: 'Sure?', message: 'Really' })
    expect(screen.getByText('Really')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByTestId('confirm-accept'))
    fireEvent.click(screen.getByTestId('confirm-accept'))
    await flush()
    expect(results).toEqual([true])
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })

  it('T-26-05 resolves false on cancel and on Escape', async () => {
    let results = await ask({ title: 'Sure?' })
    fireEvent.click(screen.getByTestId('confirm-cancel'))
    await flush()
    expect(results).toEqual([false])
    cleanup()

    results = await ask({ title: 'Sure?' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await flush()
    expect(results).toEqual([false])
  })

  it('T-26-05 danger focuses Cancel and styles confirm red', async () => {
    await ask({ title: 'Delete?', danger: true, confirmLabel: 'Delete' })
    expect(document.activeElement).toBe(screen.getByTestId('confirm-cancel'))
    expect(screen.getByTestId('confirm-accept')).toHaveTextContent('Delete')
    expect(screen.getByTestId('confirm-accept').className).toContain(
      'bg-danger-solid',
    )
  })
})
