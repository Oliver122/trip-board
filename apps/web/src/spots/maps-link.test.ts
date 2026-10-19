import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { googleMapsUrl } from './maps-link'

describe('googleMapsUrl', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('T-38-11 rounds to 6 decimals and builds the search link', () => {
    expect(googleMapsUrl({ lat: 35.0393612, lng: 135.729243 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=35.039361,135.729243',
    )
  })

  it('T-38-11 formats negative and zero coordinates', () => {
    expect(googleMapsUrl({ lat: -33.8567844, lng: 0 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-33.856784,0',
    )
    expect(googleMapsUrl({ lat: -0.0000001, lng: -151.2152967 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=0,-151.215297',
    )
  })

  it('T-38-11 keeps the dot separator with the German locale active', async () => {
    await i18n.changeLanguage('de')
    expect(googleMapsUrl({ lat: 48.1371079, lng: 11.5753822 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=48.137108,11.575382',
    )
  })
})
