/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import {
  MAX_VISIBLE_MEMBERS,
  MemberAvatars,
  memberGroupLabel,
} from './TripCard'

describe('MemberAvatars', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('T-20-12 caps the row at four circles and shows initials', () => {
    expect(MAX_VISIBLE_MEMBERS).toBe(4)
    const cases = [
      { count: 2, circles: 2, overflow: null },
      { count: 4, circles: 4, overflow: null },
      { count: 5, circles: 4, overflow: '+2' },
      { count: 12, circles: 4, overflow: '+9' },
    ]
    for (const item of cases) {
      const view = render(
        <MemberAvatars members={people(item.count)} max={4} />,
      )
      expect(screen.getAllByTestId('member-avatar')).toHaveLength(
        item.overflow ? 3 : item.circles,
      )
      const overflow = screen.queryByTestId('member-overflow')
      if (item.overflow) expect(overflow).toHaveTextContent(item.overflow)
      else expect(overflow).toBeNull()
      expect(
        screen.getAllByTestId('member-avatar').length + (overflow ? 1 : 0),
      ).toBe(item.circles)
      view.unmount()
    }

    render(
      <MemberAvatars members={[{ id: '1', name: 'Nora', avatarUrl: null }]} />,
    )
    expect(screen.getByTestId('member-avatar')).toHaveTextContent('N')
    expect(
      memberGroupLabel(i18n.t.bind(i18n), [
        { id: '1', name: 'Sven', avatarUrl: null },
        { id: '2', name: 'Aiko', avatarUrl: null },
        { id: '3', name: 'Tom', avatarUrl: null },
        { id: '4', name: 'Noa', avatarUrl: null },
        { id: '5', name: 'Kai', avatarUrl: null },
      ]),
    ).toBe('Members: Sven, Aiko, Tom and 2 more')
  })
})

function people(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    name: `Member ${index + 1}`,
    avatarUrl: index === 0 ? null : 'https://example.test/a.png',
  }))
}
