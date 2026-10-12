/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { bookmarkletCode } from './bookmarklet'
import { GoogleMapsSection } from './GoogleMapsSection'

describe('bookmarklet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('T-33-09 opens the share page with the encoded address and title', () => {
    const code = bookmarkletCode('https://trips.example')
    expect(code.startsWith('javascript:')).toBe(true)
    const opened: unknown[][] = []
    const fakeWindow = {
      location: {
        href: 'https://www.google.com/maps/place/Kinkaku-ji/@35,135,17z',
      },
      document: { title: 'Kinkaku-ji & more – Google Maps' },
      open: (...args: unknown[]) => {
        opened.push(args)
      },
    }
    new Function('window', code.slice('javascript:'.length))(fakeWindow)
    expect(opened).toEqual([
      [
        'https://trips.example/share?url=' +
          encodeURIComponent(fakeWindow.location.href) +
          '&title=' +
          encodeURIComponent(fakeWindow.document.title),
        '_blank',
      ],
    ])
  })

  it('T-33-09 renders the link with a javascript: href and copies the same code', () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<GoogleMapsSection />)
    const link = screen.getByRole('link', { name: 'Send to TripBoard' })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('javascript:')).toBe(true)
    expect(href).toBe(bookmarkletCode(window.location.origin))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(href)
  })
})
