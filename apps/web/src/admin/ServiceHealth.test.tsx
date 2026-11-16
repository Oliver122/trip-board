/** @vitest-environment jsdom */
import type { AdminOps } from '@tripboard/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { ServiceHealth } from './ServiceHealth'
import * as client from './client'

vi.mock('./client', () => ({ getOps: vi.fn(), runOpsJob: vi.fn() }))

const hour = 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function ops(): AdminOps {
  return {
    startedAt: ago(2 * hour),
    days: [{ day: '2026-11-12', apiStarts: 2, http5xx: 1, http429: 0 }],
    jobs: [
      {
        job: 'sessions',
        intervalMs: hour,
        lastStartedAt: ago(10 * 60_000),
        lastFinishedAt: ago(10 * 60_000),
        lastResult: 'ok',
        lastError: null,
      },
      {
        job: 'invites',
        intervalMs: hour,
        lastStartedAt: ago(3 * hour),
        lastFinishedAt: ago(3 * hour),
        lastResult: 'error',
        lastError: 'connection refused',
      },
      {
        job: 'geocode',
        intervalMs: hour,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastResult: null,
        lastError: null,
      },
    ],
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ServiceHealth', () => {
  it('T-45-08 flags overdue, never-run and failed jobs', async () => {
    vi.mocked(client.getOps).mockResolvedValue(ops())
    render(<ServiceHealth range="all" />)
    await screen.findByTestId('ops-jobs')
    expect(client.getOps).toHaveBeenCalledWith('90d', expect.anything())
    expect(screen.getByTestId('ops-started')).toBeInTheDocument()
    expect(screen.getByTestId('job-sessions')).toHaveAttribute(
      'data-overdue',
      'false',
    )
    const failed = screen.getByTestId('job-invites')
    expect(failed).toHaveAttribute('data-overdue', 'true')
    expect(failed).toHaveAttribute('data-result', 'error')
    expect(within(failed).getByText('Overdue')).toBeInTheDocument()
    expect(within(failed).getByText('Failed')).toBeInTheDocument()
    expect(within(failed).getByText('connection refused')).toBeInTheDocument()
    const fresh = screen.getByTestId('job-geocode')
    expect(fresh).toHaveAttribute('data-result', 'none')
    expect(fresh).toHaveAttribute('data-overdue', 'false')
    expect(within(fresh).getByText('Not yet run')).toBeInTheDocument()
  })

  it('T-45-09 Run now calls the client and refreshes the panel', async () => {
    vi.mocked(client.getOps).mockResolvedValue(ops())
    vi.mocked(client.runOpsJob).mockResolvedValue({
      job: 'invites',
      result: 'ok',
    })
    render(<ServiceHealth range="7d" />)
    const row = await screen.findByTestId('job-invites')
    const refreshed = ops()
    refreshed.jobs[1] = {
      ...refreshed.jobs[1]!,
      lastStartedAt: ago(1000),
      lastResult: 'ok',
      lastError: null,
    }
    vi.mocked(client.getOps).mockResolvedValue(refreshed)
    fireEvent.click(within(row).getByRole('button', { name: 'Run now' }))
    expect(within(row).getByRole('button', { name: 'Running…' })).toBeDisabled()
    await waitFor(() =>
      expect(screen.getByTestId('job-invites')).toHaveAttribute(
        'data-result',
        'ok',
      ),
    )
    expect(client.runOpsJob).toHaveBeenCalledWith('invites')
    expect(client.getOps).toHaveBeenCalledTimes(2)
  })

  it('T-45-10 shows an inline error when the panel or the run fails', async () => {
    vi.mocked(client.getOps).mockRejectedValueOnce(new Error('down'))
    render(<ServiceHealth range="30d" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Service health could not be loaded.',
    )
    cleanup()
    vi.mocked(client.getOps).mockResolvedValue(ops())
    vi.mocked(client.runOpsJob).mockRejectedValue(new Error('boom'))
    render(<ServiceHealth range="30d" />)
    const row = await screen.findByTestId('job-sessions')
    fireEvent.click(within(row).getByRole('button', { name: 'Run now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not run the job.',
    )
  })
})
