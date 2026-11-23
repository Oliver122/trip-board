import { type PatchImageBody, type Photo } from '@tripboard/shared'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { isAuth } from '../api/http'
import { Toast, type ToastMessage } from '../components/Toast'
import { EmptyState, ErrorState, PanelSkeleton } from '../components/states'
import { Button } from '../components/ui/button'
import { deleteImage, imageSrc } from '../images/client'
import { activeLocale } from '../i18n'
import { useDataSaver } from '../lib/data-saver'
import { phoneQuery, useMediaQuery } from '../lib/media'
import type { MapSpot } from '../map/clusters'
import { Book } from '../photobook/Book'
import { listPhotos, patchPhoto } from '../photobook/client'
import { groupBook, isPlaced, sortPhotos } from '../photobook/groups'
import { Lightbox } from '../photobook/Lightbox'
import { NotPlaced } from '../photobook/NotPlaced'
import { usePlaceNames } from '../photobook/place-names'
import { useShownPhotos } from '../photobook/shown'
import { SpotPicker } from '../photobook/SpotPicker'
import { formatPoint, formatTime } from '../photobook/time'
import { UploadPanel } from '../photobook/UploadPanel'
import { useSession } from '../session'
import {
  useMapScene,
  useTripData,
  type MapScene,
  type PhotoMapMarker,
} from '../trips/trip-context'

/** Row height of the collage: 160 px, 120 px on a phone (R-47-06). */
const rowHeights = { desktop: 160, phone: 120 }

