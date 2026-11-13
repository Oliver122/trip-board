import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './db/paths.js'

describe('restart behavior', () => {
  it('T-44-02 the systemd unit restarts always and dev kills the other child', async () => {
    const deploy = await readFile(join(repoRoot, 'scripts/deploy.sh'), 'utf8')
    const start = deploy.indexOf('trip-board.service << EOF')
    expect(start).toBeGreaterThan(-1)
    const end = deploy.indexOf('\nEOF', start)
    expect(end).toBeGreaterThan(start)
    const unit = deploy.slice(start, end)
    expect(unit).toContain('Restart=always')
    expect(unit).not.toContain('Restart=on-failure')
    expect(unit).toContain('RestartSec=3')

    const pkg = JSON.parse(
      await readFile(join(repoRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> }
    expect(pkg.scripts.dev).toContain('--kill-others')
  })
})
