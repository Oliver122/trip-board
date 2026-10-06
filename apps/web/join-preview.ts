import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'

const joinPath = /^\/join\/([A-Z0-9]{3}-[A-Z0-9]{4})\/?(?:\?.*)?$/

function isPreviewBot(userAgent: string | undefined): boolean {
  const ua = userAgent ?? ''
  return /bot|facebookexternalhit|embedly|quora|whatsapp|slack|telegram|discord|preview/i.test(
    ua,
  )
}

/** Discord and other crawlers request the web origin, not the API. */
export function joinPreviewPlugin(apiPort: number): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const header = req.headers['user-agent']
    const userAgent = Array.isArray(header) ? header[0] : header
    const match = joinPath.exec(req.url ?? '')
    if (!match || req.method !== 'GET' || !isPreviewBot(userAgent)) {
      next()
      return
    }
    const code = match[1]
    void fetch(`http://127.0.0.1:${apiPort}/join/${code}`, {
      headers: { 'user-agent': userAgent ?? 'bot' },
      signal: AbortSignal.timeout(4000),
    })
      .then(async (upstream) => {
        const html = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(html)
      })
      .catch(() => {
        next()
      })
  }

  function attach(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(middleware)
  }

  return {
    name: 'join-preview',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
