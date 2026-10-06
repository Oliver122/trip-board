/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { CopyAddress } from './CopyAddress'

describe('CopyAddress', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('T-07-09 copies the address and shows Copied', async () => {
    render(<CopyAddress address="68 Fukakusa, Kyoto" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '68 Fukakusa, Kyoto',
    )
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })
})
