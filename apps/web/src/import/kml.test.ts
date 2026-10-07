// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseKml } from './kml'

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Kinkaku-ji</name>
      <description><![CDATA[<b>Golden</b> pavilion]]></description>
      <Point><coordinates>135.7292,35.0394,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Walking route</name>
      <LineString><coordinates>135.0,35.0 135.1,35.1</coordinates></LineString>
    </Placemark>
  </Document>
</kml>`

describe('parseKml', () => {
  it('T-23-02 reads Placemark points and skips a Placemark without a point', () => {
    const result = parseKml(kml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('kml')
    expect(result.skipped).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      title: 'Kinkaku-ji',
      info: 'Golden pavilion',
      lat: 35.0394,
      lng: 135.7292,
    })
  })
})
