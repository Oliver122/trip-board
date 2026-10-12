/** @vitest-environment jsdom */
import type { Comment, Spot } from '@tripboard/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../components/ui/confirm'
import i18n from '../i18n'
import { SpotDiscussion } from './SpotDiscussion'

const comment = {
  id: 'c1',
  body: 'Nice',
  createdAt: '2026-04-12T10:00:00.000Z',
  editedAt: null,
  author: { id: 'u1', displayName: 'Ann', avatarUrl: null },
  canEdit: true,
  canDelete: true,
} as Comment

vi.mock('../session', () => ({ useSession: () => ({ user: null }) }))
vi.mock('./client', () => ({
  listComments: async () => [comment],
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  markSpotRead: async () => undefined,
}))

const spot = { id: 's1', unreadComments: 0 } as unknown as Spot

function renderThread() {
  render(
    <ConfirmProvider>
      <SpotDiscussion spot={spot} onToast={() => undefined} />
    </ConfirmProvider>,
  )
}

describe('comment delete control', () => {
  beforeEach(async () => {
    cleanup()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    await i18n.changeLanguage('en')
  })

  it('T-31-07 delete is an icon-only button with a name and title', async () => {
    renderThread()
    const button = await screen.findByRole('button', {
      name: 'Delete comment',
    })
    expect(button).toHaveAttribute('title', 'Delete comment')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('')
  })

  it('T-31-07 delete is named in German', async () => {
    await i18n.changeLanguage('de')
    renderThread()
    expect(
      await screen.findByRole('button', { name: 'Kommentar löschen' }),
    ).toHaveAttribute('title', 'Kommentar löschen')
  })

  it('T-31-07 opens the confirm dialog, Cancel returns focus', async () => {
    renderThread()
    const button = await screen.findByTestId('comment-delete')
    button.focus()
    fireEvent.click(button)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(button).toHaveFocus()
  })
})