export function PhotobookPage() {
  const { t, i18n } = useTranslation()
  const { reload } = useSession()
  const { trip, spots, imageRevision } = useTripData()
  const lang = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const phone = useMediaQuery(phoneQuery)
  const { on: lowData } = useDataSaver()
  const { isShown, show } = useShownPhotos(lowData)
  const canEdit = trip.role !== 'visitor'
  const tripId = trip.id

  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [uploadsEnabled, setUploadsEnabled] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [pickingId, setPickingId] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<MapScene['flyTo']>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToastState] = useState<ToastMessage | null>(null)
  const [overlay, setOverlay] = useState<HTMLElement | null>(null)
  const photosRef = useRef(photos)
  photosRef.current = photos
  const flyCount = useRef(0)
  const setToast = (message: string, kind: ToastMessage['kind'] = 'error') => {
    setToastState(message ? { message, kind } : null)
  }

  useLayoutEffect(() => {
    setOverlay(document.getElementById('trip-map-overlay'))
  }, [])

  // R-47-11: the first load, and a refetch on every live `image` event that
  // keeps the scroll position, the highlight and an open lightbox.
  useEffect(() => {
    const controller = new AbortController()
    void listPhotos(tripId, controller.signal)
      .then((list) => {
        setPhotos(list.photos)
        setUploadsEnabled(list.uploadsEnabled)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isAuth(error)) {
          reload()
          return
        }
        if (photosRef.current === null) setStatus('error')
      })
    return () => controller.abort()
  }, [attempt, imageRevision, reload, tripId])

  const list = useMemo(() => photos ?? [], [photos])
  const book = useMemo(() => groupBook(list), [list])
  const placed = useMemo(() => list.filter(isPlaced), [list])
  const nameOf = usePlaceNames(
    useMemo(() => placed.filter((photo) => !photo.spotId), [placed]),
    lang,
  )
  const opened = openId
    ? (list.find((photo) => photo.id === openId) ?? null)
    : null
  const pickingPhoto = pickingId
    ? (list.find((photo) => photo.id === pickingId) ?? null)
    : null

  const placeText = useCallback(
    (photo: Photo): string | null => {
      if (photo.spotTitle) return photo.spotTitle
      if (photo.lat === null || photo.lng === null) return null
      const name = nameOf(photo.lat, photo.lng)
      return name
        ? t('photobook.near', { place: name })
        : formatPoint(photo.lat, photo.lng)
    },
    [nameOf, t],
  )
  const labelOf = useCallback(
    (photo: Photo): string =>
      t('photobook.markerLabel', {
        time: photo.takenAt
          ? formatTime(photo.takenAt, lang)
          : t('photobook.noDate'),
        place: placeText(photo) ?? t('photobook.notPlacedShort'),
      }),
    [lang, placeText, t],
  )

  const mapSpots = useMemo<MapSpot[]>(
    () =>
      spots.map((spot) => ({
        id: spot.id,
        title: spot.title,
        subtitle: spot.address ?? '',
        category: spot.displayCategory,
        kinds: spot.kinds,
        lng: spot.lng,
        lat: spot.lat,
        primary: spot.primary,
      })),
    [spots],
  )
  const markers = useMemo<PhotoMapMarker[]>(
    () =>
      placed.map((photo) => ({
        id: photo.id,
        lng: photo.lng,
        lat: photo.lat,
        // R-47-10: no file is requested before the photo is loaded.
        src: isShown(photo.id) ? imageSrc(photo.url) : null,
        label: labelOf(photo),
      })),
    [isShown, labelOf, placed],
  )
  const scene = useMemo<MapScene>(
    () => ({
      spots: mapSpots,
      selectedId: null,
      hoverId: null,
      placing: placingId !== null,
      draft: null,
      highlightIds: [],
      focus: null,
      flyTo,
      plan: null,
      photos: { markers, highlightId, draggable: canEdit },
    }),
    [canEdit, flyTo, highlightId, mapSpots, markers, placingId],
  )

  function replace(photo: Photo) {
    setPhotos((current) =>
      current
        ? current.map((item) => (item.id === photo.id ? photo : item))
        : current,
    )
  }

  function fly(photo: Photo) {
    if (photo.lat === null || photo.lng === null) return
    flyCount.current += 1
    setFlyTo({
      token: `photo-${photo.id}-${flyCount.current}`,
      lng: photo.lng,
      lat: photo.lat,
    })
  }

  function scrollTo(id: string) {
    const element = document.getElementById(`book-tile-${id}`)
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  function fail(error: unknown, message: string) {
    if (isAuth(error)) {
      reload()
      return
    }
    setToast(message)
  }

  /** A write that answers with the photo; the book and the markers follow it. */
  async function write(id: string, body: PatchImageBody, message: string) {
    try {
      const saved = await patchPhoto(id, body)
      replace(saved)
      return saved
    } catch (error) {
      fail(error, message)
      return null
    }
  }

  async function placeAt(id: string, lng: number, lat: number) {
    setPlacingId(null)
    const saved = await write(id, { lat, lng }, t('photobook.placeError'))
    if (!saved) return
    setHighlightId(saved.id)
    fly(saved)
  }

  async function linkSpot(id: string, spotId: string) {
    setPlacingId(null)
    setPickingId(null)
    const saved = await write(id, { spotId }, t('photobook.placeError'))
    if (!saved) return
    setHighlightId(saved.id)
    fly(saved)
  }

  async function moveMarker(id: string, lng: number, lat: number) {
    const before = photosRef.current
    setPhotos((current) =>
      current
        ? current.map((item) => (item.id === id ? { ...item, lat, lng } : item))
        : current,
    )
    try {
      replace(await patchPhoto(id, { lat, lng }))
    } catch (error) {
      setPhotos(before)
      fail(error, t('photobook.moveError'))
    }
  }

  function reveal(id: string) {
    setHighlightId(id)
    scrollTo(id)
  }

  function openPhoto(photo: Photo) {
    show([photo.id])
    setHighlightId(photo.id)
    setOpenId(photo.id)
    fly(photo)
  }

  useMapScene(scene, {
    onSelect: (spotId) => {
      if (placingId !== null && canEdit) {
        void linkSpot(placingId, spotId)
        return
      }
      const first = list.find((photo) => photo.spotId === spotId)
      if (first) reveal(first.id)
    },
    onHover: () => undefined,
    onPlace:
      placingId !== null
        ? (lng, lat) => {
            void placeAt(placingId, lng, lat)
          }
        : undefined,
    onPhoto: reveal,
    onPhotoMove: canEdit
      ? (id, lng, lat) => {
          void moveMarker(id, lng, lat)
        }
      : undefined,
  })

  useEffect(() => {
    if (placingId === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPlacingId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [placingId])

  async function saveCaption(photo: Photo, caption: string | null) {
    setBusy(true)
    await write(photo.id, { caption }, t('photobook.saveError'))
    setBusy(false)
  }

  async function remove(photo: Photo) {
    setBusy(true)
    try {
      await deleteImage(photo.id)
      setPhotos((current) =>
        current ? current.filter((item) => item.id !== photo.id) : current,
      )
      setOpenId(null)
      setHighlightId((current) => (current === photo.id ? null : current))
    } catch (error) {
      fail(error, t('photobook.deleteError'))
    }
    setBusy(false)
  }

  const hint = placingId ? (
    <div
      role="status"
      data-testid="placing-hint"
      className="pointer-events-auto absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-card bg-foreground py-1 pr-1 pl-4 text-background shadow-panel"
    >
      <span>{t('photobook.placingHint')}</span>
      <Button
        variant="outline"
        data-testid="placing-cancel"
        onClick={() => setPlacingId(null)}
      >
        {t('ui.cancel')}
      </Button>
    </div>
  ) : null

  return (
    <main
      data-testid="photobook"
      className="flex min-h-0 w-full flex-1 flex-col overflow-auto overscroll-contain border-b border-border lg:border-r lg:border-b-0"
    >
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-xl font-semibold">{t('photobook.title')}</h1>
      </div>
      <div className="space-y-6 p-4">
        {canEdit ? (
          <UploadPanel
            tripId={tripId}
            enabled={uploadsEnabled}
            onAuthLost={reload}
            onUploaded={(photo) =>
              setPhotos((current) => sortPhotos([...(current ?? []), photo]))
            }
          />
        ) : null}
        {status === 'loading' ? (
          <div data-testid="photobook-loading">
            <PanelSkeleton />
          </div>
        ) : null}
        {status === 'error' ? (
          <ErrorState
            message={t('photobook.loadError')}
            retry={() => {
              setStatus('loading')
              setAttempt((value) => value + 1)
            }}
          />
        ) : null}
        {status === 'ready' && list.length === 0 ? (
          <div data-testid="photobook-empty">
            <EmptyState title={t('photobook.empty')} />
          </div>
        ) : null}
        {status === 'ready' && book.notPlaced.length > 0 ? (
          <NotPlaced
            photos={book.notPlaced}
            canEdit={canEdit}
            placingId={placingId}
            isShown={isShown}
            onOpen={openPhoto}
            onLoad={(photo) => show([photo.id])}
            onPlace={(photo) => {
              setOpenId(null)
              setPlacingId(photo.id)
            }}
            onPick={(photo) => setPickingId(photo.id)}
          />
        ) : null}
        {status === 'ready' ? (
          <Book
            days={book.days}
            locale={lang}
            rowHeight={phone ? rowHeights.phone : rowHeights.desktop}
            highlightId={highlightId}
            isShown={isShown}
            nameOf={nameOf}
            labelOf={labelOf}
            onOpen={openPhoto}
            onLoad={(held) => show(held.map((photo) => photo.id))}
          />
        ) : null}
      </div>
      {opened ? (
        <Lightbox
          photo={opened}
          place={placeText(opened)}
          locale={lang}
          canEdit={canEdit}
          busy={busy}
          onClose={() => setOpenId(null)}
          onSaveCaption={(caption) => void saveCaption(opened, caption)}
          onDelete={() => void remove(opened)}
        />
      ) : null}
      {pickingPhoto && canEdit ? (
        <SpotPicker
          spots={spots}
          onPick={(spotId) => void linkSpot(pickingPhoto.id, spotId)}
          onClose={() => setPickingId(null)}
        />
      ) : null}
      {hint ? (overlay ? createPortal(hint, overlay) : hint) : null}
      {toast ? <Toast toast={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
