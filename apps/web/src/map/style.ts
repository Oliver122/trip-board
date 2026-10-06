import type { StyleSpecification } from 'maplibre-gl'
import type { AppLocale } from '../lib/locale'

const glyphs = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

const light = {
  land: '#e7e5e0',
  water: '#d4e2ea',
  park: '#e3e6dc',
  building: '#ddd9d2',
  road: '#f7f6f3',
  roadCasing: '#d5d2cb',
  label: '#8a8680',
  halo: '#f4f3f0',
}

const dark = {
  land: '#1a1b1e',
  water: '#1c2a33',
  park: '#1e2420',
  building: '#2a2c31',
  road: '#3a3d44',
  roadCasing: '#2a2c31',
  label: '#9b9790',
  halo: '#1a1b1e',
}

/** Land color behind the canvas, so the first frame and a tile error are not black. */
export function mapLandColor(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? dark.land : light.land
}

/** Prefer the app language, then the other Latin tag the tiles ship, then the local name. */
export function labelTextField(locale: AppLocale) {
  const localized = locale === 'de' ? 'name:de' : 'name:en'
  const underscored = locale === 'de' ? 'name_de' : 'name_en'
  return ['coalesce', ['get', localized], ['get', underscored], ['get', 'name']]
}

export function mapStyle(
  locale: AppLocale,
  theme: 'light' | 'dark',
): StyleSpecification {
  const color = theme === 'dark' ? dark : light
  const textField = labelTextField(locale)
  return {
    version: 8,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '© OpenFreeMap © OpenStreetMap',
      },
    },
    glyphs,
    layers: [
      {
        id: 'land',
        type: 'background',
        paint: { 'background-color': color.land },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': color.water },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': color.park },
      },
      {
        id: 'wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': color.park },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': color.building },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        paint: { 'line-color': color.roadCasing, 'line-width': 2 },
      },
      {
        id: 'road',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        paint: { 'line-color': color.road, 'line-width': 1 },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['country', 'state', 'city', 'town', 'village']],
        ],
        layout: {
          'text-field': textField,
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: {
          'text-color': color.label,
          'text-halo-color': color.halo,
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'water-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        layout: {
          'text-field': textField,
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': color.label,
          'text-halo-color': color.halo,
          'text-halo-width': 1,
        },
      },
    ],
  } as StyleSpecification
}
