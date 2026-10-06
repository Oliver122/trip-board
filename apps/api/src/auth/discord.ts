import { createHash, randomBytes } from 'node:crypto'
import type { AppConfig } from '../config.js'

export type DiscordProfile = {
  id: string
  username: string
  globalName: string | null
  avatar: string | null
}

export function newOAuthSecrets(): { state: string; verifier: string } {
  return {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
  }
}

export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function discordAuthorizeUrl(
  config: AppConfig,
  state: string,
  verifier: string,
): string {
  const url = new URL('/oauth2/authorize', config.DISCORD_API_ORIGIN)
  url.searchParams.set('client_id', config.DISCORD_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', config.discordRedirectUri)
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function avatarUrl(profile: DiscordProfile): string | null {
  if (!profile.avatar || !/^[a-zA-Z0-9_]+$/.test(profile.avatar)) return null
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
}

export async function fetchDiscordProfile(
  config: AppConfig,
  code: string,
  verifier: string,
): Promise<DiscordProfile> {
  const body = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discordRedirectUri,
    code_verifier: verifier,
  })
  const tokenResponse = await fetch(
    new URL('/api/oauth2/token', config.DISCORD_API_ORIGIN),
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    },
  )
  if (!tokenResponse.ok) throw new Error('discord_token')
  const tokenJson = (await tokenResponse.json()) as { access_token?: unknown }
  if (typeof tokenJson.access_token !== 'string')
    throw new Error('discord_token')

  const userResponse = await fetch(
    new URL('/api/users/@me', config.DISCORD_API_ORIGIN),
    {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(8000),
    },
  )
  if (!userResponse.ok) throw new Error('discord_user')
  const profile = (await userResponse.json()) as {
    id?: unknown
    username?: unknown
    global_name?: unknown
    avatar?: unknown
  }
  if (typeof profile.id !== 'string' || !/^[0-9]{5,25}$/.test(profile.id)) {
    throw new Error('discord_user')
  }
  if (typeof profile.username !== 'string' || profile.username.length === 0) {
    throw new Error('discord_user')
  }
  const globalName =
    typeof profile.global_name === 'string' && profile.global_name.length > 0
      ? profile.global_name.slice(0, 64)
      : null
  const avatar = typeof profile.avatar === 'string' ? profile.avatar : null
  return {
    id: profile.id,
    username: profile.username.slice(0, 64),
    globalName,
    avatar,
  }
}
