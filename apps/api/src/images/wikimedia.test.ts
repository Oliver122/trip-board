import { describe, expect, it } from 'vitest'
import { wikimediaFileTitle, wikimediaRendition } from './wikimedia.js'

const base = 'https://upload.wikimedia.org/wikipedia/commons'

function rendition(url: string): string | null {
  return wikimediaRendition(new URL(url))?.toString() ?? null
}

function title(url: string): string | null {
  return wikimediaFileTitle(new URL(url))?.fileTitle ?? null
}

describe('wikimedia links', () => {
  it('T-43-07 rewrites originals and wide thumbs to the 2048 px rendition', () => {
    expect(rendition(`${base}/a/ab/Kinkaku-ji.JPG`)).toBe(
      `${base}/thumb/a/ab/Kinkaku-ji.JPG/2048px-Kinkaku-ji.JPG`,
    )
    expect(rendition(`${base}/a/ab/x.webp`)).toBe(
      `${base}/thumb/a/ab/x.webp/2048px-x.webp`,
    )
    expect(
      rendition(`${base}/thumb/a/ab/Kinkaku-ji.jpg/3840px-Kinkaku-ji.jpg`),
    ).toBe(`${base}/thumb/a/ab/Kinkaku-ji.jpg/2048px-Kinkaku-ji.jpg`)
    expect(
      rendition('https://upload.wikimedia.org/wikipedia/en/a/ab/Poster.png'),
    ).toBe(
      'https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Poster.png/2048px-Poster.png',
    )
  })

  it('T-43-07 leaves small thumbs, svg, gif and other hosts alone', () => {
    expect(rendition(`${base}/thumb/a/ab/x.jpg/250px-x.jpg`)).toBeNull()
    expect(rendition(`${base}/thumb/a/ab/x.jpg/2048px-x.jpg`)).toBeNull()
    expect(rendition(`${base}/a/ab/x.svg`)).toBeNull()
    expect(rendition(`${base}/a/ab/x.gif`)).toBeNull()
    expect(rendition('https://example.org/wikipedia/commons/a/ab/x.jpg')).toBe(
      null,
    )
    expect(rendition('https://example.org/photo.jpg')).toBeNull()
  })

  it('T-43-07 keeps percent-encoded names intact', () => {
    expect(rendition(`${base}/a/ab/Caf%C3%A9_%282%29.jpg`)).toBe(
      `${base}/thumb/a/ab/Caf%C3%A9_%282%29.jpg/2048px-Caf%C3%A9_%282%29.jpg`,
    )
    expect(
      rendition(`${base}/thumb/a/ab/Caf%C3%A9.jpg/5000px-Caf%C3%A9.jpg`),
    ).toBe(`${base}/thumb/a/ab/Caf%C3%A9.jpg/2048px-Caf%C3%A9.jpg`)
  })

  it('T-43-07 reads the file title of description pages', () => {
    const expected = 'File:Kinkaku-ji 2019.jpg'
    expect(
      title('https://commons.wikimedia.org/wiki/File:Kinkaku-ji_2019.jpg'),
    ).toBe(expected)
    expect(
      title('https://de.m.wikipedia.org/wiki/Datei:Kinkaku-ji_2019.jpg'),
    ).toBe(expected)
    expect(
      title(
        'https://en.wikipedia.org/wiki/Kinkaku-ji#/media/File:Kinkaku-ji_2019.jpg',
      ),
    ).toBe(expected)
    expect(
      title(
        'https://de.wikipedia.org/wiki/Kinkaku-ji#/media/Datei:Kinkaku-ji_2019.jpg',
      ),
    ).toBe(expected)
    expect(
      title('https://commons.wikimedia.org/wiki/File:Caf%C3%A9_%282%29.jpg'),
    ).toBe('File:Café (2).jpg')
  })

  it('T-43-07 ignores other pages and bad encoding', () => {
    expect(title('https://en.wikipedia.org/wiki/Kinkaku-ji')).toBeNull()
    expect(title('https://example.org/wiki/File:A.jpg')).toBeNull()
    expect(title('https://commons.wikimedia.org/wiki/File:%E0%A4%A.jpg')).toBe(
      null,
    )
    expect(
      title('https://commons.wikimedia.org/w/index.php?title=File:A.jpg'),
    ).toBe(null)
  })
})
