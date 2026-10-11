/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { SpotKind } from '@tripboard/shared'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import i18n from '../i18n'
import { BoardMenu } from './BoardMenu'
import * as client from './client'
import { KindsDialog } from './KindsDialog'
import { setKinds } from './store'

vi.mock('../session', () => ({ useSession: () => ({ reload: vi.fn() }) }))
vi.mock('./client')

const tripId = 'trip-1'

function kind(overrides: Partial<SpotKind> & Pick<SpotKind, 'id'>): SpotKind {
  return {
    name: null,
    preset: null,
    color: '#D9480F',
    symbol: 'dot',
    sortOrder: 0,
    spotCount: 0,
    ...overrides,
  }
}

const mustGo = kind({
  id: 'k1',
  preset: 'must_go',
  color: '#E5484D',
  symbol: 'exclamation',
  sortOrder: 0,
  spotCount: 3,
})
const maybe = kind({
  id: 'k2',
  preset: 'maybe',
  color: '#30A46C',
  symbol: 'question',
  sortOrder: 1,
})
const food = kind({ id: 'k3', name: 'Food', symbol: 'food', sortOrder: 2 })

function open(kinds = [mustGo, maybe, food]) {
  setKinds(tripId, kinds)
  const onClose = vi.fn()
  render(<KindsDialog tripId={tripId} onClose={onClose} />)
  return onClose
}

