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
import type { KindLimitRequest, SpotKind } from '@tripboard/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import i18n from '../i18n'
import * as client from './client'
import { KindsSection } from './KindsSection'
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

function list(kinds: SpotKind[], limit = 12) {
  return { kinds, limit, count: kinds.length }
}

function open(
  kinds = [mustGo, maybe, food],
  limit = 12,
  latest: KindLimitRequest | null = null,
) {
  setKinds(tripId, kinds, limit)
  vi.mocked(client.listKinds).mockResolvedValue(list(kinds, limit))
  vi.mocked(client.latestKindRequest).mockResolvedValue(latest)
  render(<KindsSection tripId={tripId} />)
}

function openCustomForm() {
  fireEvent.click(screen.getByTestId('kind-add-menu'))
  fireEvent.click(screen.getByTestId('kind-add-custom'))
  return screen.getByRole('form', { name: i18n.t('kinds.addTitle') })
}

describe('spot kinds section', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.mocked(client.listKinds).mockResolvedValue(list([mustGo, maybe, food]))
  })
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('renders a labelled #kinds section with a focusable heading', () => {
    open()
    const section = screen.getByTestId('kinds-section')
    expect(section).toHaveAttribute('id', 'kinds')
    expect(screen.queryByRole('dialog')).toBeNull()
    const heading = within(section).getByRole('heading', {
      level: 2,
      name: 'Spot kinds',
    })
    expect(section).toHaveAttribute('aria-labelledby', heading.id)
    expect(heading).toHaveAttribute('tabindex', '-1')
    heading.focus()
    expect(heading).toHaveFocus()
    expect(
      within(section).getByText(i18n.t('kinds.sectionDescription')),
    ).toBeInTheDocument()
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

  it('offers 10 color swatches and 64 symbols with translated names', () => {
    open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Color and symbol of Food' }),
    )
    const row = screen.getAllByTestId('kind-row')[2]!
    expect(within(row).getAllByTestId('kind-color-swatch')).toHaveLength(10)
    const symbols = within(row).getAllByTestId('kind-symbol')
    expect(symbols).toHaveLength(64)
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
    fireEvent.click(screen.getAllByRole('option', { name: 'Camera' })[0]!)
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
    const form = openCustomForm()
    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: ' Temples ' },
    })
    fireEvent.click(within(form).getByRole('option', { name: 'Temple' }))
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
    const form = openCustomForm()
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

  it('T-29-09 lists the presets the trip lacks, then Custom kind', () => {
    open([mustGo, maybe])
    fireEvent.click(screen.getByRole('button', { name: 'Add kind' }))
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
    expect(items).toEqual([
      'Food',
      'Sights',
      'Shopping',
      'Coffee',
      'Nature',
      'Nightlife',
      'Custom kind…',
    ])
  })

  it('T-29-09 creates a preset kind at once', async () => {
    vi.mocked(client.createPresetKind).mockResolvedValue(food)
    open([mustGo, maybe])
    fireEvent.click(screen.getByRole('button', { name: 'Add kind' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Coffee' }))
    await waitFor(() =>
      expect(client.createPresetKind).toHaveBeenCalledWith(tripId, 'coffee'),
    )
  })

  it('T-29-09 shows a pin preview that follows color and symbol', () => {
    open()
    const form = openCustomForm()
    const pin = () => within(form).getByTestId('kind-preview-pin')
    expect(pin().querySelector('[data-kind-colors]')).toHaveAttribute(
      'data-kind-colors',
      '#D9480F',
    )
    fireEvent.click(within(form).getByRole('button', { name: '#0F766E' }))
    fireEvent.click(within(form).getByRole('option', { name: 'Camera' }))
    const mark = pin().querySelector('[data-kind-colors]')!
    expect(mark).toHaveAttribute('data-kind-colors', '#0F766E')
    expect(mark.querySelector('[data-icon="camera"]')).not.toBeNull()
  })

  it('T-29-10 filters symbols umlaut-safe in German and shows the empty state', async () => {
    await i18n.changeLanguage('de')
    open()
    const form = openCustomForm()
    const search = within(form).getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'KAT' } })
    expect(
      within(form).getByRole('option', { name: 'Katze' }),
    ).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(within(form).queryAllByRole('option')).toHaveLength(0)
    expect(within(form).getByText('Kein Symbol passt')).toBeInTheDocument()
  })

  it('T-29-10 moves with arrow keys and picks with Enter', () => {
    open()
    const form = openCustomForm()
    const options = within(form).getAllByRole('option')
    options[0]!.focus()
    fireEvent.keyDown(options[0]!, { key: 'ArrowRight' })
    expect(options[1]).toHaveFocus()
    fireEvent.click(options[1]!)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('T-29-11 disables Add kind at the limit and sends a request', async () => {
    vi.mocked(client.createKindRequest).mockResolvedValue({
      id: 'r1',
      tripId,
      requestedBy: null,
      requestedMax: 3,
      message: null,
      status: 'pending',
      decisionNote: null,
      decidedAt: null,
      createdAt: '2026-10-11T10:00:00.000Z',
    })
    open([mustGo, maybe], 2)
    expect(screen.getByRole('button', { name: 'Add kind' })).toBeDisabled()
    expect(screen.getByText('Kind limit reached')).toBeInTheDocument()
    expect(screen.getByTestId('kind-total')).toHaveTextContent('2 of 2 kinds')
    fireEvent.click(await screen.findByRole('button', { name: 'Request more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() =>
      expect(client.createKindRequest).toHaveBeenCalledWith(tripId, {
        requestedMax: 3,
      }),
    )
    expect(
      await screen.findByText('Request for 3 kinds pending'),
    ).toBeInTheDocument()
  })

  it('T-29-11 shows a decided request once until dismissed', async () => {
    open([mustGo, maybe, food], 12, {
      id: 'r2',
      tripId,
      requestedBy: null,
      requestedMax: 14,
      message: null,
      status: 'rejected',
      decisionNote: 'Too many',
      decidedAt: '2026-10-11T10:00:00.000Z',
      createdAt: '2026-10-11T09:00:00.000Z',
    })
    expect(
      await screen.findByText('Your request for 14 kinds was rejected.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Note: Too many')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('kind-request-result')).toBeNull()
  })

  it('shows an error state with retry when the kinds cannot load', () => {
    cleanup()
    vi.mocked(client.listKinds).mockRejectedValue(new ApiError(500))
    render(<KindsSection tripId="trip-unloaded" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
