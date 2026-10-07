import pg from 'pg'
import { authenticate } from '../auth/login.js'

declare module 'fastify' {
  interface FastifyInstance {
    tripHub: TripHub
  }
}

const channel = 'trip_events'
const maxStreamsPerUser = 5
const initialBackoffMs = 200
const maxBackoffMs = 10_000

export type TripNotice = {
  tripId: string
  resource: string
  id: string | null
  action: string
  actorId: string | null
  clientId: string | null
}

type LiveStream = {
  tripId: string
  userId: string
  token: string
  closed: boolean
  timer: ReturnType<typeof setInterval> | null
  write: (chunk: string) => void
  finish: () => void
}

export class TripHub {
  private client: pg.Client | null = null
  private pending: pg.Client | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private reconnecting = false
  private backoff = initialBackoffMs
  private seq = 0
  private readonly streams = new Set<LiveStream>()

  constructor(
    private readonly databaseUrl: string,
    private readonly log: (message: string) => void,
    private readonly now: () => Date = () => new Date(),
    private readonly heartbeatMs = 25_000,
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    try {
      await this.connect()
    } catch {
      this.scheduleReconnect()
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    for (const stream of [...this.streams]) this.closeStream(stream)
    const clients = [this.client, this.pending].filter(
      (client): client is pg.Client => client != null,
    )
    this.client = null
    this.pending = null
    await Promise.all(
      clients.map((client) => client.end().catch(() => undefined)),
    )
  }

  openCount(): number {
    return this.streams.size
  }

  /** Drops the LISTEN connection so the hub reconnects and asks clients to resync. */
  disconnectListener(): void {
    const client = this.client
    this.client = null
    if (!client) return
    void client.end().catch(() => undefined)
  }

  reserve(input: {
    tripId: string
    userId: string
    token: string
    pool: pg.Pool
    lastEventId: string | null
    write: (chunk: string) => void
    finish: () => void
  }): { ok: true; start: () => void; release: () => void } | { ok: false } {
    const open = [...this.streams].filter(
      (stream) => stream.userId === input.userId,
    ).length
    if (open >= maxStreamsPerUser) return { ok: false }
    const stream: LiveStream = {
      tripId: input.tripId,
      userId: input.userId,
      token: input.token,
      closed: false,
      timer: null,
      write: input.write,
      finish: input.finish,
    }
    this.streams.add(stream)
    stream.timer = setInterval(() => {
      void this.beat(stream, input.pool)
    }, this.heartbeatMs)
    return {
      ok: true,
      start: () => {
        this.writeRaw(stream, ': open\n\n')
        if (input.lastEventId) this.send(stream, 'resync', {})
      },
      release: () => this.closeStream(stream),
    }
  }

  closeToken(token: string): void {
    for (const stream of [...this.streams]) {
      if (stream.token === token) this.closeStream(stream)
    }
  }

  private closeStream(stream: LiveStream): void {
    if (stream.closed) return
    stream.closed = true
    if (stream.timer) clearInterval(stream.timer)
    this.streams.delete(stream)
    try {
      stream.finish()
    } catch {
      /* socket already closed */
    }
  }

  private async beat(stream: LiveStream, pool: pg.Pool): Promise<void> {
    if (stream.closed) return
    const session = await authenticate(pool, stream.token, this.now()).catch(
      () => null,
    )
    if (!session) {
      this.closeStream(stream)
      return
    }
    this.writeRaw(stream, ': ping\n\n')
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const client = new pg.Client({ connectionString: this.databaseUrl })
    client.on('notification', (message) => {
      if (message.channel !== channel || !message.payload) return
      try {
        this.dispatch(JSON.parse(message.payload) as TripNotice)
      } catch {
        this.log('trip events listener dropped a malformed payload')
      }
    })
    client.on('error', () => {
      this.scheduleReconnect()
    })
    client.on('end', () => {
      if (!this.stopped) this.scheduleReconnect()
    })
    this.pending = client
    try {
      await client.connect()
      if (this.stopped) return
      await client.query(`LISTEN ${channel}`)
      if (this.stopped) return
      this.client = client
      this.backoff = initialBackoffMs
    } catch (error) {
      await client.end().catch(() => undefined)
      throw error
    } finally {
      if (this.pending === client) this.pending = null
      if (this.stopped && this.client !== client) {
        await client.end().catch(() => undefined)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnecting) return
    this.reconnecting = true
    this.client = null
    this.log('trip events listener reconnecting')
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 2, maxBackoffMs)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.stopped) return
      void this.connect()
        .then(() => {
          this.reconnecting = false
          this.broadcast('resync', {})
        })
        .catch(() => {
          this.reconnecting = false
          this.scheduleReconnect()
        })
    }, wait)
  }

  private dispatch(event: TripNotice): void {
    if (!event.tripId) return
    const targets = [...this.streams].filter(
      (stream) => stream.tripId === event.tripId,
    )
    const removed =
      event.action === 'member.remove' || event.action === 'member.leave'
        ? event.id
        : null
    for (const stream of targets) {
      if (removed && stream.userId === removed) continue
      this.send(stream, 'change', {
        resource: event.resource,
        id: event.id,
        action: event.action,
        actorId: event.actorId,
        clientId: event.clientId,
      })
    }
    if (removed) {
      for (const stream of targets) {
        if (stream.userId === removed) this.closeStream(stream)
      }
    }
    if (event.action === 'trip.delete') {
      for (const stream of targets) this.closeStream(stream)
    }
  }

  private broadcast(event: string, data: unknown): void {
    for (const stream of this.streams) this.send(stream, event, data)
  }

  private send(stream: LiveStream, event: string, data: unknown): void {
    this.seq += 1
    this.writeRaw(
      stream,
      `id: ${this.seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
  }

  private writeRaw(stream: LiveStream, chunk: string): void {
    if (stream.closed) return
    try {
      stream.write(chunk)
    } catch {
      this.closeStream(stream)
    }
  }
}
