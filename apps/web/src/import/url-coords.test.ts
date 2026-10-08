import { describe, expect, it } from 'vitest'
import { coordsFromGoogleMapsUrl } from './url-coords'

describe('coordsFromGoogleMapsUrl', () => {
  it('T-23-03 reads coordinates from each known URL form', () => {
    expect(
      coordsFromGoogleMapsUrl(
        'https://www.google.com/maps/place/Kinkaku-ji/@35.0394,135.7292,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d35.0394!4d135.7292',
      ),
    ).toEqual({ lat: 35.0394, lng: 135.7292 })
    expect(
      coordsFromGoogleMapsUrl('https://maps.google.com/@35.0394,135.7292,15z'),
    ).toEqual({ lat: 35.0394, lng: 135.7292 })
    expect(
      coordsFromGoogleMapsUrl(
        'https://maps.google.com/maps/search/35.0394,135.7292',
      ),
    ).toEqual({ lat: 35.0394, lng: 135.7292 })
    expect(
      coordsFromGoogleMapsUrl(
        'https://maps.google.com/maps?q=35.0394,135.7292',
      ),
    ).toEqual({ lat: 35.0394, lng: 135.7292 })
  })

  it('T-23-03 gives none for a data= place link and an out-of-range @ pair', () => {
    expect(
      coordsFromGoogleMapsUrl(
        'https://maps.google.com/maps/place/Name/data=!4m2!3m1!1s0x0:0x0',
      ),
    ).toBeNull()
    expect(
      coordsFromGoogleMapsUrl('https://maps.google.com/@95,10,15z'),
    ).toBeNull()
  })
})
