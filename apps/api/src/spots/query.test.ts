import { describe, expect, it } from 'vitest'
import {
  defaultSpotListQuery,
  parseSpotListQuery,
  spotListSearchParams,
  spotSearchPattern,
  strictSpotListQuery,
  type SpotListQuery,
} from '@tripboard/shared'

const aiko = '00000000-0000-0000-0000-000000000002'

describe('spot list query', () => {
  it('T-09-05 round-trips every filter param and drops invalid ones', () => {
    const query: SpotListQuery = {
      q: 'ÖFFNET %',
      cat: ['must_go', 'home'],
      status: 'scheduled',
      by: aiko,
      entry: '30000000-0000-0000-0000-000000000001',
      sort: 'az',
      visible: false,
    }
    const search = spotListSearchParams(query).toString()
    expect(search).toContain('q=')
    expect(search).toContain('cat=must_go%2Chome')
    expect(search).toContain('status=scheduled')
    expect(search).toContain(`by=${aiko}`)
    expect(search).toContain('entry=30000000-0000-0000-0000-000000000001')
    expect(search).toContain('sort=az')
    expect(search).not.toContain('visible=')
    expect(parseSpotListQuery(search)).toEqual(query)
    expect(parseSpotListQuery(new URLSearchParams(search))).toEqual(query)
    expect(spotListSearchParams(defaultSpotListQuery).toString()).toBe('')

    expect(
      parseSpotListQuery(
        'q=cafe&cat=nope,home,home&status=later&by=abc&sort=rank&visible=2&extra=1',
      ),
    ).toEqual({
      q: 'cafe',
      cat: ['home'],
      status: 'all',
      by: null,
      entry: null,
      sort: 'scheduled',
      visible: false,
    })
  })

  it('T-18-05 lets the URL override the list-follows-map setting', () => {
    expect(parseSpotListQuery('')).toMatchObject({ visible: false })
    expect(parseSpotListQuery('', true)).toMatchObject({ visible: true })
    expect(parseSpotListQuery('visible=0', true)).toMatchObject({
      visible: false,
    })
    expect(parseSpotListQuery('visible=1', false)).toMatchObject({
      visible: true,
    })
    expect(
      spotListSearchParams({ ...defaultSpotListQuery, visible: true }).get(
        'visible',
      ),
    ).toBe('1')
    expect(
      spotListSearchParams(
        { ...defaultSpotListQuery, visible: false },
        true,
      ).get('visible'),
    ).toBe('0')
    expect(spotListSearchParams(defaultSpotListQuery, false).toString()).toBe(
      '',
    )
  })

  it('escapes LIKE wildcards and leaves ordinary text unchanged', () => {
    expect(spotSearchPattern('  ')).toBeNull()
    expect(spotSearchPattern('inari')).toBe('%inari%')
    expect(spotSearchPattern('%')).toBe('%!%%')
    expect(spotSearchPattern('100%_!')).toBe('%100!%!_!!%')
  })

  it('rejects an unknown sort and keeps a valid category list', () => {
    expect(strictSpotListQuery({ sort: 'nope' })).toEqual({
      ok: false,
      fields: { sort: 'invalid' },
    })
    expect(strictSpotListQuery({ cat: 'must_go,home', q: 'inari' })).toEqual({
      ok: true,
      filters: {
        q: 'inari',
        cat: ['must_go', 'home'],
        status: 'all',
        by: null,
        entry: null,
        sort: 'scheduled',
      },
    })
    expect(strictSpotListQuery({ entry: 'nope' })).toEqual({
      ok: false,
      fields: { entry: 'invalid' },
    })
  })
})