describe('spot kinds dialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.mocked(client.listKinds).mockResolvedValue([mustGo, maybe, food])
  })
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('T-28-20 lists the kinds in order with preset labels, counts and symbols', () => {
    open()
    const rows = screen.getAllByTestId('kind-row')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByRole('textbox')).toHaveValue('Must go')
    expect(within(rows[1]!).getByRole('textbox')).toHaveValue('Maybe')
    expect(within(rows[2]!).getByRole('textbox')).toHaveValue('Food')
    expect(within(rows[0]!).getByTestId('kind-count')).toHaveTextContent(
      '3 spots',
    )
    expect(within(rows[1]!).getByTestId('kind-count')).toHaveTextContent(
      '0 spots',
    )
  })

  it('disables move up on the first and move down on the last kind', () => {
    open()
    expect(
      screen.getByRole('button', { name: 'Move Must go up' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move Food down' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Food up' })).toBeEnabled()
  })

  it('moves a kind with the button and sends the full order', async () => {
    vi.mocked(client.reorderKinds).mockResolvedValue([mustGo, food, maybe])
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Move Food up' }))
    await waitFor(() =>
      expect(client.reorderKinds).toHaveBeenCalledWith(tripId, [
        'k1',
        'k3',
        'k2',
      ]),
    )
  })

  it('renames a kind on blur and skips an unchanged name', async () => {
    vi.mocked(client.updateKind).mockResolvedValue(mustGo)
    open()
    const input = screen.getAllByRole('textbox')[0]!
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Top' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(client.updateKind).toHaveBeenCalledWith(tripId, 'k1', {
        name: 'Top',
      }),
    )
    const maybeInput = screen.getAllByRole('textbox')[1]!
    fireEvent.change(maybeInput, { target: { value: 'Maybe' } })
    fireEvent.blur(maybeInput)
    expect(client.updateKind).toHaveBeenCalledTimes(1)
  })

  it('offers 10 color swatches and 12 symbols with translated names', () => {
    open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Color and symbol of Food' }),
    )
    const row = screen.getAllByTestId('kind-row')[2]!
    expect(within(row).getAllByTestId('kind-color-swatch')).toHaveLength(10)
    const symbols = within(row).getAllByTestId('kind-symbol')
    expect(symbols).toHaveLength(12)
    expect(
      symbols.map((button) => button.getAttribute('aria-label')),
    ).toContain('Exclamation mark')
  })

  it('picks a color and a symbol for a kind', async () => {
    vi.mocked(client.updateKind).mockResolvedValue(food)
    open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Color and symbol of Food' }),
    )
    const group = screen.getByRole('group', { name: 'Color of Food' })
    fireEvent.click(within(group).getByRole('button', { name: '#0F766E' }))
    await waitFor(() =>
      expect(client.updateKind).toHaveBeenCalledWith(tripId, 'k3', {
        color: '#0F766E',
      }),
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Camera' })[0]!)
    await waitFor(() =>
      expect(client.updateKind).toHaveBeenCalledWith(tripId, 'k3', {
        symbol: 'camera',
      }),
    )
  })

  it('shows the API error for a rejected color', async () => {
    vi.mocked(client.updateKind).mockRejectedValue(
      new ApiError(400, { error: 'kind_color_contrast' }),
    )
    open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Color and symbol of Food' }),
    )
    const hex = within(screen.getAllByTestId('kind-row')[2]!).getByLabelText(
      'Hex color',
    )
    fireEvent.change(hex, { target: { value: '#FFE066' } })
    fireEvent.blur(hex)
    expect(await screen.findByTestId('kinds-error')).toHaveTextContent(
      'too light',
    )
  })

  it('adds a kind with name, color and symbol', async () => {
    vi.mocked(client.createKind).mockResolvedValue(food)
    open()
    const form = screen.getByRole('form', { name: 'New kind' })
    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: ' Temples ' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Temple' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Add kind' }))
    await waitFor(() =>
      expect(client.createKind).toHaveBeenCalledWith(tripId, {
        name: 'Temples',
        color: '#D9480F',
        symbol: 'temple',
      }),
    )
  })

  it('shows a name conflict from the API', async () => {
    vi.mocked(client.createKind).mockRejectedValue(
      new ApiError(409, { error: 'kind_name_taken' }),
    )
    open()
    const form = screen.getByRole('form', { name: 'New kind' })
    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: 'Food' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Add kind' }))
    expect(await screen.findByTestId('kinds-error')).toHaveTextContent(
      'already exists',
    )
  })

  it('T-28-14 asks where the spots go and keeps Delete disabled until picked', async () => {
    vi.mocked(client.deleteKind).mockResolvedValue()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Must go' }))
    const dialog = screen.getByTestId('kind-delete-dialog')
    expect(dialog).toHaveTextContent('3 spots use Must go.')
    const accept = within(dialog).getByTestId('kind-delete-accept')
    expect(accept).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Move them to'), {
      target: { value: 'k2' },
    })
    expect(accept).toBeEnabled()
    fireEvent.click(accept)
    await waitFor(() =>
      expect(client.deleteKind).toHaveBeenCalledWith(tripId, 'k1', 'k2'),
    )
  })

  it('T-28-14 deletes a kind without spots after a plain confirm', async () => {
    vi.mocked(client.deleteKind).mockResolvedValue()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Food' }))
    const dialog = screen.getByTestId('kind-delete-dialog')
    expect(within(dialog).queryByLabelText('Move them to')).toBeNull()
    fireEvent.click(within(dialog).getByTestId('kind-delete-accept'))
    await waitFor(() =>
      expect(client.deleteKind).toHaveBeenCalledWith(tripId, 'k3', undefined),
    )
  })

  it('T-28-14 gives the last kind no delete button', () => {
    open([maybe])
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
  })

  it('shows an error state with retry when the kinds cannot load', () => {
    cleanup()
    vi.mocked(client.listKinds).mockRejectedValue(new ApiError(500))
    render(<KindsDialog tripId="trip-unloaded" onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('board menu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.mocked(client.listKinds).mockResolvedValue([mustGo, maybe])
    setKinds(tripId, [mustGo, maybe])
  })
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  function renderMenu(
    role: 'owner' | 'admin' | 'planner' | 'visitor',
    url = '/',
  ) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <BoardMenu tripId={tripId} role={role} />
      </MemoryRouter>,
    )
  }

  it('T-28-12 shows the menu to admins and owners only', () => {
    for (const role of ['owner', 'admin'] as const) {
      renderMenu(role)
      expect(
        screen.getByRole('button', { name: 'Board menu' }),
      ).toBeInTheDocument()
      cleanup()
    }
    for (const role of ['planner', 'visitor'] as const) {
      renderMenu(role)
      expect(screen.queryByRole('button', { name: 'Board menu' })).toBeNull()
      cleanup()
    }
  })

  it('T-28-12 opens the dialog from the menu and closes it again', () => {
    renderMenu('admin')
    fireEvent.click(screen.getByRole('button', { name: 'Board menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Spot kinds' }))
    expect(
      screen.getByRole('dialog', { name: 'Spot kinds' }),
    ).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('T-28-12 shows no dialog for ?dialog=kinds to planners and visitors', () => {
    for (const role of ['planner', 'visitor'] as const) {
      renderMenu(role, '/?dialog=kinds')
      expect(screen.queryByRole('dialog')).toBeNull()
      cleanup()
    }
    renderMenu('owner', '/?dialog=kinds')
    expect(
      screen.getByRole('dialog', { name: 'Spot kinds' }),
    ).toBeInTheDocument()
  })
})
