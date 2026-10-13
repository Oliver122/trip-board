import { describe, expect, it } from 'vitest'
import {
  coordsFromGoogleMapsUrl,
  firstHttpUrl,
  googleMapsUrlIn,
  isGoogleMapsUrl,
  parseGoogleMapsLink,
} from '@tripboard/shared'

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

describe('parseGoogleMapsLink', () => {
  it('T-33-01 reads the name and the !3d!4d point of a place link', () => {
    expect(
      parseGoogleMapsLink(
        'https://www.google.com/maps/place/Kinkaku-ji/@35.0394,135.7292,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d35.0394!4d135.7292',
      ),
    ).toEqual({
      lat: 35.0394,
      lng: 135.7292,
      name: 'Kinkaku-ji',
      addressHint: null,
    })
    expect(
      parseGoogleMapsLink(
        'https://www.google.com/maps/place/Ichiran+Shibuya/@35.6,139.7,17z',
      ).name,
    ).toBe('Ichiran Shibuya')
    expect(
      parseGoogleMapsLink(
        'https://www.google.com/maps/place/Caf%C3%A9+Kitsun%C3%A9/@35,135,17z',
      ).name,
    ).toBe('Café Kitsuné')
  })

  it('T-33-01 takes a q name without a point, or a q point without a name', () => {
    expect(
      parseGoogleMapsLink('https://www.google.com/maps?q=Ichiran+Shibuya'),
    ).toEqual({
      lat: null,
      lng: null,
      name: 'Ichiran Shibuya',
      addressHint: null,
    })
    expect(
      parseGoogleMapsLink(
        'https://www.google.com/maps/search/?api=1&query=Ichiran+Shibuya',
      ).name,
    ).toBe('Ichiran Shibuya')
    expect(
      parseGoogleMapsLink('https://www.google.com/maps?q=35.1,135.7'),
    ).toEqual({ lat: 35.1, lng: 135.7, name: null, addressHint: null })
  })

  it('T-33-01 lets share text override the name and give an address hint', () => {
    const multi = parseGoogleMapsLink(
      'https://maps.app.goo.gl/abc',
      'Kinkaku-ji\n1 Kinkakujicho, Kita Ward, Kyoto\nhttps://maps.app.goo.gl/abc',
    )
    expect(multi).toEqual({
      lat: null,
      lng: null,
      name: 'Kinkaku-ji',
      addressHint: '1 Kinkakujicho, Kita Ward, Kyoto',
    })
    const one = parseGoogleMapsLink(
      'https://maps.app.goo.gl/abc',
      'Kinkaku-ji, 1 Kinkakujicho, Kyoto https://maps.app.goo.gl/abc',
    )
    expect(one.name).toBe('Kinkaku-ji')
    expect(one.addressHint).toBe('1 Kinkakujicho, Kyoto')
    expect(
      parseGoogleMapsLink(
        'https://www.google.com/maps/place/Other/@35,135,17z',
        'Kinkaku-ji\nhttps://maps.app.goo.gl/abc',
      ).name,
    ).toBe('Kinkaku-ji')
  })

  it('T-33-01 returns null coordinates when out of range', () => {
    expect(
      parseGoogleMapsLink('https://www.google.com/maps/@95,200,17z'),
    ).toMatchObject({ lat: null, lng: null })
  })
})

describe('Google Maps URL detection', () => {
  it('T-33-01 accepts the Google Maps hosts and nothing else', () => {
    for (const url of [
      'https://maps.app.goo.gl/abc',
      'https://goo.gl/maps/abc',
      'https://maps.google.com/?q=x',
      'https://maps.google.co.jp/?q=x',
      'https://www.google.com/maps/place/x',
      'https://google.de/maps?q=x',
      'https://www.google.com/search?q=x',
    ]) {
      expect(isGoogleMapsUrl(url), url).toBe(true)
    }
    for (const url of [
      'https://example.com/x',
      'https://maps.app.goo.gl.evil.com/x',
      'https://www.google.com/mail',
      'https://goo.gl/other',
      'ftp://maps.google.com/x',
      'not a url',
    ]) {
      expect(isGoogleMapsUrl(url), url).toBe(false)
    }
  })

  it('T-33-01 finds the first URL in text and checks it', () => {
    expect(firstHttpUrl('see https://a.example/x now')).toBe(
      'https://a.example/x',
    )
    expect(firstHttpUrl('hello')).toBeNull()
    expect(googleMapsUrlIn({ text: 'Spot\nhttps://maps.app.goo.gl/abc' })).toBe(
      'https://maps.app.goo.gl/abc',
    )
    expect(googleMapsUrlIn({ text: 'hello' })).toBeNull()
    expect(googleMapsUrlIn({ url: 'https://example.com/x' })).toBeNull()
  })
})
