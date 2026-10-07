import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './db/paths.js'

const exec = promisify(execFile)

describe('deploy env', () => {
  it('T-22-03 omits DEV_LOGIN from the written env and stops when the server already enables it', async () => {
    const source = await readFile(join(repoRoot, 'scripts/deploy.sh'), 'utf8')
    const apply = source.indexOf('scripts/server-env.sh')
    const restart = source.indexOf('systemctl restart trip-board')
    expect(apply).toBeGreaterThan(-1)
    expect(restart).toBeGreaterThan(apply)

    const example = await readFile(join(repoRoot, '.env.example'), 'utf8')
    expect(example).toMatch(/^DEV_LOGIN=0$/m)
    expect(example).toMatch(/DEV_LOGIN=1/)

    const clean = await mkdtemp(join(tmpdir(), 'tb-env-'))
    try {
      await writeFile(
        join(clean, '.env'),
        'DATABASE_URL=postgres://localhost/tripboard\nWEB_ORIGIN=http://127.0.0.1:5180\n',
      )
      await exec('bash', [join(repoRoot, 'scripts/deploy.sh'), '--apply-env'], {
        cwd: clean,
        env: {
          ...process.env,
          DEV_LOGIN: '1',
          WEB_ORIGIN: 'https://trip.example.com',
        },
      })
      const written = await readFile(join(clean, '.env'), 'utf8')
      expect(written).not.toMatch(/^DEV_LOGIN=/m)
      expect(written).toMatch(/^WEB_ORIGIN=https:\/\/trip\.example\.com$/m)
    } finally {
      await rm(clean, { recursive: true, force: true })
    }

    const blocked = await mkdtemp(join(tmpdir(), 'tb-env-'))
    try {
      await writeFile(
        join(blocked, '.env'),
        'DATABASE_URL=postgres://localhost/tripboard\nDEV_LOGIN=1\n',
      )
      const failed = await exec(
        'bash',
        [join(repoRoot, 'scripts/deploy.sh'), '--apply-env'],
        { cwd: blocked, env: { ...process.env } },
      ).then(
        () => null,
        (error: { code?: number; stderr?: string }) => error,
      )
      expect(failed).not.toBeNull()
      expect(failed?.code).not.toBe(0)
      expect(failed?.stderr).toMatch(/DEV_LOGIN/)
    } finally {
      await rm(blocked, { recursive: true, force: true })
    }
  })
})
