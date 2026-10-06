import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
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

  it('names the Discord settings missing in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/tripboard',
      }),
    ).toThrow(/DISCORD_CLIENT_ID/)
  })
})
