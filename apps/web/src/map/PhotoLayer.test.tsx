/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PhotoMapScene } from '../trips/trip-context'
import { PhotoLayer } from './PhotoLayer'

vi.mock('react-map-gl/maplibre', () => ({
  Marker: ({
    children,
    style,
  }: {
    children: ReactNode
    style?: { zIndex?: number }
  }) => (
    <div data-testid="marker" data-z={style?.zIndex}>
      {children}
    </div>
  ),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count != null ? `${key} ${options.count}` : key,
  }),
}))

const world = { minLng: -180, minLat: -85, maxLng: 180, maxLat: 85 }

function scene(over: Partial<PhotoMapScene> = {}, count = 2): PhotoMapScene {
  return {
    markers: Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      lng: 139.7 + (index % 5) * 0.0001,
      lat: 35.6 + Math.floor(index / 5) * 0.0001,
      src: index === 0 ? '/img/p0.webp' : null,
      label: `Photo ${index}`,
    })),
    highlightId: null,
    draggable: false,
    ...over,
  }
}

function renderLayer(photos: PhotoMapScene, onPhoto = vi.fn()) {
  const onPhotoMove = vi.fn()
  const onZoomTo = vi.fn()
  render(
    <PhotoLayer
      photos={photos}
      bounds={world}
      zoom={10}
      onPhoto={onPhoto}
      onPhotoMove={onPhotoMove}
      onZoomTo={onZoomTo}
    />,
  )
  return { onPhoto, onPhotoMove, onZoomTo }
}

describe('PhotoLayer', () => {
  afterEach(cleanup)

  it('T-47-06 renders one labelled button per photo with the thumbnail', () => {
    const { onPhoto } = renderLayer(scene())
    const button = screen.getByTestId('photo-marker-p0')
    expect(button).toHaveAccessibleName('Photo 0')
    expect(button.querySelector('img')).toHaveAttribute('src', '/img/p0.webp')
    expect(button).toHaveAttribute('data-highlighted', 'false')
    fireEvent.click(button)
    expect(onPhoto).toHaveBeenCalledWith('p0')
  })

  it('T-47-10 src null shows the icon and no img', () => {
    renderLayer(scene())
    const button = screen.getByTestId('photo-marker-p1')
    expect(button.querySelector('img')).toBeNull()
    expect(button.querySelector('[data-icon="true"]')).not.toBeNull()
  })

  it('T-47-06 the highlighted marker is raised and marked', () => {
    renderLayer(scene({ highlightId: 'p1' }))
    const button = screen.getByTestId('photo-marker-p1')
    expect(button).toHaveAttribute('data-highlighted', 'true')
    expect(button.parentElement).toHaveAttribute('data-z', '4')
    expect(screen.getByTestId('photo-marker-p0').parentElement).toHaveAttribute(
      'data-z',
      '1',
    )
  })

  it('T-47-09 data-draggable follows the scene', () => {
    const { unmount } = render(
      <PhotoLayer
        photos={scene({ draggable: true })}
        bounds={world}
        zoom={10}
        onPhoto={vi.fn()}
        onPhotoMove={vi.fn()}
        onZoomTo={vi.fn()}
      />,
    )
    expect(screen.getByTestId('photo-marker-p0')).toHaveAttribute(
      'data-draggable',
      'true',
    )
    unmount()
    renderLayer(scene())
    expect(screen.getByTestId('photo-marker-p0')).toHaveAttribute(
      'data-draggable',
      'false',
    )
  })

  it('T-47-06 31 close photos form one cluster with the count; click zooms', () => {
    const { onZoomTo } = renderLayer(scene({}, 31))
    const cluster = screen.getByTestId('photo-cluster')
    expect(cluster).toHaveTextContent('31')
    expect(screen.queryByTestId('photo-marker-p0')).toBeNull()
    fireEvent.click(cluster)
    expect(onZoomTo).toHaveBeenCalled()
  })
})
