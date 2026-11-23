/** @vitest-environment jsdom */
import type { Photo } from '@tripboard/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { Book } from './Book'
import { groupBook } from './groups'
import { NotPlaced } from './NotPlaced'
import { UploadPanel, locationsKey } from './UploadPanel'

vi.mock('../images/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../images/client')>()),
  getQuota: () => Promise.resolve({ maxFileBytes: 1_000_000 }),
}))

function photo(id: string, change: Partial<Photo> = {}): Photo {
  return {
    id,
    tripId: 't',
    url: `/images/${id}/file`,
    width: 300,
    height: 200,
    bytes: 40_000,
    lat: 35.66,
    lng: 139.7,
    takenAt: '2026-04-13T10:00:00',
    spotId: null,
    spotTitle: null,
    placeSource: 'exif',
    caption: null,
    uploadedBy: { id: 'u', name: 'Aiko' },
    createdAt: '2026-05-01T00:00:00.000Z',
    ...change,
  }
}

const photos = [
  photo('a', { spotId: 's', spotTitle: 'Shibuya Sky' }),
  photo('b', { takenAt: '2026-04-18T08:05:00', lat: 35.0116, lng: 135.7681 }),
  photo('c', { takenAt: null, lat: null, lng: null }),
]

function renderBook(isShown: (id: string) => boolean, onLoad = vi.fn()) {
  const { days } = groupBook(photos)
  render(
    <Book
      days={days}
      locale="en"
      rowHeight={160}
      highlightId="b"
      isShown={isShown}
      nameOf={() => null}
      labelOf={(item) => `Photo ${item.id}`}
      onOpen={() => undefined}
      onLoad={onLoad}
    />,
  )
  return onLoad
}

const store = new Map<string, string>()

beforeEach(async () => {
  await i18n.changeLanguage('en')
  store.clear()
  // This Node's jsdom has no usable localStorage.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  })
})

afterEach(() => {
  cleanup()
})

describe('photobook book', () => {
  it('R-47-06 shows a page per day with the spot title or the coordinates as place line', () => {
    renderBook(() => true)
    const day = screen.getByTestId('book-day-2026-04-13')
    expect(within(day).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Mon 13 Apr',
    )
    expect(within(day).getByTestId('book-place-line')).toHaveTextContent(
      'Shibuya Sky',
    )
    const kyoto = screen.getByTestId('book-day-2026-04-18')
    expect(within(kyoto).getByTestId('book-place-line')).toHaveTextContent(
      '35.012, 135.768',
    )
    expect(screen.getByTestId('book-photo-b')).toHaveAttribute(
      'data-highlighted',
      'true',
    )
    expect(screen.getByTestId('book-photo-a')).toHaveAttribute(
      'data-highlighted',
      'false',
    )
  })

  it('T-47-10 shows placeholders and no image in low data, and Load all loads the page', () => {
    const shown = new Set<string>()
    const onLoad = renderBook((id) => shown.has(id))
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(screen.getAllByTestId('photo-placeholder')).toHaveLength(3)
    // One photo per page: no Load all (it needs more than one held photo).
    expect(screen.queryByTestId('book-load-all-2026-04-13')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Load photo' })[0]!)
    expect(onLoad).toHaveBeenCalledTimes(1)
  })
})

describe('photobook not placed', () => {
  const props = {
    photos: [photo('c', { lat: null, lng: null })],
    placingId: null,
    isShown: () => true,
    onOpen: () => undefined,
    onLoad: () => undefined,
    onPlace: vi.fn(),
    onPick: vi.fn(),
  }

  it('R-47-09 gives planners the place and pick buttons', () => {
    render(<NotPlaced {...props} canEdit />)
    fireEvent.click(screen.getByTestId('place-on-map-c'))
    expect(props.onPlace).toHaveBeenCalled()
    expect(screen.getByTestId('pick-spot-c')).toBeInTheDocument()
  })

  it('R-47-09 shows visitors the list without controls', () => {
    render(<NotPlaced {...props} canEdit={false} />)
    expect(screen.getByTestId('not-placed-c')).toBeInTheDocument()
    expect(screen.queryByTestId('place-on-map-c')).toBeNull()
    expect(screen.queryByTestId('pick-spot-c')).toBeNull()
  })
})

describe('photobook upload review', () => {
  function pick(names: Array<[string, string]>, big = false) {
    const files = names.map(
      ([name, type]) =>
        new File(
          [
            big
              ? new Uint8Array(2_000_000)
              : readFileSync(
                  join(process.cwd(), 'src/photobook/fixtures', name),
                ),
          ],
          name,
          { type },
        ),
    )
    fireEvent.change(screen.getByTestId('photo-file-input'), {
      target: { files },
    })
  }

  it('T-47-08 summarises located and unlocated files and obeys the switch', async () => {
    render(
      <UploadPanel
        tripId="t"
        enabled
        onUploaded={() => undefined}
        onAuthLost={() => undefined}
      />,
    )
    pick([
      ['gps-shibuya.jpg', 'image/jpeg'],
      ['gps-kyoto.jpg', 'image/jpeg'],
      ['no-gps.png', 'image/png'],
    ])
    await waitFor(() =>
      expect(screen.getByTestId('upload-summary')).toHaveTextContent(
        '2 with location · 1 without',
      ),
    )
    expect(screen.getAllByTestId('upload-item')).toHaveLength(3)
    fireEvent.click(screen.getByTestId('photo-locations-switch'))
    expect(screen.getByTestId('upload-summary')).toHaveTextContent(
      '0 with location · 3 without',
    )
    expect(window.localStorage.getItem(locationsKey)).toBe('0')
  })

  it('T-47-08 lists a file over the limit as skipped and keeps the others ready', async () => {
    render(
      <UploadPanel
        tripId="t"
        enabled
        onUploaded={() => undefined}
        onAuthLost={() => undefined}
      />,
    )
    pick([['gps-shibuya.jpg', 'image/jpeg']])
    await waitFor(() =>
      expect(screen.getAllByTestId('upload-item')).toHaveLength(1),
    )
    expect(screen.getByTestId('upload-item')).toHaveAttribute(
      'data-status',
      'ready',
    )
    cleanup()
    render(
      <UploadPanel
        tripId="t"
        enabled
        onUploaded={() => undefined}
        onAuthLost={() => undefined}
      />,
    )
    pick([['huge.jpg', 'image/jpeg']], true)
    await waitFor(() =>
      expect(screen.getByTestId('upload-item')).toHaveAttribute(
        'data-status',
        'skipped',
      ),
    )
    expect(screen.getByTestId('upload-item')).toHaveTextContent('larger than')
    expect(screen.getByTestId('upload-start')).toBeDisabled()
  })

  it('R-47-08 shows no drop zone when uploads are paused', () => {
    render(
      <UploadPanel
        tripId="t"
        enabled={false}
        onUploaded={() => undefined}
        onAuthLost={() => undefined}
      />,
    )
    expect(screen.queryByTestId('photo-file-input')).toBeNull()
  })
})
