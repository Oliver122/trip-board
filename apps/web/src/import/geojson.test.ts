import { describe, expect, it } from 'vitest'
import { parseGeoJson } from './geojson'

describe('parseGeoJson', () => {
  it('T-23-02 reads Saved Places.json and treats [0, 0] as missing coordinates', () => {
    const data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [135.7292, 35.0394] },
          properties: {
            Location: {
              'Business Name': 'Kinkaku-ji',
              Address: 'Kinkakujicho, Kyoto',
            },
            'Google Maps URL': 'https://maps.google.com/?q=35,135',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { name: 'No coordinates' },
        },
      ],
    }

    const result = parseGeoJson(JSON.stringify(data))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('google_geojson')
    expect(result.skipped).toBe(0)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      title: 'Kinkaku-ji',
      address: 'Kinkakujicho, Kyoto',
      link: 'https://maps.google.com/?q=35,135',
      lat: 35.0394,
      lng: 135.7292,
    })
    expect(result.rows[1]).toMatchObject({
      title: 'No coordinates',
      lat: null,
      lng: null,
    })
  })
})
