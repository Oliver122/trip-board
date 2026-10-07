/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { CommentBody } from './body'

describe('comment body', () => {
  it('T-24-11 shows markup as text, keeps line breaks, links http(s) only', () => {
    const body = '<b>hi</b>\nsee https://example.com.\njavascript:alert(1)'
    const { container } = render(<CommentBody body={body} />)

    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<b>hi</b>')
    expect(container.textContent).toContain('\n')
    expect(container.querySelector('p')?.className).toContain(
      'whitespace-pre-wrap',
    )

    const link = screen.getByRole('link', { name: 'https://example.com' })
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.textContent).toContain('javascript:alert(1)')
  })
})
