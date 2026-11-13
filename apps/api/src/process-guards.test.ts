import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installProcessGuards } from './process-guards.js'

function setup(close: () => Promise<void>) {
  const proc = Object.assign(new EventEmitter(), { exit: vi.fn() })
  const lines: string[] = []
  installProcessGuards(proc, (line) => lines.push(line), close)
  return { proc, lines }
}

describe('process guards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('T-44-01 logs a fatal line and exits 1 on unhandledRejection and uncaughtException', () => {
    const { proc, lines } = setup(async () => {})
    proc.emit('unhandledRejection', new Error('rejected'))
    expect(lines).toHaveLength(1)
    const first = JSON.parse(lines[0]!)
    expect(first.level).toBe('fatal')
    expect(first.event).toBe('unhandledRejection')
    expect(first.message).toBe('rejected')
    expect('stack' in first).toBe(true)
    expect(first.stack).toContain('rejected')
    expect(proc.exit).toHaveBeenLastCalledWith(1)

    proc.emit('uncaughtException', new Error('thrown'))
    expect(lines).toHaveLength(2)
    const second = JSON.parse(lines[1]!)
    expect(second.level).toBe('fatal')
    expect(second.event).toBe('uncaughtException')
    expect(second.stack).toContain('thrown')
    expect(proc.exit).toHaveBeenCalledTimes(2)
    expect(proc.exit).toHaveBeenLastCalledWith(1)
  })

  it('T-44-01 handles a non-Error rejection reason', () => {
    const { proc, lines } = setup(async () => {})
    proc.emit('unhandledRejection', 'plain')
    const line = JSON.parse(lines[0]!)
    expect(line.message).toBe('plain')
    expect(line.level).toBe('fatal')
    expect('stack' in line).toBe(true)
    expect(line.stack).toBeNull()
    expect(proc.exit).toHaveBeenCalledWith(1)
  })

  it('T-44-01 SIGTERM closes once and exits 0', async () => {
    const close = vi.fn(async () => {})
    const { proc } = setup(close)
    proc.emit('SIGTERM')
    proc.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    expect(close).toHaveBeenCalledTimes(1)
    expect(proc.exit).toHaveBeenCalledTimes(1)
    expect(proc.exit).toHaveBeenCalledWith(0)
  })

  it('T-44-01 exits 1 when close rejects', async () => {
    const { proc } = setup(async () => {
      throw new Error('nope')
    })
    proc.emit('SIGINT')
    await vi.advanceTimersByTimeAsync(0)
    expect(proc.exit).toHaveBeenCalledWith(1)
  })

  it('T-44-01 exits 1 after 10 s when close never resolves', async () => {
    const { proc } = setup(() => new Promise<void>(() => {}))
    proc.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(9_999)
    expect(proc.exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(proc.exit).toHaveBeenCalledTimes(1)
    expect(proc.exit).toHaveBeenCalledWith(1)
  })

  it('T-44-01 registers the handlers exactly once per process', () => {
    const { proc } = setup(async () => {})
    installProcessGuards(
      proc,
      () => {},
      async () => {},
    )
    for (const event of [
      'unhandledRejection',
      'uncaughtException',
      'SIGTERM',
      'SIGINT',
    ]) {
      expect(proc.listenerCount(event)).toBe(1)
    }
  })
})
