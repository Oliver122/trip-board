import sharp from 'sharp'
import type { AppConfig } from '../config.js'
import { commonsRadiusMeters } from './commons.js'
import type { InterceptResponse } from './web-fetch.js'

// Fixtures for NODE_ENV=test only: the e2e specs never reach the real internet.
// Served at GET /test/fixtures/:name and, for the host below, through the
// download code in place of a network connection.

export const fixtureHost = 'fixtures.tripboard.test'
const commonsRenditionHost = 'upload.wikimedia.org'

const cache = new Map<string, Promise<Buffer>>()

function render(name: string): Promise<Buffer> | null {
  const make = (
    width: number,
    height: number,
    format: 'jpeg' | 'png',
    r: number,
  ) => {
    const image = sharp({
      create: { width, height, channels: 3, background: { r, g: 90, b: 160 } },
    })
    return (format === 'jpeg' ? image.jpeg() : image.png()).toBuffer()
  }
  switch (name) {
    case 'photo.jpg':
      return make(4000, 3000, 'jpeg', 200)
    case 'photo.png':
      return make(64, 48, 'png', 30)
    case 'thumb.jpg':
      return make(320, 240, 'jpeg', 120)
    default:
      return null
  }
}

function bytesOf(name: string): Promise<Buffer> | null {
  const hit = cache.get(name)
  if (hit) return hit
  const made = render(name)
  if (made) cache.set(name, made)
  return made
}

const types: Record<string, string> = {
  'photo.jpg': 'image/jpeg',
  'thumb.jpg': 'image/jpeg',
  'photo.png': 'image/png',
}

export async function fixtureFile(
  name: string,
): Promise<InterceptResponse | null> {
  if (name === 'redirect.jpg') {
    return { status: 302, headers: { location: '/photo.jpg' } }
  }
  const body = await bytesOf(name)
  if (!body) return null
  return { status: 200, headers: { 'content-type': types[name] ?? '' }, body }
}

/** Answers `http://fixtures.tripboard.test/<name>` and Commons renditions. */
export async function fixtureIntercept(
  url: URL,
): Promise<InterceptResponse | null> {
  if (url.hostname === commonsRenditionHost) return fixtureFile('photo.jpg')
  if (url.hostname !== fixtureHost) return null
  const answer = await fixtureFile(url.pathname.replace(/^\//, ''))
  return answer ?? { status: 404 }
}

const kinkakuji = { lat: 35.0394, lng: 135.7292 }

type Fixture = {
  title: string
  artist: string
  license: string
  mime: string
}

const kinkakujiFiles: Fixture[] = [
  {
    title: 'File:Kinkaku-ji Golden Pavilion.jpg',
    artist: 'Jane Doe',
    license: 'CC BY-SA 4.0',
    mime: 'image/jpeg',
  },
  {
    title: 'File:Kinkaku-ji pond.jpg',
    artist: 'John Roe',
    license: 'CC BY 2.0',
    mime: 'image/jpeg',
  },
  {
    title: 'File:Kinkaku-ji in snow.jpg',
    artist: 'Mika Sato',
    license: 'Public domain',
    mime: 'image/jpeg',
  },
  {
    title: 'File:Kinkaku-ji animation.gif',
    artist: 'Gif Maker',
    license: 'CC BY 4.0',
    mime: 'image/gif',
  },
  {
    title: 'File:Kinkaku-ji commercial.jpg',
    artist: 'Pro Shot',
    license: 'CC BY-NC 4.0',
    mime: 'image/jpeg',
  },
]

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

function page(file: Fixture, config: AppConfig, width: number) {
  const slug = file.title.replace(/^File:/, '').replaceAll(' ', '_')
  return {
    title: file.title,
    imageinfo: [
      {
        thumburl:
          width === 320
            ? `${config.WEB_ORIGIN}/api/test/fixtures/thumb.jpg`
            : `https://${commonsRenditionHost}/wikipedia/commons/thumb/a/ab/${slug}/${width}px-${slug}`,
        url: `https://${commonsRenditionHost}/wikipedia/commons/a/ab/${slug}`,
        width: 4000,
        height: 3000,
        mime: file.mime,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:${slug}`,
        extmetadata: {
          Artist: { value: `<a href="//example.org">${file.artist}</a>` },
          LicenseShortName: { value: file.license },
        },
      },
    ],
  }
}

/** A stand-in for the Commons API with a few files around Kinkaku-ji. */
export function fixtureCommonsFetch(config: AppConfig): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      })
    if (url.searchParams.get('list') === 'geosearch') {
      const [lat, lng] = (url.searchParams.get('gscoord') ?? '')
        .split('|')
        .map(Number)
      const near =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        metersBetween(
          kinkakuji.lat,
          kinkakuji.lng,
          lat as number,
          lng as number,
        ) <= commonsRadiusMeters
      return json({
        query: {
          geosearch: near
            ? kinkakujiFiles.map((file) => ({ title: file.title }))
            : [],
        },
      })
    }
    const width = Number(url.searchParams.get('iiurlwidth') ?? 320)
    const titles = (url.searchParams.get('titles') ?? '').split('|')
    const pages = kinkakujiFiles
      .filter((file) => titles.includes(file.title))
      .map((file) => page(file, config, width))
    return json({ query: { pages } })
  }
}
