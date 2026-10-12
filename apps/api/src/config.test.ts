import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  // T-00-02
  it('names DATABASE_URL when it is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })

  it('reads the database url and falls back to a non-default API port', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://localhost/tripboard',
    })
    expect(config.DATABASE_URL).toBe('postgres://localhost/tripboard')
    expect(config.API_PORT).toBe(4080)
    expect(config.WEB_ORIGIN).toBe('http://127.0.0.1:5180')
    expect(config.discordRedirectUri).toBe(
      'http://127.0.0.1:5180/api/auth/discord/callback',
    )
  })

  it('T-22-02 refuses DEV_LOGIN outside a local development origin', () => {
    const base = {
      DATABASE_URL: 'postgres://localhost/tripboard',
      DEV_LOGIN: '1',
    }
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(
      /DEV_LOGIN/,
    )
    expect(() =>
      loadConfig({ ...base, WEB_ORIGIN: 'https://trip.example.com' }),
    ).toThrow(/DEV_LOGIN/)
    expect(() =>
      loadConfig({ ...base, WEB_ORIGIN: 'http://192.168.1.5:5180' }),
    ).toThrow(/DEV_LOGIN/)

    for (const origin of [
      'http://127.0.0.1:5180',
      'http://localhost:5180',
      'http://[::1]:5180',
    ]) {
      expect(loadConfig({ ...base, WEB_ORIGIN: origin }).devLogin).toBe(true)
    }
    expect(loadConfig({ DATABASE_URL: base.DATABASE_URL }).devLogin).toBe(false)
  })

  it('names the Discord settings missing in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/tripboard',
      }),
    ).toThrow(/DISCORD_CLIENT_ID/)
  })
})
