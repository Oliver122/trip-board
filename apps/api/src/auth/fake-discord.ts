import { createServer, type Server } from 'node:http'
import type { DiscordProfile } from './discord.js'

type Issued = {
  token: string
  profile: {
    id: string
    username: string
    global_name: string | null
    avatar: string | null
  }
}

export type FakeDiscord = {
  origin: string
  issue(code: string, profile: DiscordProfile): void
  close(): Promise<void>
}

export async function startFakeDiscord(): Promise<FakeDiscord> {
  const codes = new Map<string, Issued>()
  const tokens = new Map<string, Issued['profile']>()
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'POST' && url.pathname === '/api/oauth2/token') {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = new URLSearchParams(Buffer.concat(chunks).toString())
      const issued = codes.get(body.get('code') ?? '')
      if (!issued || body.get('grant_type') !== 'authorization_code') {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid_grant' }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          access_token: issued.token,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/users/@me') {
      const header = request.headers.authorization ?? ''
      const profile = tokens.get(header.replace(/^Bearer /, ''))
      if (!profile) {
        response.writeHead(401)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(profile))
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('fake Discord server failed to listen')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    issue(code, profile) {
      const token = `token-${code}`
      const body = {
        id: profile.id,
        username: profile.username,
        global_name: profile.globalName,
        avatar: profile.avatar,
      }
      codes.set(code, { token, profile: body })
      tokens.set(token, body)
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
